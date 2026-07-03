"""Backend tests for Phase 1 logo upload/serve endpoints."""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://handoff-app-5.preview.emergentagent.com").rstrip("/")
EMAIL = "demo@studio-app.uk"
PASSWORD = "Demo!2026"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/admin/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _png_bytes():
    # 1x1 transparent PNG
    return bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489"
        "0000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
    )


class TestLogoUpload:
    def test_upload_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/admin/logo", files={"file": ("x.png", _png_bytes(), "image/png")}, timeout=30)
        assert r.status_code in (401, 403)

    def test_upload_rejects_non_image(self, token):
        headers = {"Authorization": f"Bearer {token}"}
        r = requests.post(
            f"{BASE_URL}/api/admin/logo",
            headers=headers,
            files={"file": ("bad.txt", b"hello world", "text/plain")},
            timeout=30,
        )
        assert r.status_code == 400, r.text
        assert "image" in r.text.lower() or "png" in r.text.lower()

    def test_upload_png_returns_absolute_url_and_serves_public(self, token):
        headers = {"Authorization": f"Bearer {token}"}
        r = requests.post(
            f"{BASE_URL}/api/admin/logo",
            headers=headers,
            files={"file": ("logo.png", _png_bytes(), "image/png")},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "logo_url" in body and "asset_id" in body
        assert body["logo_url"].startswith("http")
        assert f"/api/public/asset/{body['asset_id']}" in body["logo_url"]

        # public GET - no auth
        r2 = requests.get(body["logo_url"], timeout=30)
        assert r2.status_code == 200
        assert r2.headers.get("Content-Type", "").startswith("image/")
        assert len(r2.content) > 0

        # verify tenant record updated: GET /api/admin/me or /tenant
        me = requests.get(f"{BASE_URL}/api/admin/me", headers=headers, timeout=30)
        if me.status_code == 200:
            d = me.json()
            # accept either flat or nested
            logo = d.get("logo_url") or d.get("tenant", {}).get("logo_url")
            assert logo == body["logo_url"]

    def test_public_asset_bad_id_404(self):
        r = requests.get(f"{BASE_URL}/api/public/asset/does-not-exist-xyz", timeout=30)
        assert r.status_code == 404
