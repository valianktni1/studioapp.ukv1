import os
import smtplib
import uuid
import html as html_lib
from datetime import datetime, timezone, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr
from fastapi import APIRouter, Depends, HTTPException
from starlette.concurrency import run_in_threadpool

from db import db, resolve_public_base
from auth_utils import get_current_tenant

import logging
logger = logging.getLogger("studioapp")

router = APIRouter(prefix="/api/admin", tags=["email"])


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def _get_smtp(tenant_id):
    doc = await db.settings.find_one({"tenant_id": tenant_id, "key": "smtp"})
    return (doc or {}).get("value")


def _send(cfg, to, subject, html):
    if not cfg or not cfg.get("smtp_host"):
        raise HTTPException(status_code=400, detail="SMTP is not configured. Add your email settings first.")
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((cfg.get("sender_name") or cfg["smtp_email"], cfg["smtp_email"]))
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))
    port = int(cfg.get("smtp_port", 587))
    try:
        if port == 465:
            server = smtplib.SMTP_SSL(cfg["smtp_host"], port, timeout=8)
        else:
            server = smtplib.SMTP(cfg["smtp_host"], port, timeout=8)
            server.starttls()
        server.login(cfg["smtp_email"], cfg["smtp_password"])
        server.sendmail(cfg["smtp_email"], [to], msg.as_string())
        server.quit()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Email send failed: {e}")


@router.get("/settings/smtp")
async def get_smtp(ctx=Depends(get_current_tenant)):
    cfg = await _get_smtp(ctx["tenant_id"]) or {}
    cfg = dict(cfg)
    if cfg.get("smtp_password"):
        cfg["smtp_password"] = ""  # never return the stored password
        cfg["has_password"] = True
    return cfg


@router.post("/settings/smtp")
async def save_smtp(body: dict, ctx=Depends(get_current_tenant)):
    existing = await _get_smtp(ctx["tenant_id"]) or {}
    value = {
        "smtp_host": body.get("smtp_host", "").strip(),
        "smtp_port": int(body.get("smtp_port") or 587),
        "smtp_email": body.get("smtp_email", "").strip(),
        "sender_name": body.get("sender_name", "").strip(),
        # keep existing password if the form left it blank
        "smtp_password": body.get("smtp_password") or existing.get("smtp_password", ""),
    }
    await db.settings.update_one(
        {"tenant_id": ctx["tenant_id"], "key": "smtp"},
        {"$set": {"tenant_id": ctx["tenant_id"], "key": "smtp", "value": value}}, upsert=True)
    return {"saved": True}


@router.post("/settings/smtp/test")
async def test_smtp(body: dict, ctx=Depends(get_current_tenant)):
    cfg = await _get_smtp(ctx["tenant_id"])
    to = body.get("to") or (cfg or {}).get("smtp_email")
    if not to:
        raise HTTPException(status_code=400, detail="No recipient")
    tenant = await db.tenants.find_one({"id": ctx["tenant_id"]})
    html = f"<h2 style='font-family:Georgia,serif'>Test email from {tenant.get('business_name')}</h2><p>Your StudioApp email settings are working. 🎉</p><p style='color:#888;font-size:12px'>Powered by StudioApp</p>"
    await run_in_threadpool(_send, cfg, to, f"Test email from {tenant.get('business_name')}", html)
    await db.email_log.insert_one({"id": str(uuid.uuid4()), "tenant_id": ctx["tenant_id"], "type": "test",
                                   "subject": "Test email", "recipient": to, "created_at": now_iso()})
    return {"sent": True}


