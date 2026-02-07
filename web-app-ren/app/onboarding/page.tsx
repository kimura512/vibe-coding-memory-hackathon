'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { CharacterBackground } from '@/components/character-background';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { characterList, CharacterProfile } from '@/lib/characters';

export default function OnboardingPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [name, setName] = useState('');
    const [selectedCharacter, setSelectedCharacter] = useState<string>('normal');
    const [alarmTime, setAlarmTime] = useState('07:00');
    const [isLoading, setIsLoading] = useState(false);

    const handleComplete = async () => {
        if (!name.trim()) return;

        setIsLoading(true);
        try {
            // ユーザー作成
            const userRes = await fetch('/api/user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    character: selectedCharacter,
                }),
            });

            if (!userRes.ok) throw new Error('Failed to create user');
            const { user } = await userRes.json();

            // アラーム設定
            const alarmRes = await fetch('/api/alarm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    time: alarmTime,
                    label: '朝のアラーム',
                }),
            });

            if (!alarmRes.ok) throw new Error('Failed to create alarm');

            // ローカルストレージに保存
            localStorage.setItem('wakeupai_userId', user.id);
            localStorage.setItem('wakeupai_userName', user.name);
            localStorage.setItem('wakeupai_character', selectedCharacter);

            router.push('/');
        } catch (error) {
            console.error('Onboarding error:', error);
            alert('セットアップに失敗しました');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <CharacterBackground characterId={selectedCharacter}>
            <div className="flex min-h-screen items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-md"
                >
                    <Card>
                        <CardHeader className="text-center">
                            <CardTitle className="text-3xl">🌅 WakeUpBuddy</CardTitle>
                            <CardDescription className="text-white/80">
                                あなたを覚えている目覚まし
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {step === 1 && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="space-y-4"
                                >
                                    <div>
                                        <label className="block text-sm font-medium text-white/80 mb-2">
                                            お名前を教えてください
                                        </label>
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="例: ゆうた"
                                            className="w-full px-4 py-3 rounded-xl glass-input text-white placeholder-white/40 text-lg"
                                            autoFocus
                                        />
                                    </div>
                                    <Button
                                        onClick={() => setStep(2)}
                                        disabled={!name.trim()}
                                        variant="primary"
                                        size="lg"
                                        className="w-full"
                                    >
                                        次へ
                                    </Button>
                                </motion.div>
                            )}

                            {step === 2 && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="space-y-4"
                                >
                                    <div>
                                        <label className="block text-sm font-medium text-white/80 mb-3">
                                            起こしてくれるキャラを選んでね
                                        </label>
                                        <div className="grid grid-cols-2 gap-3">
                                            {characterList.map((char) => (
                                                <button
                                                    key={char.id}
                                                    onClick={() => setSelectedCharacter(char.id)}
                                                    className={`p-3 rounded-xl transition-all ${selectedCharacter === char.id
                                                            ? 'ring-2 ring-white bg-white/20'
                                                            : 'bg-white/10 hover:bg-white/15'
                                                        }`}
                                                >
                                                    <div className="relative w-full aspect-square rounded-lg overflow-hidden mb-2">
                                                        <Image
                                                            src={char.imagePath}
                                                            alt={char.name}
                                                            fill
                                                            className="object-cover"
                                                        />
                                                    </div>
                                                    <p className="text-white font-medium text-sm">{char.name}</p>
                                                    <p className="text-white/60 text-xs line-clamp-1">{char.personality}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex gap-3">
                                        <Button
                                            onClick={() => setStep(1)}
                                            variant="ghost"
                                            size="lg"
                                            className="flex-1"
                                        >
                                            戻る
                                        </Button>
                                        <Button
                                            onClick={() => setStep(3)}
                                            variant="primary"
                                            size="lg"
                                            className="flex-1"
                                        >
                                            次へ
                                        </Button>
                                    </div>
                                </motion.div>
                            )}

                            {step === 3 && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="space-y-4"
                                >
                                    <div>
                                        <label className="block text-sm font-medium text-white/80 mb-2">
                                            起きたい時間は？
                                        </label>
                                        <input
                                            type="time"
                                            value={alarmTime}
                                            onChange={(e) => setAlarmTime(e.target.value)}
                                            className="w-full px-4 py-3 rounded-xl glass-input text-white text-2xl text-center"
                                        />
                                    </div>
                                    <p className="text-white/60 text-sm text-center">
                                        {name}さん、毎朝この時間に起こすね
                                    </p>
                                    <div className="flex gap-3">
                                        <Button
                                            onClick={() => setStep(2)}
                                            variant="ghost"
                                            size="lg"
                                            className="flex-1"
                                        >
                                            戻る
                                        </Button>
                                        <Button
                                            onClick={handleComplete}
                                            disabled={isLoading}
                                            variant="primary"
                                            size="lg"
                                            className="flex-1"
                                        >
                                            {isLoading ? '設定中...' : '完了'}
                                        </Button>
                                    </div>
                                </motion.div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </CharacterBackground>
    );
}
