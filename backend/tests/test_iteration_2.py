"""Iteration 2 backend tests — billing, gallery-limit, share auto-slug, public tenant, plan metadata."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break
API = f"{BASE_URL}/api"

SUPER = {"username": "superadmin", "password": "Stu!d10App_2026xQ"}
DEMO = {"email": "demo@studio-app.uk", "password": "Demo!2026"}


@pytest.fixture(scope="module")
def super_headers():
    r = requests.post(f"{API}/super-admin/login", json=SUPER, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def demo_headers():
    r = requests.post(f"{API}/admin/login", json=DEMO, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def demo_tenant_id(super_headers):
    r = requests.get(f"{API}/super-admin/tenants", headers=super_headers)
    assert r.status_code == 200
    for t in r.json():
        if t["email"] == "demo@studio-app.uk":
            return t["id"]
    pytest.fail("demo tenant not found")


# ---------------- Billing ----------------
class TestBillingPlans:
    def test_plans_shape(self):
        r = requests.get(f"{API}/billing/plans")
        assert r.status_code == 200, r.text
        plans = r.json()
        assert plans["starter"]["gallery_limit"] == 10
        assert plans["starter"]["price"] == 15
        assert plans["professional"]["gallery_limit"] == 30
        assert plans["professional"]["price"] == 35
        assert plans["studio"]["gallery_limit"] == 60
        assert plans["studio"]["price"] == 65
        assert plans["starter"]["label"] == "Starter"

    def test_checkout_requires_auth(self):
        r = requests.post(f"{API}/billing/checkout", json={"plan": "studio", "origin_url": BASE_URL})
        assert r.status_code in (401, 403)

    def test_checkout_invalid_plan(self, demo_headers):
        r = requests.post(f"{API}/billing/checkout", headers=demo_headers,
                          json={"plan": "bogus", "origin_url": BASE_URL})
        assert r.status_code == 400

    def test_checkout_missing_origin(self, demo_headers):
        r = requests.post(f"{API}/billing/checkout", headers=demo_headers,
                          json={"plan": "studio", "origin_url": ""})
        assert r.status_code == 400

    def test_checkout_creates_session_and_status(self, demo_headers):
        r = requests.post(f"{API}/billing/checkout", headers=demo_headers,
                          json={"plan": "studio", "origin_url": BASE_URL}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "url" in body and body["url"].startswith("http")
        assert "stripe" in body["url"].lower() or "checkout" in body["url"].lower()
        assert body["session_id"]
        sid = body["session_id"]

        # Status endpoint should not error
        r2 = requests.get(f"{API}/billing/status/{sid}", headers=demo_headers, timeout=30)
        assert r2.status_code == 200, r2.text
        s = r2.json()
        assert "status" in s and "payment_status" in s
        # Not paid yet
        assert s["payment_status"] in ("unpaid", "no_payment_required", None, "open")

    def test_status_unknown_session_404(self, demo_headers):
        r = requests.get(f"{API}/billing/status/cs_test_nonexistent_xxxxx", headers=demo_headers)
        assert r.status_code == 404


# ---------------- Gallery limit enforcement ----------------
class TestGalleryLimit:
    def test_limit_enforced_and_restore(self, super_headers, demo_headers, demo_tenant_id):
        # Snapshot: how many galleries does demo currently have?
        r = requests.get(f"{API}/admin/galleries", headers=demo_headers)
        assert r.status_code == 200
        initial_count = len(r.json())

        # Set gallery_limit to 1 via storage_limit_bytes (reused field)
        r = requests.put(f"{API}/super-admin/tenants/{demo_tenant_id}/plan",
                         headers=super_headers, json={"storage_limit_bytes": 1})
        assert r.status_code == 200, r.text

        try:
            # Attempt to create a new gallery -> should 402 (already >=1)
            r = requests.post(f"{API}/admin/galleries", headers=demo_headers,
                              json={"folder_name": f"TEST_limit_{uuid.uuid4().hex[:6]}"})
            assert r.status_code == 402, f"Expected 402, got {r.status_code}: {r.text}"
            assert "limit" in r.text.lower() or "upgrade" in r.text.lower()
        finally:
            # Restore professional plan
            r = requests.put(f"{API}/super-admin/tenants/{demo_tenant_id}/plan",
                             headers=super_headers, json={"plan": "professional"})
            assert r.status_code == 200
            body = r.json()
            assert body["plan"] == "professional"
            assert body["gallery_limit"] == 30


# ---------------- Share auto-slug ----------------
class TestShareAutoSlug:
    def test_slug_from_couple_name(self, demo_headers):
        folder = f"Sarah & Tom {uuid.uuid4().hex[:4]} 12.08.26"
        r = requests.post(f"{API}/admin/galleries", headers=demo_headers,
                          json={"folder_name": folder})
        assert r.status_code == 200, r.text
        gid = r.json()["id"]

        try:
            r = requests.post(f"{API}/admin/galleries/{gid}/shares", headers=demo_headers,
                              json={"access_level": "download"})
            assert r.status_code == 200, r.text
            share = r.json()
            slug = share.get("custom_slug", "")
            # Must be url-safe kebab-case
            assert slug, "custom_slug must be auto-generated"
            assert "sarah" in slug.lower()
            assert "tom" in slug.lower()
            # No spaces or & or dots
            assert " " not in slug and "&" not in slug and "." not in slug
            # Should contain the date digits
            assert "12" in slug and "08" in slug and "26" in slug

            # Public access via slug works
            r = requests.get(f"{API}/share/{slug}")
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["gallery_name"] == folder
        finally:
            requests.delete(f"{API}/admin/galleries/{gid}", headers=demo_headers)


# ---------------- Public tenant ----------------
class TestPublicTenant:
    def test_demo_subdomain(self):
        r = requests.get(f"{API}/public/tenant/demo")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["business_name"] == "Demo Studio"
        assert d["subdomain"] == "demo"
        assert d["accent_color"]

    def test_unknown_subdomain(self):
        r = requests.get(f"{API}/public/tenant/does-not-exist-xyz")
        assert r.status_code == 404


# ---------------- Plan metadata on /me + dashboard-stats ----------------
class TestPlanMetadata:
    def test_dashboard_stats_has_plan_label(self, demo_headers):
        r = requests.get(f"{API}/admin/dashboard-stats", headers=demo_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("plan_label") == "Professional"
        assert d.get("gallery_limit") == 30

    def test_super_admin_tenants_has_gallery_count_and_subdomain(self, super_headers):
        r = requests.get(f"{API}/super-admin/tenants", headers=super_headers)
        assert r.status_code == 200
        found = False
        for t in r.json():
            if t["email"] == "demo@studio-app.uk":
                found = True
                assert "gallery_count" in t
                assert "gallery_limit" in t
                assert t["subdomain"] == "demo"
                assert t["plan_label"] == "Professional"
        assert found

    def test_super_admin_overview_total_galleries(self, super_headers):
        r = requests.get(f"{API}/super-admin/overview", headers=super_headers)
        assert r.status_code == 200
        assert "total_galleries" in r.json()
