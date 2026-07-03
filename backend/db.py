import os
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", str(ROOT_DIR / "storage" / "uploads")))
BACKUP_DIR = Path(os.environ.get("BACKUP_DIR", str(ROOT_DIR / "storage" / "backups")))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

# Subscription plans -> gallery limits (number of top-level galleries)
PLANS = {
    "starter": {"label": "Starter", "gallery_limit": 10, "price": 15},
    "professional": {"label": "Professional", "gallery_limit": 30, "price": 35},
    "studio": {"label": "Studio", "gallery_limit": 60, "price": 65},
}


def resolve_public_base() -> str:
    """The app's public origin, used to build absolute links in emails/logos.
    Prefers PUBLIC_BASE_URL; falls back to https://ROOT_DOMAIN. Returns '' if neither is set
    so callers can refuse to emit a broken (host-less) URL."""
    b = (os.environ.get("PUBLIC_BASE_URL") or "").strip().rstrip("/")
    if b:
        return b
    rd = (os.environ.get("ROOT_DOMAIN") or "").strip().strip("/")
    if rd and "." in rd:
        return f"https://{rd}"
    return ""

