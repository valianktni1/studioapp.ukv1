"""
Iteration 14 — Super Admin platform + Per-tenant Branding
Tests:
  - Super admin login/list/create/plan/status/delete
  - Tenant provisioning auto-creates demo gallery
  - Tenant branding get/update/logo upload + public asset
  - Share meta returns branding object
  - Tenant isolation
"""
import io
import os
import time
import uuid
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://handoff-app-5.preview.emergentagent.com").rstrip("/")

SUPER_USER = "superadmin"
SUPER_PASS = "Stu!d10App_2026xQ"
MARK_USER, MARK_PASS = "mark", "Test!2026"
ROSE_USER, ROSE_PASS = "rose", "Rose!2026"


@pytest.fixture(scope="module")
def super_token():
    r = requests.post(f"{BASE_URL}/api/super/login", json={"username": SUPER_USER, "password": SUPER_PASS})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def super_headers(super_token):
    return {"Authorization": f"Bearer {super_token}"}


@pytest.fixture(scope="module")
def mark_token():
    r = requests.post(f"{BASE_URL}/api/admin/login", json={"username": MARK_USER, "password": MARK_PASS})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def rose_token():
    r = requests.post(f"{BASE_URL}/api/admin/login", json={"username": ROSE_USER, "password": ROSE_PASS})
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ── Super Admin auth ─────────────────────────────────────────────
class TestSuperAuth:
    def test_login_success(self):
        r = requests.post(f"{BASE_URL}/api/super/login", json={"username": SUPER_USER, "password": SUPER_PASS})
        assert r.status_code == 200
        d = r.json()
        assert "token" in d and isinstance(d["token"], str) and len(d["token"]) > 10
        assert d["username"] == SUPER_USER

    def test_login_bad_pw(self):
        r = requests.post(f"{BASE_URL}/api/super/login", json={"username": SUPER_USER, "password": "wrong"})
        assert r.status_code == 401

    def test_list_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/super/tenants")
        assert r.status_code == 401

    def test_tenant_token_forbidden(self, mark_token):
        # tenant admin JWT (role=admin) cannot access super endpoints
        r = requests.get(f"{BASE_URL}/api/super/tenants", headers={"Authorization": f"Bearer {mark_token}"})
        assert r.status_code == 403

    def test_plans(self, super_headers):
        r = requests.get(f"{BASE_URL}/api/super/plans", headers=super_headers)
        assert r.status_code == 200
        p = r.json()
        assert set(p.keys()) == {"starter", "pro", "studio"}
        assert p["starter"]["gallery_limit"] == 10 and p["starter"]["price"] == 15
        assert p["pro"]["gallery_limit"] == 30 and p["pro"]["price"] == 35
        assert p["studio"]["gallery_limit"] == 60 and p["studio"]["price"] == 65


