import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest,
)

from db import db, PLANS
from auth_utils import get_current_tenant

router = APIRouter(prefix="/api", tags=["billing"])


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def _stripe(request: Request) -> StripeCheckout:
    api_key = os.environ["STRIPE_API_KEY"]
    host_url = str(request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    return StripeCheckout(api_key=api_key, webhook_url=webhook_url)


@router.get("/billing/plans")
async def billing_plans():
    return PLANS


@router.post("/billing/checkout")
async def create_checkout(payload: dict, request: Request, ctx=Depends(get_current_tenant)):
    plan = payload.get("plan")
    origin = (payload.get("origin_url") or "").rstrip("/")
    if plan not in PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")
    if not origin:
        raise HTTPException(status_code=400, detail="Missing origin")

    amount = float(PLANS[plan]["price"])  # server-side amount only
    success_url = f"{origin}/admin/settings?tab=billing&session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/admin/settings?tab=billing"
    metadata = {"tenant_id": ctx["tenant_id"], "plan": plan, "kind": "subscription"}

    stripe = _stripe(request)
    req = CheckoutSessionRequest(amount=amount, currency="gbp",
                                 success_url=success_url, cancel_url=cancel_url, metadata=metadata)
    session = await stripe.create_checkout_session(req)

    await db.payment_transactions.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": ctx["tenant_id"], "plan": plan,
        "amount": amount, "currency": "gbp", "session_id": session.session_id,
        "payment_status": "initiated", "status": "open", "applied": False,
        "metadata": metadata, "created_at": now_iso(), "updated_at": now_iso(),
    })
    return {"url": session.url, "session_id": session.session_id}


async def _apply_if_paid(tx, checkout_status):
    """Idempotently upgrade tenant when a session becomes paid."""
    if checkout_status.payment_status == "paid" and not tx.get("applied"):
        plan = tx["plan"]
        await db.tenants.update_one({"id": tx["tenant_id"]}, {"$set": {
            "plan": plan, "gallery_limit": PLANS[plan]["gallery_limit"],
            "subscription_status": "active", "trial_ends_at": None, "suspended": False,
        }})
        await db.payment_transactions.update_one({"session_id": tx["session_id"]}, {"$set": {"applied": True}})


@router.get("/billing/status/{session_id}")
async def checkout_status(session_id: str, request: Request, ctx=Depends(get_current_tenant)):
    tx = await db.payment_transactions.find_one({"session_id": session_id, "tenant_id": ctx["tenant_id"]})
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    stripe = _stripe(request)
    st = await stripe.get_checkout_status(session_id)
    await db.payment_transactions.update_one({"session_id": session_id}, {"$set": {
        "payment_status": st.payment_status, "status": st.status, "updated_at": now_iso()}})
    await _apply_if_paid(tx, st)
    return {"status": st.status, "payment_status": st.payment_status, "plan": tx["plan"]}


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    sig = request.headers.get("Stripe-Signature")
    stripe = _stripe(request)
    try:
        event = await stripe.handle_webhook(body, sig)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook")
    if event.session_id:
        tx = await db.payment_transactions.find_one({"session_id": event.session_id})
        if tx:
            await db.payment_transactions.update_one({"session_id": event.session_id}, {"$set": {
                "payment_status": event.payment_status, "updated_at": now_iso()}})
            if event.payment_status == "paid":
                class _S:  # lightweight adapter for _apply_if_paid
                    payment_status = "paid"
                await _apply_if_paid(tx, _S())
    return {"received": True}
