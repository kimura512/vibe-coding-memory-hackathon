const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

/**
 * Gemini 3 Flash でテキスト応答を生成
 */
export async function generateText(
    messages: ChatMessage[],
    systemPrompt?: string,
    memoryContext?: string
): Promise<string> {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    const contents = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
    }));

    const systemInstruction = systemPrompt
        ? `${systemPrompt}\n\n${memoryContext ? `【ユーザーについての記憶】\n${memoryContext}` : ''}`
        : memoryContext
            ? `【ユーザーについての記憶】\n${memoryContext}`
            : undefined;

    const requestBody: Record<string, unknown> = {
        contents,
    };

    if (systemInstruction) {
        requestBody.systemInstruction = {
            parts: [{ text: systemInstruction }],
        };
    }

    const response = await fetch(
        `${GEMINI_API_BASE}/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.candidates[0]?.content?.parts[0]?.text || '';
}

/**
 * Gemini 2.5 Flash TTS でテキストを音声に変換
 */
export async function textToSpeech(
    text: string,
    voiceName?: string
): Promise<{ base64Audio: string; mimeType: string }> {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    const selectedVoice = voiceName || 'Kore'; // 日本語対応ボイス

    const response = await fetch(
        `${GEMINI_API_BASE}/models/gemini-2.5-flash-preview-tts:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text }],
                }],
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: selectedVoice,
                            },
                        },
                    },
                },
            }),
        }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini TTS API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inlineData?.data) {
        throw new Error('No audio data in Gemini TTS response');
    }

    // Gemini returns raw PCM (Linear16, 24kHz, mono) - convert to WAV
    const pcmBuffer = Buffer.from(inlineData.data, 'base64');
    const wavBuffer = pcmToWav(pcmBuffer, 24000, 1, 16);
    const wavBase64 = wavBuffer.toString('base64');

    return { base64Audio: wavBase64, mimeType: 'audio/wav' };
}

/**
 * PCMデータをWAVフォーマットに変換
 */
function pcmToWav(pcmData: Buffer, sampleRate: number, channels: number, bitDepth: number): Buffer {
    const dataLength = pcmData.length;
    const header = Buffer.alloc(44);
    const byteRate = sampleRate * channels * (bitDepth / 8);
    const blockAlign = channels * (bitDepth / 8);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataLength, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // chunk size
    header.writeUInt16LE(1, 20);  // PCM format
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitDepth, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataLength, 40);

    return Buffer.concat([header, pcmData]);
}

/**
 * Gemini 3 Flash マルチモーダルで音声をテキストに変換
 */
export async function speechToText(audioBase64: string, mimeType: string): Promise<string> {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    const response = await fetch(
        `${GEMINI_API_BASE}/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            inlineData: {
                                mimeType,
                                data: audioBase64,
                            },
                        },
                        {
                            text: '音声の内容を正確に文字起こししてください。文字起こし結果のみを出力し、説明は不要です。',
                        },
                    ],
                }],
            }),
        }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini STT API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.candidates[0]?.content?.parts[0]?.text || '';
}
