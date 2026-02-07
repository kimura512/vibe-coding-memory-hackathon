'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CharacterBackground } from '@/components/character-background';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAlarmEngine } from '@/lib/alarm/engine';
import { Settings, MessageCircle, Bell } from 'lucide-react';

export default function HomePage() {
    const router = useRouter();
    const [userId, setUserId] = useState<string | null>(null);
    const [userName, setUserName] = useState<string>('');
    const [characterId, setCharacterId] = useState<string>('normal');

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
    }, [router]);

    const { alarmInfo, alarmState, formattedTimeUntil } = useAlarmEngine(userId);

    // アラーム発動時は専用画面へ遷移
    useEffect(() => {
        if (alarmState.isActive) {
            router.push('/alarm');
        }
    }, [alarmState.isActive, router]);

    if (!userId) {
        return null; // ローディング中
    }

    return (
        <CharacterBackground characterId={characterId} showCharacter={true}>
            <div className="flex h-full flex-col p-4 relative z-10">
                {/* ヘッダー */}
                <div className="flex justify-between items-center py-2">
                    <h1 className="text-lg font-semibold text-white/90">WakeUpBuddy</h1>
                    <div className="flex gap-2">
                        <Button
                            variant="glass"
                            size="sm"
                            className="text-[10px] h-8 px-3 opacity-60 hover:opacity-100 transition-opacity"
                            onClick={() => router.push('/alarm')}
                        >
                            アラームテスト
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push('/settings')}
                        >
                            <Settings className="w-5 h-5" />
                        </Button>
                    </div>
                </div>

                {/* メインコンテンツ */}
                <div className="flex-1 flex flex-col items-center justify-center">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 }}
                        className="text-center mb-8"
                    >
                        <p className="text-white/70 text-lg mb-2">おはよう、{userName}さん</p>

                        {alarmInfo ? (
                            <>
                                <motion.div
                                    className="text-6xl font-light text-white mb-4"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.4 }}
                                >
                                    {alarmInfo.time}
                                </motion.div>

                                {formattedTimeUntil && (
                                    <motion.div
                                        className="glass rounded-full px-6 py-2 inline-block"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.6 }}
                                    >
                                        <p className="text-white/90">
                                            あと <span className="font-semibold">{formattedTimeUntil}</span>
                                        </p>
                                    </motion.div>
                                )}
                            </>
                        ) : alarmState.isLoading ? (
                            <p className="text-white/60">読み込み中...</p>
                        ) : (
                            <p className="text-white/60">アラームが設定されていません</p>
                        )}
                    </motion.div>
                </div>

                {/* 下部ナビゲーション */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                    className="pb-4"
                >
                    <Card className="bg-white/10">
                        <CardContent className="px-6 py-5">
                            <div className="flex gap-6">
                                <Button
                                    onClick={() => router.push('/chat')}
                                    variant="glass"
                                    size="lg"
                                    className="flex-1 gap-2 h-12 text-sm"
                                >
                                    <MessageCircle className="w-5 h-5" />
                                    チャット
                                </Button>
                                <Button
                                    onClick={() => router.push('/settings')}
                                    variant="glass"
                                    size="lg"
                                    className="flex-1 gap-2 h-12 text-sm"
                                >
                                    <Bell className="w-5 h-5" />
                                    アラーム
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </CharacterBackground>
    );
}
