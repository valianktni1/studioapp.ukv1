# StudioApp — ARCHITECTURE PIVOT (2026-06)

## Decision (user-directed, final)
STOP maintaining the from-scratch reimplementation. **Base the product on the user's own
proven repo `180226galleryrepo` (single-tenant "Weddings By Mark")** — everything already
works there (VAAPI GPU transcode, video thumbnails, cinematic client/couple experience,
print shop, slideshow, QR PDFs, SMTP). Then **add a SaaS layer on top**: super admin (the
user "Mark"), tenants (photographers), and tenant customisation. Do NOT reinvent the core.

## What was done (Phase 0 — DONE)
- Cloned `180226galleryrepo` -> replaced /app/backend (monolithic server.py ~3900 lines) and
  /app/frontend (craco + their pages/components) with the repo's code.
- Preserved protected .env (MONGO_URL, DB_NAME, REACT_APP_BACKEND_URL). Added UPLOAD_DIR/JWT_SECRET.
- Disabled visual-edits in craco.config.js (enableVisualEdits=false) — its babel-metadata-plugin
  crashed on ShareView.js. Not needed.
- Dropped the old `studioapp` Mongo DB for a clean first-run.
- Old reimplementation kept for reference at /app/_saas_ref_backend and /app/_saas_ref_frontend
  (has working SaaS patterns: super_admin, tenant_auth, billing, models, local logo upload).
- VERIFIED: app compiles + renders the "Set Up" first-run admin screen in preview.

## Backend architecture (their repo)
- Single monolith: /app/backend/server.py. api_router = APIRouter(prefix="/api"). uvicorn server:app.
- Auth: get_admin (JWT via Header), get_share_session. First-run: /api/admin/check-setup + /api/admin/setup.
- Storage: UPLOAD_DIR / {folder_name}; CACHE_DIR = UPLOAD_DIR/.cache/thumbs/{gallery_id}/{subfolder}/...
- Hardcoded branding to replace: "Weddings By Mark" at lines ~98, 1376, 3391-3546, 3818; display_name default; mark@perfectweddingsbymark.uk.
- Video pipeline (WORKS on their AMD 780M): make_video_thumbnail (output-seek+fallback), create_web_version (VAAPI->CPU), ensure_video_faststart, thumbnail_executor(8)/transcode_executor(2). Do NOT change.

## SaaS conversion plan (remaining phases)
- Phase 4: DONE ✅ (2026-06). Stripe billing (emergentintegrations Checkout wrapper, server-side GBP pricing) + trials + gallery-limit enforcement + self-serve signup + usage meter.
  - Backend: GET /api/admin/billing (usage {used,limit,plan,trial_active,status} + plans), POST /admin/billing/checkout (creates Stripe session, records control_db.payment_transactions), GET /admin/billing/status/{sid} (polls get_checkout_status, idempotent _activate_subscription on paid), POST /webhook/stripe (handle_webhook, idempotent activation), POST /signup (public self-serve, provisions tenant + 14-day trial + demo gallery). create_gallery blocks with 402 when used>=plan limit. _provision_tenant sets subscription_status=trialing + trial_ends_at (TRIAL_DAYS env=14).
  - Frontend: /signup (Signup.js), /admin/billing (AdminBilling.js: plan cards, usage bar, Stripe redirect + return polling), dashboard usage meter (dash-usage-meter) + soft upgrade nudge + Plan nav button.
  - VERIFIED: signup+trial, billing info, checkout session creation (real Stripe test session URL), usage meter, plan cards render. NOTE: actual card payment completion is external (Stripe hosted page); activation wired via status-poll + webhook. STRIPE_API_KEY in backend/.env (test key).
