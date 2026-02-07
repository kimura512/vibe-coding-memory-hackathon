import { NextRequest, NextResponse } from 'next/server';
import { generateText, textToSpeech } from '@/lib/gemini-client';
import { retrieveMemory, memorizeContent } from '@/lib/memu-client';
import { getCharacter } from '@/lib/characters';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
    const startTime = performance.now();
    try {
        const body = await request.json();
        const { userId, content, history = [], escalationLevel = 0 } = body;

        if (!userId || !content) {
            return NextResponse.json(
                { error: 'userId and content are required' },
                { status: 400 }
            );
        }

        // 1. ユーザー情報取得
        const t0 = performance.now();
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });
        const t1 = performance.now();
        console.log(`[LATENCY] User Fetch: ${(t1 - t0).toFixed(2)}ms`);

        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            );
        }

        const character = getCharacter(user.character || 'normal');

        // 現在の日時情報を取得 (JST)
        const now = new Date();
        const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

        // エスカレーションに応じたプロンプト調整
        let escalationInstruction = '';
        if (escalationLevel > 0 || content.includes('[SYSTEM_SIGNAL_SILENCE]')) {
            // アラーム鳴動中のため、必ず時刻を言わせる
            escalationInstruction = `\n【重要: 時刻告知】ユーザーを確実に起こすため、必ず返答のどこかで現在の日本標準時（JST）の時刻（${timeStr}）を「○時○分だよ」といった形式で正確に述べてください。`;

            if (escalationLevel === 1) {
                escalationInstruction += '\n【エスカレーションレベル1: 粘り強い】ユーザーがまだ寝ているようです。少ししつこく、強い口調で起こしてください。';
            } else if (escalationLevel === 2) {
                escalationInstruction += '\n【エスカレーションレベル2: 怒り】ユーザーが全く反応しません。怒鳴る、叫ぶなど、かなり強い怒りを表現して起こしてください。';
            } else if (escalationLevel >= 3) {
                escalationInstruction += '\n【エスカレーションレベル3: 感情の爆発】最終段階です。ガチギレする、絶望して号泣する、あるいは発狂して支離滅裂なことを叫ぶなど、ユーザーが驚いて飛び起きるような極限の感情を表現してください。';
            }
        }

        // 2. memUから記憶を取得 (システム信号の場合はスキップして高速化)
        const t2 = performance.now();
        let memoryContext = '';
        if (!content.includes('[SYSTEM_SIGNAL_SILENCE]')) {
            try {
                const searchQueries = [{ role: 'user', content: content }];
                const memories = await retrieveMemory(searchQueries, userId);
                if (memories.length > 0) {
                    memoryContext = memories.map(m => `- ${m.summary}`).join('\n');
                }
            } catch (error) {
                console.warn('Failed to retrieve memory:', error);
            }
        }
        const t3 = performance.now();
        console.log(`[LATENCY] Memory Retrieval: ${(t3 - t2).toFixed(2)}ms`);

        const dateStr = now.toLocaleDateString('ja-JP', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        // ユーザー名と現在時刻を含むコンテキスト
        const userContext = `現在時刻は ${dateStr} ${timeStr} です。\nユーザーの名前は「${user.name}」です。`;
        const fullContext = memoryContext
            ? `${userContext}\n\n【関連する記憶・日記】\n${memoryContext}`
            : userContext;

        // チャット履歴をDBから取得（fallback）
        let dbHistory: { role: string; content: string }[] = [];
        if (history.length === 0) {
            const recentMessages = await prisma.chatMessage.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: 5, // 10から5に減らして高速化
            });
            dbHistory = recentMessages.reverse().map((m: any) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            }));
        }

        // 会話履歴を構築
        const messages = [
            ...(history.length > 0 ? history.slice(-5) : dbHistory),
            { role: 'user' as const, content },
        ];

        // 3. Geminiでテキスト応答を生成
        const t4 = performance.now();
        const responseText = await generateText(
            messages,
            character.systemPrompt + escalationInstruction,
            fullContext
        );
        const t5 = performance.now();
        console.log(`[LATENCY] Text Generation: ${(t5 - t4).toFixed(2)}ms`);

        // 4. TTSで音声を生成
        const t6 = performance.now();
        let audioData = null;
        try {
            const ttsResult = await textToSpeech(responseText, character.voiceName);
            audioData = `data:${ttsResult.mimeType};base64,${ttsResult.base64Audio}`;
        } catch (error) {
            console.warn('Failed to generate TTS (Likely Quota Limit):', error);
            // TTS失敗時は音声なしで返す（500エラーにしない）
        }
        const t7 = performance.now();
        console.log(`[LATENCY] TTS Generation: ${(t7 - t6).toFixed(2)}ms`);

        // 5. 保存処理（非同期かつ最後に実行）
        if (!content.includes('[SYSTEM_SIGNAL_SILENCE]')) {
            prisma.chatMessage.create({
                data: {
                    userId,
                    role: 'user',
                    content: content.substring(0, 500),
                }
            }).catch(e => console.error('Save user msg error:', e));

            prisma.chatMessage.create({
                data: {
                    userId,
                    role: 'assistant',
                    content: responseText.substring(0, 500),
                }
            }).catch(e => console.error('Save ai msg error:', e));

            memorizeContent(`ユーザー(${user.name}): ${content}\nAI: ${responseText}`, userId, 'conversation')
                .catch(err => console.warn('Failed to memorize:', err));
        }

        const totalTime = performance.now() - startTime;
        console.log(`[LATENCY] Total: ${totalTime.toFixed(2)}ms\n---`);

        return NextResponse.json({
            text: responseText,
            audioBlob: audioData,
            memoryUsed: memoryContext.length > 0,
            characterName: character.name,
            latency: {
                total: totalTime,
                text: t5 - t4,
                tts: t7 - t6
            },
            isTtsError: !audioData
        });
    } catch (error) {
        console.error('Chat message error:', error);
        return NextResponse.json(
            { error: 'Failed' },
            { status: 500 }
        );
    }
}
