import uuid
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException

from db import db
from auth_utils import get_current_tenant, hash_password, verify_password
from models import ShareCreate

router = APIRouter(prefix="/api/admin", tags=["shares"])


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def clean(d):
    if d:
        d = dict(d)
        d.pop("_id", None)
        d.pop("password_hash", None)
    return d


@router.post("/galleries/{gid}/shares")
async def create_share(gid: str, body: ShareCreate, ctx=Depends(get_current_tenant)):
    if body.access_level not in ("view", "download", "full"):
        raise HTTPException(status_code=400, detail="Invalid access level")
    g = await db.galleries.find_one({"id": gid, "tenant_id": ctx["tenant_id"]})
    if not g:
        raise HTTPException(status_code=404, detail="Gallery not found")
    if body.custom_slug:
        exists = await db.shares.find_one({"custom_slug": body.custom_slug})
        if exists:
            raise HTTPException(status_code=400, detail="Custom slug already taken")
    else:
        # auto-generate a vanity slug from the gallery (couple) name + date
        from media import slugify as _sl
        base = _sl(g.get("folder_name", "gallery"))
        cand = base
        n = 1
        while await db.shares.find_one({"custom_slug": cand}):
            n += 1
            cand = f"{base}-{n}"
        body.custom_slug = cand
    doc = {
        "id": str(uuid.uuid4()), "tenant_id": ctx["tenant_id"], "gallery_id": gid,
        "token": secrets.token_urlsafe(10),
        "subfolder": body.subfolder,
        "password_hash": hash_password(body.password) if body.password else None,
        "has_password": bool(body.password),
        "access_level": body.access_level,
        "is_active": True,
        "expires_at": body.expires_at,
        "label": body.label,
        "custom_slug": body.custom_slug,
        "guest_upload_mode": body.guest_upload_mode,
        "expiry_reminder_sent": False,
        "created_at": now_iso(),
    }
    await db.shares.insert_one(doc)
    return clean(doc)


@router.get("/galleries/{gid}/shares")
async def list_shares(gid: str, ctx=Depends(get_current_tenant)):
    items = await db.shares.find({"tenant_id": ctx["tenant_id"], "gallery_id": gid}).sort("created_at", -1).to_list(200)
    return [clean(i) for i in items]


@router.delete("/shares/{sid}")
async def delete_share(sid: str, ctx=Depends(get_current_tenant)):
    await db.shares.delete_one({"id": sid, "tenant_id": ctx["tenant_id"]})
    return {"deleted": True}


@router.put("/shares/{sid}/toggle")
async def toggle_share(sid: str, ctx=Depends(get_current_tenant)):
    s = await db.shares.find_one({"id": sid, "tenant_id": ctx["tenant_id"]})
    if not s:
        raise HTTPException(status_code=404, detail="Share not found")
    new_state = not s.get("is_active", True)
    await db.shares.update_one({"id": sid}, {"$set": {"is_active": new_state}})
    return {"is_active": new_state}


@router.put("/shares/{sid}/expiry")
async def set_expiry(sid: str, payload: dict, ctx=Depends(get_current_tenant)):
    await db.shares.update_one({"id": sid, "tenant_id": ctx["tenant_id"]},
                               {"$set": {"expires_at": payload.get("expires_at"), "expiry_reminder_sent": False}})
    return {"ok": True}
