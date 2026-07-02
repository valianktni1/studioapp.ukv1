import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse, Response

from db import db
from auth_utils import get_current_tenant
from models import GalleryCreate, GalleryUpdate, TemplateCreate, DEFAULT_SUBFOLDERS
from media import (
    slugify, file_type_for, gallery_dir, cache_dir, remove_path,
    generate_image_derivatives, thumbnail_executor, backup_gallery_dir,
)

router = APIRouter(prefix="/api/admin", tags=["galleries"])


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def clean(doc):
    if doc:
        doc = dict(doc)
        doc.pop("_id", None)
    return doc


# ---------------- Templates ----------------
@router.get("/templates")
async def list_templates(ctx=Depends(get_current_tenant)):
    items = await db.templates.find({"tenant_id": ctx["tenant_id"]}).to_list(200)
    return [clean(i) for i in items]


@router.post("/templates")
async def create_template(body: TemplateCreate, ctx=Depends(get_current_tenant)):
    doc = {"id": str(uuid.uuid4()), "tenant_id": ctx["tenant_id"], "name": body.name,
           "subfolders": body.subfolders, "created_at": now_iso()}
    await db.templates.insert_one(doc)
    return clean(doc)


@router.delete("/templates/{tid}")
async def delete_template(tid: str, ctx=Depends(get_current_tenant)):
    await db.templates.delete_one({"id": tid, "tenant_id": ctx["tenant_id"]})
    return {"deleted": True}


# ---------------- Galleries ----------------
async def _enrich_gallery(g, tenant_id):
    g = clean(g)
    counts = {}
    for sf in g.get("subfolders", []):
        counts[sf] = await db.files.count_documents(
            {"tenant_id": tenant_id, "gallery_id": g["id"], "subfolder": sf})
    g["file_counts"] = counts
    g["total_files"] = sum(counts.values())
    return g


@router.post("/galleries")
async def create_gallery(body: GalleryCreate, ctx=Depends(get_current_tenant)):
    from db import PLANS
    tenant = await db.tenants.find_one({"id": ctx["tenant_id"]})
    limit = tenant.get("gallery_limit")
    if limit is None:
        limit = PLANS.get(tenant.get("plan", "starter"), PLANS["starter"])["gallery_limit"]
    current = await db.galleries.count_documents({"tenant_id": ctx["tenant_id"]})
    if current >= limit:
        raise HTTPException(status_code=402, detail=f"You've reached your plan limit of {limit} galleries. Upgrade to add more.")
    subfolders = body.subfolders
    if body.template_id:
        tpl = await db.templates.find_one({"id": body.template_id, "tenant_id": ctx["tenant_id"]})
        if tpl:
            subfolders = tpl["subfolders"]
    if not subfolders:
        subfolders = list(DEFAULT_SUBFOLDERS)
    gid = str(uuid.uuid4())
    doc = {
        "id": gid, "tenant_id": ctx["tenant_id"], "folder_name": body.folder_name,
        "subfolders": subfolders, "client_email": body.client_email,
        "covers": {}, "created_at": now_iso(),
    }
    await db.galleries.insert_one(doc)
    for sf in subfolders:
        gallery_dir(ctx["tenant_id"], gid, slugify(sf)).mkdir(parents=True, exist_ok=True)
    return await _enrich_gallery(doc, ctx["tenant_id"])


@router.get("/galleries")
async def list_galleries(ctx=Depends(get_current_tenant)):
    items = await db.galleries.find({"tenant_id": ctx["tenant_id"]}).sort("created_at", -1).to_list(1000)
    return [await _enrich_gallery(g, ctx["tenant_id"]) for g in items]


@router.get("/galleries/{gid}")
async def get_gallery(gid: str, ctx=Depends(get_current_tenant)):
    g = await db.galleries.find_one({"id": gid, "tenant_id": ctx["tenant_id"]})
    if not g:
        raise HTTPException(status_code=404, detail="Gallery not found")
    g = await _enrich_gallery(g, ctx["tenant_id"])
    files = await db.files.find({"tenant_id": ctx["tenant_id"], "gallery_id": gid}).sort("created_at", 1).to_list(5000)
    g["files"] = [clean(f) for f in files]
    return g