# ── Super Admin: list/create/manage tenants ──────────────────────
class TestSuperTenantMgmt:
    _created_ids = []

    def test_list_tenants_includes_mark_rose(self, super_headers):
        r = requests.get(f"{BASE_URL}/api/super/tenants", headers=super_headers)
        assert r.status_code == 200
        tenants = r.json()
        usernames = {t.get("admin_username") for t in tenants}
        assert "mark" in usernames and "rose" in usernames
        for t in tenants:
            assert "_id" not in t

    def test_create_tenant_provisions_demo(self, super_headers):
        uniq = uuid.uuid4().hex[:6]
        payload = {
            "business_name": f"TEST Studio {uniq}",
            "username": f"TEST_user_{uniq}",
            "password": "Test!2026Pass",
            "plan": "starter",
        }
        r = requests.post(f"{BASE_URL}/api/super/tenants", json=payload, headers=super_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["business_name"] == payload["business_name"]
        assert d["plan"] == "starter"
        assert "id" in d
        TestSuperTenantMgmt._created_ids.append(d["id"])

        # Login as the new tenant admin and confirm demo gallery
        lr = requests.post(f"{BASE_URL}/api/admin/login", json={"username": payload["username"], "password": payload["password"]})
        assert lr.status_code == 200, lr.text
        t_tok = lr.json()["token"]
        gr = requests.get(f"{BASE_URL}/api/admin/galleries", headers={"Authorization": f"Bearer {t_tok}"})
        assert gr.status_code == 200
        gals = gr.json()
        names = [g.get("folder_name") for g in gals]
        assert any("Demo - Emma & James 01.01.26" in n for n in names), f"No demo gallery in {names}"

    def test_create_tenant_duplicate_username(self, super_headers):
        r = requests.post(
            f"{BASE_URL}/api/super/tenants",
            json={"business_name": "Dup", "username": "mark", "password": "x", "plan": "starter"},
            headers=super_headers,
        )
        assert r.status_code == 400

    def test_create_tenant_invalid_plan(self, super_headers):
        r = requests.post(
            f"{BASE_URL}/api/super/tenants",
            json={"business_name": "BadPlan", "username": f"TEST_{uuid.uuid4().hex[:6]}", "password": "x", "plan": "megaplan"},
            headers=super_headers,
        )
        assert r.status_code == 400

    def test_set_plan_and_status(self, super_headers):
        assert TestSuperTenantMgmt._created_ids, "prior test created no tenant"
        tid = TestSuperTenantMgmt._created_ids[0]
        r = requests.put(f"{BASE_URL}/api/super/tenants/{tid}/plan?plan=studio", headers=super_headers)
        assert r.status_code == 200 and r.json()["plan"] == "studio"
        r = requests.put(f"{BASE_URL}/api/super/tenants/{tid}/status?status=suspended", headers=super_headers)
        assert r.status_code == 200 and r.json()["status"] == "suspended"
        # Verify via list
        lst = requests.get(f"{BASE_URL}/api/super/tenants", headers=super_headers).json()
        row = next(t for t in lst if t["id"] == tid)
        assert row["plan"] == "studio" and row["status"] == "suspended"
        # Reactivate
        r = requests.put(f"{BASE_URL}/api/super/tenants/{tid}/status?status=active", headers=super_headers)
        assert r.status_code == 200

    def test_set_status_invalid(self, super_headers):
        tid = TestSuperTenantMgmt._created_ids[0]
        r = requests.put(f"{BASE_URL}/api/super/tenants/{tid}/status?status=bogus", headers=super_headers)
        assert r.status_code == 400

    def test_delete_created_tenants(self, super_headers):
        # teardown: delete our created TEST tenants
        for tid in TestSuperTenantMgmt._created_ids:
            r = requests.delete(f"{BASE_URL}/api/super/tenants/{tid}", headers=super_headers)
            assert r.status_code == 200
        # verify removal
        lst = requests.get(f"{BASE_URL}/api/super/tenants", headers=super_headers).json()
        remaining = {t["id"] for t in lst}
        for tid in TestSuperTenantMgmt._created_ids:
            assert tid not in remaining


# ── Tenant branding self-service ─────────────────────────────────
class TestBranding:
    def test_get_branding_mark(self, mark_token):
        r = requests.get(f"{BASE_URL}/api/admin/branding", headers={"Authorization": f"Bearer {mark_token}"})
        assert r.status_code == 200
        b = r.json()
        assert b["business_name"] == "Weddings By Mark"
        for k in ("logo_url", "accent_color", "contact_email", "tagline"):
            assert k in b

    def test_update_branding(self, mark_token):
        h = {"Authorization": f"Bearer {mark_token}"}
        # Snapshot original
        orig = requests.get(f"{BASE_URL}/api/admin/branding", headers=h).json()
        try:
            new_tagline = f"TEST tagline {uuid.uuid4().hex[:6]}"
            r = requests.put(
                f"{BASE_URL}/api/admin/branding",
                headers=h,
                json={
                    "business_name": "Weddings By Mark",
                    "tagline": new_tagline,
                    "accent_color": "#123456",
                    "contact_email": "mark@test.local",
                },
            )
            assert r.status_code == 200, r.text
            b = r.json()
            assert b["tagline"] == new_tagline
            assert b["accent_color"] == "#123456"
            assert b["contact_email"] == "mark@test.local"
            # GET-verify persistence
            b2 = requests.get(f"{BASE_URL}/api/admin/branding", headers=h).json()
            assert b2["tagline"] == new_tagline
        finally:
            # restore
            requests.put(f"{BASE_URL}/api/admin/branding", headers=h, json={
                "business_name": orig.get("business_name") or "Weddings By Mark",
                "tagline": orig.get("tagline") or "",
                "accent_color": orig.get("accent_color") or "#D4AF37",
                "contact_email": orig.get("contact_email") or "",
            })

    def test_upload_logo_and_serve(self, mark_token):
        h = {"Authorization": f"Bearer {mark_token}"}
        orig = requests.get(f"{BASE_URL}/api/admin/branding", headers=h).json()
        try:
            img = Image.new("RGB", (64, 64), (12, 34, 56))
            buf = io.BytesIO(); img.save(buf, format="PNG"); buf.seek(0)
            files = {"file": ("logo.png", buf.getvalue(), "image/png")}
            r = requests.post(f"{BASE_URL}/api/admin/branding/logo", headers=h, files=files)
            assert r.status_code == 200, r.text
            logo_url = r.json()["logo_url"]
            assert logo_url.startswith("/api/public/branding-asset/")
            # fetch it publicly (no auth)
            full = BASE_URL + logo_url
            fr = requests.get(full)
            assert fr.status_code == 200
            assert fr.headers.get("content-type", "").startswith("image/")
            assert len(fr.content) > 100
            # verify branding GET reflects logo
            b = requests.get(f"{BASE_URL}/api/admin/branding", headers=h).json()
            assert b["logo_url"] == logo_url
        finally:
            requests.put(f"{BASE_URL}/api/admin/branding", headers=h, json={
                "business_name": orig.get("business_name") or "Weddings By Mark",
            })
            # Note: we don't clear logo_url via PUT (schema has no field). Acceptable for test.

    def test_upload_logo_rejects_bad_ext(self, mark_token):
        h = {"Authorization": f"Bearer {mark_token}"}
        files = {"file": ("bad.txt", b"not an image", "text/plain")}
        r = requests.post(f"{BASE_URL}/api/admin/branding/logo", headers=h, files=files)
        assert r.status_code == 400

    def test_branding_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/branding")
        assert r.status_code == 401


# ── Share meta returns branding ──────────────────────────────────
class TestShareBranding:
    def test_share_meta_has_branding(self, mark_token):
        h = {"Authorization": f"Bearer {mark_token}"}
        gals = requests.get(f"{BASE_URL}/api/admin/galleries", headers=h).json()
        assert gals, "mark has no galleries"
        gid = gals[0]["id"]
        # try existing shares first
        shares = requests.get(f"{BASE_URL}/api/admin/galleries/{gid}/shares", headers=h)
        token = None
        if shares.status_code == 200 and shares.json():
            token = shares.json()[0].get("token") or shares.json()[0].get("share_token")
        if not token:
            cr = requests.post(f"{BASE_URL}/api/admin/galleries/{gid}/shares", headers=h, json={})
            assert cr.status_code in (200, 201), cr.text
            body = cr.json()
            token = body.get("token") or body.get("share_token") or body.get("share", {}).get("token")
        assert token, "no share token available"

        m = requests.get(f"{BASE_URL}/api/share/{token}")
        assert m.status_code == 200, m.text
        data = m.json()
        assert "branding" in data, f"share meta missing 'branding': keys={list(data.keys())}"
        b = data["branding"]
        assert b.get("business_name") == "Weddings By Mark"
        for k in ("logo_url", "accent_color", "contact_email", "tagline"):
            assert k in b


# ── Tenant isolation ─────────────────────────────────────────────
class TestIsolation:
    def test_mark_rose_galleries_disjoint(self, mark_token, rose_token):
        gm = requests.get(f"{BASE_URL}/api/admin/galleries", headers={"Authorization": f"Bearer {mark_token}"}).json()
        gr = requests.get(f"{BASE_URL}/api/admin/galleries", headers={"Authorization": f"Bearer {rose_token}"}).json()
        m_ids = {g["id"] for g in gm}
        r_ids = {g["id"] for g in gr}
        assert m_ids and r_ids
        assert m_ids.isdisjoint(r_ids)

    def test_mark_branding_does_not_change_rose(self, mark_token, rose_token):
        hm = {"Authorization": f"Bearer {mark_token}"}
        hr = {"Authorization": f"Bearer {rose_token}"}
        rose_before = requests.get(f"{BASE_URL}/api/admin/branding", headers=hr).json()
        mark_before = requests.get(f"{BASE_URL}/api/admin/branding", headers=hm).json()
        try:
            requests.put(f"{BASE_URL}/api/admin/branding", headers=hm, json={
                "business_name": "Weddings By Mark",
                "tagline": f"iso-{uuid.uuid4().hex[:5]}",
            })
            rose_after = requests.get(f"{BASE_URL}/api/admin/branding", headers=hr).json()
            assert rose_after == rose_before
        finally:
            requests.put(f"{BASE_URL}/api/admin/branding", headers=hm, json={
                "business_name": mark_before.get("business_name") or "Weddings By Mark",
                "tagline": mark_before.get("tagline") or "",
            })
