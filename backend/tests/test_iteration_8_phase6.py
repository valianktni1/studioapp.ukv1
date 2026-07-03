"""Phase 6 tests: PayPal super-admin config, tenant print sizes, orders, public print order flow."""
import os
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://handoff-app-5.preview.emergentagent.com").rstrip("/")
SA_USER = "superadmin"
SA_PASS = "Stu!d10App_2026xQ"
TENANT_EMAIL = "demo@studio-app.uk"
TENANT_PASS = "Demo!2026"
SHARE_TOKEN = "eva-ella-27-06-26"


@pytest.fixture(scope="module")
def sa_session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/super-admin/login", json={"username": SA_USER, "password": SA_PASS}, timeout=30)
    assert r.status_code == 200, f"SA login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def tenant_session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/admin/login", json={"email": TENANT_EMAIL, "password": TENANT_PASS}, timeout=30)
    assert r.status_code == 200, f"Tenant login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# ---------------- Super Admin PayPal config ----------------
class TestPayPalConfig:
    def test_get_paypal_initial(self, sa_session):
        r = sa_session.get(f"{BASE}/api/super-admin/paypal", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "client_id" in data and "mode" in data and "currency" in data and "configured" in data
        assert "secret" not in data, "Secret must NOT be returned"

    def test_put_and_masked_secret(self, sa_session):
        # Save dummy sandbox creds
        payload = {"client_id": "TEST_DUMMY_CLIENT_ID_123", "secret": "TEST_DUMMY_SECRET_XYZ",
                   "mode": "sandbox", "currency": "GBP"}
        r = sa_session.put(f"{BASE}/api/super-admin/paypal", json=payload, timeout=30)
        assert r.status_code == 200
        assert r.json().get("saved") is True

        # Re-fetch - client_id/mode/currency retained, secret not leaked, configured=true
        r2 = sa_session.get(f"{BASE}/api/super-admin/paypal", timeout=30)
        assert r2.status_code == 200
        d = r2.json()
        assert d["client_id"] == "TEST_DUMMY_CLIENT_ID_123"
        assert d["mode"] == "sandbox"
        assert d["currency"] == "GBP"
        assert d["configured"] is True
        assert "secret" not in d

    def test_clear_paypal_config(self, sa_session):
        # Clear so client ordering flows uses awaiting_contact
        r = sa_session.put(f"{BASE}/api/super-admin/paypal",
                           json={"client_id": "", "secret": "", "mode": "sandbox", "currency": "GBP"}, timeout=30)
        assert r.status_code == 200
        r2 = sa_session.get(f"{BASE}/api/super-admin/paypal", timeout=30)
        d = r2.json()
        assert d["configured"] is False


# ---------------- Tenant print sizes ----------------
class TestPrintSizes:
    def test_get_sizes(self, tenant_session):
        r = tenant_session.get(f"{BASE}/api/admin/print-sizes", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "sizes" in data and "currency" in data

    def test_put_sizes_and_persistence(self, tenant_session):
        sizes = [
            {"label": "6x4", "dimensions": "6x4 inches", "price": 3.50},
            {"label": "8x6", "dimensions": "8x6 inches", "price": 6.00},
        ]
        r = tenant_session.put(f"{BASE}/api/admin/print-sizes", json={"sizes": sizes}, timeout=30)
        assert r.status_code == 200
        saved = r.json()["sizes"]
        assert len(saved) == 2
        assert all("id" in s for s in saved)
        assert saved[0]["price"] == 3.50

        # Verify persistence
        r2 = tenant_session.get(f"{BASE}/api/admin/print-sizes", timeout=30)
        got = r2.json()["sizes"]
        assert len(got) == 2
        labels = [x["label"] for x in got]
        assert "6x4" in labels and "8x6" in labels


# ---------------- Public ordering (awaiting_contact when PayPal not configured) ----------------
class TestPublicOrder:
    def test_public_sizes(self):
        r = requests.get(f"{BASE}/api/share/{SHARE_TOKEN}/print-sizes", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "sizes" in d and "currency" in d and "paypal_enabled" in d
        assert d["paypal_enabled"] is False  # cleared above
        assert len(d["sizes"]) >= 1
        # store for next
        TestPublicOrder.sizes = d["sizes"]

    def test_email_required(self):
        sz = TestPublicOrder.sizes[0]
        r = requests.post(f"{BASE}/api/share/{SHARE_TOKEN}/print-order",
                          json={"items": [{"size_id": sz["id"], "qty": 2}], "customer": {"name": "Test"}}, timeout=30)
        assert r.status_code == 400

    def test_zero_qty_blocked(self):
        sz = TestPublicOrder.sizes[0]
        r = requests.post(f"{BASE}/api/share/{SHARE_TOKEN}/print-order",
                          json={"items": [{"size_id": sz["id"], "qty": 0}],
                                "customer": {"name": "T", "email": "t@example.com"}}, timeout=30)
        assert r.status_code == 400

    def test_place_order_awaiting_contact(self):
        sz = TestPublicOrder.sizes[0]  # 6x4 £3.50
        r = requests.post(f"{BASE}/api/share/{SHARE_TOKEN}/print-order",
                          json={"items": [{"size_id": sz["id"], "qty": 2}],
                                "customer": {"name": "TEST Customer", "email": "test_phase6@example.com"}}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["paypal"] is False
        assert "order_id" in d
        TestPublicOrder.order_id = d["order_id"]

    def test_server_computes_total(self, tenant_session):
        # Retrieve from admin/orders to verify server-computed total
        r = tenant_session.get(f"{BASE}/api/admin/orders", timeout=30)
        assert r.status_code == 200
        orders = r.json()
        match = [o for o in orders if o["id"] == TestPublicOrder.order_id]
        assert len(match) == 1
        o = match[0]
        # 2 x 3.50 = 7.00
        assert o["total"] == 7.00
        assert o["status"] == "awaiting_contact"
        assert o["customer"]["email"] == "test_phase6@example.com"
        assert "_id" not in o  # ObjectId excluded

    def test_update_order_status(self, tenant_session):
        oid = TestPublicOrder.order_id
        r = tenant_session.put(f"{BASE}/api/admin/orders/{oid}/status",
                               json={"status": "contacted"}, timeout=30)
        assert r.status_code == 200
        # Verify persisted
        r2 = tenant_session.get(f"{BASE}/api/admin/orders", timeout=30)
        o = [x for x in r2.json() if x["id"] == oid][0]
        assert o["status"] == "contacted"
