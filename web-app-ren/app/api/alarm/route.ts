import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET: ユーザーのアラーム取得
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    try {
        const alarm = await prisma.alarm.findFirst({
            where: {
                userId,
                isActive: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ alarm });
    } catch (error) {
        console.error('Failed to get alarm:', error);
        return NextResponse.json({ error: 'Failed to get alarm' }, { status: 500 });
    }
}

// POST: アラーム作成/更新
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { userId, time, label } = body;

        if (!userId || !time) {
            return NextResponse.json(
                { error: 'userId and time are required' },
                { status: 400 }
            );
        }

        // Userが存在しない場合は作成
        let user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            user = await prisma.user.create({
                data: {
                    id: userId,
                    name: 'User',
                },
            });
        }

        // 既存のアクティブなアラームを無効化
        await prisma.alarm.updateMany({
            where: { userId, isActive: true },
            data: { isActive: false },
        });

        // 新しいアラームを作成
        const alarm = await prisma.alarm.create({
            data: {
                userId,
                time,
                label,
                isActive: true,
            },
        });

        return NextResponse.json({ alarm });
    } catch (error) {
        console.error('Failed to create alarm:', error);
        return NextResponse.json({ error: 'Failed to create alarm' }, { status: 500 });
    }
}


// DELETE: アラーム削除
export async function DELETE(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const alarmId = searchParams.get('id');

    if (!alarmId) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    try {
        await prisma.alarm.delete({
            where: { id: alarmId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete alarm:', error);
        return NextResponse.json({ error: 'Failed to delete alarm' }, { status: 500 });
    }
}
