'use client';

import { useEffect, useRef } from 'react';

interface VoiceVisualizerProps {
    isActive: boolean;
    barCount?: number;
    className?: string;
}

export function VoiceVisualizer({
    isActive,
    barCount = 5,
    className = ''
}: VoiceVisualizerProps) {
    const barsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isActive || !barsRef.current) return;

        const bars = barsRef.current.querySelectorAll('.voice-bar');
        const intervals: NodeJS.Timeout[] = [];

        bars.forEach((bar, index) => {
            const animate = () => {
                const height = Math.random() * 80 + 20; // 20-100%
                (bar as HTMLElement).style.height = `${height}%`;
            };

            // ランダムな間隔でアニメーション
            const interval = setInterval(animate, 100 + index * 20);
            intervals.push(interval);
            animate(); // 初回実行
        });

        return () => {
            intervals.forEach(clearInterval);
        };
    }, [isActive]);

    if (!isActive) return null;

    return (
        <div
            ref={barsRef}
            className={`flex items-end justify-center gap-1 h-8 ${className}`}
        >
            {Array.from({ length: barCount }).map((_, i) => (
                <div
                    key={i}
                    className="voice-bar w-1.5 bg-white/80 rounded-full transition-all duration-100"
                    style={{ height: '20%' }}
                />
            ))}
        </div>
    );
}