@router.post("/galleries/{gid}/notify")
async def notify_couple(gid: str, body: dict, ctx=Depends(get_current_tenant)):
    g = await db.galleries.find_one({"id": gid, "tenant_id": ctx["tenant_id"]})
    if not g:
        raise HTTPException(status_code=404, detail="Gallery not found")
    to = body.get("to") or g.get("client_email")
    if not to:
        raise HTTPException(status_code=400, detail="No client email set for this gallery")
    tenant = await db.tenants.find_one({"id": ctx["tenant_id"]})
    cfg = await _get_smtp(ctx["tenant_id"])
    biz = tenant.get("business_name")
    accent = tenant.get("accent_color", "#D4AF37")
    link = body.get("share_url", "")
    pwd = html_lib.escape(body.get("password", "") or "")
    message = html_lib.escape(body.get("message", "") or "")
    logo = f"<img src='{tenant.get('logo_url')}' alt='{biz}' style='max-height:60px;margin-bottom:16px'/>" if tenant.get("logo_url") else ""
    html = f"""
    <div style='font-family:Georgia,serif;max-width:560px;margin:auto;padding:24px;color:#1a1a1a'>
      {logo}
      <h1 style='font-size:26px'>Your wedding gallery is ready ✨</h1>
      <p>Hello,</p>
      <p>{biz} has finished your gallery <b>{g.get('folder_name')}</b>. You can now view, favourite and download your images.</p>
      {f'<p>{message}</p>' if message else ''}
      <p style='margin:24px 0'><a href='{link}' style='background:{accent};color:#fff;padding:12px 22px;text-decoration:none;border-radius:4px;font-family:Arial,sans-serif'>View your gallery</a></p>
      {f"<p style='font-family:Arial,sans-serif'>Password: <b>{pwd}</b></p>" if pwd else ''}
      <p style='color:#888;font-size:12px;margin-top:32px'>Powered by StudioApp</p>
    </div>"""
    await run_in_threadpool(_send, cfg, to, f"Your gallery is ready — {biz}", html)
    await db.email_log.insert_one({"id": str(uuid.uuid4()), "tenant_id": ctx["tenant_id"], "type": "gallery_ready",
                                   "subject": f"Your gallery is ready — {biz}", "gallery_name": g.get("folder_name"),
                                   "recipient": to, "created_at": now_iso()})
    return {"sent": True}


@router.get("/email-log")
async def email_log(ctx=Depends(get_current_tenant)):
    items = await db.email_log.find({"tenant_id": ctx["tenant_id"]}).sort("created_at", -1).to_list(300)
    return [{k: v for k, v in i.items() if k != "_id"} for i in items]


# ---------------- Reusable email templates ----------------
@router.get("/email-templates")
async def list_templates(ctx=Depends(get_current_tenant)):
    items = await db.email_templates.find({"tenant_id": ctx["tenant_id"]}).sort("created_at", -1).to_list(200)
    return [{k: v for k, v in i.items() if k != "_id"} for i in items]


@router.post("/email-templates")
async def create_template(body: dict, ctx=Depends(get_current_tenant)):
    doc = {"id": str(uuid.uuid4()), "tenant_id": ctx["tenant_id"],
           "name": (body.get("name") or "Untitled").strip(),
           "subject": (body.get("subject") or "").strip(),
           "body": body.get("body") or "", "created_at": now_iso()}
    await db.email_templates.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/email-templates/{tid}")
async def update_template(tid: str, body: dict, ctx=Depends(get_current_tenant)):
    await db.email_templates.update_one({"id": tid, "tenant_id": ctx["tenant_id"]},
        {"$set": {"name": (body.get("name") or "Untitled").strip(), "subject": (body.get("subject") or "").strip(), "body": body.get("body") or ""}})
    return {"updated": True}


@router.delete("/email-templates/{tid}")
async def delete_template(tid: str, ctx=Depends(get_current_tenant)):
    await db.email_templates.delete_one({"id": tid, "tenant_id": ctx["tenant_id"]})
    return {"deleted": True}


def _render(text, couple, link, pwd=""):
    return (text or "").replace("{couple_name}", couple or "").replace("{gallery_link}", link or "").replace("{password}", pwd or "")


