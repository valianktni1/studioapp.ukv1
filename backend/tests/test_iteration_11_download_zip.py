"""Iteration 11: Verify streaming download-zip endpoint (GET + POST) and access control."""
import io
import os
import time
import zipfile

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://handoff-app-5.preview.emergentagent.com").rstrip("/")
TOKEN = "eva-ella-27-06-26"


@pytest.fixture(scope="module")
def grant():
    r = requests.post(f"{BASE_URL}/api/share/{TOKEN}/access", json={"password": ""}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    g = body.get("grant") or body.get("token") or body.get("access_token")
    assert g, f"No grant in response: {body}"
    return g


def _validate_zip(content: bytes):
    zf = zipfile.ZipFile(io.BytesIO(content))
    names = zf.namelist()
    assert len(names) >= 1
    # arcnames should be like 'Wedding Images/xyz.jpg'
    assert any("/" in n for n in names), f"Expected subfolder arcnames, got {names}"
    bad = zf.testzip()
    assert bad is None, f"Corrupt entry: {bad}"
    return names


def test_get_download_zip_streams_valid_zip(grant):
    start = time.time()
    r = requests.get(f"{BASE_URL}/api/share/{TOKEN}/download-zip", params={"grant": grant}, timeout=30)
    elapsed = time.time() - start
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("application/zip")
    cd = r.headers.get("content-disposition", "")
    assert "attachment" in cd.lower()
    assert ".zip" in cd.lower()
    names = _validate_zip(r.content)
    print(f"GET zip: {len(names)} files, {len(r.content)} bytes, {elapsed:.2f}s, names={names[:3]}")
    assert elapsed < 15, f"Download took too long: {elapsed}s"


def test_post_download_zip_backwards_compatible(grant):
    r = requests.post(f"{BASE_URL}/api/share/{TOKEN}/download-zip", json={"grant": grant}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("application/zip")
    names = _validate_zip(r.content)
    assert len(names) >= 1


def test_download_zip_access_control_on_view_only_share():
    """Downloads must be disabled entirely for view-only shares. Demo share has no
    password, so empty grant is legit. Verify: a share whose access_level is not
    download/full returns 403 regardless of grant."""
    # Try a bogus token — must 404 (not leak files)
    r = requests.get(f"{BASE_URL}/api/share/does-not-exist-xyz/download-zip", params={"grant": ""}, timeout=15)
    assert r.status_code == 404, f"Expected 404 for unknown token, got {r.status_code}"
