'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

const BASE_RMS_THRESHOLD = 0.02;
const TTS_RMS_BOOST = 0.05;
const SILENCE_DURATION_MS = 2000;
const TTS_SUPPRESSION_MS = 500;
const MEDIARECORDER_TIMESLICE_MS = 250;
const MIN_UTTERANCE_DURATION_MS = 600;

type VoiceStatus =
    | 'idle'
    | 'voice_mode'
    | 'user_speaking'
    | 'transcribing'
    | 'awaiting_ai'
    | 'ai_speaking';

type VoiceMachineState = {
    status: VoiceStatus;
    isMicActive: boolean;
    isTtsPlaying: boolean;
    lastTranscript: string | null;
    error: string | null;
};

type VoiceEvent =
    | { type: 'mic_start' }
    | { type: 'mic_stop' }
    | { type: 'audio_activity' }
    | { type: 'silence_detected' }
    | { type: 'stt_success'; text: string }
    | { type: 'stt_error'; message: string }
    | { type: 'ai_request' }
    | { type: 'ai_reply' }
    | { type: 'tts_start' }
    | { type: 'tts_end' }
    | { type: 'user_interrupt' }
    | { type: 'error'; message: string }
    | { type: 'reset' };

const initialVoiceState: VoiceMachineState = {
    status: 'idle',
    isMicActive: false,
    isTtsPlaying: false,
    lastTranscript: null,
    error: null,
};

function voiceReducer(state: VoiceMachineState, event: VoiceEvent): VoiceMachineState {
    switch (event.type) {
        case 'mic_start':
            return {
                status: 'voice_mode',
                isMicActive: true,
                isTtsPlaying: false,
                lastTranscript: null,
                error: null,
            };
        case 'mic_stop':
            return {
                status: 'idle',
                isMicActive: false,
                isTtsPlaying: false,
                lastTranscript: null,
                error: null,
            };
        case 'audio_activity':
            if (state.isMicActive && state.status !== 'transcribing') {
                return { ...state, status: 'user_speaking', error: null };
            }
            return state;
        case 'silence_detected':
            if (state.isMicActive) {
                return { ...state, status: 'transcribing' };
            }
            return state;
        case 'stt_success':
            return {
                ...state,
                status: 'awaiting_ai',
                lastTranscript: event.text,
                error: null,
            };
        case 'stt_error':
            return {
                ...state,
                status: state.isMicActive ? 'voice_mode' : 'idle',
                error: event.message,
            };
        case 'ai_request':
            if (state.isMicActive) {
                return { ...state, status: 'awaiting_ai' };
            }
            return state;
        case 'ai_reply':
            if (state.isMicActive) {
                return { ...state, status: 'ai_speaking' };
            }
            return state;
        case 'tts_start':
            return {
                ...state,
                isTtsPlaying: true,
                status: state.isMicActive ? 'ai_speaking' : state.status,
            };
        case 'tts_end':
            return {
                ...state,
                isTtsPlaying: false,
                status: state.isMicActive ? 'voice_mode' : 'idle',
            };
        case 'user_interrupt':
            return {
                ...state,
                isTtsPlaying: false,
                status: 'user_speaking',
            };
        case 'error':
            return { ...state, error: event.message };
        case 'reset':
            return initialVoiceState;
        default:
            return state;
    }
}

type UseVoiceConversationOptions = {
    userId: string | null;
    onSendMessage: (text: string) => Promise<Blob | null>; // Returns audio blob for playback
    onPlayAudio: (audioBlob: Blob) => void;
    onStopAudio: () => void;
};

type UseVoiceConversationResult = {
    state: VoiceMachineState;
    statusMessage: string | null;
    toggle: () => void;
    start: () => void;
    stop: () => void;
    markTtsStart: () => void;
    markTtsEnd: () => void;
};

function computeRms(data: Float32Array) {
    let sumSquares = 0;
    for (let index = 0; index < data.length; index += 1) {
        const sample = data[index];
        sumSquares += sample * sample;
    }
    return Math.sqrt(sumSquares / data.length);
}

