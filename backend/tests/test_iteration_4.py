"""Iteration 4 tests: gallery-count plan enforcement + SuperAdmin tenant create."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://handoff-app-5.preview.emergentagent.com").rstrip("/")

SUPER = {"username": "superadmin", "password": "Stu!d10App_2026xQ"}
DEMO = {"email": "demo@studio-app.uk", "password": "Demo!2026"}


@pytest.fixture(scope="module")
def super_token():
    r = requests.post(f"{BASE_URL}/api/super-admin/login", json=SUPER, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def demo_token():
    r = requests.post(f"{BASE_URL}/api/admin/login", json=DEMO, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def sa_headers(t):
    return {"Authorization": f"Bearer {t}"}


def test_super_login(super_token):
    assert super_token


def test_create_tenant_professional_success_and_cleanup(super_token):
    ts = int(time.time())
    email = f"TEST_qa_{ts}@example.com"
    payload = {
        "business_name": f"TEST QA Studio {ts}",
        "email": email,
        "password": "TestPass!23",
        "plan": "professional",
    }
    r = requests.post(f"{BASE_URL}/api/super-admin/tenants", json=payload,
                      headers=sa_headers(super_token), timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["plan"] == "professional"
    assert body["plan_label"] == "Professional"
    assert body["gallery_limit"] == 30
    tid = body["id"]

    # Verify in list
    lst = requests.get(f"{BASE_URL}/api/super-admin/tenants",
                       headers=sa_headers(super_token), timeout=15).json()
    found = next((x for x in lst if x["id"] == tid), None)
    assert found is not None
    assert found["gallery_limit"] == 30
    assert found["gallery_count"] == 0

    # Cleanup
    d = requests.delete(f"{BASE_URL}/api/super-admin/tenants/{tid}",
                        headers=sa_headers(super_token), timeout=15)
    assert d.status_code == 200


def test_create_tenant_rejects_invalid_plan(super_token):
    ts = int(time.time())
    payload = {
        "business_name": f"TEST bad plan {ts}",
        "email": f"TEST_bad_{ts}@example.com",
        "password": "TestPass!23",
        "plan": "pro",  # legacy invalid value
    }
    r = requests.post(f"{BASE_URL}/api/super-admin/tenants", json=payload,
                      headers=sa_headers(super_token), timeout=15)
    assert r.status_code == 400
    assert "Invalid plan" in r.text


def test_overview_reports_plans_by_gallery_count(super_token):
    r = requests.get(f"{BASE_URL}/api/super-admin/overview",
                     headers=sa_headers(super_token), timeout=15)
    assert r.status_code == 200
    data = r.json()
    plans = data.get("plans", {})
    assert plans["starter"]["gallery_limit"] == 10
    assert plans["professional"]["gallery_limit"] == 30
    assert plans["studio"]["gallery_limit"] == 60


def test_demo_dashboard_stats_has_gallery_limit(demo_token):
    r = requests.get(f"{BASE_URL}/api/admin/dashboard-stats",
                     headers=sa_headers(demo_token), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["gallery_limit"] == 30
    assert d["plan_label"] == "Professional"
    assert "active_galleries" in d


def test_gallery_limit_enforcement_402_on_starter_tenant(super_token):
    """Create a Starter tenant (limit=10), fill to 10 galleries, verify next returns 402."""
    ts = int(time.time())
    email = f"TEST_lim_{ts}@example.com"
    r = requests.post(f"{BASE_URL}/api/super-admin/tenants",
                      json={"business_name": f"TEST Lim {ts}", "email": email,
                            "password": "TestPass!23", "plan": "starter"},
                      headers=sa_headers(super_token), timeout=15)
    assert r.status_code == 200, r.text
    tid = r.json()["id"]

    # Impersonate to get tenant admin token
    imp = requests.post(f"{BASE_URL}/api/super-admin/tenants/{tid}/impersonate",
                        headers=sa_headers(super_token), timeout=15)
    assert imp.status_code == 200, imp.text
    ttoken = imp.json()["token"]

    last_status = None
    try:
        # Create 10 galleries (limit)
        for i in range(10):
            cr = requests.post(f"{BASE_URL}/api/admin/galleries",
                               json={"folder_name": f"TEST_g{i}", "client_email": "x@x.com",
                                     "subfolders": ["Photos"]},
                               headers=sa_headers(ttoken), timeout=20)
            assert cr.status_code == 200, f"gallery {i}: {cr.status_code} {cr.text}"

        # 11th must be 402
        over = requests.post(f"{BASE_URL}/api/admin/galleries",
                             json={"folder_name": "TEST_over", "client_email": "x@x.com",
                                   "subfolders": ["Photos"]},
                             headers=sa_headers(ttoken), timeout=20)
        last_status = over.status_code
        assert over.status_code == 402, f"expected 402, got {over.status_code} {over.text}"
        assert "10 galleries" in over.text or "limit" in over.text.lower()
    finally:
        # Always cleanup tenant + all its data
        requests.delete(f"{BASE_URL}/api/super-admin/tenants/{tid}",
                        headers=sa_headers(super_token), timeout=15)
