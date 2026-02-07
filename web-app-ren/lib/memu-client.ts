const PYTHON_API_URL = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:8000';

export interface MemoryItem {
    summary: string;
    category: string;
    metadata: Record<string, unknown>;
}

export interface RetrieveResponse {
    items: MemoryItem[];
}

export interface MemorizeResponse {
    success: boolean;
    memory_id?: string;
}

/**
 * memU から記憶を検索
 */
export async function retrieveMemory(
    queries: Array<{ role: string; content: string }>,
    userId: string
): Promise<MemoryItem[]> {
    const response = await fetch(`${PYTHON_API_URL}/retrieve`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            queries,
            user_id: userId,
        }),
    });

    if (!response.ok) {
        console.error('Failed to retrieve memory:', response.statusText);
        return []; // エラー時は空配列を返す（記憶なしとして処理を継続）
    }

    const data: RetrieveResponse = await response.json();
    return data.items;
}

/**
 * memU に記憶を保存
 */
export async function memorizeContent(
    content: string,
    userId: string,
    modality: string = 'conversation'
): Promise<MemorizeResponse> {
    const response = await fetch(`${PYTHON_API_URL}/memorize`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            content,
            user_id: userId,
            modality,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to memorize content: ${response.statusText}`);
    }

    return response.json();
}

/**
 * memU ヘルスチェック
 */
export async function checkMemUHealth(): Promise<boolean> {
    try {
        const response = await fetch(`${PYTHON_API_URL}/health`);
        if (!response.ok) return false;
        const data = await response.json();
        return data.status === 'ok';
    } catch {
        return false;
    }
}
