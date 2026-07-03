import io
import os
import uuid
import zipfile
import jwt
from datetime import datetime, timezone, timedelta
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import FileResponse, StreamingResponse

from db import db, resolve_public_base
from auth_utils import verify_password, get_jwt_secret
from media import (
    slugify, file_type_for, gallery_dir, cache_dir,
    generate_image_derivatives,
)

router = APIRouter(prefix="/api", tags=["public-share"])


def _issue_grant(token: str) -> str:
    return jwt.encode(
        {"t": token, "exp": datetime.now(timezone.utc) + timedelta(hours=24)},
        get_jwt_secret(), algorithm="HS256")


def _grant_valid(token: str, grant: str) -> bool:
    if not grant:
        return False
    try:
        p = jwt.decode(grant, get_jwt_secret(), algorithms=["HS256"])
        return p.get("t") == token
    except jwt.InvalidTokenError:
        return False


async def _require_download_access(s, grant: str = None):
    """Enforce password gate on downloads for password-protected shares."""
    if not _access_allows_download(s):
        raise HTTPException(status_code=403, detail="Downloads are disabled for this gallery")
    if s.get("has_password") and not _grant_valid(s["token"], grant):
        raise HTTPException(status_code=401, detail="Unlock the gallery to download")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def clean(d):
    if d:
        d = dict(d)
        d.pop("_id", None)
        d.pop("password_hash", None)
    return d


async def _resolve_share(token: str):
    s = await db.shares.find_one({"$or": [{"token": token}, {"custom_slug": token}]})
    if not s or not s.get("is_active", True):
        raise HTTPException(status_code=404, detail="Share link not found or inactive")
    if s.get("expires_at"):
        if s["expires_at"] < now_iso():
            raise HTTPException(status_code=410, detail="This gallery link has expired")
    return s


async def _tenant_brand(tenant_id):
    t = await db.tenants.find_one({"id": tenant_id})
    if not t:
        return {}
    return {
        "business_name": t.get("business_name"),
        "logo_url": t.get("logo_url"),
        "accent_color": t.get("accent_color", "#D4AF37"),
        "secondary_color": t.get("secondary_color", "#0A0A0B"),
        "email": t.get("email"),
    }


@router.get("/share/{token}")
async def share_meta(token: str):
    s = await _resolve_share(token)
    g = await db.galleries.find_one({"id": s["gallery_id"]})
    if not g:
        raise HTTPException(status_code=404, detail="Gallery not found")
    subfolders = [s["subfolder"]] if s.get("subfolder") else g.get("subfolders", [])
    return {
        "share_id": s["id"],
        "needs_password": bool(s.get("has_password")),
        "access_level": s.get("access_level"),
        "guest_upload_mode": s.get("guest_upload_mode", False),
        "gallery_name": g.get("folder_name"),
        "gallery_id": g["id"],
        "subfolders": subfolders,
        "tenant": await _tenant_brand(s["tenant_id"]),
    }


async def _files_payload(s, g):
    subfolders = [s["subfolder"]] if s.get("subfolder") else g.get("subfolders", [])
    q = {"tenant_id": s["tenant_id"], "gallery_id": g["id"], "subfolder": {"$in": subfolders}}
    files = await db.files.find(q).sort("created_at", 1).to_list(10000)
    fav_count = await db.favourites.count_documents({"share_token": s["token"]})
    return {
        "gallery_name": g.get("folder_name"),
        "gallery_id": g["id"],
        "subfolders": subfolders,
        "covers": g.get("covers", {}),
        "access_level": s.get("access_level"),
        "guest_upload_mode": s.get("guest_upload_mode", False),
        "tenant": await _tenant_brand(s["tenant_id"]),
        "favourites_count": fav_count,
        "grant": _issue_grant(s["token"]),
        "files": [clean(f) for f in files],
    }


