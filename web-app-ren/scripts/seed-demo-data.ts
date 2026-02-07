/**
 * デモ日記データをmemUに投入するスクリプト
 * 
 * 実行方法:
 * cd web-app-ren
 * pnpm seed:demo
 */

import fs from 'fs';
import path from 'path';

const PYTHON_API_URL = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:8000';
// コマンドライン引数からユーザーIDを取得
const args = process.argv.slice(2);
const TARGET_USER_ID = args[0] || 'demo-user-12345';

console.log(`Target User ID: ${TARGET_USER_ID}`);

async function memorizeFile(filePath: string): Promise<boolean> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    console.log(`Memorizing: ${fileName}`);

    try {
        const response = await fetch(`${PYTHON_API_URL}/memorize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content,
                user_id: TARGET_USER_ID,
                modality: 'diary',
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error(`  Failed: ${error}`);
            return false;
        }

        const result = await response.json();
        console.log(`  Success: ${result.memory_id || 'done'}`);
        return true;
    } catch (error) {
        console.error(`  Error: ${error}`);
        return false;
    }
}

async function checkHealth(): Promise<boolean> {
    try {
        const response = await fetch(`${PYTHON_API_URL}/health`);
        if (!response.ok) return false;
        const data = await response.json();
        return data.status === 'ok' && data.memu_initialized;
    } catch {
        return false;
    }
}

async function main() {
    console.log('=== WakeUpAI Demo Data Seeder ===\n');

    // ヘルスチェック
    console.log('Checking Python API...');
    const isHealthy = await checkHealth();

    if (!isHealthy) {
        console.error('ERROR: Python API is not running or memU is not initialized.');
        console.log('\nPlease start the Python API first:');
        console.log('  cd python-api');
        console.log('  source .venv/bin/activate');
        console.log('  uvicorn main:app --reload --port 8000');
        process.exit(1);
    }

    console.log('Python API is healthy!\n');

    // デモ日記ファイルを読み込み
    const diaryDir = path.join(__dirname, '../data/demo-diary');

    if (!fs.existsSync(diaryDir)) {
        console.error(`ERROR: Diary directory not found: ${diaryDir}`);
        process.exit(1);
    }

    const files = fs.readdirSync(diaryDir)
        .filter(f => f.endsWith('.md'))
        .sort();

    console.log(`Found ${files.length} diary files.\n`);

    let successCount = 0;
    let failCount = 0;

    for (const file of files) {
        const filePath = path.join(diaryDir, file);
        const success = await memorizeFile(filePath);

        if (success) {
            successCount++;
        } else {
            failCount++;
        }

        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n=== Summary ===');
    console.log(`Success: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`\nDemo user ID: ${TARGET_USER_ID}`);
    console.log('You can use this ID in localStorage for testing.');
}

main().catch(console.error);