- Phase 2: DONE ✅ (2026-06). Super admin (platform owner) seeded from env (SUPER_ADMIN_USERNAME/PASSWORD) into control_db.super_admins. Routes: /api/super/login, /super/tenants (list w/ stats), POST /super/tenants (provision tenant + admin + default template + AUTO DEMO GALLERY), PUT status/plan, DELETE (drops tenant DB + files). Plans: starter 10/£15, pro 30/£35, studio 60/£65. Frontend: /super (SuperAdmin.js login+dashboard), token in localStorage 'super_token'. VERIFIED 20/20 backend + frontend.
- Phase 3: DONE ✅ (2026-06). Per-tenant branding on tenant doc (business_name, logo_url, accent_color, contact_email, tagline). Routes: GET/PUT /api/admin/branding, POST /api/admin/branding/logo (LOCAL disk under UPLOAD_DIR/<tid>/.branding, cleans old logos), GET /api/public/branding-asset/<tid>/<file>. Share meta /api/share/{token} returns 'branding'. Frontend: AdminBranding.js (/admin/branding), dynamic dash-logo + Branding button in AdminDashboard, generic StudioApp login, ShareView/GuestUploadView/Slideshow use tenant brand; footer 'Site Designed & Hosted by StudioApp'. Backend email/QR hardcoded 'Weddings By Mark' replaced with tenant sender_name / StudioApp. VERIFIED, no WBM leak across tenants.
- Phase 1: DONE ✅ (2026-06). Multi-tenancy at the data layer via **database-per-tenant + request-scoped `db` proxy** (contextvar). Control DB `studioapp` holds `admins`, `tenants`, `share_index`, `super_admins`. Each tenant's data lives in `studioapp__t_<id>`. JWT carries `tenant_id`; `get_admin`/`get_share_session` bind it; public `/api/share/*` routes bind via a router-level dep that looks up the token in `share_index`. Storage paths prefixed by tenant. Background jobs tenant-bound.
- Phase 2: Auth. Super admin (Mark) role + tenant admins. Convert single-admin setup into: super admin seeded from env (SUPER_ADMIN_USERNAME/PASSWORD), tenants each with their own admin login. get_admin resolves tenant_id from JWT.
- Phase 3: Tenant branding. Per-tenant display_name/logo/accent/secondary/email/SMTP. Replace all hardcoded WBM. Logo upload to LOCAL disk (no cloud object storage). Footer: "Site Designed & Hosted by StudioApp".
- Phase 4: Super admin dashboard + plans + billing. Plans: Starter 10 galleries £15/mo, Professional 30 £35/mo, Studio 60 £65/mo. Stripe (emergentintegrations, direct to Stripe). Trials + suspend.
- Phase 5: DONE ✅ (2026-06). Namespaced/branded share URLs /s/{tenant.subdomain}/{token} (path style, no wildcard DNS) IN ADDITION to legacy /s/{token} (both work). Backend: _tenant_subdomain()/_share_public_path() helpers; QR PNG, QR-frame PDF and gallery-share links now emit branded URLs. Fixed latent multi-tenant bug: QR endpoints (get_share_qr / get_share_qr_frame) authenticate via query-string JWT and now call use_tenant(payload['tenant_id']) before db access (was returning 400 'No tenant context'). Frontend: App.js has both route families; ShareAccess/ShareView/PrintShop/SlideshowDirect/GuestUploadView are tenant-aware (base=`/s/${tenant}/${token}`) so internal navigation preserves the branded prefix; AdminGalleryDetail copyShareLink + QR dialog show branded URL via getBranding().subdomain. Gallery-limit enforcement (402) confirmed active in create_gallery. VERIFIED: testing agent iteration_15 — all 4 namespaced routes render identically to legacy, tenant prefix preserved, tenant isolation intact; QR PNG/frame fixed & re-verified via curl (200).
- Phase 5 (old note): Namespaced share URLs /s/{tenant.subdomain}/{slug} (path style, no wildcard DNS).
- Phase 6: Deploy. Compose builds from github valianktni1/studioapp.ukv1; /dev/dri:/dev/dri passthrough; nginx-video service. See DEPLOYMENT.md.

## Notes
- NO Emergent cloud object storage (breaks self-hosting). Logos + all media = local filesystem.
- Deploy commands: see /app/memory/DEPLOYMENT.md (exact, user-provided).

## CRITICAL DEPLOYMENT GOTCHAS (learned the hard way, 2026-06)
1. **emergentintegrations MUST be installed in backend/Dockerfile** (it is NOT on PyPI, so `pip install -r requirements.txt` never gets it). server.py imports it at module top for Stripe -> without it the backend crash-loops with `ModuleNotFoundError: No module named 'emergentintegrations'` (shows as "?" in Dockge + 502 on /api). Dockerfile has: `RUN pip install --no-cache-dir emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/`. Build host needs outbound internet to that index.
2. **GPU transcode**: compose backend must pass the WHOLE dir `devices: - /dev/dri:/dev/dri` (single renderD128 node makes VAAPI fail -> CPU fallback). Diagnose with `docker exec <backend> vainfo`.
3. **Smooth video playback over the net**: set backend env `NGINX_VIDEO_URL=1` (any value) to use the nginx-video container. Unset = jerky Python streaming. nginx video path is tenant-prefixed: `/uploads/{tenant_id}/{gallery}/{sub}/{file}` (fixed in generate_nginx_video_url).
4. **Super admin password**: env is source of truth; ensure_super_admin() force-syncs SUPER_ADMIN_PASSWORD on every startup. Login at /super or /superadmin. Wrap the value in single quotes in YAML if it has special chars.
5. Root `/` = photographer Sign In + "Create your studio" (-> /signup trial). Super admin at /super.