@router.put("/galleries/{gid}")
async def update_gallery(gid: str, body: GalleryUpdate, ctx=Depends(get_current_tenant)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        await db.galleries.update_one({"id": gid, "tenant_id": ctx["tenant_id"]}, {"$set": updates})
    g = await db.galleries.find_one({"id": gid, "tenant_id": ctx["tenant_id"]})
    if not g:
        raise HTTPException(status_code=404, detail="Gallery not found")
    return await _enrich_gallery(g, ctx["tenant_id"])


@router.delete("/galleries/{gid}")
async def delete_gallery(gid: str, delete_backup: bool = Query(False), ctx=Depends(get_current_tenant)):
    g = await db.galleries.find_one({"id": gid, "tenant_id": ctx["tenant_id"]})
    if not g:
        raise HTTPException(status_code=404, detail="Gallery not found")
    freed = sum(f.get("file_size", 0) for f in await db.files.find(
        {"tenant_id": ctx["tenant_id"], "gallery_id": gid}).to_list(10000))
    await db.files.delete_many({"tenant_id": ctx["tenant_id"], "gallery_id": gid})
    await db.shares.delete_many({"tenant_id": ctx["tenant_id"], "gallery_id": gid})
    await db.galleries.delete_one({"id": gid})
    remove_path(gallery_dir(ctx["tenant_id"], gid))
    remove_path(cache_dir(gid, "thumbs"))
    remove_path(cache_dir(gid, "previews"))
    if delete_backup:
        remove_path(backup_gallery_dir(ctx["tenant_id"], gid))
    await db.tenants.update_one({"id": ctx["tenant_id"]}, {"$inc": {"storage_used_bytes": -freed}})
    return {"deleted": True}


@router.put("/galleries/{gid}/subfolders/{name}/cover")
async def set_cover(gid: str, name: str, payload: dict, ctx=Depends(get_current_tenant)):
    file_id = payload.get("file_id")
    await db.galleries.update_one({"id": gid, "tenant_id": ctx["tenant_id"]},
                                  {"$set": {f"covers.{name}": file_id}})
    return {"ok": True}


@router.delete("/galleries/{gid}/subfolders/{name}")
async def delete_subfolder(gid: str, name: str, ctx=Depends(get_current_tenant)):
    g = await db.galleries.find_one({"id": gid, "tenant_id": ctx["tenant_id"]})
    if not g:
        raise HTTPException(status_code=404, detail="Gallery not found")
    await db.files.delete_many({"tenant_id": ctx["tenant_id"], "gallery_id": gid, "subfolder": name})
    remove_path(gallery_dir(ctx["tenant_id"], gid, slugify(name)))
    subs = [s for s in g.get("subfolders", []) if s != name]
    await db.galleries.update_one({"id": gid}, {"$set": {"subfolders": subs}})
    return {"deleted": True}


# ---------------- File upload / delete / download ----------------
@router.post("/galleries/{gid}/upload")
async def upload_files(gid: str, subfolder: str = Form(...), files: list[UploadFile] = File(...),
                       ctx=Depends(get_current_tenant)):
    g = await db.galleries.find_one({"id": gid, "tenant_id": ctx["tenant_id"]})
    if not g:
        raise HTTPException(status_code=404, detail="Gallery not found")
    tenant = await db.tenants.find_one({"id": ctx["tenant_id"]})
    used = tenant.get("storage_used_bytes", 0)
    slug = slugify(subfolder)
    dest_dir = gallery_dir(ctx["tenant_id"], gid, slug)
    dest_dir.mkdir(parents=True, exist_ok=True)
    saved = []
    for uf in files:
        data = await uf.read()
        size = len(data)
        fpath = dest_dir / uf.filename
        with open(fpath, "wb") as f:
            f.write(data)
        used += size
        ftype = file_type_for(uf.filename)
        doc = {
            "id": str(uuid.uuid4()), "tenant_id": ctx["tenant_id"], "gallery_id": gid,
            "subfolder": subfolder, "subfolder_slug": slug, "filename": uf.filename,
            "file_type": ftype, "file_size": size,
            "has_thumb": False, "has_preview": False, "is_guest_upload": False,
            "created_at": now_iso(),
        }
        await db.files.insert_one(doc)
        if ftype == "photo":
            _submit_thumb(doc["id"], gid, slug, uf.filename, str(fpath))
        saved.append(clean(doc))
    await db.tenants.update_one({"id": ctx["tenant_id"]}, {"$set": {"storage_used_bytes": used}})
    return {"uploaded": len(saved), "files": saved}


def _submit_thumb(file_id, gid, slug, filename, path):
    thumbnail_executor.submit(_thumb_and_mark, file_id, gid, slug, filename, path)


def _thumb_and_mark(file_id, gid, slug, filename, path):
    from pymongo import MongoClient
    import os
    ok = generate_image_derivatives(gid, slug, filename, path)
    if ok:
        c = MongoClient(os.environ["MONGO_URL"])
        c[os.environ["DB_NAME"]].files.update_one(
            {"id": file_id}, {"$set": {"has_thumb": True, "has_preview": True}})
        c.close()


@router.delete("/galleries/{gid}/files/{file_id}")
async def delete_file(gid: str, file_id: str, delete_backup: bool = Query(False),
                      ctx=Depends(get_current_tenant)):
    f = await db.files.find_one({"id": file_id, "tenant_id": ctx["tenant_id"], "gallery_id": gid})
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    remove_path(gallery_dir(ctx["tenant_id"], gid, f["subfolder_slug"]) / f["filename"])
    stem = Path(f["filename"]).stem
    remove_path(cache_dir(gid, "thumbs") / f["subfolder_slug"] / f"{stem}.jpg")
    remove_path(cache_dir(gid, "previews") / f["subfolder_slug"] / f"{stem}.jpg")
    if delete_backup:
        remove_path(backup_gallery_dir(ctx["tenant_id"], gid) / f["subfolder_slug"] / f["filename"])
    await db.files.delete_one({"id": file_id})
    await db.tenants.update_one({"id": ctx["tenant_id"]}, {"$inc": {"storage_used_bytes": -f.get("file_size", 0)}})
    return {"deleted": True}


@router.get("/galleries/{gid}/download-file/{file_id}")
async def download_file(gid: str, file_id: str, ctx=Depends(get_current_tenant)):
    f = await db.files.find_one({"id": file_id, "tenant_id": ctx["tenant_id"], "gallery_id": gid})
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    path = gallery_dir(ctx["tenant_id"], gid, f["subfolder_slug"]) / f["filename"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="File missing on disk")
    return FileResponse(str(path), filename=f["filename"])


# ---------------- Dashboard stats ----------------
@router.get("/dashboard-stats")
async def dashboard_stats(ctx=Depends(get_current_tenant)):
    tid = ctx["tenant_id"]
    active_galleries = await db.galleries.count_documents({"tenant_id": tid})
    now = datetime.now(timezone.utc)
    soon = (now + timedelta(days=14)).isoformat()
    expiring = await db.shares.count_documents(
        {"tenant_id": tid, "is_active": True, "expires_at": {"$ne": None, "$lte": soon, "$gte": now.isoformat()}})
    week_ago = (now - timedelta(days=7)).isoformat()
    downloads_week = await db.activity_log.count_documents(
        {"tenant_id": tid, "action": "download", "created_at": {"$gte": week_ago}})
    galleries = await db.galleries.find({"tenant_id": tid}).to_list(1000)
    pending = 0
    for g in galleries:
        c = await db.files.count_documents({"tenant_id": tid, "gallery_id": g["id"], "subfolder": "Album Favourites"})
        if c == 0:
            pending += 1
    tenant = await db.tenants.find_one({"id": tid})
    from db import PLANS
    plan = PLANS.get(tenant.get("plan", "starter"), PLANS["starter"])
    return {
        "active_galleries": active_galleries,
        "expiring_soon": expiring,
        "downloads_this_week": downloads_week,
        "pending_albums": pending,
        "storage_used_bytes": tenant.get("storage_used_bytes", 0),
        "gallery_limit": tenant.get("gallery_limit", plan["gallery_limit"]),
        "plan_label": plan["label"],
    }


@router.get("/live-visitors")
async def live_visitors(ctx=Depends(get_current_tenant)):
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat()
    sessions = await db.live_sessions.find(
        {"tenant_id": ctx["tenant_id"], "last_seen": {"$gte": cutoff}}).to_list(500)
    return [clean(s) for s in sessions]


@router.get("/activity")
async def activity(ctx=Depends(get_current_tenant), search: str = Query("")):
    q = {"tenant_id": ctx["tenant_id"]}
    if search:
        q["$or"] = [{"gallery_name": {"$regex": search, "$options": "i"}},
                    {"detail": {"$regex": search, "$options": "i"}}]
    items = await db.activity_log.find(q).sort("created_at", -1).to_list(500)
    return [clean(i) for i in items]
