import os
import uuid
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException

from db import db
from auth_utils import get_current_tenant, hash_password, verify_password, assert_trial_active
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
    tenant = await db.tenants.find_one({"id": ctx["tenant_id"]})
    assert_trial_active(tenant)
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
        "allow_delete": body.allow_delete,
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


@router.get("/shares/{sid}/qr-pdf")
async def share_qr_pdf(sid: str, design: str = "minimal", ctx=Depends(get_current_tenant)):
    from fastapi.responses import StreamingResponse
    from qr_pdf import build_qr_pdf
    from media import parse_couple_name
    from db import resolve_public_base
    s = await db.shares.find_one({"id": sid, "tenant_id": ctx["tenant_id"]})
    if not s:
        raise HTTPException(status_code=404, detail="Share not found")
    g = await db.galleries.find_one({"id": s["gallery_id"]})
    t = await db.tenants.find_one({"id": ctx["tenant_id"]})
    base = resolve_public_base()
    url = f"{base}/s/{s.get('custom_slug') or s['token']}"
    couple = parse_couple_name(g["folder_name"]) if g else "Your Gallery"
    brand = (t or {}).get("business_name", "Gallery")
    if design not in ("minimal", "classic", "botanical"):
        design = "minimal"
    buf = build_qr_pdf(url, couple, brand, design)
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="gallery-qr-{design}.pdf"'})