@router.post("/share/{token}/access")
async def share_access(token: str, payload: dict):
    s = await _resolve_share(token)
    if s.get("has_password"):
        if not verify_password(payload.get("password", ""), s["password_hash"]):
            raise HTTPException(status_code=401, detail="Incorrect password")
    g = await db.galleries.find_one({"id": s["gallery_id"]})
    if not g:
        raise HTTPException(status_code=404, detail="Gallery not found")
    return await _files_payload(s, g)


@router.get("/share/{token}/files")
async def share_files(token: str):
    s = await _resolve_share(token)
    if s.get("has_password"):
        raise HTTPException(status_code=401, detail="Password required")
    g = await db.galleries.find_one({"id": s["gallery_id"]})
    if not g:
        raise HTTPException(status_code=404, detail="Gallery not found")
    return await _files_payload(s, g)


# ---------------- Favourites ----------------
@router.post("/share/{token}/favourite")
async def toggle_favourite(token: str, payload: dict):
    s = await _resolve_share(token)
    file_id = payload.get("file_id")
    session_id = payload.get("session_id", "anon")
    existing = await db.favourites.find_one({"share_token": s["token"], "file_id": file_id, "session_id": session_id})
    if existing:
        await db.favourites.delete_one({"_id": existing["_id"]})
        faved = False
    else:
        await db.favourites.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": s["tenant_id"], "gallery_id": s["gallery_id"],
            "share_token": s["token"], "session_id": session_id, "file_id": file_id, "created_at": now_iso()})
        faved = True
    count = await db.favourites.count_documents({"share_token": s["token"]})
    return {"favourited": faved, "count": count}


@router.post("/share/{token}/submit-favourites")
async def submit_favourites(token: str, payload: dict):
    s = await _resolve_share(token)
    g = await db.galleries.find_one({"id": s["gallery_id"]})
    count = await db.favourites.count_documents({"share_token": s["token"]})
    await db.activity_log.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": s["tenant_id"], "gallery_id": s["gallery_id"],
        "gallery_name": g.get("folder_name") if g else "", "action": "submit",
        "detail": f"Submitted {count} favourites", "created_at": now_iso()})
    return {"submitted": True, "count": count}


# ---------------- Tracking / heartbeat ----------------
@router.post("/share/{token}/track-view")
async def track_view(token: str, payload: dict):
    s = await _resolve_share(token)
    g = await db.galleries.find_one({"id": s["gallery_id"]})
    await db.activity_log.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": s["tenant_id"], "gallery_id": s["gallery_id"],
        "gallery_name": g.get("folder_name") if g else "", "action": "view",
        "detail": payload.get("detail", ""), "created_at": now_iso()})
    return {"ok": True}


@router.post("/share/{token}/heartbeat")
async def heartbeat(token: str, payload: dict, request: Request):
    s = await _resolve_share(token)
    g = await db.galleries.find_one({"id": s["gallery_id"]})
    ua = request.headers.get("user-agent", "").lower()
    device = "Mobile" if "mobile" in ua else ("Tablet" if "tablet" in ua or "ipad" in ua else "Desktop")
    await db.live_sessions.update_one(
        {"session_id": payload.get("session_id")},
        {"$set": {
            "session_id": payload.get("session_id"), "tenant_id": s["tenant_id"],
            "gallery_id": s["gallery_id"], "gallery_name": g.get("folder_name") if g else "",
            "action": payload.get("action", "viewing"), "subfolder": payload.get("subfolder", ""),
            "detail": payload.get("detail", ""), "device": device, "last_seen": now_iso(),
        }, "$setOnInsert": {"started_at": now_iso()}}, upsert=True)
    return {"ok": True}


# ---------------- Downloads ----------------
def _access_allows_download(s):
    return s.get("access_level") in ("download", "full")


async def _log_download(s, gname, detail):
    await db.activity_log.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": s["tenant_id"], "gallery_id": s["gallery_id"],
        "gallery_name": gname, "action": "download", "detail": detail, "created_at": now_iso()})


