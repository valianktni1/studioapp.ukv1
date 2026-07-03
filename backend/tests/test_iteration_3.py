"""Iteration 3 backend tests — SMTP email settings, test-send, gallery notify."""
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

DEMO = {"email": "demo@studio-app.uk", "password": "Demo!2026"}


@pytest.fixture(scope="module")
def demo_headers():
    r = requests.post(f"{API}/admin/login", json=DEMO, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


class TestSmtpSettings:
    def test_smtp_requires_auth(self):
        r = requests.get(f"{API}/admin/settings/smtp")
        assert r.status_code in (401, 403)

    def test_save_and_get_masks_password(self, demo_headers):
        payload = {
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
            "smtp_email": "test@example.com",
            "sender_name": "Test Studio",
            "smtp_password": "supersecret123",
        }
        r = requests.post(f"{API}/admin/settings/smtp", headers=demo_headers, json=payload)
        assert r.status_code == 200, r.text
        assert r.json().get("saved") is True

        r = requests.get(f"{API}/admin/settings/smtp", headers=demo_headers)
        assert r.status_code == 200
        cfg = r.json()
        assert cfg["smtp_host"] == "smtp.example.com"
        assert cfg["smtp_port"] == 587
        assert cfg["smtp_email"] == "test@example.com"
        assert cfg["sender_name"] == "Test Studio"
        # Password must never be returned in plaintext
        assert cfg.get("smtp_password") in ("", None)
        assert cfg.get("has_password") is True

    def test_save_preserves_password_when_blank(self, demo_headers):
        # Save without password should retain previous password
        r = requests.post(f"{API}/admin/settings/smtp", headers=demo_headers, json={
            "smtp_host": "smtp.example.com",
            "smtp_port": 465,
            "smtp_email": "test@example.com",
            "sender_name": "Test Studio",
            "smtp_password": "",
        })
        assert r.status_code == 200
        r = requests.get(f"{API}/admin/settings/smtp", headers=demo_headers)
        assert r.json().get("has_password") is True
        assert r.json().get("smtp_port") == 465


class TestSmtpTestSend:
    def test_test_send_fails_gracefully(self, demo_headers):
        # SMTP is bogus in preview — expect 502 (send failure), not a crash.
        r = requests.post(f"{API}/admin/settings/smtp/test",
                          headers=demo_headers,
                          json={"to": "someone@example.com"}, timeout=45)
        # 502/400 from backend, or 504/502 from ingress on SMTP timeout — all acceptable, no crash.
        assert r.status_code in (502, 400, 504), f"unexpected status {r.status_code}: {r.text[:200]}"

    def test_test_send_requires_recipient(self, demo_headers):
        # Clear smtp_email path — pass empty to
        r = requests.post(f"{API}/admin/settings/smtp/test",
                          headers=demo_headers, json={"to": ""}, timeout=30)
        # Either 502 (fell back to smtp_email) or 400 (no recipient)
        assert r.status_code in (400, 502)


class TestGalleryNotify:
    def test_notify_gallery_not_found(self, demo_headers):
        r = requests.post(f"{API}/admin/galleries/nonexistent-xyz/notify",
                          headers=demo_headers,
                          json={"to": "x@example.com", "share_url": "http://x"})
        assert r.status_code == 404

    def test_notify_requires_recipient(self, demo_headers):
        # Create a gallery without client_email
        gname = f"TEST_notify_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/admin/galleries", headers=demo_headers, json={"folder_name": gname})
        assert r.status_code == 200, r.text
        gid = r.json()["id"]
        try:
            r = requests.post(f"{API}/admin/galleries/{gid}/notify",
                              headers=demo_headers, json={"to": "", "share_url": "http://x"})
            assert r.status_code == 400
        finally:
            requests.delete(f"{API}/admin/galleries/{gid}", headers=demo_headers)

    def test_notify_fails_gracefully_with_bogus_smtp(self, demo_headers):
        gname = f"TEST_notify2_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/admin/galleries", headers=demo_headers, json={"folder_name": gname})
        gid = r.json()["id"]
        try:
            r = requests.post(f"{API}/admin/galleries/{gid}/notify", headers=demo_headers,
                              json={"to": "client@example.com", "share_url": "http://x", "message": "hi"},
                              timeout=45)
            assert r.status_code in (502, 400), r.text
        finally:
            requests.delete(f"{API}/admin/galleries/{gid}", headers=demo_headers)


class TestEmailLog:
    def test_email_log_accessible(self, demo_headers):
        r = requests.get(f"{API}/admin/email-log", headers=demo_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
