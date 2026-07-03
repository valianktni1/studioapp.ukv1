"""
Iteration 10: resolve_public_base() safety + host-less link prevention.

- Unit tests for db.resolve_public_base()
- Test run_expiry_reminders(): with base set -> sends absolute URL, sets flag
- Test run_expiry_reminders(): with NO base -> returns 0, does not call _send
- Integration: /api/admin/logo returns absolute https URL
- Regression: /api/admin/shares/{sid}/qr-pdf returns 200 application/pdf
"""
import io
import os
import sys
import uuid
import asyncio
from datetime import datetime, timezone, timedelta

import pytest
import requests

# Ensure backend is importable
sys.path.insert(0, "/app/backend")

from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://handoff-app-5.preview.emergentagent.com").rstrip("/")
EMAIL = "demo@studio-app.uk"
PASSWORD = "Demo!2026"

ORIGINAL_PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "")
ORIGINAL_ROOT_DOMAIN = os.environ.get("ROOT_DOMAIN", "")


def _png_bytes():
    from io import BytesIO
    from PIL import Image
    buf = BytesIO()
    Image.new("RGB", (4, 4), (128, 64, 200)).save(buf, format="PNG")
    return buf.getvalue()


# Module-scoped event loop so motor client stays bound
_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)


def _run(coro):
    return _LOOP.run_until_complete(coro)


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/admin/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ---------------- Unit: resolve_public_base ----------------
class TestResolvePublicBase:
    def teardown_method(self):
        os.environ["PUBLIC_BASE_URL"] = ORIGINAL_PUBLIC_BASE_URL
        os.environ["ROOT_DOMAIN"] = ORIGINAL_ROOT_DOMAIN

    def test_public_base_url_wins_and_strips_trailing_slash(self):
        from db import resolve_public_base
        os.environ["PUBLIC_BASE_URL"] = "https://foo.example.com/"
        os.environ["ROOT_DOMAIN"] = "bar.example.com"
        assert resolve_public_base() == "https://foo.example.com"

    def test_public_base_url_whitespace_trimmed(self):
        from db import resolve_public_base
        os.environ["PUBLIC_BASE_URL"] = "  https://spaced.example.com  "
        os.environ["ROOT_DOMAIN"] = ""
        assert resolve_public_base() == "https://spaced.example.com"

    def test_falls_back_to_root_domain(self):
        from db import resolve_public_base
        os.environ["PUBLIC_BASE_URL"] = ""
        os.environ["ROOT_DOMAIN"] = "studio-app.uk"
        assert resolve_public_base() == "https://studio-app.uk"

    def test_empty_when_neither_set(self):
        from db import resolve_public_base
        os.environ["PUBLIC_BASE_URL"] = ""
        os.environ["ROOT_DOMAIN"] = ""
        assert resolve_public_base() == ""

    def test_empty_when_root_domain_invalid(self):
        from db import resolve_public_base
        os.environ["PUBLIC_BASE_URL"] = ""
        os.environ["ROOT_DOMAIN"] = "notadomain"  # no dot
        assert resolve_public_base() == ""