@router.post("/galleries/{gid}/send-template")
async def send_template(gid: str, body: dict, ctx=Depends(get_current_tenant)):
    from media import parse_couple_name
    g = await db.galleries.find_one({"id": gid, "tenant_id": ctx["tenant_id"]})
    if not g:
        raise HTTPException(status_code=404, detail="Gallery not found")
    tpl = await db.email_templates.find_one({"id": body.get("template_id"), "tenant_id": ctx["tenant_id"]})
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    to = body.get("to") or g.get("client_email")
    if not to:
        raise HTTPException(status_code=400, detail="No recipient email")
    tenant = await db.tenants.find_one({"id": ctx["tenant_id"]})
    cfg = await _get_smtp(ctx["tenant_id"])
    couple = parse_couple_name(g.get("folder_name"))
    link = body.get("share_url", "")
    pwd = body.get("password", "")
    subject = _render(tpl["subject"], couple, link, pwd)
    logo = f"<img src='{tenant.get('logo_url')}' alt='' style='max-height:60px;margin-bottom:16px'/>" if tenant.get("logo_url") else ""
    inner = _render(tpl["body"], couple, link, pwd).replace("\n", "<br/>")
    html = f"<div style='font-family:Georgia,serif;max-width:560px;margin:auto;padding:24px;color:#1a1a1a'>{logo}{inner}<p style='color:#888;font-size:12px;margin-top:32px'>Powered by StudioApp</p></div>"
    await run_in_threadpool(_send, cfg, to, subject or f"A message from {tenant.get('business_name')}", html)
    await db.email_log.insert_one({"id": str(uuid.uuid4()), "tenant_id": ctx["tenant_id"], "type": "template",
                                   "subject": subject, "gallery_name": g.get("folder_name"), "recipient": to, "created_at": now_iso()})
    return {"sent": True}


# ---------------- Expiry reminder background job ----------------
async def run_expiry_reminders():
    from media import parse_couple_name
    base = resolve_public_base()
    if not base:
        logger.warning("Skipping expiry reminders: neither PUBLIC_BASE_URL nor ROOT_DOMAIN is set (would produce broken links).")
        return 0
    now = datetime.now(timezone.utc)
    soon = now + timedelta(days=7)
    sent = 0
    cursor = db.shares.find({"expires_at": {"$ne": None}, "is_active": True,
                             "guest_upload_mode": {"$ne": True}, "expiry_reminder_sent": {"$ne": True}})
    async for s in cursor:
        try:
            exp = datetime.fromisoformat(s["expires_at"])
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
        except Exception:
            continue
        if exp <= now or exp > soon:
            continue
        g = await db.galleries.find_one({"id": s["gallery_id"]})
        to = (g or {}).get("client_email")
        cfg = await _get_smtp(s["tenant_id"])
        if not to or not cfg or not cfg.get("smtp_host"):
            continue
        tenant = await db.tenants.find_one({"id": s["tenant_id"]})
        biz = (tenant or {}).get("business_name", "")
        accent = (tenant or {}).get("accent_color", "#D4AF37")
        link = f"{base}/s/{s.get('custom_slug') or s['token']}"
        couple = parse_couple_name((g or {}).get("folder_name"))
        logo = f"<img src='{tenant.get('logo_url')}' alt='' style='max-height:60px;margin-bottom:16px'/>" if (tenant or {}).get("logo_url") else ""
        html = f"""<div style='font-family:Georgia,serif;max-width:560px;margin:auto;padding:24px;color:#1a1a1a'>{logo}
          <h1 style='font-size:24px'>Don't miss your photos, {couple}</h1>
          <p>A quick reminder from {biz}: your gallery link expires on <b>{exp.date().isoformat()}</b>.</p>
          <p>Please download your favourite images before then.</p>
          <p style='margin:24px 0'><a href='{link}' style='background:{accent};color:#fff;padding:12px 22px;text-decoration:none;border-radius:4px;font-family:Arial,sans-serif'>Open your gallery</a></p>
          <p style='color:#888;font-size:12px;margin-top:32px'>Powered by StudioApp</p></div>"""
        try:
            await run_in_threadpool(_send, cfg, to, f"Your gallery expires soon — {biz}", html)
            await db.shares.update_one({"id": s["id"]}, {"$set": {"expiry_reminder_sent": True}})
            await db.email_log.insert_one({"id": str(uuid.uuid4()), "tenant_id": s["tenant_id"], "type": "expiry_reminder",
                                           "subject": f"Your gallery expires soon — {biz}", "recipient": to, "created_at": now_iso()})
            sent += 1
        except Exception:
            continue
    return sent
