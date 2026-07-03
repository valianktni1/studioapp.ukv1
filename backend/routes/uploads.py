import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from db import db
from auth_utils import get_current_tenant
from storage_client import put_object, get_object, APP_NAME

router = APIRouter(tags=["uploads"])

PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
ALLOWED = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "gif": "image/gif", "svg": "image/svg+xml"}
MAX_BYTES = 5 * 1024 * 1024


def now_iso():
    return datetime.now(timezone.utc).isoformat()


@router.post("/api/admin/logo")
async def upload_logo(file: UploadFile = File(...), ctx=Depends(get_current_tenant)):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    if ext not in ALLOWED:
        raise HTTPException(status_code=400, detail="Please upload a PNG, JPG, WEBP, GIF or SVG image")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="Logo must be under 5 MB")
    if ext != "svg":
        # verify it is a real, decodable raster image
        try:
            from io import BytesIO
            from PIL import Image
            Image.open(BytesIO(data)).verify()
        except Exception:
            raise HTTPException(status_code=400, detail="That file doesn't look like a valid image")
    content_type = ALLOWED[ext]
    path = f"{APP_NAME}/logos/{ctx['tenant_id']}/{uuid.uuid4()}.{ext}"
    try:
        result = await run_in_threadpool(put_object, path, data, content_type)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Logo upload failed: {e}")
    asset_id = str(uuid.uuid4())
    await db.assets.insert_one({
        "id": asset_id, "tenant_id": ctx["tenant_id"], "kind": "logo",
        "storage_path": result["path"], "content_type": content_type, "created_at": now_iso(),
    })
    logo_url = f"{PUBLIC_BASE_URL}/api/public/asset/{asset_id}"
    await db.tenants.update_one({"id": ctx["tenant_id"]}, {"$set": {"logo_url": logo_url, "logo_asset_id": asset_id}})
    return {"logo_url": logo_url, "asset_id": asset_id}


@router.get("/api/public/asset/{asset_id}")
async def serve_asset(asset_id: str):
    asset = await db.assets.find_one({"id": asset_id})
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    try:
        data, ct = await run_in_threadpool(get_object, asset["storage_path"])
    except Exception:
        raise HTTPException(status_code=404, detail="Asset unavailable")
    return Response(content=data, media_type=asset.get("content_type", ct),
                    headers={"Cache-Control": "public, max-age=86400"})
