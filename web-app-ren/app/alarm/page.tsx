'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CharacterBackground } from '@/components/character-background';
import { Button } from '@/components/ui/button';
import { VoiceVisualizer } from '@/components/voice-visualizer';
import { useAlarmEngine } from '@/lib/alarm/engine';
import { useVoiceConversation } from '@/lib/hooks/use-voice-conversation';

export default function AlarmPage() {
    const router = useRouter();
    const [userId, setUserId] = useState<string | null>(null);
    const [userName, setUserName] = useState('');
    const [wakeUpMessage, setWakeUpMessage] = useState('');
    const [isPlaying, setIsPlaying] = useState(false);
    const [characterId, setCharacterId] = useState<string>('normal');
    const [slideProgress, setSlideProgress] = useState(0);
    const [isStopping, setIsStopping] = useState(false);
    const [escalationLevel, setEscalationLevel] = useState(0);

    // 二重フェッチ防止用フラグ
    const hasFetchedRef = useRef(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const sliderRef = useRef<HTMLDivElement>(null);
    const startXRef = useRef(0);
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

    const { stopAlarm } = useAlarmEngine(userId);

    // 沈黙タイマー管理
    const resetSilenceTimer = useCallback(() => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        console.log(`[ALARM] Starting silence timer (8s). Current Level: ${escalationLevel}`);
        // 8秒間放置されたらエスカレート（遅延を考慮して短縮）
        silenceTimerRef.current = setTimeout(() => {
            console.log(`[ALARM] Silence timeout reached! Triggering escalation.`);
            handleEscalation();
        }, 8000);
    }, [escalationLevel]);

    const stopSilenceTimer = useCallback(() => {
        if (silenceTimerRef.current) {
            console.log(`[ALARM] Silence timer stopped.`);
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
        }
    }, []);

    const handleEscalation = async () => {
        const nextLevel = Math.min(escalationLevel + 1, 3);
        console.log(`[ALARM] Escalating to Level ${nextLevel}`);
        setEscalationLevel(nextLevel);

        // 擬似的に「ユーザーが黙っている」という信号を送る
        const nextText = await handleSendMessage(`[SYSTEM_SIGNAL_SILENCE] ユーザーがまだ起きていません。強制的に起こしてください。現在のレベル: ${nextLevel}`, nextLevel);

        if (nextText) {
            console.log(`[ALARM] Escalation message received.`);
        }
    };

    // 会話エンジンのためのコールバック
    const handleStopAudio = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            setIsPlaying(false);
        }
    }, []);

    const handlePlayAudio = useCallback((audioBlob: Blob) => {
        const url = URL.createObjectURL(audioBlob);
        const audio = new Audio(url);
        audioRef.current = audio;

        // タイマー停止（喋っている間は沈黙ではない）
        stopSilenceTimer();

        // hookに通知
        voiceConversation.markTtsStart();
        setIsPlaying(true);

        audio.onended = () => {
            setIsPlaying(false);
            voiceConversation.markTtsEnd();

            // 喋り終わったら沈黙タイマー開始
            resetSilenceTimer();
        };

        audio.onerror = (e) => {
            console.error("Audio playback error:", audio.error);
            setIsPlaying(false);
            voiceConversation.markTtsEnd();
        };

        audio.play().catch(console.error);
    }, [resetSilenceTimer, stopSilenceTimer]); // voiceConversationは後で定義されるのでdepsに入れない（循環参照回避）またはuseEffectで紐付ける

    const handleSendMessage = async (text: string, level?: number): Promise<Blob | null> => {
        if (!userId) return null;
        console.log(`[ALARM] Sending message: ${text.substring(0, 30)}... (Level: ${level ?? escalationLevel})`);
        const t0 = performance.now();
        try {
            const currentLevel = level !== undefined ? level : escalationLevel;
            const response = await fetch('/api/chat/message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    content: text,
                    history: [],
                    escalationLevel: currentLevel,
                }),
            });

            const t1 = performance.now();
            console.log(`[ALARM] API Response took ${(t1 - t0).toFixed(2)}ms`);

            if (response.ok) {
                const data = await response.json();
                setWakeUpMessage(data.text);

                // ユーザーが喋った場合はエスカレーションをリセット
                if (!text.includes('[SYSTEM_SIGNAL_SILENCE]')) {
                    console.log(`[ALARM] User responded, resetting escalation level.`);
                    setEscalationLevel(0);
                }

                if (data.audioBlob) {
                    const res = await fetch(data.audioBlob);
                    const blob = await res.blob();

                    if (text.includes('[SYSTEM_SIGNAL_SILENCE]')) {
                        handlePlayAudio(blob);
                    }
                    return blob;
                }
            }
        } catch (error) {
            console.error('Failed to send message:', error);
        }
        return null;
    };

    const voiceConversation = useVoiceConversation({
        userId,
        onSendMessage: handleSendMessage,
        onPlayAudio: handlePlayAudio,
        onStopAudio: handleStopAudio,
    });

    useEffect(() => {
        const storedId = localStorage.getItem('wakeupai_userId');
        const storedName = localStorage.getItem('wakeupai_userName');
        const storedChar = localStorage.getItem('wakeupai_character');

        if (!storedId) {
            router.push('/onboarding');
            return;
        }

        setUserId(storedId);
        setUserName(storedName || '');
        if (storedChar) setCharacterId(storedChar);

        // 起床時のキャラクターメッセージを取得・再生（一度だけ実行）
        if (!hasFetchedRef.current) {
            hasFetchedRef.current = true;
            fetchWakeUpMessage(storedId);
        }
    }, [router]);

    // 音声会話・沈黙タイマーの開始処理を共通化
    const startVoiceInteraction = useCallback(() => {
        setIsPlaying(false);
        voiceConversation.markTtsEnd();
        voiceConversation.start();
        resetSilenceTimer();
    }, [voiceConversation, resetSilenceTimer]);

    // audioRefを使った再生ラッパー（初期メッセージ用）
    // 初期メッセージ再生時にもVoiceConversationの状態を同期させる
    const playInitialAudio = (audioData: string) => {
        if (audioRef.current) audioRef.current.pause();

        const audio = new Audio(audioData);
        audioRef.current = audio;

        voiceConversation.markTtsStart();
        setIsPlaying(true);
        stopSilenceTimer();

        audio.onended = () => {
            startVoiceInteraction();
        };

        audio.play().catch((err) => {
            console.error("Audio play failed (autoplay policy?):", err);
            // 自動再生に失敗した場合でも、リスニングは開始してみる
            startVoiceInteraction();
        });
    };

    const fetchWakeUpMessage = async (uid: string) => {
        try {
            const response = await fetch('/api/chat/message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: uid,
                    content: '起きる時間だよ。一言だけ短く、起こして。今日の予定は聞かなくていい。',
                    history: [],
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setWakeUpMessage(data.text);

                if (data.audioBlob) {
                    playInitialAudio(data.audioBlob);
                } else {
                    // 音声がない場合（クォータ切れ等）は、少し待ってからリスニング開始
                    // テキストを「読んだ」くらいの時間を適当に空ける (例: 3秒)
                    setTimeout(() => {
                        startVoiceInteraction();
                    }, 3000);
                }
            }
        } catch (error) {
            console.error('Failed to fetch wake up message:', error);
            setWakeUpMessage('おはよう！');
            // エラー時もリスニング開始
            startVoiceInteraction();
        }
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        startXRef.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!sliderRef.current) return;

        const currentX = e.touches[0].clientX;
        const diff = currentX - startXRef.current;
        const maxSlide = sliderRef.current.offsetWidth - 60;
        const progress = Math.min(Math.max(diff / maxSlide, 0), 1);

        setSlideProgress(progress);
    };

    const handleTouchEnd = () => {
        if (slideProgress > 0.8) {
            handleStopAlarm();
        } else {
            setSlideProgress(0);
        }
    };

    const handleStopAlarm = () => {
        setIsStopping(true);
        handleStopAudio();
        stopSilenceTimer();
        voiceConversation.stop(); // 音声会話も終了

        stopAlarm();

        setTimeout(() => {
            router.push('/');
        }, 500);
    };

    // 音声会話の状態変化に合わせてタイマー制御
    useEffect(() => {
        if (voiceConversation.state.status === 'user_speaking') {
            stopSilenceTimer();
        }
    }, [voiceConversation.state.status, stopSilenceTimer]);

    const currentTime = new Date().toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
    });

    return (
        <CharacterBackground characterId={characterId} showCharacter={true}>
            return (
            <CharacterBackground characterId={characterId} showCharacter={true}>
                <div className="flex flex-col h-full p-6 pt-16 pb-12 relative z-10">
                    {/* 時刻表示 - 上部に固定気味に配置 */}
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-center mb-auto"
                    >
                        <div className="text-7xl font-light text-white mb-2 tracking-wider">{currentTime}</div>
                        <p className="text-white/60 text-sm font-medium">おはよう、{userName}さん</p>
                    </motion.div>

                    {/* 中央から下部のコンテンツをまとめるコンテナ */}
                    <div className="w-full flex flex-col items-center gap-8 mt-auto">
                        {/* キャラクターメッセージ & 音声ステータス - 少し下に配置 */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.3 }}
                            className="w-full max-w-sm"
                        >
                            <div className="glass rounded-2xl p-6 text-center shadow-xl border border-white/10">
                                <div className="flex justify-center mb-6 relative">
                                    <VoiceVisualizer isActive={isPlaying || voiceConversation.state.status === 'user_speaking'} barCount={7} />

                                    {/* マイクステータスインジケーター */}
                                    {voiceConversation.state.isMicActive && (
                                        <span className="absolute -right-2 -top-2 w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                                    )}
                                </div>

                                <div className="relative">
                                    <p className="text-white text-lg leading-relaxed min-h-[4rem] font-medium">
                                        {voiceConversation.statusMessage ? (
                                            <span className="text-white/50 text-sm italic">
                                                {voiceConversation.statusMessage}
                                            </span>
                                        ) : (
                                            wakeUpMessage || '...'
                                        )}
                                    </p>
                                </div>
                            </div>
                        </motion.div>

                        {/* スライドして停止 & スヌーズ */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.6 }}
                            className="w-full max-w-xs space-y-4"
                        >
                            <div
                                ref={sliderRef}
                                className="relative h-16 rounded-full glass overflow-hidden border border-white/10 shadow-lg"
                                onTouchStart={handleTouchStart}
                                onTouchMove={handleTouchMove}
                                onTouchEnd={handleTouchEnd}
                            >
                                {/* 背景プログレス */}
                                <div
                                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-400/30 to-emerald-500/30 transition-all"
                                    style={{ width: `${slideProgress * 100}%` }}
                                />

                                {/* スライドボタン */}
                                <motion.div
                                    className="absolute top-2 left-2 w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-xl z-20"
                                    style={{ x: slideProgress * (sliderRef.current?.offsetWidth || 200 - 64) }}
                                >
                                    <span className="text-xl">☀️</span>
                                </motion.div>

                                {/* テキスト */}
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <span className="text-white/70 text-sm font-medium ml-10">
                                        スライドして起きる
                                    </span>
                                </div>
                            </div>

                            {/* スヌーズボタン */}
                            <Button
                                variant="ghost"
                                className="w-full h-12 text-white/60 hover:text-white hover:bg-white/5 rounded-full text-sm font-medium transition-colors"
                                onClick={() => {
                                    handleStopAudio();
                                    stopSilenceTimer();
                                    voiceConversation.stop();
                                    router.push('/');
                                }}
                            >
                                5分スヌーズ
                            </Button>
                        </motion.div>
                    </div>
                </div>
            </CharacterBackground>
        </CharacterBackground>
    );
}