@router.get("/share/{token}/download/{file_id}")
async def share_download(token: str, file_id: str, grant: str = None):
    s = await _resolve_share(token)
    await _require_download_access(s, grant)
    f = await db.files.find_one({"id": file_id, "gallery_id": s["gallery_id"]})
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    path = gallery_dir(s["tenant_id"], s["gallery_id"], f["subfolder_slug"]) / f["filename"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="File missing")
    g = await db.galleries.find_one({"id": s["gallery_id"]})
    await _log_download(s, g.get("folder_name") if g else "", f["filename"])
    return FileResponse(str(path), filename=f["filename"])


@router.post("/share/{token}/download-zip")
async def share_download_zip(token: str, payload: dict = None):
    s = await _resolve_share(token)
    grant = (payload or {}).get("grant")
    await _require_download_access(s, grant)
    g = await db.galleries.find_one({"id": s["gallery_id"]})
    subfolders = [s["subfolder"]] if s.get("subfolder") else g.get("subfolders", [])
    files = await db.files.find(
        {"tenant_id": s["tenant_id"], "gallery_id": s["gallery_id"], "subfolder": {"$in": subfolders}}).to_list(10000)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
        for f in files:
            p = gallery_dir(s["tenant_id"], s["gallery_id"], f["subfolder_slug"]) / f["filename"]
            if p.exists():
                zf.write(str(p), arcname=f"{f['subfolder']}/{f['filename']}")
    buf.seek(0)
    await _log_download(s, g.get("folder_name") if g else "", "Download All (ZIP)")
    fname = (g.get("folder_name") if g else "gallery").replace(" ", "_") + ".zip"
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": f"attachment; filename={fname}"})


# ---------------- Guest uploads ----------------
@router.get("/share/{token}/guest-upload-count")
async def guest_count(token: str):
    s = await _resolve_share(token)
    c = await db.files.count_documents(
        {"gallery_id": s["gallery_id"], "is_guest_upload": True})
    return {"count": c}


@router.post("/share/{token}/upload")
async def guest_upload(token: str, files: list[UploadFile] = File(...)):
    s = await _resolve_share(token)
    if not s.get("guest_upload_mode"):
        raise HTTPException(status_code=403, detail="Guest uploads not enabled")
    tenant = await db.tenants.find_one({"id": s["tenant_id"]})
    used = tenant.get("storage_used_bytes", 0)
    subfolder = "Guest Uploads"
    slug = slugify(subfolder)
    dest = gallery_dir(s["tenant_id"], s["gallery_id"], slug)
    dest.mkdir(parents=True, exist_ok=True)
    saved = 0
    for uf in files:
        data = await uf.read()
        size = len(data)
        with open(dest / uf.filename, "wb") as fh:
            fh.write(data)
        used += size
        ftype = file_type_for(uf.filename)
        doc = {"id": str(uuid.uuid4()), "tenant_id": s["tenant_id"], "gallery_id": s["gallery_id"],
               "subfolder": subfolder, "subfolder_slug": slug, "filename": uf.filename,
               "file_type": ftype, "file_size": size, "has_thumb": False, "has_preview": False,
               "is_guest_upload": True, "created_at": now_iso()}
        await db.files.insert_one(doc)
        if ftype == "photo":
            from routes.galleries import _thumb_and_mark
            from media import thumbnail_executor
            thumbnail_executor.submit(_thumb_and_mark, doc["id"], s["gallery_id"], slug, uf.filename, str(dest / uf.filename))
        saved += 1
    await db.tenants.update_one({"id": s["tenant_id"]}, {"$set": {"storage_used_bytes": used}})
    return {"uploaded": saved}


# ---------------- Media serving (capability = gallery_id uuid) ----------------
async def _find_file(gallery_id, filename, subfolder_slug=None):
    q = {"gallery_id": gallery_id, "filename": filename}
    if subfolder_slug:
        q["subfolder_slug"] = subfolder_slug
    return await db.files.find_one(q)


