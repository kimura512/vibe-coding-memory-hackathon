'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { format, differenceInMilliseconds, addDays, parse, isAfter } from 'date-fns';
import { ja } from 'date-fns/locale';

interface AlarmInfo {
    id: string;
    time: string; // HH:mm
    label?: string;
    alarmDateTime: Date; // 次回発動時刻
}

interface AlarmState {
    isActive: boolean;
    timeUntilAlarm: number; // ms
    isLoading: boolean;
}

export function useAlarmEngine(userId: string | null) {
    const [alarmInfo, setAlarmInfo] = useState<AlarmInfo | null>(null);
    const [alarmState, setAlarmState] = useState<AlarmState>({
        isActive: false,
        timeUntilAlarm: Infinity,
        isLoading: true,
    });

    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const alarmTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // アラーム情報を取得
    const fetchAlarmInfo = useCallback(async () => {
        if (!userId) return;

        try {
            const response = await fetch(`/api/alarm?userId=${userId}`);
            if (!response.ok) {
                setAlarmInfo(null);
                setAlarmState(prev => ({ ...prev, isLoading: false }));
                return;
            }

            const data = await response.json();
            if (!data.alarm) {
                setAlarmInfo(null);
                setAlarmState(prev => ({ ...prev, isLoading: false }));
                return;
            }

            // 次回発動時刻を計算
            const now = new Date();
            let alarmDateTime = parse(data.alarm.time, 'HH:mm', now);

            // 今日の時刻が既に過ぎている場合は翌日に設定
            if (!isAfter(alarmDateTime, now)) {
                alarmDateTime = addDays(alarmDateTime, 1);
            }

            setAlarmInfo({
                id: data.alarm.id,
                time: data.alarm.time,
                label: data.alarm.label,
                alarmDateTime,
            });
            setAlarmState(prev => ({ ...prev, isLoading: false }));
        } catch (error) {
            console.error('Failed to fetch alarm info:', error);
            setAlarmState(prev => ({ ...prev, isLoading: false }));
        }
    }, [userId]);

    // カウントダウンタイマー
    useEffect(() => {
        if (!alarmInfo) return;

        const updateCountdown = () => {
            const now = new Date();
            const diff = differenceInMilliseconds(alarmInfo.alarmDateTime, now);

            setAlarmState(prev => ({
                ...prev,
                timeUntilAlarm: Math.max(0, diff),
            }));
        };

        updateCountdown();
        timerRef.current = setInterval(updateCountdown, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [alarmInfo]);

    // アラーム発動チェック
    useEffect(() => {
        if (!alarmInfo || alarmState.isActive) return;

        const now = new Date();
        const diff = differenceInMilliseconds(alarmInfo.alarmDateTime, now);

        if (diff <= 0) {
            // 既にアラーム時刻を過ぎている
            setAlarmState(prev => ({ ...prev, isActive: true }));
            return;
        }

        // アラーム発動タイムアウトを設定
        alarmTimeoutRef.current = setTimeout(() => {
            setAlarmState(prev => ({ ...prev, isActive: true }));
        }, diff);

        return () => {
            if (alarmTimeoutRef.current) clearTimeout(alarmTimeoutRef.current);
        };
    }, [alarmInfo, alarmState.isActive]);

    // アラーム停止
    const stopAlarm = useCallback(() => {
        setAlarmState(prev => ({ ...prev, isActive: false }));
        // 次の日のアラームを再計算
        if (alarmInfo) {
            const nextAlarm = addDays(alarmInfo.alarmDateTime, 1);
            setAlarmInfo(prev => prev ? { ...prev, alarmDateTime: nextAlarm } : null);
        }
    }, [alarmInfo]);

    // 初回読み込み
    useEffect(() => {
        fetchAlarmInfo();
    }, [fetchAlarmInfo]);

    // フォーマットされた残り時間
    const formattedTimeUntil = alarmState.timeUntilAlarm < Infinity
        ? formatTimeRemaining(alarmState.timeUntilAlarm)
        : null;

    return {
        alarmInfo,
        alarmState,
        formattedTimeUntil,
        stopAlarm,
        refetchAlarm: fetchAlarmInfo,
    };
}

function formatTimeRemaining(ms: number): string {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);

    if (hours > 0) {
        return `${hours}時間${minutes}分`;
    }
    if (minutes > 0) {
        return `${minutes}分${seconds}秒`;
    }
    return `${seconds}秒`;
}
