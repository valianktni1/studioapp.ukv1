"""Iteration 13 – validate P0 video thumbnail fix + photo upload regression + share ThankYou flow.

Focus: tenant admin uploads video -> has_thumb becomes True (background), thumbnail
JPEG served, .web.mp4 produced, no leftover .web.tmp.mp4. Photo upload still works.
"""
import os
import time
import subprocess
from pathlib import Path
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    # fallback: read frontend .env
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE = line.split("=", 1)[1].strip().rstrip("/")

ADMIN_EMAIL = "demo@studio-app.uk"
ADMIN_PASS = "Demo!2026"
SHARE_TOKEN = "eva-ella-27-06-26"

VIDEO_PATH = "/tmp/testclip.mp4"
PHOTO_PATH = "/tmp/testphoto.jpg"


@pytest.fixture(scope="module")
def media_files():
    if not Path(VIDEO_PATH).exists():
        subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i",
                        "testsrc=duration=3:size=320x240:rate=15",
                        "-pix_fmt", "yuv420p", VIDEO_PATH], check=True, capture_output=True)
    if not Path(PHOTO_PATH).exists():
        subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i",
                        "color=c=blue:s=200x200:d=1", "-frames:v", "1", PHOTO_PATH],
                       check=True, capture_output=True)
    return {"video": VIDEO_PATH, "photo": PHOTO_PATH}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE}/api/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def gallery(auth):
    r = requests.post(f"{BASE}/api/admin/galleries", headers=auth,
                      json={"folder_name": "TEST_Video_iter13", "subfolders": ["Clips"]})
    assert r.status_code == 200, r.text
    gid = r.json()["id"]
    yield gid
    # cleanup
    requests.delete(f"{BASE}/api/admin/galleries/{gid}?delete_backup=true", headers=auth)


# ---------------- P0: Video upload -> thumbnail + web mp4 ----------------
class TestVideoPipeline:
    def test_upload_video_and_wait_for_processing(self, auth, gallery, media_files):
        with open(media_files["video"], "rb") as fh:
            r = requests.post(
                f"{BASE}/api/admin/galleries/{gallery}/upload",
                headers=auth,
                data={"subfolder": "Clips"},
                files={"files": ("clip.mp4", fh, "video/mp4")},
            )
        assert r.status_code == 200, r.text
        payload = r.json()
        assert payload["uploaded"] == 1
        f = payload["files"][0]
        assert f["file_type"] == "video"
        assert f["has_thumb"] is False  # background job still queued
        pytest.file_id = f["id"]
        pytest.filename = f["filename"]
        pytest.subfolder_slug = f["subfolder_slug"]

    def test_thumbnail_becomes_ready(self, auth, gallery):
        # Poll gallery detail until has_thumb True (up to ~30s)
        deadline = time.time() + 45
        got = None
        while time.time() < deadline:
            r = requests.get(f"{BASE}/api/admin/galleries/{gallery}", headers=auth)
            assert r.status_code == 200
            files = r.json().get("files", [])
            got = next((x for x in files if x["id"] == pytest.file_id), None)
            if got and got.get("has_thumb"):
                break
            time.sleep(1)
        assert got and got.get("has_thumb") is True, f"has_thumb never became True (last={got})"

    def test_thumbnail_endpoint_serves_jpeg(self, gallery):
        r = requests.get(f"{BASE}/api/media/thumb/{gallery}/{pytest.subfolder_slug}/{pytest.filename}")
        assert r.status_code == 200, f"thumb 404: {r.status_code} {r.text[:200]}"
        assert r.headers.get("content-type", "").startswith("image/jpeg")
        assert r.content[:3] == b"\xff\xd8\xff", "response body is not a JPEG"
        assert len(r.content) > 500

    def test_preview_endpoint_serves_jpeg(self, gallery):
        r = requests.get(f"{BASE}/api/media/preview/{gallery}/{pytest.subfolder_slug}/{pytest.filename}")
        assert r.status_code == 200
        assert r.content[:3] == b"\xff\xd8\xff"

    def test_web_mp4_produced_and_no_tmp_leftover(self, auth, gallery):
        # Wait up to ~90s for transcode to finish (CPU fallback on this pod)
        deadline = time.time() + 120
        status = None
        while time.time() < deadline:
            r = requests.get(f"{BASE}/api/admin/galleries/{gallery}", headers=auth)
            got = next((x for x in r.json()["files"] if x["id"] == pytest.file_id), {})
            status = got.get("video_status")
            web_ready = got.get("web_ready")
            if status in ("ready", "failed"):
                break
            time.sleep(2)
        assert status == "ready", f"video_status={status} (expected ready)"
        # Check filesystem: web.mp4 exists, no leftover tmp
        from pathlib import Path as P
        uploads_env = os.environ.get("UPLOAD_DIR", "/app/backend/storage/uploads")
        uploads = P(uploads_env)
        clips = list(uploads.glob(f"*/{gallery}/{pytest.subfolder_slug}"))
        assert clips, f"gallery folder not found under {uploads}"
        d = clips[0]
        stem = P(pytest.filename).stem
        assert (d / f"{stem}.web.mp4").exists(), f"web.mp4 missing in {d}, contents={list(d.iterdir())}"
        tmp = d / f"{stem}.web.tmp.mp4"
        assert not tmp.exists(), f"leftover tmp: {tmp}"


# ---------------- Photo regression ----------------
class TestPhotoRegression:
    def test_upload_photo_and_thumb(self, auth, gallery, media_files):
        with open(media_files["photo"], "rb") as fh:
            r = requests.post(
                f"{BASE}/api/admin/galleries/{gallery}/upload",
                headers=auth, data={"subfolder": "Clips"},
                files={"files": ("photo.jpg", fh, "image/jpeg")},
            )
        assert r.status_code == 200
        fid = r.json()["files"][0]["id"]
        deadline = time.time() + 20
        while time.time() < deadline:
            g = requests.get(f"{BASE}/api/admin/galleries/{gallery}", headers=auth).json()
            got = next((x for x in g["files"] if x["id"] == fid), {})
            if got.get("has_thumb"):
                break
            time.sleep(1)
        assert got.get("has_thumb") is True
        r2 = requests.get(f"{BASE}/api/media/thumb/{gallery}/clips/photo.jpg")
        assert r2.status_code == 200
        assert r2.content[:3] == b"\xff\xd8\xff"


# ---------------- Share ThankYou flow (backend endpoint) ----------------
class TestShareSubmitFavourites:
    def test_share_meta_open(self):
        r = requests.get(f"{BASE}/api/share/{SHARE_TOKEN}")
        assert r.status_code == 200
        assert r.json()["needs_password"] is False

    def test_favourite_toggle_and_submit(self):
        files = requests.get(f"{BASE}/api/share/{SHARE_TOKEN}/files").json()["files"]
        assert files, "share has no files"
        fid = files[0]["id"]
        sess = "TEST_iter13_sess"
        r = requests.post(f"{BASE}/api/share/{SHARE_TOKEN}/favourite",
                          json={"file_id": fid, "session_id": sess})
        assert r.status_code == 200
        assert r.json()["favourited"] is True
        r2 = requests.post(f"{BASE}/api/share/{SHARE_TOKEN}/submit-favourites", json={})
        assert r2.status_code == 200
        assert r2.json()["submitted"] is True
        assert isinstance(r2.json()["count"], int)
        # untoggle to clean up
        requests.post(f"{BASE}/api/share/{SHARE_TOKEN}/favourite",
                      json={"file_id": fid, "session_id": sess})
