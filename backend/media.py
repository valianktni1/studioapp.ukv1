import re
import os
import shutil
import time
import base64
import hashlib
import logging
import subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageOps

from db import UPLOAD_DIR, BACKUP_DIR

logger = logging.getLogger("studioapp")

# Two intentionally separate pools (per handoff): thumbs (fast) vs transcode (slow).
thumbnail_executor = ThreadPoolExecutor(max_workers=8)
transcode_executor = ThreadPoolExecutor(max_workers=2)

FFMPEG = shutil.which("ffmpeg")
VAAPI_DEVICE = os.environ.get("VAAPI_DEVICE", "/dev/dri/renderD128")

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".tiff", ".tif", ".webp", ".bmp"}
VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".mts"}

THUMB_SIZE = 400
PREVIEW_SIZE = 1600


def slugify(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", (name or "").strip().lower()).strip("-")
    return s or "folder"


def file_type_for(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext in IMAGE_EXTS:
        return "photo"
    if ext in VIDEO_EXTS:
        return "video"
    return "other"


def tenant_root(tenant_id: str) -> Path:
    return UPLOAD_DIR / tenant_id


def gallery_dir(tenant_id: str, gallery_folder: str, subfolder: str = "") -> Path:
    p = tenant_root(tenant_id) / gallery_folder
    if subfolder:
        p = p / subfolder
    return p


def cache_dir(gallery_id: str, kind: str) -> Path:
    return UPLOAD_DIR / ".cache" / kind / gallery_id


def _resize_to(src: Path, dst: Path, max_size: int, quality: int = 82):
    dst.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)
        im.thumbnail((max_size, max_size), Image.LANCZOS)
        if im.mode in ("RGBA", "P", "LA"):
            im = im.convert("RGB")
        im.save(dst, "JPEG", quality=quality, optimize=True)


def generate_image_derivatives(gallery_id: str, subfolder_slug: str, filename: str, src_path: str):
    """Runs in thumbnail_executor. Returns True on success."""
    src = Path(src_path)
    if not src.exists():
        return False
    stem = Path(filename).stem
    thumb = cache_dir(gallery_id, "thumbs") / subfolder_slug / f"{stem}.jpg"
    preview = cache_dir(gallery_id, "previews") / subfolder_slug / f"{stem}.jpg"
    try:
        _resize_to(src, thumb, THUMB_SIZE, 78)
        _resize_to(src, preview, PREVIEW_SIZE, 85)
        return True
    except Exception as e:
        import logging
        logging.getLogger("studioapp").warning("thumb gen failed for %s: %s", filename, e)
        return False


def dir_size_bytes(path: Path) -> int:
    total = 0
    if not path.exists():
        return 0
    for f in path.rglob("*"):
        if f.is_file():
            try:
                total += f.stat().st_size
            except OSError:
                pass
    return total


def remove_path(path: Path):
    if path.is_dir():
        shutil.rmtree(path, ignore_errors=True)
    elif path.exists():
        try:
            path.unlink()
        except OSError:
            pass


def backup_gallery_dir(tenant_id: str, gallery_folder: str) -> Path:
    return BACKUP_DIR / tenant_id / gallery_folder


def parse_couple_name(folder_name: str) -> str:
    """Strip a trailing date (e.g. 'Eva & Ella 27.06.26' -> 'Eva & Ella')."""
    if not folder_name:
        return ""
    cleaned = re.sub(r"\s*[-\u2013\u2014]?\s*(\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?|\d{4})\s*$", "", folder_name).strip()
    return cleaned or folder_name


# ---------------- Video pipeline (runs on the user's TrueNAS with ffmpeg + AMD 780M VAAPI) ----------------
def _db():
    from pymongo import MongoClient
    c = MongoClient(os.environ["MONGO_URL"])
    return c, c[os.environ["DB_NAME"]]


def _set_video_status(file_id, status, web_ready=None):
    c, db = _db()
    upd = {"video_status": status}
    if web_ready is not None:
        upd["web_ready"] = web_ready
    db.files.update_one({"id": file_id}, {"$set": upd})
    c.close()


def video_poster(gallery_id, subfolder_slug, filename, src_path):
    """Extract a frame ~1s in and build thumb + preview jpgs (so the grid shows a still)."""
    if not FFMPEG:
        return False
    src = Path(src_path)
    stem = Path(filename).stem
    frame = src.parent / f".{stem}.frame.jpg"
    try:
        subprocess.run([FFMPEG, "-y", "-ss", "1", "-i", str(src), "-frames:v", "1", "-q:v", "3", str(frame)],
                       capture_output=True, timeout=120, check=True)
        thumb = cache_dir(gallery_id, "thumbs") / subfolder_slug / f"{stem}.jpg"
        preview = cache_dir(gallery_id, "previews") / subfolder_slug / f"{stem}.jpg"
        _resize_to(frame, thumb, THUMB_SIZE, 78)
        _resize_to(frame, preview, PREVIEW_SIZE, 85)
        return True
    except Exception as e:
        logger.warning("video poster failed for %s: %s", filename, e)
        return False
    finally:
        try: frame.unlink()
        except OSError: pass


def ensure_video_faststart(src_path):
    """Move moov atom to the front for instant web playback."""
    if not FFMPEG:
        return
    src = Path(src_path)
    tmp = src.parent / f".{src.stem}.fs.mp4"
    try:
        subprocess.run([FFMPEG, "-y", "-i", str(src), "-c", "copy", "-movflags", "+faststart", str(tmp)],
                       capture_output=True, timeout=1800, check=True)
        shutil.move(str(tmp), str(src))
    except Exception as e:
        logger.warning("faststart failed for %s: %s", src_path, e)
        try: tmp.unlink()
        except OSError: pass


def _transcode_cmd(src, dst, use_vaapi):
    if use_vaapi:
        # Decode on CPU, upload frames to the AMD 780M, scale + H.264 encode on the GPU (VAAPI).
        # The hwupload chain is robust across any source codec, unlike full -hwaccel decode.
        return [FFMPEG, "-y", "-vaapi_device", VAAPI_DEVICE, "-i", str(src),
                "-vf", "format=nv12,hwupload,scale_vaapi=w=-2:h=1080", "-c:v", "h264_vaapi", "-b:v", "5M",
                "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(dst)]
    return [FFMPEG, "-y", "-i", str(src), "-vf", "scale=-2:1080", "-c:v", "libx264", "-preset", "medium",
            "-b:v", "5M", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(dst)]


def transcode_web(gallery_id, tenant_id, subfolder_slug, filename, src_path):
    """Create {stem}.web.mp4 (1080p H.264) — GPU (VAAPI) first, CPU fallback."""
    if not FFMPEG:
        return False
    src = Path(src_path)
    dst = src.parent / f"{src.stem}.web.mp4"
    for use_vaapi in (True, False):
        try:
            subprocess.run(_transcode_cmd(src, dst, use_vaapi), capture_output=True, timeout=7200, check=True)
            if dst.exists() and dst.stat().st_size > 0:
                logger.info("transcoded %s via %s", filename, "GPU (VAAPI/780M)" if use_vaapi else "CPU (libx264)")
                return True
        except Exception as e:
            logger.warning("transcode (%s) failed for %s: %s", "vaapi" if use_vaapi else "cpu", filename, e)
    return False


def process_video(file_id, gallery_id, tenant_id, subfolder_slug, filename, src_path):
    """Full pipeline: poster (fast) -> faststart -> web transcode. Updates db.files status."""
    poster = video_poster(gallery_id, subfolder_slug, filename, src_path)
    if poster:
        c, db = _db(); db.files.update_one({"id": file_id}, {"$set": {"has_thumb": True, "has_preview": True}}); c.close()
    if not FFMPEG:
        _set_video_status(file_id, "unavailable", web_ready=False)
        return
    _set_video_status(file_id, "processing", web_ready=False)
    ensure_video_faststart(src_path)
    ok = transcode_web(gallery_id, tenant_id, subfolder_slug, filename, src_path)
    _set_video_status(file_id, "ready" if ok else "failed", web_ready=ok)


def sign_video_uri(uri: str, expires_seconds: int = 7200):
    """Matches nginx: secure_link_md5 '$video_secret$uri$arg_expires' (base64url, no padding)."""
    secret = os.environ.get("NGINX_VIDEO_SECRET", "")
    expires = int(time.time()) + expires_seconds
    raw = hashlib.md5(f"{secret}{uri}{expires}".encode()).digest()
    md5 = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    return md5, expires
