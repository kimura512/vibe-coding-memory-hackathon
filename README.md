# WakeUpBuddy

"朝起きるのが辛い...いっそ誰かにブチ切れられたい..."
そんなあなたのための、新感覚目覚ましアプリ。

## Features
- **Character AI**: ツンデレ、オカン、イケメンなど、個性豊かなキャラクターがあなたを起こします。
- **Memory (memU)**: あなたとの会話を記憶し、日々のコンテキストを踏まえた会話が可能です。
- **Voice Interaction**: Gemini 2.5 Flash TTS / Gemini 3 Flash STT による自然な音声会話。
- **Escalation**: 起きないと徐々に不機嫌になったり、情緒不安定になったりします。

## Stack
- **Frontend**: Next.js 15, React 19, TailwindCSS, Framer Motion
- **Backend**: Python (FastAPI) for memU wrapper
- **Database**: SQLite (via Prisma & memU)
- **AI**: Google Gemini 3 Flash / 2.5 Flash

## Setup

```bash
# Frontend
cd web-app-ren
pnpm install
pnpm dev

# Backend (Terminal 2)
cd web-app-ren
source python-api/.venv/bin/activate
python -m uvicorn python-api.main:app --host 0.0.0.0 --port 8000
```
