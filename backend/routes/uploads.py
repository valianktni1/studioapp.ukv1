import os
import uuid
from pathlib import Path
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from db import db, UPLOAD_DIR
from auth_utils import get_current_tenant

router = APIRouter(tags=["uploads"])

ALLOWED = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "gif": "image/gif", "svg": "image/svg+xml"}
MAX_BYTES = 5 * 1024 * 1024

# Logos live on the local filesystem alongside gallery media (self-host friendly, no cloud deps).
ASSETS_DIR = UPLOAD_DIR / ".assets" / "logos"


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
        try:
            from io import BytesIO
            from PIL import Image
            Image.open(BytesIO(data)).verify()
        except Exception:
            raise HTTPException(status_code=400, detail="That file doesn't look like a valid image")
    content_type = ALLOWED[ext]
    asset_id = str(uuid.uuid4())
    dest_dir = ASSETS_DIR / ctx["tenant_id"]
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{asset_id}.{ext}"
    try:
        with open(dest, "wb") as fh:
            fh.write(data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Logo upload failed: {e}")
    await db.assets.insert_one({
        "id": asset_id, "tenant_id": ctx["tenant_id"], "kind": "logo",
        "storage_path": str(dest), "content_type": content_type, "created_at": now_iso(),
    })
    # Relative URL -> resolves against whatever origin serves the app (works on any domain, no config).
    logo_url = f"/api/public/asset/{asset_id}"
    await db.tenants.update_one({"id": ctx["tenant_id"]}, {"$set": {"logo_url": logo_url, "logo_asset_id": asset_id}})
    return {"logo_url": logo_url, "asset_id": asset_id}


@router.get("/api/public/asset/{asset_id}")
async def serve_asset(asset_id: str):
    asset = await db.assets.find_one({"id": asset_id})
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    path = Path(asset["storage_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Asset unavailable")
    return FileResponse(str(path), media_type=asset.get("content_type", "application/octet-stream"),
                        headers={"Cache-Control": "public, max-age=86400"})
