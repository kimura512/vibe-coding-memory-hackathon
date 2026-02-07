
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const PYTHON_API_URL = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { userId } = body;

        if (!userId) {
            return NextResponse.json(
                { error: 'userId is required' },
                { status: 400 }
            );
        }

        // デモ日記ディレクトリのパス
        const diaryDir = path.join(process.cwd(), 'data/demo-diary');

        if (!fs.existsSync(diaryDir)) {
            console.error(`Diary directory not found: ${diaryDir}`);
            return NextResponse.json(
                { error: 'Demo data directory not found' },
                { status: 500 }
            );
        }

        const files = fs.readdirSync(diaryDir)
            .filter(f => f.endsWith('.md'))
            .sort();

        console.log(`Found ${files.length} demo files for user ${userId}`);

        let successCount = 0;
        let failCount = 0;

        for (const file of files) {
            const filePath = path.join(diaryDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');

            try {
                const response = await fetch(`${PYTHON_API_URL}/memorize`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        content,
                        user_id: userId,
                        modality: 'document',
                    }),
                });

                if (response.ok) {
                    successCount++;
                } else {
                    console.error(`Failed to memorize ${file}: ${response.statusText}`);
                    failCount++;
                }
            } catch (error) {
                console.error(`Error memorizing ${file}:`, error);
                failCount++;
            }
        }

        return NextResponse.json({
            success: true,
            message: `Imported ${successCount} files. Failed: ${failCount}`,
            stats: { success: successCount, failed: failCount }
        });

    } catch (error) {
        console.error('Seed API error:', error);
        return NextResponse.json(
            { error: 'Failed to process seed request' },
            { status: 500 }
        );
    }
}
