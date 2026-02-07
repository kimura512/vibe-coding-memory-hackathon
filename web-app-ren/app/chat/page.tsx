'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CharacterBackground } from '@/components/character-background';
import { Button } from '@/components/ui/button';
// import { VoiceVisualizer } from '@/components/voice-visualizer';
import { ArrowLeft, Mic, Send, MicOff } from 'lucide-react';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    audioBlob?: string;
}

// 新しいコンポーネント: タイプライター風テキスト表示
function TypewriterText({ text, onComplete }: { text: string; onComplete?: () => void }) {
    const [displayedText, setDisplayedText] = useState('');
    const indexRef = useRef(0);

    useEffect(() => {
        // テキストが変わったらリセット
        setDisplayedText('');
        indexRef.current = 0;
    }, [text]);

    useEffect(() => {
        if (indexRef.current >= text.length) {
            onComplete?.();
            return;
        }

        const timer = setInterval(() => {
            if (indexRef.current < text.length) {
                setDisplayedText((prev) => prev + text.charAt(indexRef.current));
                indexRef.current++;
            } else {
                clearInterval(timer);
                onComplete?.();
            }
        }, 100); // 10 chars/sec = 100ms/char

        return () => clearInterval(timer);
    }, [text, onComplete]);

    return <p className="text-white">{displayedText}</p>;
}

export default function ChatPage() {
    const router = useRouter();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [characterId, setCharacterId] = useState<string>('normal');
    const [characterName, setCharacterName] = useState<string>('ミライ');
    const [userId, setUserId] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const stored = localStorage.getItem('wakeupai_userId');
        const storedChar = localStorage.getItem('wakeupai_character');

        if (!stored) {
            router.push('/onboarding');
            return;
        }
        setUserId(stored);
        if (storedChar) {
            setCharacterId(storedChar);
            // 本来はcharacters.tsから名前を取得すべきだが、簡易的に
            const names: Record<string, string> = {
                'normal': 'ミライ',
                'tsundere': 'ツン子',
                'mom': '大阪のオカン',
                'ikemen': 'レン'
            };
            setCharacterName(names[storedChar] || 'ミライ');
        }
    }, [router]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    // タイピング中もスクロール追従したいので、displayedTextが変わるたびに実行される仕組みが必要だが
    // 簡易的にはTypewriterText側で制御するか、あるいは親で定期的にスクロールするか。
    // ここでは新しいメッセージが追加された時(isLoading=true/false)にスクロールするようにしている。

    const handleSend = async () => {
        if (!input.trim() || !userId || isLoading) return;

        const userMessage: Message = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/chat/message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    content: input,
                    history: messages.slice(-10),
                }),
            });

            if (response.ok) {
                const data = await response.json();

                // テキストと音声は同時に返ってくるが、テキスト表示を優先する
                // isLoadingをfalseにして、メッセージリストに追加することでTypewriterTextを開始させる
                const assistantMessage: Message = {
                    role: 'assistant',
                    content: data.text,
                    audioBlob: data.audioBlob,
                };

                setMessages(prev => [...prev, assistantMessage]);
                // サーバーからキャラ名が返ってくる場合は更新
                if (data.characterName) setCharacterName(data.characterName);

                // 音声再生（テキスト表示とは非同期で再生開始）
                if (data.audioBlob) {
                    playAudio(data.audioBlob);
                }
            } else {
                if (response.status === 404) {
                    alert('ユーザー情報が見つかりません。データをリセットして再登録してください。');
                    localStorage.clear();
                    router.push('/onboarding');
                    return;
                }
                console.error('API Error:', response.status);
            }
        } catch (error) {
            console.error('Failed to send message:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const playAudio = (audioData: string) => {
        if (audioRef.current) {
            audioRef.current.pause();
        }

        const audio = new Audio(audioData);
        audioRef.current = audio;

        audio.onplay = () => setIsPlaying(true);
        audio.onended = () => setIsPlaying(false);
        audio.onerror = (e) => {
            console.error("Audio playback error:", audio.error);
            setIsPlaying(false);
        };

        audio.play().catch(console.error);
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            const chunks: Blob[] = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(chunks, { type: 'audio/webm' });
                const formData = new FormData();
                formData.append('audio', audioBlob);

                try {
                    const response = await fetch('/api/gemini/stt', {
                        method: 'POST',
                        body: formData,
                    });

                    if (response.ok) {
                        const data = await response.json();
                        setInput(data.text);
                        inputRef.current?.focus();
                    }
                } catch (error) {
                    console.error('STT error:', error);
                }

                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (error) {
            console.error('Failed to start recording:', error);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    if (!userId) return null;

    return (
        <CharacterBackground characterId={characterId} showCharacter={true}>
            <div className="flex flex-col h-full relative z-10">
                {/* ヘッダー */}
                <div className="flex items-center gap-2 px-4 py-3 glass-dark shrink-0 z-20">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
                        <ArrowLeft className="w-6 h-6" />
                    </Button>
                    <div className="flex-1">
                        <h1 className="font-bold text-lg">{characterName}</h1>
                        <p className="text-xs text-white/70">
                            {isPlaying ? 'お話し中...' : 'オンライン'}
                        </p>
                    </div>
                </div>

                {/* メッセージエリア */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
                    <AnimatePresence>
                        {messages.map((msg, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[80%] px-4 py-3 rounded-2xl ${msg.role === 'user'
                                        ? 'bg-gradient-to-r from-pink-500 to-purple-500 rounded-br-sm'
                                        : 'glass rounded-bl-sm'
                                        }`}
                                >
                                    {msg.role === 'assistant' ? (
                                        // 最新のアシスタントメッセージだけタイピングアニメーションを適用
                                        idx === messages.length - 1 ? (
                                            <TypewriterText text={msg.content} />
                                        ) : (
                                            <p className="text-white">{msg.content}</p>
                                        )
                                    ) : (
                                        <p className="text-white">{msg.content}</p>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {isLoading && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex justify-start"
                        >
                            <div className="glass px-4 py-3 rounded-2xl rounded-bl-sm">
                                <div className="flex gap-1">
                                    <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce" />
                                    <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce [animation-delay:0.2s]" />
                                    <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce [animation-delay:0.4s]" />
                                </div>
                            </div>
                        </motion.div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* 入力エリア */}
                <div className="absolute bottom-0 left-0 right-0 p-4 glass-dark safe-area-bottom z-20 bg-black/40 backdrop-blur-xl">
                    <div className="flex gap-3 items-center">
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="メッセージを入力..."
                            className="flex-1 px-5 py-3.5 rounded-full glass-input text-white placeholder-white/50 text-base"
                            disabled={isLoading}
                        />
                        <Button
                            onClick={isRecording ? stopRecording : startRecording}
                            variant={isRecording ? 'danger' : 'glass'}
                            size="icon"
                            className="rounded-full h-12 w-12 shrink-0"
                        >
                            {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                        </Button>
                        <Button
                            onClick={handleSend}
                            disabled={!input.trim() || isLoading}
                            variant="primary"
                            size="icon"
                            className="rounded-full h-12 w-12 shrink-0"
                        >
                            <Send className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
            </div>
        </CharacterBackground>
    );
}