# ---------------- run_expiry_reminders ----------------
class TestExpiryReminders:
    """Uses real Mongo but monkeypatches _send to avoid SMTP."""

    @pytest.fixture
    def seeded(self):
        """Create a tenant + gallery + share expiring tomorrow. Returns ids for cleanup."""
        from db import db as mdb
        tenant_id = None
        gid = None
        sid = None

        async def _setup():
            nonlocal tenant_id, gid, sid
            # Find any tenant that has SMTP configured (needed for run_expiry_reminders to proceed)
            smtp_doc = await mdb.settings.find_one({"key": "smtp", "value.smtp_host": {"$nin": [None, ""]}})
            assert smtp_doc, "No tenant with SMTP configured"
            tenant_id = smtp_doc["tenant_id"]

            gid = f"TEST_g_{uuid.uuid4()}"
            await mdb.galleries.insert_one({
                "id": gid, "tenant_id": tenant_id,
                "folder_name": "TEST_Alice & Bob",
                "client_email": "TEST_client@example.com",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            sid = f"TEST_s_{uuid.uuid4()}"
            tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
            await mdb.shares.insert_one({
                "id": sid, "tenant_id": tenant_id, "gallery_id": gid,
                "token": "testtoken123", "custom_slug": None,
                "is_active": True, "guest_upload_mode": False,
                "expires_at": tomorrow,
                "expiry_reminder_sent": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

        async def _teardown():
            if sid:
                await mdb.shares.delete_one({"id": sid})
            if gid:
                await mdb.galleries.delete_one({"id": gid})

        _run(_setup())
        yield {"tenant_id": tenant_id, "gid": gid, "sid": sid}
        _run(_teardown())

    def test_sends_absolute_link_and_sets_flag(self, seeded, monkeypatch):
        from db import db as mdb
        import routes.email as email_mod

        os.environ["PUBLIC_BASE_URL"] = "https://handoff-app-5.preview.emergentagent.com"

        captured = {}

        def fake_send(cfg, to, subject, html):
            captured["cfg"] = cfg
            captured["to"] = to
            captured["subject"] = subject
            captured["html"] = html

        monkeypatch.setattr(email_mod, "_send", fake_send)

        sent = _run(email_mod.run_expiry_reminders())

        assert sent >= 1, f"Expected at least 1 send, got {sent}. Captured={captured}"
        assert captured, "_send was not called"
        html = captured["html"]
        assert "http:///" not in html, f"Host-less URL leaked: {html[:400]}"
        expected_link = "https://handoff-app-5.preview.emergentagent.com/s/testtoken123"
        assert expected_link in html, f"Expected {expected_link} in html, got: {html[:400]}"

        share = _run(mdb.shares.find_one({"id": seeded["sid"]}))
        assert share.get("expiry_reminder_sent") is True

    def test_skips_when_no_base_resolvable(self, seeded, monkeypatch):
        import routes.email as email_mod

        os.environ["PUBLIC_BASE_URL"] = ""
        os.environ["ROOT_DOMAIN"] = ""

        calls = []

        def fake_send(cfg, to, subject, html):
            calls.append((cfg, to, subject, html))

        monkeypatch.setattr(email_mod, "_send", fake_send)

        try:
            sent = _run(email_mod.run_expiry_reminders())
            assert sent == 0
            assert calls == [], f"_send should not be called when base is empty, got {len(calls)} calls"
        finally:
            os.environ["PUBLIC_BASE_URL"] = ORIGINAL_PUBLIC_BASE_URL
            os.environ["ROOT_DOMAIN"] = ORIGINAL_ROOT_DOMAIN


# ---------------- Logo upload absolute URL ----------------
class TestLogoAbsoluteUrl:
    def test_logo_returns_absolute_https_url(self, token):
        headers = {"Authorization": f"Bearer {token}"}
        r = requests.post(
            f"{BASE_URL}/api/admin/logo",
            headers=headers,
            files={"file": ("logo.png", _png_bytes(), "image/png")},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        url = body["logo_url"]
        assert url.startswith("https://"), f"logo_url not absolute https: {url}"
        assert "http:///" not in url, f"Host-less URL: {url}"
        assert "/api/public/asset/" in url


# ---------------- QR PDF regression ----------------
class TestQrPdfRegression:
    def test_qr_pdf_still_works(self, token):
        headers = {"Authorization": f"Bearer {token}"}
        # List galleries for this tenant
        rg = requests.get(f"{BASE_URL}/api/admin/galleries", headers=headers, timeout=30)
        if rg.status_code != 200:
            pytest.skip(f"cannot list galleries: {rg.status_code}")
        gals = rg.json()
        if not gals:
            pytest.skip("no gallery")
        gid = gals[0].get("id")

        # Find or create a share
        rl = requests.get(f"{BASE_URL}/api/admin/galleries/{gid}/shares", headers=headers, timeout=30)
        shares = rl.json() if rl.status_code == 200 else []
        if shares:
            sid = shares[0]["id"]
            created = False
        else:
            rc = requests.post(
                f"{BASE_URL}/api/admin/galleries/{gid}/shares",
                headers=headers,
                json={"access_level": "view", "subfolder": None, "password": None,
                      "expires_at": None, "label": "TEST_qr", "custom_slug": None,
                      "guest_upload_mode": False},
                timeout=30,
            )
            assert rc.status_code == 200, rc.text
            sid = rc.json()["id"]
            created = True

        try:
            r2 = requests.get(f"{BASE_URL}/api/admin/shares/{sid}/qr-pdf", headers=headers, timeout=30)
            assert r2.status_code == 200, r2.text[:300]
            assert r2.headers.get("Content-Type", "").startswith("application/pdf")
            assert len(r2.content) > 100
        finally:
            if created:
                requests.delete(f"{BASE_URL}/api/admin/shares/{sid}", headers=headers, timeout=30)


def teardown_module(module):
    # Restore env
    os.environ["PUBLIC_BASE_URL"] = ORIGINAL_PUBLIC_BASE_URL
    os.environ["ROOT_DOMAIN"] = ORIGINAL_ROOT_DOMAIN
