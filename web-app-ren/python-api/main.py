from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from dotenv import load_dotenv
from typing import List, Optional

# --- monkey-patch: sqlmodel 0.0.32 が list 型を SQLAlchemy 型に変換できないバグの回避 ---
import sqlmodel.main as _sqlmodel_main
from sqlalchemy import JSON as _SA_JSON

_orig_get_sqlalchemy_type = _sqlmodel_main.get_sqlalchemy_type

def _patched_get_sqlalchemy_type(field):
    try:
        return _orig_get_sqlalchemy_type(field)
    except ValueError:
        return _SA_JSON

_sqlmodel_main.get_sqlalchemy_type = _patched_get_sqlalchemy_type
# --- end monkey-patch ---

from memu.app.service import MemoryService

load_dotenv()

app = FastAPI(title="memU Wrapper API", version="0.1.0")

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# memU初期化
openai_key = os.getenv("OPENAI_API_KEY")
if not openai_key:
    print("WARNING: OPENAI_API_KEY not found. MemoryService will not be initialized.")
    service = None
else:
    llm_profiles = {
        "default": {
            "provider": "openai",
            "api_key": openai_key,
            "chat_model": "gpt-4o-mini"
        },
        "embedding": {
            "provider": "openai",
            "api_key": openai_key,
            "embed_model": "text-embedding-3-small"
        }
    }

    # Database設定
    db_path = os.getenv("MEMU_DB_PATH", "./memu.db")
    db_dsn = f"sqlite:///{os.path.abspath(db_path)}"

    database_config = {
        "metadata_store": {
            "provider": "sqlite",
            "dsn": db_dsn,
            "ddl_mode": "create"
        }
    }

    try:
        service = MemoryService(
            llm_profiles=llm_profiles,
            database_config=database_config
        )
        print("MemoryService initialized successfully.")
    except Exception as e:
        print(f"Failed to initialize MemoryService: {e}")
        service = None


# Pydantic Models
class QueryItem(BaseModel):
    role: str
    content: str

class RetrieveRequest(BaseModel):
    queries: List[QueryItem]
    user_id: str

class MemorizeRequest(BaseModel):
    resource_url: Optional[str] = None
    content: Optional[str] = None
    user_id: str
    modality: str = "conversation"


@app.get("/health")
async def health_check():
    """ヘルスチェック"""
    return {
        "status": "ok",
        "memu_initialized": service is not None
    }


@app.post("/retrieve")
async def retrieve_memory(req: RetrieveRequest):
    """記憶検索"""
    if service is None:
        raise HTTPException(status_code=503, detail="MemoryService not initialized")
    
    try:
        queries = [{"role": q.role, "content": q.content} for q in req.queries]
        result = await service.retrieve(
            queries=queries,
            where={"user_id": req.user_id}
        )
        
        # Convert items to list to be safe
        print(f"--- DEBUG: Python API Retrieve ---")
        print(f"UserID: {req.user_id}")
        print(f"Queries: {queries}")
        
        # result is a dict, so we access the 'items' list directly
        found_items = result.get('items', [])
        print(f"Found Items Count: {len(found_items)}")

        items = []
        for i, item in enumerate(found_items):
            # item is a dict (or object) representing a memory
            # We need to handle both cases (dict or object)
            summary = "No summary"
            category = "unknown"
            metadata = {}

            if isinstance(item, dict):
                summary = item.get('summary', 'No summary')
                category = item.get('category', 'unknown')
                metadata = item.get('metadata', {})
                score = item.get('score', 0.0)
            else:
                summary = getattr(item, 'summary', 'No summary')
                category = getattr(item, 'category', 'unknown')
                metadata = getattr(item, 'metadata', {})
                score = getattr(item, 'score', 0.0)
            
            print(f"Item [{i}]: Score={score}, Summary={summary[:50]}...")
            
            items.append({
                "summary": summary,
                "category": category,
                "metadata": metadata
            })
        
        return {"items": items}
    except Exception as e:
        print(f"Retrieve error: {e}")
        return {"items": []}  # エラー時は空のリストを返す


@app.post("/memorize")
async def memorize_content(req: MemorizeRequest):
    """記憶保存"""
    if service is None:
        raise HTTPException(status_code=503, detail="MemoryService not initialized")
    
    try:
        # contentが提供されている場合は一時ファイルを作成
        if req.content and not req.resource_url:
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt', encoding='utf-8') as f:
                f.write(req.content)
                resource_url = f.name
        else:
            resource_url = req.resource_url
        
        if not resource_url:
            raise HTTPException(status_code=400, detail="Either resource_url or content must be provided")
        
        print(f"--- DEBUG: Memorize ---")
        print(f"UserID: {req.user_id}")
        print(f"Modality: {req.modality}")
        print(f"ResourceURL: {resource_url}")
        
        result = await service.memorize(
            resource_url=os.path.abspath(resource_url),
            modality=req.modality,
            user={"user_id": req.user_id}
        )
        
        print(f"Memorize result type: {type(result)}")
        print(f"Memorize result: {result}")
        
        # Check what items were extracted
        if result:
            items = result.get('items', []) if isinstance(result, dict) else getattr(result, 'items', [])
            print(f"Extracted items count: {len(items) if items else 0}")
            for i, item in enumerate(items[:3]):  # Show first 3 items
                if isinstance(item, dict):
                    print(f"Item [{i}]: {item.get('summary', 'No summary')[:100]}")
                else:
                    print(f"Item [{i}]: {getattr(item, 'summary', 'No summary')[:100]}")
        
        return {
            "success": True,
            "memory_id": getattr(result, 'memory_id', None) if result else None
        }
    except Exception as e:
        print(f"Memorize error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/memorize-file")
async def memorize_file(user_id: str, file_path: str, modality: str = "document"):
    """ファイルを記憶に保存"""
    if service is None:
        raise HTTPException(status_code=503, detail="MemoryService not initialized")
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=400, detail=f"File not found: {file_path}")
    
    try:
        result = await service.memorize(
            resource_url=os.path.abspath(file_path),
            modality=modality,
            user={"user_id": user_id}
        )
        
        return {
            "success": True,
            "memory_id": getattr(result, 'memory_id', None) if result else None
        }
    except Exception as e:
        print(f"Memorize file error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