## SUPER ADMIN v2 (2026-06)
4-tab platform dashboard (SuperAdmin.js): Overview (tenants by status, galleries, MRR, total revenue, trials ending in 7 days), Photographers (existing tenant CRUD), Payments (control_db.payment_transactions table + paid total), Broadcast Email (platform SMTP in control_db.settings key 'platform_smtp' + send announcement to all photographers' contact/login emails). Backend endpoints: /super/overview, /super/payments, /super/email-settings (GET/POST + /test), /super/broadcast (+/recipients). Reuses send_smtp_email()/build_branded_email(). GET email-settings masks password; POST preserves on masked placeholder. Verified iteration_16 (100% frontend).
Also this session: batched uploads (25 photos/req, videos 1/req) for 1000+ image drops; removed "delete from backup" checkbox from delete dialogs; index.html rebranded to StudioApp.

## SUPER ADMIN v3 + branding (2026-06)
- Extend Trial per tenant: POST /super/tenants/{id}/extend-trial ({days} adds to current end, or {forever:true} => trial_ends_at 9999 + trial_forever flag, shown as 'lifetime'). UI: ExtendTrialDialog (extend-days-btn / extend-forever-btn) on each photographer row.
- Single-tenant email: POST /super/tenants/{id}/email (platform SMTP) via TenantEmailDialog (tenant-email-<id>).
- Email templates CRUD: /super/email-templates (control_db.email_templates) via TemplatesManager in Email tab; template picker fills broadcast + single-send composers.
- Branding: transparent StudioApp logo (/studioapp-logo.png) on AdminLogin + SuperAdmin (login & header). Login footer 'Site Designed & Hosted by StudioApp'. Client share footers now also show '© {year} {business_name}'. Login mobile faded hero background. Tenant admin Help Centre at /admin/help (StudioApp-branded, no Emergent refs).
- Verified iteration_16 (super v2) + iteration_17 (extend/email/templates) — 100% frontend.

## PAYMENTS + TRIAL LIMITS (2026-06, iteration_18)
- **Per-tenant Print/Payment settings** (tenant DB `db.settings` key `print_settings`): shipping_cost, minimum_order, paypal_method (none|paypalme|api), paypalme_handle, paypal_client_id, paypal_secret (masked on GET, preserved on masked re-submit), paypal_mode (live|sandbox). Backend GET/POST `/api/admin/settings/print`. Frontend: new "Delivery & Payments" tab in AdminSettings.js.
- **PayPal for client print orders** (replaces old hardcoded `paypal.me/weddingsbymark`): (a) PayPal.me link per tenant, (b) full PayPal Checkout via each tenant's own REST Client ID+Secret — backend POST `/share/{token}/print-order/{order_id}/paypal/create-order` + `/capture` (httpx, per-tenant creds, auto-marks order paid on COMPLETED). PrintShop.js renders PayPalButtons (api) or Pay-with-PayPal link (paypalme) or "photographer will invoice" (none). Uses @paypal/react-paypal-js. NOTE: full-API capture NOT testable in sandbox (needs live PayPal creds) — verified by render + curl only.
- Per-tenant **delivery cost + minimum order** now drive `create_print_order` totals; backend rejects sub-minimum orders (400). Public `/share/{token}/print-sizes` returns shipping_cost, minimum_order, paypal{method,handle,client_id(api only),mode}.
- **Trial gallery cap = 3**: `_tenant_usage` returns effective limit min(3, plan_limit) for 14-day trialing tenants (is_trial_limited=true). `create_gallery` returns 402 with trial-specific message. Lifetime-trial tenants (trial_forever) keep FULL plan limit (per user: lifetime = plan limit e.g. 10). Frontend: dashboard shows Upgrade popup (upgrade-dialog / upgrade-now-btn → /admin/billing) on 402.
- VERIFIED: backend 7/7 (iteration_18), upgrade popup + Delivery&Payments tab via screenshot. Test tenants created via /api/signup were cleaned up.
