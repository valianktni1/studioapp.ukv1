"""Phase 7 (QR PDFs) + Phase 8 (Email templates & send-template) backend tests."""
import os
import pytest
import requests

def _get_base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        # fall back to reading frontend/.env
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert url, "REACT_APP_BACKEND_URL not set"
    return url.rstrip("/")

BASE_URL = _get_base()
DEMO_EMAIL = "demo@studio-app.uk"
DEMO_PASSWORD = "Demo!2026"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/admin/login",
                      json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def demo_gallery(headers):
    r = requests.get(f"{BASE_URL}/api/admin/galleries", headers=headers, timeout=15)
    assert r.status_code == 200
    galleries = r.json()
    g = next((x for x in galleries if "Eva" in x.get("folder_name", "")), None)
    assert g, f"Eva & Ella gallery not found. got={[x.get('folder_name') for x in galleries]}"
    return g


@pytest.fixture(scope="module")
def demo_share(headers, demo_gallery):
    r = requests.get(f"{BASE_URL}/api/admin/galleries/{demo_gallery['id']}/shares",
                     headers=headers, timeout=15)
    assert r.status_code == 200
    shares = r.json()
    assert shares, "No share links found for Eva gallery"
    return shares[0]


# ---------------- Phase 7: QR PDF ----------------
class TestQrPdf:
    @pytest.mark.parametrize("design", ["minimal", "classic", "botanical"])
    def test_qr_pdf_download(self, headers, demo_share, design):
        r = requests.get(
            f"{BASE_URL}/api/admin/shares/{demo_share['id']}/qr-pdf",
            params={"design": design}, headers=headers, timeout=30)
        assert r.status_code == 200, f"status={r.status_code} body={r.text[:200]}"
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF", "content does not look like PDF"
        assert len(r.content) > 5000, f"PDF too small: {len(r.content)}"

    def test_qr_pdf_invalid_design_falls_back(self, headers, demo_share):
        r = requests.get(f"{BASE_URL}/api/admin/shares/{demo_share['id']}/qr-pdf",
                         params={"design": "bogus"}, headers=headers, timeout=30)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_qr_pdf_unknown_share_404(self, headers):
        r = requests.get(f"{BASE_URL}/api/admin/shares/does-not-exist/qr-pdf",
                         headers=headers, timeout=15)
        assert r.status_code == 404


# ---------------- Phase 8: Email templates CRUD ----------------
class TestEmailTemplates:
    def test_full_crud(self, headers):
        # Create
        payload = {"name": "TEST_tpl", "subject": "Hello {couple_name}", "body": "Link: {gallery_link} pwd: {password}"}
        r = requests.post(f"{BASE_URL}/api/admin/email-templates", json=payload, headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["name"] == "TEST_tpl"
        assert "id" in created
        tid = created["id"]

        # List
        r = requests.get(f"{BASE_URL}/api/admin/email-templates", headers=headers, timeout=15)
        assert r.status_code == 200
        assert any(t["id"] == tid for t in r.json())

        # Update
        r = requests.put(f"{BASE_URL}/api/admin/email-templates/{tid}",
                         json={"name": "TEST_tpl_upd", "subject": "S2", "body": "B2"},
                         headers=headers, timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/admin/email-templates", headers=headers, timeout=15)
        item = next(t for t in r2.json() if t["id"] == tid)
        assert item["name"] == "TEST_tpl_upd"
        assert item["subject"] == "S2"

        # Delete
        r = requests.delete(f"{BASE_URL}/api/admin/email-templates/{tid}", headers=headers, timeout=15)
        assert r.status_code == 200
        r3 = requests.get(f"{BASE_URL}/api/admin/email-templates", headers=headers, timeout=15)
        assert not any(t["id"] == tid for t in r3.json())


# ---------------- Phase 8: send-template ----------------
class TestSendTemplate:
    def test_send_template_graceful_smtp_fail(self, headers, demo_gallery):
        # create a template
        tpl = requests.post(f"{BASE_URL}/api/admin/email-templates",
                            json={"name": "TEST_send", "subject": "Hi {couple_name}",
                                  "body": "Open {gallery_link}"}, headers=headers, timeout=15).json()
        tid = tpl["id"]
        try:
            r = requests.post(
                f"{BASE_URL}/api/admin/galleries/{demo_gallery['id']}/send-template",
                json={"template_id": tid, "to": "test@example.com",
                      "share_url": "https://example.com/s/x", "password": "p"},
                headers=headers, timeout=30)
            # SMTP invalid => 502 expected. Some ingress may swallow to 504/no-body.
            assert r.status_code in (502, 400, 504), f"unexpected status={r.status_code} body={r.text[:200]}"
            # response body may not be json in edge cases; accept either
            try:
                body = r.json()
                assert "detail" in body
            except Exception:
                assert r.text  # any error body
        finally:
            requests.delete(f"{BASE_URL}/api/admin/email-templates/{tid}", headers=headers, timeout=10)

    def test_send_template_unknown_template_404(self, headers, demo_gallery):
        r = requests.post(
            f"{BASE_URL}/api/admin/galleries/{demo_gallery['id']}/send-template",
            json={"template_id": "nope", "to": "test@example.com"},
            headers=headers, timeout=15)
        assert r.status_code == 404
