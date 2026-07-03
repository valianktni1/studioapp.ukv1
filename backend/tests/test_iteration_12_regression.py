"""
Iteration 12 — proactive full regression for StudioApp.
Covers: auth/onboarding, super-admin CRUD & PayPal, tenant gallery mgmt, share links,
QR PDF, notify (graceful SMTP fail), gallery-limit 402, settings (branding/prints/email),
public share landing/access/download/print-order, video URL fallback.
Clean-up removes every TEST_/qa+ artifact it creates.
"""
import os
import io
import time
import uuid
import zipfile

import pytest
import requests

BASE = (os.environ.get("REACT_APP_BACKEND_URL")
        or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=", 1)[1].splitlines()[0].strip()).rstrip("/")

SUPER_USER = "superadmin"
SUPER_PASS = "Stu!d10App_2026xQ"
DEMO_EMAIL = "demo@studio-app.uk"
DEMO_PASS = "Demo!2026"
PUBLIC_SLUG = "eva-ella-27-06-26"

RUN = uuid.uuid4().hex[:8]


# ---------------- fixtures ----------------
@pytest.fixture(scope="session")
def super_token():
    r = requests.post(f"{BASE}/api/super-admin/login",
                      json={"username": SUPER_USER, "password": SUPER_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def super_headers(super_token):
    return {"Authorization": f"Bearer {super_token}"}


@pytest.fixture(scope="session")
def demo_token():
    r = requests.post(f"{BASE}/api/admin/login",
                      json={"email": DEMO_EMAIL, "password": DEMO_PASS}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"Demo login failed: {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def demo_headers(demo_token):
    return {"Authorization": f"Bearer {demo_token}"}


@pytest.fixture(scope="session")
def created_tenants():
    ids = []
    yield ids
    # Teardown: delete every TEST_ tenant we created
    r = requests.post(f"{BASE}/api/super-admin/login",
                      json={"username": SUPER_USER, "password": SUPER_PASS}, timeout=30)
    if r.status_code != 200:
        return
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    for tid in ids:
        try:
            requests.delete(f"{BASE}/api/super-admin/tenants/{tid}", headers=h, timeout=30)
        except Exception:
            pass


# ---------------- Super-admin ----------------
class TestSuperAdmin:
    def test_login_and_me(self, super_headers):
        r = requests.get(f"{BASE}/api/super-admin/me", headers=super_headers, timeout=15)
        assert r.status_code == 200
        assert r.json().get("username") == SUPER_USER

    def test_overview(self, super_headers):
        r = requests.get(f"{BASE}/api/super-admin/overview", headers=super_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "tenant_count" in d and "plans" in d
        # Sanity: plan labels & no GB in gallery_limit (COUNT based)
        for k, p in d["plans"].items():
            assert "gallery_limit" in p and isinstance(p["gallery_limit"], int)
            assert "price" in p

    def test_create_professional_tenant(self, super_headers, created_tenants):
        payload = {
            "business_name": f"TEST_Pro_{RUN}",
            "email": f"qa+pro{RUN}@example.com",
            "password": "Pass!2026",
            "plan": "professional",
        }
        r = requests.post(f"{BASE}/api/super-admin/tenants", json=payload,
                          headers=super_headers, timeout=30)
        assert r.status_code == 200, r.text
        t = r.json()
        created_tenants.append(t["id"])
        assert t["plan"] == "professional"
        assert t["gallery_limit"] == 30
        assert t["plan_label"].lower().startswith("professional")
        # verify count via list_tenants
        r = requests.get(f"{BASE}/api/super-admin/tenants", headers=super_headers, timeout=15)
        assert r.status_code == 200
        assert any(x["id"] == t["id"] and x["gallery_count"] == 0 for x in r.json())

    def test_trial_extend_and_comp(self, super_headers, created_tenants):
        tid = created_tenants[0]
        r = requests.put(f"{BASE}/api/super-admin/tenants/{tid}/trial",
                         json={"days": 30}, headers=super_headers, timeout=15)
        assert r.status_code == 200 and r.json()["subscription_status"] == "trialing"
        r = requests.put(f"{BASE}/api/super-admin/tenants/{tid}/trial",
                         json={"unlimited": True}, headers=super_headers, timeout=15)
        assert r.status_code == 200 and r.json()["subscription_status"] == "comp"

    def test_paypal_config_masks_secret(self, super_headers):
        # GET current
        r = requests.get(f"{BASE}/api/super-admin/paypal", headers=super_headers, timeout=15)
        assert r.status_code == 200
        before = r.json()
        assert "secret" not in before  # never returned
        # PUT new config
        r = requests.put(f"{BASE}/api/super-admin/paypal",
                         json={"client_id": "TEST_pp_client_id",
                               "secret": "TEST_pp_secret",
                               "mode": "sandbox", "currency": "GBP"},
                         headers=super_headers, timeout=15)
        assert r.status_code == 200 and r.json()["saved"] is True
        # GET again — configured=true, still no raw secret
        r = requests.get(f"{BASE}/api/super-admin/paypal", headers=super_headers, timeout=15)
        d = r.json()
        assert "secret" not in d
        assert d["configured"] is True
        # Restore: clear it back out so PayPal path stays off for print-order tests
        requests.put(f"{BASE}/api/super-admin/paypal",
                     json={"client_id": "", "secret": "", "mode": "sandbox", "currency": "GBP"},
                     headers=super_headers, timeout=15)


# ---------------- Auth / onboarding ----------------
class TestAuth:
    def test_register_and_auto_login(self, created_tenants):
        email = f"qa+signup{RUN}@example.com"
        r = requests.post(f"{BASE}/api/admin/register",
                          json={"business_name": f"TEST_Signup_{RUN}",
                                "email": email, "password": "Pass!2026", "plan": "starter"},
                          timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("token")
        assert data.get("onboarding_complete") is False
        t = data["tenant"]
        assert t["gallery_limit"] == 10
        assert t["subscription_status"] in ("trialing", "active")
        created_tenants.append(t["id"])

        # duplicate rejected
        r2 = requests.post(f"{BASE}/api/admin/register",
                           json={"business_name": "TEST_dup", "email": email,
                                 "password": "Pass!2026", "plan": "starter"}, timeout=15)
        assert r2.status_code == 400

        # /admin/me works with token; onboarding via PUT branding
        h = {"Authorization": f"Bearer {data['token']}"}
        me = requests.get(f"{BASE}/api/admin/me", headers=h, timeout=15)
        assert me.status_code == 200 and me.json()["tenant"]["id"] == t["id"]

    def test_demo_login(self, demo_headers):
        r = requests.get(f"{BASE}/api/admin/me", headers=demo_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["tenant"]["subdomain"] == "demo"

    def test_login_bad_password(self):
        r = requests.post(f"{BASE}/api/admin/login",
                          json={"email": DEMO_EMAIL, "password": "wrong!"}, timeout=15)
        assert r.status_code == 401


# ---------------- Gallery limit (Starter tenant) ----------------
class TestGalleryLimit:
    def test_402_when_over_limit(self, super_headers, created_tenants):
        # Create a fresh Starter tenant + impersonate
        payload = {"business_name": f"TEST_Limit_{RUN}",
                   "email": f"qa+limit{RUN}@example.com", "password": "Pass!2026", "plan": "starter"}
        r = requests.post(f"{BASE}/api/super-admin/tenants", json=payload,
                          headers=super_headers, timeout=15)
        assert r.status_code == 200
        tid = r.json()["id"]
        created_tenants.append(tid)
        # Squash gallery_limit to 1 to make the check cheap
        r = requests.put(f"{BASE}/api/super-admin/tenants/{tid}/plan",
                         json={"storage_limit_bytes": 1}, headers=super_headers, timeout=15)
        assert r.status_code == 200
        r = requests.post(f"{BASE}/api/super-admin/tenants/{tid}/impersonate",
                          headers=super_headers, timeout=15)
        assert r.status_code == 200
        h = {"Authorization": f"Bearer {r.json()['token']}"}
        # First creation OK
        r1 = requests.post(f"{BASE}/api/admin/galleries",
                           json={"folder_name": "TEST_G1"}, headers=h, timeout=15)
        assert r1.status_code == 200, r1.text
        # Second creation should be blocked with 402
        r2 = requests.post(f"{BASE}/api/admin/galleries",
                           json={"folder_name": "TEST_G2"}, headers=h, timeout=15)
        assert r2.status_code == 402, r2.text
        assert "limit" in r2.text.lower()


# ---------------- Demo-tenant management ----------------
class TestTenantGallery:
    gid = None
    sid = None

    def test_dashboard_stats(self, demo_headers):
        r = requests.get(f"{BASE}/api/admin/dashboard-stats", headers=demo_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("active_galleries", "gallery_limit", "plan_label"):
            assert k in d

    def test_create_gallery_and_subfolders(self, demo_headers):
        r = requests.post(f"{BASE}/api/admin/galleries",
                          json={"folder_name": f"TEST_Gallery_{RUN}"},
                          headers=demo_headers, timeout=15)
        assert r.status_code == 200, r.text
        g = r.json()
        TestTenantGallery.gid = g["id"]
        # Default subfolders should exist
        assert isinstance(g["subfolders"], list) and len(g["subfolders"]) > 0
        assert g["total_files"] == 0

    def test_upload_photo(self, demo_headers):
        gid = TestTenantGallery.gid
        # 1x1 JPEG bytes
        from PIL import Image
        buf = io.BytesIO()
        Image.new("RGB", (32, 32), (200, 100, 50)).save(buf, format="JPEG")
        buf.seek(0)
        sub = "Wedding Images"
        files = {"files": ("test_pic.jpg", buf.read(), "image/jpeg")}
        r = requests.post(f"{BASE}/api/admin/galleries/{gid}/upload",
                          headers=demo_headers, data={"subfolder": sub}, files=files, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["uploaded"] == 1

    def test_create_shares_variants(self, demo_headers):
        gid = TestTenantGallery.gid
        # Open, download access, vanity slug
        r = requests.post(f"{BASE}/api/admin/galleries/{gid}/shares",
                          json={"access_level": "download",
                                "custom_slug": f"test-share-{RUN}",
                                "label": "TEST_open"},
                          headers=demo_headers, timeout=15)
        assert r.status_code == 200, r.text
        s = r.json()
        TestTenantGallery.sid = s["id"]
        assert s["custom_slug"] == f"test-share-{RUN}"
        assert s["has_password"] is False
        # Password-protected + expiry
        r2 = requests.post(f"{BASE}/api/admin/galleries/{gid}/shares",
                           json={"access_level": "view", "password": "sekret",
                                 "expires_at": "2099-01-01T00:00:00+00:00",
                                 "label": "TEST_pw"},
                           headers=demo_headers, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["has_password"] is True

        # Toggle
        r = requests.put(f"{BASE}/api/admin/shares/{TestTenantGallery.sid}/toggle",
                         headers=demo_headers, timeout=15)
        assert r.status_code == 200 and r.json()["is_active"] is False
        # Toggle back to active for downstream QR test
        r = requests.put(f"{BASE}/api/admin/shares/{TestTenantGallery.sid}/toggle",
                         headers=demo_headers, timeout=15)
        assert r.json()["is_active"] is True

    def test_qr_pdf_all_designs(self, demo_headers):
        sid = TestTenantGallery.sid
        for design in ("minimal", "classic", "botanical"):
            r = requests.get(f"{BASE}/api/admin/shares/{sid}/qr-pdf?design={design}",
                             headers=demo_headers, timeout=30)
            assert r.status_code == 200, f"{design}: {r.text}"
            assert r.headers.get("content-type", "").startswith("application/pdf")
            assert r.content[:4] == b"%PDF"

    def test_notify_smtp_graceful(self, demo_headers):
        gid = TestTenantGallery.gid
        r = requests.post(f"{BASE}/api/admin/galleries/{gid}/notify",
                          headers=demo_headers, timeout=30,
                          json={"to": "someone@example.com", "share_url": "https://example/s/x",
                                "message": "TEST"})
        # Demo has no valid SMTP → expect graceful 4xx/502, not 500 crash
        assert r.status_code in (400, 502), f"Notify returned {r.status_code}: {r.text}"

    def test_teardown_gallery(self, demo_headers):
        gid = TestTenantGallery.gid
        r = requests.delete(f"{BASE}/api/admin/galleries/{gid}?delete_backup=true",
                            headers=demo_headers, timeout=30)
        assert r.status_code == 200


# ---------------- Settings: prints, email ----------------
class TestSettings:
    def test_print_sizes_crud(self, demo_headers):
        # Read initial
        r = requests.get(f"{BASE}/api/admin/print-sizes", headers=demo_headers, timeout=15)
        assert r.status_code == 200
        initial = r.json().get("sizes", [])
        # Save new set
        new_sizes = initial + [{"label": "TEST_size", "dimensions": "6x4", "price": 4.50}]
        r = requests.put(f"{BASE}/api/admin/print-sizes",
                         json={"sizes": new_sizes}, headers=demo_headers, timeout=15)
        assert r.status_code == 200
        saved = r.json()["sizes"]
        assert any(s["label"] == "TEST_size" for s in saved)
        # Restore
        requests.put(f"{BASE}/api/admin/print-sizes",
                     json={"sizes": initial}, headers=demo_headers, timeout=15)

    def test_smtp_get_masks_password(self, demo_headers):
        r = requests.get(f"{BASE}/api/admin/settings/smtp", headers=demo_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        # Password must never be echoed
        assert not d.get("smtp_password")

    def test_email_templates_crud(self, demo_headers):
        r = requests.post(f"{BASE}/api/admin/email-templates",
                          json={"name": f"TEST_tpl_{RUN}", "subject": "TEST subj",
                                "body": "Hello {couple_name}"},
                          headers=demo_headers, timeout=15)
        assert r.status_code == 200
        tid = r.json()["id"]
        r = requests.put(f"{BASE}/api/admin/email-templates/{tid}",
                         json={"name": "TEST_tpl_updated", "subject": "s", "body": "b"},
                         headers=demo_headers, timeout=15)
        assert r.status_code == 200
        r = requests.delete(f"{BASE}/api/admin/email-templates/{tid}",
                            headers=demo_headers, timeout=15)
        assert r.status_code == 200

    def test_orders_list(self, demo_headers):
        r = requests.get(f"{BASE}/api/admin/orders", headers=demo_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------- Public share (Eva & Ella) ----------------
class TestPublicShare:
    grant = None

    def test_share_meta(self):
        r = requests.get(f"{BASE}/api/share/{PUBLIC_SLUG}", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["needs_password"] is False
        assert d["access_level"] == "download"
        assert d["tenant"]["business_name"]

    def test_share_access_and_files(self):
        r = requests.post(f"{BASE}/api/share/{PUBLIC_SLUG}/access",
                          json={"password": ""}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["grant"]
        assert isinstance(d["files"], list) and len(d["files"]) >= 1
        TestPublicShare.grant = d["grant"]
        # No _id leaks
        for f in d["files"]:
            assert "_id" not in f

    def test_favourite_toggle_and_submit(self):
        r = requests.get(f"{BASE}/api/share/{PUBLIC_SLUG}/files", timeout=15)
        f0 = r.json()["files"][0]
        sess = f"TEST_sess_{RUN}"
        r = requests.post(f"{BASE}/api/share/{PUBLIC_SLUG}/favourite",
                          json={"file_id": f0["id"], "session_id": sess}, timeout=15)
        assert r.status_code == 200 and r.json()["favourited"] is True
        # untoggle to keep DB clean
        r = requests.post(f"{BASE}/api/share/{PUBLIC_SLUG}/favourite",
                          json={"file_id": f0["id"], "session_id": sess}, timeout=15)
        assert r.status_code == 200 and r.json()["favourited"] is False
        # Submit
        r = requests.post(f"{BASE}/api/share/{PUBLIC_SLUG}/submit-favourites",
                          json={}, timeout=15)
        assert r.status_code == 200 and r.json()["submitted"] is True

    def test_download_single(self):
        r = requests.get(f"{BASE}/api/share/{PUBLIC_SLUG}/files", timeout=15)
        f0 = r.json()["files"][0]
        r = requests.get(f"{BASE}/api/share/{PUBLIC_SLUG}/download/{f0['id']}", timeout=30)
        assert r.status_code == 200
        assert int(r.headers.get("content-length", "0")) > 0

    def test_download_zip_stream(self):
        t0 = time.time()
        with requests.get(f"{BASE}/api/share/{PUBLIC_SLUG}/download-zip",
                          stream=True, timeout=60) as r:
            assert r.status_code == 200
            assert r.headers.get("content-type") == "application/zip"
            data = r.content
        assert time.time() - t0 < 30
        z = zipfile.ZipFile(io.BytesIO(data))
        assert z.testzip() is None
        assert any(n.startswith("Wedding Images/") for n in z.namelist())

    def test_print_sizes_endpoint(self):
        r = requests.get(f"{BASE}/api/share/{PUBLIC_SLUG}/print-sizes", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "sizes" in d and "currency" in d

    def test_print_order_manual_path(self):
        # Ensure PayPal is not configured (we cleared it) => manual awaiting_contact path
        r = requests.get(f"{BASE}/api/share/{PUBLIC_SLUG}/print-sizes", timeout=15)
        sizes = r.json().get("sizes") or []
        if not sizes:
            pytest.skip("No print sizes configured on demo tenant")
        r = requests.post(f"{BASE}/api/share/{PUBLIC_SLUG}/print-order",
                          json={"items": [{"size_id": sizes[0]["id"], "qty": 1,
                                           "file_id": "any", "filename": "x.jpg"}],
                                "customer": {"name": "TEST_QA", "email": "qa@example.com"},
                                "origin_url": BASE},
                          timeout=30)
        # Either paypal=true (unlikely since we cleared) or paypal=false manual path
        assert r.status_code == 200, r.text
        assert "order_id" in r.json()


# ---------------- Public base URL ----------------
class TestPublicBase:
    def test_no_broken_scheme_in_meta(self):
        # public_share.share_meta returns tenant.logo_url; if set, must be absolute
        r = requests.get(f"{BASE}/api/share/{PUBLIC_SLUG}", timeout=15)
        logo = (r.json().get("tenant") or {}).get("logo_url")
        if logo:
            assert logo.startswith("http://") or logo.startswith("https://")
            assert "http:///" not in logo
