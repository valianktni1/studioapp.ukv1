import os
import uuid
import requests
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from starlette.concurrency import run_in_threadpool

from db import db
from auth_utils import get_current_tenant, get_current_super_admin

router = APIRouter(prefix="/api", tags=["orders"])


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def clean(d):
    if d:
        d = dict(d); d.pop("_id", None)
    return d


# ---------------- PayPal helpers (creds from DB, set by super admin) ----------------
async def _paypal_cfg():
    doc = await db.settings.find_one({"key": "paypal", "scope": "global"})
    return (doc or {}).get("value") or {}


def _paypal_base(mode):
    return "https://api-m.paypal.com" if mode == "live" else "https://api-m.sandbox.paypal.com"


def _pp_token(cfg):
    r = requests.post(f"{_paypal_base(cfg.get('mode'))}/v1/oauth2/token",
                      auth=(cfg["client_id"], cfg["secret"]), data={"grant_type": "client_credentials"}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def _pp_create(cfg, amount, currency, return_url, cancel_url, desc):
    tok = _pp_token(cfg)
    body = {"intent": "CAPTURE",
            "purchase_units": [{"amount": {"currency_code": currency, "value": f"{amount:.2f}"}, "description": desc[:127]}],
            "application_context": {"return_url": return_url, "cancel_url": cancel_url, "shipping_preference": "NO_SHIPPING", "user_action": "PAY_NOW"}}
    r = requests.post(f"{_paypal_base(cfg.get('mode'))}/v2/checkout/orders", json=body,
                      headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}, timeout=30)
    r.raise_for_status()
    data = r.json()
    approve = next((l["href"] for l in data.get("links", []) if l["rel"] == "approve"), None)
    return data["id"], approve


def _pp_capture(cfg, pp_order_id):
    tok = _pp_token(cfg)
    r = requests.post(f"{_paypal_base(cfg.get('mode'))}/v2/checkout/orders/{pp_order_id}/capture",
                      headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}, timeout=30)
    r.raise_for_status()
    return r.json()


# ---------------- Super admin: PayPal config ----------------
@router.get("/super-admin/paypal")
async def get_paypal(sa=Depends(get_current_super_admin)):
    cfg = await _paypal_cfg()
    return {"client_id": cfg.get("client_id", ""), "mode": cfg.get("mode", "sandbox"),
            "currency": cfg.get("currency", "GBP"), "configured": bool(cfg.get("client_id") and cfg.get("secret"))}


@router.put("/super-admin/paypal")
async def set_paypal(body: dict, sa=Depends(get_current_super_admin)):
    existing = await _paypal_cfg()
    value = {"client_id": (body.get("client_id") or "").strip(),
             "secret": body.get("secret") or existing.get("secret", ""),
             "mode": body.get("mode", "sandbox"), "currency": (body.get("currency") or "GBP").upper()}
    await db.settings.update_one({"key": "paypal", "scope": "global"},
                                 {"$set": {"key": "paypal", "scope": "global", "value": value}}, upsert=True)
    return {"saved": True}


# ---------------- Tenant: print sizes ----------------
@router.get("/admin/print-sizes")
async def get_sizes(ctx=Depends(get_current_tenant)):
    doc = await db.settings.find_one({"tenant_id": ctx["tenant_id"], "key": "print_sizes"})
    cfg = await _paypal_cfg()
    return {"sizes": (doc or {}).get("value", []), "currency": cfg.get("currency", "GBP")}


@router.put("/admin/print-sizes")
async def set_sizes(body: dict, ctx=Depends(get_current_tenant)):
    sizes = []
    for s in body.get("sizes", []):
        sizes.append({"id": s.get("id") or str(uuid.uuid4()), "label": (s.get("label") or "").strip(),
                      "dimensions": (s.get("dimensions") or "").strip(), "price": round(float(s.get("price") or 0), 2)})
    await db.settings.update_one({"tenant_id": ctx["tenant_id"], "key": "print_sizes"},
                                 {"$set": {"tenant_id": ctx["tenant_id"], "key": "print_sizes", "value": sizes}}, upsert=True)
    return {"saved": True, "sizes": sizes}


