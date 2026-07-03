import os
import uuid
import logging
from datetime import datetime, timezone
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from db import db, PLANS
from auth_utils import hash_password, verify_password
from routes import super_admin, tenant_auth, galleries, shares, public_share, billing, email, uploads

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("studioapp")

app = FastAPI(title="StudioApp")


@app.get("/api/")
async def root():
    return {"app": "StudioApp", "status": "ok"}


@app.get("/api/health")
async def health():
    return {"status": "healthy"}


app.include_router(super_admin.router)
app.include_router(tenant_auth.router)
app.include_router(galleries.router)
app.include_router(shares.router)
app.include_router(public_share.router)
app.include_router(billing.router)
app.include_router(email.router)
app.include_router(uploads.router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def seed_super_admin():
    username = os.environ["SUPER_ADMIN_USERNAME"]
    password = os.environ["SUPER_ADMIN_PASSWORD"]
    existing = await db.super_admins.find_one({"username": username})
    if not existing:
        await db.super_admins.insert_one({
            "id": str(uuid.uuid4()), "username": username,
            "password_hash": hash_password(password), "created_at": now_iso()})
        logger.info("Seeded super admin: %s", username)
    elif not verify_password(password, existing["password_hash"]):
        await db.super_admins.update_one({"username": username},
                                         {"$set": {"password_hash": hash_password(password)}})


async def seed_demo_tenant():
    email = "demo@studio-app.uk"
    if await db.admins.find_one({"email": email}):
        return
    tenant_id = str(uuid.uuid4())
    await db.tenants.insert_one({
        "id": tenant_id, "business_name": "Demo Studio", "email": email,
        "subdomain": "demo",
        "logo_url": None, "accent_color": "#D4AF37", "secondary_color": "#0A0A0B",
        "phone": None, "website": None, "plan": "professional",
        "gallery_limit": PLANS["professional"]["gallery_limit"], "storage_used_bytes": 0,
        "subscription_status": "active", "stripe_customer_id": None, "stripe_subscription_id": None,
        "suspended": False, "onboarding_complete": True, "created_at": now_iso()})
    await db.admins.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": tenant_id, "email": email,
        "password_hash": hash_password("Demo!2026"), "totp_secret": None,
        "totp_enabled": False, "created_at": now_iso()})
    logger.info("Seeded demo tenant: %s", email)


async def migrate_tenants():
    from routes.super_admin import make_unique_subdomain
    async for t in db.tenants.find({}):
        updates = {}
        if t.get("plan") == "pro":
            updates["plan"] = "professional"
        plan = updates.get("plan", t.get("plan", "starter"))
        if not t.get("gallery_limit"):
            updates["gallery_limit"] = PLANS.get(plan, PLANS["starter"])["gallery_limit"]
        if not t.get("subdomain"):
            updates["subdomain"] = await make_unique_subdomain(t.get("business_name", "studio"))
        if updates:
            await db.tenants.update_one({"id": t["id"]}, {"$set": updates})


async def create_indexes():
    await db.super_admins.create_index("username", unique=True)
    await db.admins.create_index("email", unique=True)
    await db.tenants.create_index("id", unique=True)
    await db.tenants.create_index("subdomain")
    await db.galleries.create_index([("tenant_id", 1), ("created_at", -1)])
    await db.files.create_index([("tenant_id", 1), ("gallery_id", 1)])
    await db.files.create_index([("gallery_id", 1), ("filename", 1)])
    await db.shares.create_index("token")
    await db.shares.create_index("custom_slug")


@app.on_event("startup")
async def startup():
    await create_indexes()
    await seed_super_admin()
    await seed_demo_tenant()
    await migrate_tenants()
    try:
        from storage_client import init_storage
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error("Object storage init failed: %s", e)


@app.on_event("shutdown")
async def shutdown():
    pass
