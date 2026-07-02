import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException

from db import db, PLANS
from auth_utils import (
    hash_password, verify_password, create_token,
    get_current_super_admin, _clean,
)
from models import LoginRequest, TenantCreate, PlanUpdate
from media import tenant_root, backup_gallery_dir, remove_path, dir_size_bytes
from db import UPLOAD_DIR, BACKUP_DIR

router = APIRouter(prefix="/api/super-admin", tags=["super-admin"])


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def _subdomain_base(name: str) -> str:
    import re
    s = re.sub(r"[^a-z0-9]", "", (name or "").lower())
    return s or "studio"


async def make_unique_subdomain(name: str) -> str:
    base = _subdomain_base(name)
    slug = base
    i = 1
    while await db.tenants.find_one({"subdomain": slug}):
        i += 1
        slug = f"{base}{i}"
    return slug


@router.post("/login")
async def super_login(body: LoginRequest):
    sa = await db.super_admins.find_one({"username": body.username})
    if not sa or not verify_password(body.password, sa["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token({"sub": sa["id"], "role": "super_admin"})
    return {"token": token, "username": sa["username"], "role": "super_admin"}


@router.get("/me")
async def super_me(sa=Depends(get_current_super_admin)):
    return sa


async def _tenant_public(t: dict) -> dict:
    t = _clean(t)
    plan = PLANS.get(t.get("plan", "starter"), PLANS["starter"])
    t["plan_label"] = plan["label"]
    t["gallery_limit"] = t.get("gallery_limit", plan["gallery_limit"])
    t["price"] = plan["price"]
    return t


@router.get("/tenants")
async def list_tenants(sa=Depends(get_current_super_admin)):
    tenants = await db.tenants.find().sort("created_at", -1).to_list(1000)
    out = []
    for t in tenants:
        gcount = await db.galleries.count_documents({"tenant_id": t["id"]})
        t = await _tenant_public(t)
        t["gallery_count"] = gcount
        out.append(t)
    return out


@router.post("/tenants")
async def create_tenant(body: TenantCreate, sa=Depends(get_current_super_admin)):
    if body.plan not in PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")
    existing = await db.admins.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already in use")
    tenant_id = str(uuid.uuid4())
    subdomain = await make_unique_subdomain(body.business_name)
    tenant = {
        "id": tenant_id,
        "business_name": body.business_name,
        "email": body.email.lower(),
        "subdomain": subdomain,
        "logo_url": None,
        "accent_color": "#D4AF37",
        "secondary_color": "#0A0A0B",
        "phone": None,
        "website": None,
        "plan": body.plan,
        "gallery_limit": PLANS[body.plan]["gallery_limit"],
        "storage_used_bytes": 0,
        "subscription_status": "active",
        "stripe_customer_id": None,
        "stripe_subscription_id": None,
        "suspended": False,
        "onboarding_complete": False,
        "created_at": now_iso(),
    }
    await db.tenants.insert_one(tenant)
    admin = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "totp_secret": None,
        "totp_enabled": False,
        "created_at": now_iso(),
    }
    await db.admins.insert_one(admin)
    return await _tenant_public(tenant)


@router.put("/tenants/{tenant_id}/plan")
async def update_plan(tenant_id: str, body: PlanUpdate, sa=Depends(get_current_super_admin)):
    updates = {}
    if body.plan:
        if body.plan not in PLANS:
            raise HTTPException(status_code=400, detail="Invalid plan")
        updates["plan"] = body.plan
        updates["gallery_limit"] = PLANS[body.plan]["gallery_limit"]
    if body.storage_limit_bytes is not None:
        updates["gallery_limit"] = body.storage_limit_bytes
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    r = await db.tenants.update_one({"id": tenant_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tenant not found")
    t = await db.tenants.find_one({"id": tenant_id})
    return await _tenant_public(t)


@router.put("/tenants/{tenant_id}/suspend")
async def suspend_tenant(tenant_id: str, sa=Depends(get_current_super_admin)):
    r = await db.tenants.update_one({"id": tenant_id}, {"$set": {"suspended": True}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {"suspended": True}


@router.put("/tenants/{tenant_id}/unsuspend")
async def unsuspend_tenant(tenant_id: str, sa=Depends(get_current_super_admin)):
    r = await db.tenants.update_one({"id": tenant_id}, {"$set": {"suspended": False}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {"suspended": False}


@router.delete("/tenants/{tenant_id}")
async def delete_tenant(tenant_id: str, sa=Depends(get_current_super_admin)):
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    for coll in ["admins", "galleries", "files", "shares", "favourites",
                 "activity_log", "email_log", "email_templates", "templates",
                 "settings", "print_sizes", "print_orders"]:
        await db[coll].delete_many({"tenant_id": tenant_id})
    await db.tenants.delete_one({"id": tenant_id})
    remove_path(tenant_root(tenant_id))
    remove_path(BACKUP_DIR / tenant_id)
    return {"deleted": True}


@router.post("/tenants/{tenant_id}/impersonate")
async def impersonate(tenant_id: str, sa=Depends(get_current_super_admin)):
    admin = await db.admins.find_one({"tenant_id": tenant_id})
    if not admin:
        raise HTTPException(status_code=404, detail="Tenant admin not found")
    token = create_token({
        "sub": admin["id"], "role": "tenant_admin",
        "tenant_id": tenant_id, "impersonated_by": sa["id"],
    })
    return {"token": token, "tenant_id": tenant_id}


@router.get("/overview")
async def overview(sa=Depends(get_current_super_admin)):
    tenants = await db.tenants.find().to_list(1000)
    total_used = sum(t.get("storage_used_bytes", 0) for t in tenants)
    total_galleries = await db.galleries.count_documents({})
    active = [t for t in tenants if not t.get("suspended") and t.get("subscription_status") == "active"]
    mrr = sum(PLANS.get(t.get("plan", "starter"), PLANS["starter"])["price"] for t in active)
    return {
        "tenant_count": len(tenants),
        "active_count": len(active),
        "suspended_count": len([t for t in tenants if t.get("suspended")]),
        "total_storage_used_bytes": total_used,
        "total_galleries": total_galleries,
        "mrr": mrr,
        "plans": PLANS,
    }
