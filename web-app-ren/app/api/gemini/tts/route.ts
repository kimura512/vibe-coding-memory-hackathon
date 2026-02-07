import { NextRequest, NextResponse } from 'next/server';
import { textToSpeech } from '@/lib/gemini-client';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { text, voiceName } = body;

        if (!text) {
            return NextResponse.json({ error: 'text is required' }, { status: 400 });
        }

        const result = await textToSpeech(text, voiceName);

        return NextResponse.json({
            audioBlob: `data:${result.mimeType};base64,${result.base64Audio}`,
            mimeType: result.mimeType,
        });
    } catch (error) {
        console.error('TTS error:', error);
        return NextResponse.json({ error: 'Failed to generate speech' }, { status: 500 });
    }
}
