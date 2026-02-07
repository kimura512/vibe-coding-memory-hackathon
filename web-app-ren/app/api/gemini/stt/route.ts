import { NextRequest, NextResponse } from 'next/server';
import { speechToText } from '@/lib/gemini-client';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const audioFile = formData.get('audio') as File;

        if (!audioFile) {
            return NextResponse.json({ error: 'audio file is required' }, { status: 400 });
        }

        // ファイルをBase64に変換
        const arrayBuffer = await audioFile.arrayBuffer();
        const base64Audio = Buffer.from(arrayBuffer).toString('base64');

        // MIMEタイプを取得（webmの場合が多い）
        const mimeType = audioFile.type || 'audio/webm';

        const text = await speechToText(base64Audio, mimeType);

        return NextResponse.json({ text });
    } catch (error) {
        console.error('STT error:', error);
        return NextResponse.json({ error: 'Failed to transcribe speech' }, { status: 500 });
    }
}
