'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { CharacterBackground } from '@/components/character-background';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Bell, User, Trash2, Smile } from 'lucide-react';
import { characterList } from '@/lib/characters';

export default function SettingsPage() {
    const router = useRouter();
    const [userId, setUserId] = useState<string | null>(null);
    const [userName, setUserName] = useState('');
    const [characterId, setCharacterId] = useState<string>('normal');
    const [alarmTime, setAlarmTime] = useState('07:00');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [isCharSaved, setIsCharSaved] = useState(false);

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

        // 現在のアラーム設定を取得
        fetchAlarmSettings(storedId);
    }, [router]);

    const fetchAlarmSettings = async (uid: string) => {
        try {
            const response = await fetch(`/api/alarm?userId=${uid}`);
            if (response.ok) {
                const data = await response.json();
                if (data.alarm) {
                    setAlarmTime(data.alarm.time);
                }
            }
        } catch (error) {
            console.error('Failed to fetch alarm settings:', error);
        }
    };

    const handleSaveAlarm = async () => {
        if (!userId) return;

        setIsLoading(true);
        try {
            const response = await fetch('/api/alarm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    time: alarmTime,
                    label: '朝のアラーム',
                }),
            });

            if (response.ok) {
                setIsSaved(true);
                setTimeout(() => setIsSaved(false), 2000);
            }
        } catch (error) {
            console.error('Failed to save alarm:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveCharacter = async (newCharId: string) => {
        if (!userId) return;
        setCharacterId(newCharId);

        try {
            const response = await fetch('/api/user', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: userId,
                    character: newCharId,
                }),
            });

            if (response.ok) {
                localStorage.setItem('wakeupai_character', newCharId);
                setIsCharSaved(true);
                setTimeout(() => setIsCharSaved(false), 2000);
            }
        } catch (error) {
            console.error('Failed to change character:', error);
        }
    };

    const handleReset = () => {
        if (confirm('すべてのデータをリセットしますか？')) {
            localStorage.clear();
            router.push('/onboarding');
        }
    };

    if (!userId) return null;

    return (
        <CharacterBackground characterId={characterId} showCharacter={true}>
            <div className="flex flex-col h-full overflow-y-auto p-4 relative z-10 pb-20">
                {/* ヘッダー */}
                <div className="flex items-center gap-2 py-2 mb-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <h1 className="text-lg font-semibold">設定</h1>
                </div>

                <div className="space-y-4">
                    {/* アラーム設定 */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Bell className="w-5 h-5" />
                                    アラーム
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <label className="block text-sm text-white/70 mb-2">
                                        起床時刻
                                    </label>
                                    <input
                                        type="time"
                                        value={alarmTime}
                                        onChange={(e) => setAlarmTime(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl glass-input text-white text-2xl text-center"
                                    />
                                </div>
                                <Button
                                    onClick={handleSaveAlarm}
                                    disabled={isLoading}
                                    variant="primary"
                                    className="w-full"
                                >
                                    {isLoading ? '保存中...' : isSaved ? '保存しました ✓' : '保存'}
                                </Button>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* キャラクター設定 */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Smile className="w-5 h-5" />
                                    キャラクター変更
                                    {isCharSaved && <span className="text-xs text-green-400 ml-2">変更しました ✓</span>}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 gap-3">
                                    {characterList.map((char) => (
                                        <button
                                            key={char.id}
                                            onClick={() => handleSaveCharacter(char.id)}
                                            className={`p-2 rounded-xl transition-all ${characterId === char.id
                                                ? 'ring-2 ring-white bg-white/20'
                                                : 'bg-white/5 hover:bg-white/10'
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
                                            <p className="text-white font-medium text-xs">{char.name}</p>
                                        </button>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* ユーザー情報 */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <User className="w-5 h-5" />
                                    ユーザー
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-white font-medium">{userName}</p>
                                        <p className="text-xs text-white/50">ID: {userId?.slice(0, 8)}...</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>


                    {/* データ管理 */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        <Card className="bg-red-500/10 border-red-500/30">
                            <CardContent className="py-4 space-y-3">
                                <DemoImportButton userId={userId} />

                                <Button
                                    onClick={handleReset}
                                    variant="danger"
                                    className="w-full gap-2"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    データをリセット
                                </Button>
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>
            </div>
        </CharacterBackground>
    );
}

function DemoImportButton({ userId }: { userId: string }) {
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

    const handleImport = async () => {
        if (!confirm('デモ日記データをインポートしますか？\n（memUに記憶が追加されます）')) return;

        setStatus('loading');
        try {
            const res = await fetch('/api/seed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            });

            if (res.ok) {
                setStatus('success');
                setTimeout(() => setStatus('idle'), 3000);
            } else {
                setStatus('error');
            }
        } catch {
            setStatus('error');
        }
    };

    return (
        <Button
            onClick={handleImport}
            disabled={status === 'loading'}
            variant="glass"
            className="w-full gap-2 border-white/20"
        >
            <span className="text-xl">📚</span>
            {status === 'loading' ? 'インポート中...' :
                status === 'success' ? '完了しました！' :
                    status === 'error' ? 'エラーが発生しました' :
                        'デモ日記データをインポート'}
        </Button>
    );
}