export function useVoiceConversation({
    userId,
    onSendMessage,
    onPlayAudio,
    onStopAudio,
}: UseVoiceConversationOptions): UseVoiceConversationResult {
    const [state, dispatch] = useReducer(voiceReducer, initialVoiceState);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    const voiceStateRef = useRef(state);
    const sendMessageRef = useRef(onSendMessage);

    useEffect(() => {
        voiceStateRef.current = state;
    }, [state]);

    useEffect(() => {
        sendMessageRef.current = onSendMessage;
    }, [onSendMessage]);

    const audioContextRef = useRef<AudioContext | null>(null);
    const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const silenceStartedAtRef = useRef<number | null>(null);
    const speechStartedAtRef = useRef<number | null>(null);
    const pendingStopProcessingRef = useRef(false);
    const ignoreNextRecorderStopRef = useRef(false);
    const ttsSuppressionUntilRef = useRef<number>(0);
    const pendingTranscriptionAbortRef = useRef<AbortController | null>(null);

    const cleanupResources = useCallback(() => {
        if (pendingTranscriptionAbortRef.current) {
            pendingTranscriptionAbortRef.current.abort();
            pendingTranscriptionAbortRef.current = null;
        }

        const processor = scriptProcessorRef.current;
        if (processor) {
            processor.disconnect();
            processor.onaudioprocess = null;
            scriptProcessorRef.current = null;
        }

        const recorder = mediaRecorderRef.current;
        if (recorder) {
            recorder.ondataavailable = null;
            recorder.onstop = null;
            if (recorder.state !== 'inactive') {
                ignoreNextRecorderStopRef.current = true;
                try {
                    recorder.stop();
                } catch (error) {
                    console.error('[voice] failed to stop recorder', error);
                }
            }
            mediaRecorderRef.current = null;
        }

        if (sourceNodeRef.current) {
            sourceNodeRef.current.disconnect();
            sourceNodeRef.current = null;
        }

        if (audioContextRef.current) {
            const context = audioContextRef.current;
            audioContextRef.current = null;
            void context.close().catch(() => null);
        }

        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
        }

        recordedChunksRef.current = [];
        silenceStartedAtRef.current = null;
        speechStartedAtRef.current = null;
        pendingStopProcessingRef.current = false;
        ignoreNextRecorderStopRef.current = false;
        ttsSuppressionUntilRef.current = 0;
    }, []);

    const handleRecordedBlob = useCallback(
        async (mimeType: string) => {
            pendingStopProcessingRef.current = false;

            const duration =
                speechStartedAtRef.current !== null
                    ? performance.now() - speechStartedAtRef.current
                    : 0;
            speechStartedAtRef.current = null;

            const chunks = recordedChunksRef.current;
            recordedChunksRef.current = [];

            if (duration < MIN_UTTERANCE_DURATION_MS || chunks.length === 0) {
                // 短すぎる場合は無視してリスニング継続
                return;
            }

            const blob = new Blob(chunks, { type: mimeType });
            if (blob.size === 0) {
                dispatch({
                    type: 'stt_error',
                    message: '音声が取得できませんでした。',
                });
                return;
            }

            const abortController = new AbortController();
            if (pendingTranscriptionAbortRef.current) {
                pendingTranscriptionAbortRef.current.abort();
            }
            pendingTranscriptionAbortRef.current = abortController;

            dispatch({ type: 'silence_detected' });
            setStatusMessage('音声を文字起こし中…');

            const formData = new FormData();
            formData.append('audio', blob, 'utterance.webm');

            try {
                const response = await fetch('/api/gemini/stt', {
                    method: 'POST',
                    body: formData,
                    signal: abortController.signal,
                });

                if (!response.ok) {
                    throw new Error('文字起こしエラー');
                }

                const json = await response.json();
                if (!json.text) {
                    throw new Error('文字起こし結果が空です');
                }

                dispatch({ type: 'stt_success', text: json.text });
                setStatusMessage(`音声入力: ${json.text}`);

                dispatch({ type: 'ai_request' });
                setStatusMessage('考え中…');

                // 音声再生中は止める（割り込み）
                onStopAudio();

                const audioBlob = await sendMessageRef.current(json.text);

                dispatch({ type: 'ai_reply' });

                if (audioBlob) {
                    onPlayAudio(audioBlob);
                } else {
                    // 音声がない場合（テキストのみなど）はすぐにリスニングに戻る
                    dispatch({ type: 'tts_end' });
                }

            } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    return;
                }
                const messageText =
                    error instanceof Error ? error.message : '文字起こしに失敗しました。';
                dispatch({ type: 'stt_error', message: messageText });
                setStatusMessage(messageText);
            } finally {
                if (pendingTranscriptionAbortRef.current === abortController) {
                    pendingTranscriptionAbortRef.current = null;
                }
            }
        },
        [onStopAudio, onPlayAudio]
    );

    const handleRecorderStop = useCallback(
        (event: Event) => {
            if (ignoreNextRecorderStopRef.current) {
                ignoreNextRecorderStopRef.current = false;
                recordedChunksRef.current = [];
                pendingStopProcessingRef.current = false;
                return;
            }

            if (!pendingStopProcessingRef.current) {
                recordedChunksRef.current = [];
                return;
            }

            // @ts-ignore
            const recorder = (event?.target as MediaRecorder | null) ?? mediaRecorderRef.current;
            const mimeType = recorder?.mimeType ?? 'audio/webm';
            void handleRecordedBlob(mimeType);
        },
        [handleRecordedBlob]
    );

    const beginRecording = useCallback(() => {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state === 'recording') {
            return;
        }

        recordedChunksRef.current = [];
        silenceStartedAtRef.current = null;
        speechStartedAtRef.current = performance.now();
        pendingStopProcessingRef.current = false;

        try {
            recorder.start(MEDIARECORDER_TIMESLICE_MS);
        } catch (error) {
            console.error('[voice] failed to start recorder', error);
            dispatch({
                type: 'stt_error',
                message: '録音の開始に失敗しました。',
            });
        }
    }, []);

    const finalizeRecording = useCallback(() => {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state !== 'recording') {
            return;
        }

        pendingStopProcessingRef.current = true;

        try {
            recorder.stop();
        } catch (error) {
            console.error('[voice] failed to stop recorder', error);
            pendingStopProcessingRef.current = false;
            void handleRecordedBlob(recorder.mimeType);
        }
    }, [handleRecordedBlob]);

    const processAudioFrame = useCallback(
        (channelData: Float32Array) => {
            const currentState = voiceStateRef.current;

            if (!currentState.isMicActive) {
                return;
            }

            if (
                currentState.status === 'transcribing' ||
                currentState.status === 'awaiting_ai'
            ) {
                return;
            }

            const rms = computeRms(channelData);
            const now = performance.now();

            if (currentState.isTtsPlaying && now < ttsSuppressionUntilRef.current) {
                return;
            }

            const threshold =
                BASE_RMS_THRESHOLD + (currentState.isTtsPlaying ? TTS_RMS_BOOST : 0);

            if (rms > threshold) {
                dispatch({ type: 'audio_activity' });

                if (
                    mediaRecorderRef.current &&
                    mediaRecorderRef.current.state !== 'recording'
                ) {
                    beginRecording();
                }

                silenceStartedAtRef.current = null;

                if (
                    currentState.isTtsPlaying &&
                    speechStartedAtRef.current !== null &&
                    now - speechStartedAtRef.current >= MIN_UTTERANCE_DURATION_MS
                ) {
                    // ユーザーが喋り始めたら TTS を止める（割り込み）
                    dispatch({ type: 'user_interrupt' });
                    onStopAudio();
                }
            } else if (mediaRecorderRef.current?.state === 'recording') {
                if (!silenceStartedAtRef.current) {
                    silenceStartedAtRef.current = now;
                } else if (now - silenceStartedAtRef.current >= SILENCE_DURATION_MS) {
                    finalizeRecording();
                }
            }
        },
        [beginRecording, finalizeRecording, onStopAudio]
    );

    const startVoice = useCallback(async () => {
        if (voiceStateRef.current.isMicActive) {
            return;
        }

        if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
            const message = 'このブラウザではマイクが利用できません。';
            dispatch({ type: 'error', message });
            setStatusMessage(message);
            return;
        }

        try {
            setStatusMessage('マイクを初期化中…');

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
                video: false,
            });

            mediaStreamRef.current = stream;

            // @ts-ignore
            const context = new (window.AudioContext || window.webkitAudioContext)();
            audioContextRef.current = context;
            await context.resume();

            const source = context.createMediaStreamSource(stream);
            sourceNodeRef.current = source;
            const processor = context.createScriptProcessor(2048, 1, 1);
            processor.onaudioprocess = (event) => {
                processAudioFrame(event.inputBuffer.getChannelData(0));
            };
            source.connect(processor);
            processor.connect(context.destination);
            scriptProcessorRef.current = processor;

            if (typeof MediaRecorder === 'undefined') {
                throw new Error('MediaRecorder がサポートされていない環境です。');
            }

            let preferredMime = '';
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                preferredMime = 'audio/webm;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                preferredMime = 'audio/webm';
            }

            const recorder = preferredMime
                ? new MediaRecorder(stream, { mimeType: preferredMime })
                : new MediaRecorder(stream);

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunksRef.current.push(event.data);
                }
            };
            recorder.onstop = (event) => {
                handleRecorderStop(event);
            };

            mediaRecorderRef.current = recorder;

            dispatch({ type: 'mic_start' });
            setStatusMessage('聞いています…');
        } catch (error) {
            console.error('[voice] failed to start', error);
            cleanupResources();
            dispatch({ type: 'mic_stop' });

            const message =
                error instanceof DOMException && error.name === 'NotAllowedError'
                    ? 'マイクへのアクセスが許可されませんでした。'
                    : '音声会話モードの開始に失敗しました。';

            dispatch({ type: 'error', message });
            setStatusMessage(message);
        }
    }, [cleanupResources, handleRecorderStop, processAudioFrame]);

    const stopVoice = useCallback(() => {
        cleanupResources();
        if (voiceStateRef.current.isTtsPlaying) {
            dispatch({ type: 'tts_end' });
        }
        dispatch({ type: 'mic_stop' });
        setStatusMessage(null);
        onStopAudio();
    }, [cleanupResources, onStopAudio]);

    const toggle = useCallback(() => {
        if (voiceStateRef.current.isMicActive) {
            stopVoice();
        } else {
            void startVoice();
        }
    }, [startVoice, stopVoice]);

    const markTtsStart = useCallback(() => {
        if (!voiceStateRef.current.isMicActive) {
            return;
        }
        dispatch({ type: 'tts_start' });
        ttsSuppressionUntilRef.current = performance.now() + TTS_SUPPRESSION_MS;
    }, []);

    const markTtsEnd = useCallback(() => {
        if (!voiceStateRef.current.isMicActive) {
            return;
        }
        dispatch({ type: 'tts_end' });
    }, []);

    useEffect(() => {
        return () => {
            stopVoice();
        };
    }, [stopVoice]);

    useEffect(() => {
        if (!state.isMicActive) {
            setStatusMessage(null);
            return;
        }

        if (state.error) {
            setStatusMessage(state.error);
            return;
        }

        // ステータスメッセージの自動更新
        // 外部から setStatusMessage で上書きされていない場合のみ
        if (state.status === 'voice_mode' && !statusMessage?.startsWith('音声入力:')) {
            setStatusMessage('何か話しかけてください');
        }

    }, [state, statusMessage]);

    useEffect(() => {
        if (!userId && state.isMicActive) {
            stopVoice();
        }
    }, [userId, state.isMicActive, stopVoice]);

    return {
        state,
        statusMessage,
        toggle,
        start: startVoice,
        stop: stopVoice,
        markTtsStart,
        markTtsEnd,
    };
}
