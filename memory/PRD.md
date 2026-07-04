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
- Phase 2: DONE ✅ (2026-06). Super admin (platform owner) seeded from env (SUPER_ADMIN_USERNAME/PASSWORD) into control_db.super_admins. Routes: /api/super/login, /super/tenants (list w/ stats), POST /super/tenants (provision tenant + admin + default template + AUTO DEMO GALLERY), PUT status/plan, DELETE (drops tenant DB + files). Plans: starter 10/£15, pro 30/£35, studio 60/£65. Frontend: /super (SuperAdmin.js login+dashboard), token in localStorage 'super_token'. VERIFIED 20/20 backend + frontend.
- Phase 3: DONE ✅ (2026-06). Per-tenant branding on tenant doc (business_name, logo_url, accent_color, contact_email, tagline). Routes: GET/PUT /api/admin/branding, POST /api/admin/branding/logo (LOCAL disk under UPLOAD_DIR/<tid>/.branding, cleans old logos), GET /api/public/branding-asset/<tid>/<file>. Share meta /api/share/{token} returns 'branding'. Frontend: AdminBranding.js (/admin/branding), dynamic dash-logo + Branding button in AdminDashboard, generic StudioApp login, ShareView/GuestUploadView/Slideshow use tenant brand; footer 'Site Designed & Hosted by StudioApp'. Backend email/QR hardcoded 'Weddings By Mark' replaced with tenant sender_name / StudioApp. VERIFIED, no WBM leak across tenants.
- Phase 1: DONE ✅ (2026-06). Multi-tenancy at the data layer via **database-per-tenant + request-scoped `db` proxy** (contextvar). Control DB `studioapp` holds `admins`, `tenants`, `share_index`, `super_admins`. Each tenant's data lives in `studioapp__t_<id>`. JWT carries `tenant_id`; `get_admin`/`get_share_session` bind it; public `/api/share/*` routes bind via a router-level dep that looks up the token in `share_index`. Storage paths prefixed by tenant. Background jobs tenant-bound.
- Phase 2: Auth. Super admin (Mark) role + tenant admins. Convert single-admin setup into: super admin seeded from env (SUPER_ADMIN_USERNAME/PASSWORD), tenants each with their own admin login. get_admin resolves tenant_id from JWT.
- Phase 3: Tenant branding. Per-tenant display_name/logo/accent/secondary/email/SMTP. Replace all hardcoded WBM. Logo upload to LOCAL disk (no cloud object storage). Footer: "Site Designed & Hosted by StudioApp".
- Phase 4: Super admin dashboard + plans + billing. Plans: Starter 10 galleries £15/mo, Professional 30 £35/mo, Studio 60 £65/mo. Stripe (emergentintegrations, direct to Stripe). Trials + suspend.
- Phase 5: Namespaced share URLs /s/{tenant.subdomain}/{slug} (path style, no wildcard DNS).
- Phase 6: Deploy. Compose builds from github valianktni1/studioapp.ukv1; /dev/dri:/dev/dri passthrough; nginx-video service. See DEPLOYMENT.md.

## Notes
- NO Emergent cloud object storage (breaks self-hosting). Logos + all media = local filesystem.
- Deploy commands: see /app/memory/DEPLOYMENT.md (exact, user-provided).
