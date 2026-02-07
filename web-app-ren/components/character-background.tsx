'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { getCharacter } from '@/lib/characters';

interface CharacterBackgroundProps {
    characterId?: string;
    children?: React.ReactNode;
    showCharacter?: boolean;
}

export function CharacterBackground({
    characterId = 'normal',
    children,
    showCharacter = false,
}: CharacterBackgroundProps) {
    const character = getCharacter(characterId);

    // キャラクター背景色のマッピング
    const backgroundStyles: Record<string, string> = {
        normal: 'from-indigo-600 via-purple-600 to-pink-500',
        tsundere: 'from-pink-500 via-rose-500 to-red-400',
        mom: 'from-amber-500 via-orange-400 to-yellow-400',
        ikemen: 'from-blue-600 via-indigo-500 to-purple-500',
    };

    const bgClass = backgroundStyles[characterId] || backgroundStyles.normal;

    return (
        <div className="fixed inset-0 overflow-hidden">
            {/* 動的グラデーション背景 */}
            <motion.div
                className={`absolute inset-0 bg-gradient-to-br ${bgClass}`}
                animate={{
                    background: [
                        `linear-gradient(135deg, var(--tw-gradient-stops))`,
                        `linear-gradient(180deg, var(--tw-gradient-stops))`,
                        `linear-gradient(225deg, var(--tw-gradient-stops))`,
                        `linear-gradient(135deg, var(--tw-gradient-stops))`,
                    ],
                }}
                transition={{
                    duration: 20,
                    repeat: Infinity,
                    ease: 'linear',
                }}
            />

            {/* 装飾的な光のオーブ */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <motion.div
                    className="absolute w-96 h-96 rounded-full bg-white/10 blur-3xl"
                    style={{ top: '10%', left: '60%' }}
                    animate={{
                        x: [0, 50, 0],
                        y: [0, 30, 0],
                    }}
                    transition={{
                        duration: 15,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                />
                <motion.div
                    className="absolute w-80 h-80 rounded-full bg-pink-300/20 blur-3xl"
                    style={{ bottom: '20%', left: '20%' }}
                    animate={{
                        x: [0, -30, 0],
                        y: [0, 50, 0],
                    }}
                    transition={{
                        duration: 12,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                />
            </div>

            {/* キャラクター画像 (Flexboxで中央寄せ) */}
            {showCharacter && (
                <div className="fixed inset-0 z-0 flex items-center justify-center pointer-events-none">
                    <motion.div
                        className="relative w-full max-w-lg h-[65vh] opacity-85"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 0.85, scale: 1 }}
                        transition={{ duration: 0.5 }}
                    >
                        <Image
                            src={character.imagePath}
                            alt={character.name}
                            fill
                            className="object-contain object-center"
                            priority
                        />
                    </motion.div>
                </div>
            )}

            {/* コンテンツ */}
            <div className="relative z-10 h-dvh w-full overflow-hidden pb-32 safe-area-bottom">
                {children}
            </div>
        </div>
    );
}
