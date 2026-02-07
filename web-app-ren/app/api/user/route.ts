import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET: ユーザー取得
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('id');

    if (!userId) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { alarms: true },
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json({ user });
    } catch (error) {
        console.error('Failed to get user:', error);
        return NextResponse.json({ error: 'Failed to get user' }, { status: 500 });
    }
}

// POST: ユーザー作成
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name, character } = body;

        if (!name) {
            return NextResponse.json({ error: 'name is required' }, { status: 400 });
        }

        const user = await prisma.user.create({
            data: {
                name,
                character: character || 'normal',
            },
        });

        return NextResponse.json({ user });
    } catch (error) {
        console.error('Failed to create user:', error);
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }
}

// PUT: ユーザー更新
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, name, character } = body;

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        const user = await prisma.user.update({
            where: { id },
            data: {
                ...(name && { name }),
                ...(character && { character }),
            },
        });

        return NextResponse.json({ user });
    } catch (error) {
        console.error('Failed to update user:', error);
        return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }
}