# ---------------- Tenant: orders ----------------
@router.get("/admin/orders")
async def list_orders(ctx=Depends(get_current_tenant)):
    items = await db.print_orders.find({"tenant_id": ctx["tenant_id"]}).sort("created_at", -1).to_list(500)
    return [clean(i) for i in items]


@router.put("/admin/orders/{oid}/status")
async def update_order(oid: str, body: dict, ctx=Depends(get_current_tenant)):
    await db.print_orders.update_one({"id": oid, "tenant_id": ctx["tenant_id"]},
                                     {"$set": {"status": body.get("status", "new")}})
    return {"updated": True}


# ---------------- Public: print sizes + ordering ----------------
async def _resolve(token):
    from routes.public_share import _resolve_share
    return await _resolve_share(token)


@router.get("/share/{token}/print-sizes")
async def public_sizes(token: str):
    s = await _resolve(token)
    doc = await db.settings.find_one({"tenant_id": s["tenant_id"], "key": "print_sizes"})
    cfg = await _paypal_cfg()
    return {"sizes": (doc or {}).get("value", []), "currency": cfg.get("currency", "GBP"), "paypal_enabled": bool(cfg.get("client_id") and cfg.get("secret"))}


@router.post("/share/{token}/print-order")
async def create_print_order(token: str, body: dict):
    s = await _resolve(token)
    doc = await db.settings.find_one({"tenant_id": s["tenant_id"], "key": "print_sizes"})
    size_map = {x["id"]: x for x in (doc or {}).get("value", [])}
    items, total = [], 0.0
    for it in body.get("items", []):
        sz = size_map.get(it.get("size_id"))
        qty = int(it.get("qty") or 0)
        if not sz or qty <= 0:
            continue
        line = round(sz["price"] * qty, 2)
        total += line
        items.append({"size_id": sz["id"], "size_label": sz["label"], "dimensions": sz["dimensions"],
                      "unit_price": sz["price"], "qty": qty, "line_total": line,
                      "file_id": it.get("file_id"), "filename": it.get("filename")})
    if not items:
        raise HTTPException(status_code=400, detail="Please add at least one print")
    cust = body.get("customer") or {}
    if not cust.get("email"):
        raise HTTPException(status_code=400, detail="Your email is required")
    cfg = await _paypal_cfg()
    currency = cfg.get("currency", "GBP")
    oid = str(uuid.uuid4())
    order = {"id": oid, "tenant_id": s["tenant_id"], "gallery_id": s["gallery_id"], "share_token": s["token"],
             "items": items, "total": round(total, 2), "currency": currency,
             "customer": {"name": cust.get("name", ""), "email": cust.get("email", "")},
             "status": "pending", "paypal_order_id": None, "created_at": now_iso()}

    if cfg.get("client_id") and cfg.get("secret"):
        origin = (body.get("origin_url") or os.environ.get("PUBLIC_BASE_URL", "")).rstrip("/")
        return_url = f"{origin}/s/{token}?print_paid={oid}"
        cancel_url = f"{origin}/s/{token}?print_cancel={oid}"
        try:
            pp_id, approve = await run_in_threadpool(_pp_create, cfg, round(total, 2), currency, return_url, cancel_url, f"Photo prints — {len(items)} item(s)")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Could not start PayPal checkout: {e}")
        order["paypal_order_id"] = pp_id
        await db.print_orders.insert_one(order)
        return {"order_id": oid, "approve_url": approve, "paypal": True}

    order["status"] = "awaiting_contact"
    await db.print_orders.insert_one(order)
    return {"order_id": oid, "paypal": False, "message": "Order received"}


@router.post("/share/{token}/print-order/{oid}/capture")
async def capture_print_order(token: str, oid: str, body: dict):
    s = await _resolve(token)
    order = await db.print_orders.find_one({"id": oid, "tenant_id": s["tenant_id"]})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    cfg = await _paypal_cfg()
    pp_id = body.get("paypal_order_id") or order.get("paypal_order_id")
    try:
        result = await run_in_threadpool(_pp_capture, cfg, pp_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Payment capture failed: {e}")
    paid = result.get("status") == "COMPLETED"
    await db.print_orders.update_one({"id": oid}, {"$set": {"status": "paid" if paid else "failed"}})
    return {"paid": paid, "status": result.get("status")}
