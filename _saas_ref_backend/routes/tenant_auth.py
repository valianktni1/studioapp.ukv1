from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException

from db import db, PLANS
from auth_utils import verify_password, hash_password, create_token, get_current_tenant, _clean, trial_info, TRIAL_DAYS
from models import RegisterRequest, AdminLogin, PasswordChange, OnboardingData

router = APIRouter(prefix="/api/admin", tags=["tenant-auth"])


def now_iso():
    return datetime.now(timezone.utc).isoformat()


@router.post("/register")
async def register(body: RegisterRequest):
    import uuid
    from routes.super_admin import make_unique_subdomain
    email = body.email.lower()
    if await db.admins.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    plan = body.plan if body.plan in PLANS else "starter"
    tenant_id = str(uuid.uuid4())
    subdomain = await make_unique_subdomain(body.business_name)
    trial_ends = (datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)).isoformat()
    tenant = {
        "id": tenant_id, "business_name": body.business_name, "email": email,
        "subdomain": subdomain, "logo_url": None, "accent_color": "#D4AF37",
        "secondary_color": "#0A0A0B", "phone": None, "website": None, "plan": plan,
        "gallery_limit": PLANS[plan]["gallery_limit"], "storage_used_bytes": 0,
        "subscription_status": "trialing", "trial_ends_at": trial_ends,
        "stripe_customer_id": None, "stripe_subscription_id": None, "suspended": False,
        "onboarding_complete": False, "created_at": now_iso(),
    }
    await db.tenants.insert_one(tenant)
    admin_id = str(uuid.uuid4())
    await db.admins.insert_one({
        "id": admin_id, "tenant_id": tenant_id, "email": email,
        "password_hash": hash_password(body.password), "totp_secret": None,
        "totp_enabled": False, "created_at": now_iso(),
    })
    token = create_token({"sub": admin_id, "role": "tenant_admin", "tenant_id": tenant_id})
    return {"token": token, "role": "tenant_admin", "onboarding_complete": False, "tenant": _tenant_brand(tenant)}


@router.post("/login")
async def admin_login(body: AdminLogin):
    admin = await db.admins.find_one({"email": body.email.lower()})
    if not admin or not verify_password(body.password, admin["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    tenant = await db.tenants.find_one({"id": admin["tenant_id"]})
    if not tenant:
        raise HTTPException(status_code=401, detail="Tenant not found")
    if tenant.get("suspended"):
        raise HTTPException(status_code=403, detail="Account suspended, contact support")
    token = create_token({"sub": admin["id"], "role": "tenant_admin", "tenant_id": admin["tenant_id"]})
    return {
        "token": token,
        "role": "tenant_admin",
        "onboarding_complete": tenant.get("onboarding_complete", False),
        "tenant": _tenant_brand(tenant),
    }


def _tenant_brand(t: dict) -> dict:
    ti = trial_info(t)
    t = _clean(t)
    plan = PLANS.get(t.get("plan", "starter"), PLANS["starter"])
    t["plan_label"] = plan["label"]
    t["gallery_limit"] = t.get("gallery_limit", plan["gallery_limit"])
    t["price"] = plan["price"]
    t["subscription_status"] = ti["status"]
    t["trial_expired"] = ti["trial_expired"]
    t["trial_days_left"] = ti["trial_days_left"]
    t["trial_ends_at"] = ti["trial_ends_at"]
    return t


@router.get("/me")
async def admin_me(ctx=Depends(get_current_tenant)):
    return {
        "admin_id": ctx["admin_id"],
        "email": ctx["email"],
        "impersonated": bool(ctx.get("impersonated_by")),
        "tenant": _tenant_brand(ctx["tenant"]),
    }


@router.put("/change-password")
async def change_password(body: PasswordChange, ctx=Depends(get_current_tenant)):
    admin = await db.admins.find_one({"id": ctx["admin_id"]})
    if not verify_password(body.current_password, admin["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    await db.admins.update_one({"id": ctx["admin_id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    return {"changed": True}


@router.post("/onboarding")
async def complete_onboarding(body: OnboardingData, ctx=Depends(get_current_tenant)):
    from routes.super_admin import make_unique_subdomain
    updates = {
        "business_name": body.business_name,
        "phone": body.phone,
        "website": body.website,
        "logo_url": body.logo_url,
        "accent_color": body.accent_color or "#D4AF37",
        "secondary_color": body.secondary_color or "#0A0A0B",
        "onboarding_complete": True,
    }
    current = await db.tenants.find_one({"id": ctx["tenant_id"]})
    if not current.get("subdomain"):
        updates["subdomain"] = await make_unique_subdomain(body.business_name)
    if body.contact_email:
        updates["email"] = body.contact_email
    await db.tenants.update_one({"id": ctx["tenant_id"]}, {"$set": updates})
    t = await db.tenants.find_one({"id": ctx["tenant_id"]})
    return _tenant_brand(t)


@router.put("/branding")
async def update_branding(body: OnboardingData, ctx=Depends(get_current_tenant)):
    updates = {k: v for k, v in {
        "business_name": body.business_name,
        "phone": body.phone,
        "website": body.website,
        "logo_url": body.logo_url,
        "accent_color": body.accent_color,
        "secondary_color": body.secondary_color,
    }.items() if v is not None}
    if body.contact_email:
        updates["email"] = body.contact_email.lower()
    await db.tenants.update_one({"id": ctx["tenant_id"]}, {"$set": updates})
    t = await db.tenants.find_one({"id": ctx["tenant_id"]})
    return _tenant_brand(t)
