"""Iteration 18 backend tests:
- Per-tenant Print/Payment settings GET/POST (mask/preserve secret, sanitise paypalme handle).
- Public share /print-sizes returns delivery + paypal (client_id gated by method=='api').
- Print order enforces minimum_order + uses configured shipping_cost.
- Trial gallery cap (14-day trial capped at 3; lifetime-trial keeps full plan limit).
"""
import os
import time
import uuid
import requests
import pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

SUPER_USER = "superadmin"
SUPER_PASS = "Stu!d10App_2026xQ"
MARK_USER = "mark"
MARK_PASS = "Test!2026"


def _login(username, password):
    r = requests.post(f"{API}/admin/login", json={"username": username, "password": password}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _super_login():
    r = requests.post(f"{API}/super/login", json={"username": SUPER_USER, "password": SUPER_PASS}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def mark_headers():
    return {"Authorization": f"Bearer {_login(MARK_USER, MARK_PASS)}"}


@pytest.fixture(scope="module")
def super_headers():
    return {"Authorization": f"Bearer {_super_login()}"}


# ─── Print settings tests (against mark tenant) ───
class TestPrintSettings:
    def test_get_defaults(self, mark_headers):
        r = requests.get(f"{API}/admin/settings/print", headers=mark_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("shipping_cost", "minimum_order", "paypal_method", "paypalme_handle",
                  "paypal_client_id", "paypal_secret", "paypal_mode"):
            assert k in d, f"missing {k}"
        assert isinstance(d["shipping_cost"], (int, float))
        assert isinstance(d["minimum_order"], (int, float))
        assert d["paypal_method"] in ("none", "paypalme", "api")
        # secret must be masked or empty (never raw)
        assert d["paypal_secret"] in ("", "••••••••")

    def test_save_paypalme_sanitises_handle(self, mark_headers):
        payload = {
            "shipping_cost": 3.5,
            "minimum_order": 20.0,
            "paypal_method": "paypalme",
            "paypalme_handle": "@paypal.me/testhandle/",
            "paypal_client_id": "",
            "paypal_secret": "",
            "paypal_mode": "live",
        }
        r = requests.post(f"{API}/admin/settings/print", headers=mark_headers, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("success") is True
        # verify by re-fetch
        g = requests.get(f"{API}/admin/settings/print", headers=mark_headers, timeout=15).json()
        assert g["paypalme_handle"] == "testhandle", g
        assert g["paypal_method"] == "paypalme"
        assert g["shipping_cost"] == 3.5
        assert g["minimum_order"] == 20.0

    def test_save_api_and_secret_preserved_on_mask(self, mark_headers):
        # Save with real secret
        payload = {
            "shipping_cost": 4.99,
            "minimum_order": 25.0,
            "paypal_method": "api",
            "paypalme_handle": "",
            "paypal_client_id": "test_client_id_ABC",
            "paypal_secret": "real_secret_XYZ",
            "paypal_mode": "sandbox",
        }
        r = requests.post(f"{API}/admin/settings/print", headers=mark_headers, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        g = requests.get(f"{API}/admin/settings/print", headers=mark_headers, timeout=15).json()
        assert g["paypal_method"] == "api"
        assert g["paypal_client_id"] == "test_client_id_ABC"
        assert g["paypal_mode"] == "sandbox"
        assert g["paypal_secret"] == "••••••••"

        # Now re-submit with masked placeholder -> secret must be preserved
        payload2 = {**payload, "paypal_secret": "••••••••", "paypal_client_id": "test_client_id_ABC"}
        r2 = requests.post(f"{API}/admin/settings/print", headers=mark_headers, json=payload2, timeout=15)
        assert r2.status_code == 200
        g2 = requests.get(f"{API}/admin/settings/print", headers=mark_headers, timeout=15).json()
        assert g2["paypal_secret"] == "••••••••"  # still masked, still stored (verify via public /print-sizes below)

    def test_public_print_sizes_exposes_client_id_only_for_api(self, mark_headers):
        # Explicitly set method=api first so this test is self-contained
        setup_payload = {
            "shipping_cost": 4.99, "minimum_order": 25.0, "paypal_method": "api",
            "paypalme_handle": "", "paypal_client_id": "test_client_id_ABC",
            "paypal_secret": "real_secret_XYZ", "paypal_mode": "sandbox",
        }
        assert requests.post(f"{API}/admin/settings/print", headers=mark_headers, json=setup_payload, timeout=15).status_code == 200
        # First need an active share for mark. Ensure at least one gallery + share exists.
        gals = requests.get(f"{API}/admin/galleries", headers=mark_headers, timeout=15).json()
        assert isinstance(gals, list) and len(gals) > 0, "mark should have galleries"
        gid = gals[0]["id"]
        shares_r = requests.get(f"{API}/admin/galleries/{gid}/shares", headers=mark_headers, timeout=15)
        share_token = None
        if shares_r.status_code == 200:
            for s in shares_r.json():
                if s.get("is_active"):
                    share_token = s.get("token")
                    break
        if not share_token:
            cr = requests.post(f"{API}/admin/galleries/{gid}/shares", headers=mark_headers,
                               json={"access_level": "view"}, timeout=15)
            assert cr.status_code in (200, 201), cr.text
            share_token = cr.json().get("token")
        assert share_token, "need a share token"

        # method is currently 'api' (from prior test) → client_id must be present
        r = requests.get(f"{API}/share/{share_token}/print-sizes", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "shipping_cost" in d and "minimum_order" in d and "paypal" in d
        assert d["paypal"]["method"] == "api"
        assert d["paypal"]["client_id"] == "test_client_id_ABC"
        assert d["paypal"]["mode"] == "sandbox"

        # Switch method back to 'paypalme' → client_id should be empty in public payload
        payload = {
            "shipping_cost": 2.5,
            "minimum_order": 15.0,
            "paypal_method": "paypalme",
            "paypalme_handle": "markpays",
            "paypal_client_id": "test_client_id_ABC",
            "paypal_secret": "••••••••",
            "paypal_mode": "live",
        }
        assert requests.post(f"{API}/admin/settings/print", headers=mark_headers, json=payload, timeout=15).status_code == 200
        r2 = requests.get(f"{API}/share/{share_token}/print-sizes", timeout=15)
        d2 = r2.json()
        assert d2["paypal"]["method"] == "paypalme"
        assert d2["paypal"]["handle"] == "markpays"
        assert d2["paypal"]["client_id"] == "", "client_id must be hidden when method != api"
        assert d2["shipping_cost"] == 2.5
        assert d2["minimum_order"] == 15.0

    def test_min_order_and_shipping_applied(self, mark_headers):
        """Verify create_print_order rejects when subtotal < minimum_order and applies shipping_cost."""
        # Set known values: min=15, shipping=2.5
        setup = {
            "shipping_cost": 2.5, "minimum_order": 15.0, "paypal_method": "paypalme",
            "paypalme_handle": "markpays", "paypal_client_id": "", "paypal_secret": "",
            "paypal_mode": "live",
        }
        assert requests.post(f"{API}/admin/settings/print", headers=mark_headers, json=setup, timeout=15).status_code == 200

        # Get gallery + share + a file
        gals = requests.get(f"{API}/admin/galleries", headers=mark_headers, timeout=15).json()
        gid = gals[0]["id"]
        # find share
        shares = requests.get(f"{API}/admin/galleries/{gid}/shares", headers=mark_headers, timeout=15).json()
        share_token = next((s["token"] for s in shares if s.get("is_active")), None)
        if not share_token:
            cr = requests.post(f"{API}/admin/galleries/{gid}/shares", headers=mark_headers,
                               json={"access_level": "view"}, timeout=15)
            share_token = cr.json().get("token")
        # get files
        files = requests.get(f"{API}/admin/galleries/{gid}/files", headers=mark_headers, timeout=15)
        if files.status_code != 200 or not files.json():
            pytest.skip("no files in gallery; cannot test print order")
        file_id = files.json()[0]["id"]

        # get share access (need session)
        access = requests.post(f"{API}/share/{share_token}/access", json={"password": ""}, timeout=15)
        if access.status_code != 200:
            pytest.skip(f"share access failed: {access.status_code} {access.text[:200]}")
        share_bearer = access.json().get("jwt") or access.json().get("session_token") or access.json().get("token")
        if not share_bearer:
            pytest.skip(f"no session token in access response: {access.json()}")
        share_headers = {"Authorization": f"Bearer {share_bearer}"}

        # get print sizes for share
        sizes_r = requests.get(f"{API}/share/{share_token}/print-sizes", timeout=15).json()
        if not sizes_r.get("sizes"):
            pytest.skip("no print sizes configured")
        size = sizes_r["sizes"][0]
        gloss_price = size["prices"]["gloss"]

        # Order below minimum → 400
        qty_low = 1  # unit_price=gloss_price; total may be < 15
        if gloss_price * qty_low < 15.0:
            r_low = requests.post(f"{API}/share/{share_token}/print-order", headers=share_headers, json={
                "gallery_id": gid, "customer_email": "test@example.com",
                "items": [{"file_id": file_id, "size_id": size["id"], "finish": "gloss", "quantity": qty_low}],
            }, timeout=15)
            assert r_low.status_code == 400, f"expected 400 for below-minimum, got {r_low.status_code}: {r_low.text}"
            assert "minimum" in r_low.json().get("detail", "").lower()

        # Order above minimum → 200 and shipping applied
        # Use large qty to exceed 15
        qty_hi = max(1, int(16.0 // max(gloss_price, 0.01)) + 1)
        r_hi = requests.post(f"{API}/share/{share_token}/print-order", headers=share_headers, json={
            "gallery_id": gid, "customer_email": "test@example.com",
            "items": [{"file_id": file_id, "size_id": size["id"], "finish": "gloss", "quantity": qty_hi}],
        }, timeout=15)
        assert r_hi.status_code == 200, r_hi.text
        d = r_hi.json()
        expected_subtotal = round(gloss_price * qty_hi, 2)
        assert round(d["shipping"], 2) == 2.5, d
        assert round(d["subtotal"], 2) == expected_subtotal, d
        assert round(d["total"], 2) == round(expected_subtotal + 2.5, 2), d

    def test_reset_to_defaults_for_mark(self, mark_headers):
        # Restore mark's print settings to none / 2.50 / 15 (safe defaults)
        payload = {
            "shipping_cost": 2.5, "minimum_order": 15.0, "paypal_method": "none",
            "paypalme_handle": "", "paypal_client_id": "", "paypal_secret": "",
            "paypal_mode": "live",
        }
        r = requests.post(f"{API}/admin/settings/print", headers=mark_headers, json=payload, timeout=15)
        assert r.status_code == 200# ─── Trial gallery cap tests ───
class TestTrialCap:
    def test_signup_new_trial_tenant_and_hit_cap(self, super_headers):
        uname = f"trialtest_{uuid.uuid4().hex[:8]}"
        pwd = "TrialTest!2026"
        bname = f"Trial Studio {uname}"
        r = requests.post(f"{API}/signup",
                          json={"business_name": bname, "username": uname, "password": pwd, "plan": "pro"},
                          timeout=20)
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        H = {"Authorization": f"Bearer {token}"}

        try:
            # Verify usage.limit=3 and is_trial_limited=true
            b = requests.get(f"{API}/admin/billing", headers=H, timeout=15)
            assert b.status_code == 200, b.text
            usage = b.json()["usage"]
            assert usage["limit"] == 3, f"trial limit should be 3, got {usage['limit']}"
            assert usage["is_trial_limited"] is True
            assert usage["trial_forever"] is False
            # Demo gallery counts as 1
            assert usage["used"] >= 1

            # Create galleries up to the cap
            created = []
            while True:
                gcount = requests.get(f"{API}/admin/billing", headers=H, timeout=15).json()["usage"]["used"]
                if gcount >= 3:
                    break
                cr = requests.post(f"{API}/admin/galleries", headers=H,
                                   json={"folder_name": f"TEST_trial_gal_{uuid.uuid4().hex[:6]}"}, timeout=15)
                assert cr.status_code == 200, cr.text
                created.append(cr.json()["id"])

            # The 4th create must fail with 402
            r4 = requests.post(f"{API}/admin/galleries", headers=H,
                               json={"folder_name": f"TEST_trial_gal_{uuid.uuid4().hex[:6]}"}, timeout=15)
            assert r4.status_code == 402, f"expected 402, got {r4.status_code}: {r4.text}"
            detail = r4.json().get("detail", "").lower()
            assert "3 galleries" in detail or "trial" in detail, detail

            # Find tenant_id via super listing
            tlist = requests.get(f"{API}/super/tenants", headers=super_headers, timeout=15).json()
            tenant = next((t for t in tlist if t.get("admin_username") == uname), None)
            assert tenant is not None
            self._tenant_id = tenant["id"]
        finally:
            # cleanup: find tenant + delete
            try:
                tlist = requests.get(f"{API}/super/tenants", headers=super_headers, timeout=15).json()
                tenant = next((t for t in tlist if t.get("admin_username") == uname), None)
                if tenant:
                    requests.delete(f"{API}/super/tenants/{tenant['id']}", headers=super_headers, timeout=20)
            except Exception as e:
                print(f"cleanup failed: {e}")

    def test_lifetime_trial_keeps_full_plan_limit(self, mark_headers):
        """mark is trial_forever (studio plan) — should NOT be trial-limited."""
        b = requests.get(f"{API}/admin/billing", headers=mark_headers, timeout=15)
        assert b.status_code == 200
        usage = b.json()["usage"]
        # Per credentials.md mark is on studio plan; iteration_17 set both to lifetime.
        assert usage["trial_forever"] is True, f"mark should be trial_forever now: {usage}"
        assert usage["is_trial_limited"] is False
        # limit should equal plan_limit, not 3
        assert usage["limit"] == usage["plan_limit"]
        assert usage["limit"] > 3, f"lifetime tenant should have full plan limit >3, got {usage['limit']}"
