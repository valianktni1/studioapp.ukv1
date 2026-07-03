# StudioApp — PRD & Build Log

## Original Problem Statement
Turn a single-tenant wedding photography gallery system into a **multi-tenant SaaS** called **StudioApp** (studioapp.uk). Super admin (platform owner "Mark") sits above tenant photographers, who manage wedding galleries; clients access password-protected branded galleries. Per-tenant branding (remove all "Weddings By Mark"), "Site Designed & Hosted by StudioApp" footer everywhere, storage plans (Starter 250GB / Pro 500GB / Studio 1TB), Stripe billing, video transcoding (VAAPI), NGINX secure_link video serving, TrueNAS/Docker deployment target.

## Architecture (preview environment)
- Backend: FastAPI (modular), MongoDB (motor), JWT multi-tier auth, PIL thumbnails, local-disk storage under UPLOAD_DIR.
- Frontend: React 19 + React Router 7, Tailwind, Framer Motion, sonner, lucide-react. Dark luxury theme (charcoal #0A0A0B + champagne gold #D4AF37), Cormorant Garamond + Manrope fonts.
- Multi-tenancy: every collection carries tenant_id; all tenant endpoints filter by JWT tenant_id. Disk: UPLOAD_DIR/{tenant_id}/{gallery_id}/{subfolder_slug}/.
- Auth tiers: super_admin -> tenant_admin (impersonation supported) -> share links (clients).

## User Personas
1. Super Admin (Mark) — manages all tenants, billing, storage, impersonation.
2. Tenant Admin (Photographer) — galleries, uploads, shares, branding, settings.
3. Client (Couple) — views/favourites/downloads via share links.

## Implemented (2026-07-02)
- Multi-tier JWT auth (bcrypt): super admin + tenant admin, impersonation, suspend gate.
- Super Admin dashboard: list/create/suspend/unsuspend/delete tenants, overview (count/active/MRR/galleries), impersonate; table shows Galleries (used/limit) + Subdomain.
- Tenant onboarding wizard (business, logo URL, brand colours) + branding/password settings.
- Galleries: CRUD, default subfolders, templates, subfolder cover, delete subfolder. **Gallery-count limit enforced (402) per plan.**
- File uploads with background thumbnail + preview generation (separate 8/2 worker pools).
- Media serving: thumb/preview/original (public by gallery_id UUID capability — MVP).
- Share links: create/list/toggle/delete, password (bcrypt), access levels, expiry, guest-upload; **auto vanity slug from couple name/date**; password-gated downloads via signed grant.
- Public ShareView: branding, password gate, subfolder tabs, grid + lightbox, favourites + submit, Download All (ZIP), guest uploads, 30s heartbeat, dark/light, album instructions, watermark.
- Dashboard stats (5 cards) + gallery-usage bar, Live Visitors, activity logging.
- Per-tenant branding + "Site Designed & Hosted by StudioApp" footer everywhere.
- **Pricing model = number of galleries: Starter £15/10, Professional £35/30, Studio £65/60.**
- **Stripe subscription checkout (Settings > Billing) via emergentintegrations, webhook + status polling, auto-upgrades plan on paid.** Tested returning real checkout.stripe.com URLs.
- **Per-tenant subdomain slug ({subdomain}.studio-app.uk) + public resolve endpoint /api/public/tenant/{subdomain}.**
- Landing: wedding hero image + "Built by a Wedding Photographer for Photographers" section.
- Tests: iteration_2 41/41 backend + frontend flows pass.

## DEFERRED / Backlog (not yet built)
- P0: **PayPal payments** (awaiting user credentials — subscriptions and/or print orders).
- P0: Real subdomain wildcard routing (needs *.studio-app.uk DNS + NPM + wildcard SSL; app resolves tenant from Host header — logic ready, can't demo in single-host preview).
- P0: Video transcoding (FFmpeg + VAAPI GPU/CPU fallback) + NGINX secure_link (no ffmpeg/GPU in preview).
- P1: SMTP per-tenant email suite, TOTP 2FA, QR PDFs, print sizes/orders, chunked 40GB uploads, backups, activity archive, slideshow.
- P2: Docker Compose + TrueNAS mounts, logo file upload to object storage.
- Security notes: gate /api/media/* before prod; set PUBLIC_BASE_URL for Stripe webhook; consider per-tenant share slug once subdomain routing is live.

## Email/SMTP Suite (2026-07-03) — DONE
- Per-tenant SMTP config: Settings > Email (SMTP) tab (host/port/from/sender/password), password never returned in plaintext (masked, has_password flag). Save via POST /api/admin/settings/smtp, load via GET.
- Test send: POST /api/admin/settings/smtp/test. Branded "Gallery Ready" client email: POST /api/admin/galleries/{gid}/notify (Notify Client button + modal in gallery detail, picks a share link, optional password/message). Email log: GET /api/admin/email-log.
- From header uses formataddr((sender_name, smtp_email)) to avoid Hostinger 553. _send runs via run_in_threadpool (non-blocking), smtplib timeout=8s, message/password html-escaped.
- Fixed pre-existing crash: AdminLogin.js was missing `useTitle` import (login page ReferenceError). 
- Verified: iteration_3 backend 9/9 + all 4 frontend flows pass. NOTE: actual email delivery cannot be tested in preview (unreachable SMTP); friendly toast on 502/504.

## Gallery-count Plans Fix (2026-07-03) — DONE
- Backend PLANS already gallery-count based (Starter 10/£15, Professional 30/£35, Studio 60/£65) with 402 enforcement in routes/galleries.py. Bug was stale FRONTEND leftovers:
  - Super Admin "New Studio" dropdown showed 250GB/500GB/1TB AND sent plan="pro" (invalid key) -> creation failed 400 "Invalid plan". Fixed to starter/professional/studio + gallery-count labels.
  - Landing feature copy "Generous Storage / 250GB-1TB" -> gallery-count messaging.
  - Tenant AdminDashboard "Storage" (bytes) stat -> "Galleries Left"; usage bar shows active/limit.
- Verified iteration_4: Professional studio -> gallery_limit=30; 11th gallery on Starter -> 402; no GB copy remains in tenant UI.
- NOTE: email suite + this fix are in preview/codebase; LIVE site shows old behaviour until Save to GitHub (studioapp.ukv1/main) + Dockge rebuild.

## Next Tasks
1. PayPal (awaiting credentials) — subscriptions + print orders.
2. Video transcoding (VAAPI/FFmpeg) + NGINX secure_link (backend logic only; no ffmpeg/GPU in preview).
3. Broadcast email to multiple gallery clients + editable templates; background job for share-link expiry reminders.
4. Redeploy after each change (Save to Github -> Dockge rebuild).
- Backlog security: Fernet-encrypt stored smtp_password at rest.

## Trials & Self-Signup (2026-07-02)
- Public signup POST /api/admin/register -> creates tenant+admin, auto subdomain, starts **7-day free trial** (subscription_status="trialing", trial_ends_at=now+7d), auto-login -> onboarding. Landing/login CTAs wired to /signup.
- Trial enforcement: write actions (create gallery, upload, create share) return 402 once trial expired & unpaid; login + billing remain reachable so they can pay. Stripe payment -> subscription_status="active", trial cleared.
- Super admin trial control: PUT /api/super-admin/tenants/{id}/trial {days:N} (extend, adds to remaining) or {unlimited:true} (comp = free forever). Dashboard shows Trial·Xd / Active / Comp·Unlimited / Trial ended, with +7d and ∞ (comp) buttons per tenant.
