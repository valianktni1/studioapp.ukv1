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