@router.get("/public/tenant/{subdomain}")
async def public_tenant(subdomain: str):
    t = await db.tenants.find_one({"subdomain": subdomain.lower()})
    if not t or t.get("suspended"):
        raise HTTPException(status_code=404, detail="Studio not found")
    return {
        "business_name": t.get("business_name"),
        "subdomain": t.get("subdomain"),
        "logo_url": t.get("logo_url"),
        "accent_color": t.get("accent_color", "#D4AF37"),
        "secondary_color": t.get("secondary_color", "#0A0A0B"),
        "website": t.get("website"),
    }


@router.get("/share/{token}/video-url/{file_id}")
async def share_video_url(token: str, file_id: str):
    """Returns a streaming URL: signed NGINX secure_link if configured, else the original via API."""
    s = await _resolve_share(token)
    f = await db.files.find_one({"id": file_id, "gallery_id": s["gallery_id"]})
    if not f or f.get("file_type") != "video":
        raise HTTPException(status_code=404, detail="Video not found")
    from media import sign_video_uri
    base = os.environ.get("NGINX_VIDEO_BASE_URL", "").rstrip("/")
    stem = Path(f["filename"]).stem
    if base and f.get("web_ready"):
        uri = f"/video/{s['tenant_id']}/{s['gallery_id']}/{f['subfolder_slug']}/{stem}.web.mp4"
        md5, expires = sign_video_uri(uri)
        return {"url": f"{base}{uri}?md5={md5}&expires={expires}", "type": "web"}
    public = resolve_public_base()
    return {"url": f"{public}/api/media/original/{s['gallery_id']}/{f['subfolder_slug']}/{f['filename']}", "type": "original"}


@router.get("/media/thumb/{gallery_id}/{subfolder_slug}/{filename}")
async def media_thumb(gallery_id: str, subfolder_slug: str, filename: str):
    stem = Path(filename).stem
    thumb = cache_dir(gallery_id, "thumbs") / subfolder_slug / f"{stem}.jpg"
    if not thumb.exists():
        f = await _find_file(gallery_id, filename, subfolder_slug)
        if not f:
            raise HTTPException(status_code=404, detail="Not found")
        if f.get("file_type") == "video":
            raise HTTPException(status_code=404, detail="Poster not ready")
        src = gallery_dir(f["tenant_id"], gallery_id, subfolder_slug) / filename
        generate_image_derivatives(gallery_id, subfolder_slug, filename, str(src))
    if not thumb.exists():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(str(thumb), media_type="image/jpeg")


@router.get("/media/preview/{gallery_id}/{subfolder_slug}/{filename}")
async def media_preview(gallery_id: str, subfolder_slug: str, filename: str):
    stem = Path(filename).stem
    preview = cache_dir(gallery_id, "previews") / subfolder_slug / f"{stem}.jpg"
    if not preview.exists():
        f = await _find_file(gallery_id, filename, subfolder_slug)
        if not f:
            raise HTTPException(status_code=404, detail="Not found")
        if f.get("file_type") == "video":
            raise HTTPException(status_code=404, detail="Poster not ready")
        src = gallery_dir(f["tenant_id"], gallery_id, subfolder_slug) / filename
        generate_image_derivatives(gallery_id, subfolder_slug, filename, str(src))
    if not preview.exists():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(str(preview), media_type="image/jpeg")


@router.get("/media/original/{gallery_id}/{subfolder_slug}/{filename}")
async def media_original(gallery_id: str, subfolder_slug: str, filename: str):
    f = await _find_file(gallery_id, filename, subfolder_slug)
    if not f:
        raise HTTPException(status_code=404, detail="Not found")
    path = gallery_dir(f["tenant_id"], gallery_id, subfolder_slug) / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(str(path))
