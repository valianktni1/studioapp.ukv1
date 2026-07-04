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

## Phase 1 — Tenant Logo Upload (2026-07-03) — DONE
- Tenants upload a logo IMAGE file (not just URL) at signup (optional), onboarding, and Settings > Branding.
- Stored via Emergent object storage (storage_client.py, init at startup). routes/uploads.py: POST /api/admin/logo (auth, multipart, PIL-validated, 5MB, png/jpg/webp/gif/svg) -> db.assets + tenant.logo_url absolute via PUBLIC_BASE_URL. GET /api/public/asset/{id} serves bytes publicly (for emails/galleries).
- Frontend: components/LogoUpload.js reused in AdminSettings (Branding), TenantOnboarding (step 1, prefilled), Signup (deferred upload after register).
- Env added: EMERGENT_LLM_KEY, PUBLIC_BASE_URL (also added to compose.example.yaml — user MUST set these on TrueNAS).
- Verified iteration_5: backend 4/4 + all UI flows pass; validation rejects non-images (400).

## Client Gallery build — remaining phases (confirmed order)
- Phase 2: Client Gallery Landing — DONE 2026-07-03 (iteration_6, frontend 100%). ShareView.js fully rewritten: cinematic hero (admin cover, NO auto-pick per user), auto-parsed couple name, gold diamonds, welcome tagline, floating header (inverted logo, Order Prints, theme toggle, fav counter), 3 instruction cards, album subfolder cards (cover+count+hover zoom), album view (sticky header, info banner, Download All, grid, CSS watermark, favourites view + Submit for Album, lightbox), dark/light persisted in localStorage 'gallery_dark_mode'.
- Phase 3: Browsing — DONE 2026-07-03 (iteration_7). Masonry grid (natural ratios), components/ShareLightbox.js progressive blur->sharp image + smart preload of next 3 + keyboard nav + counter, single-file download with progress overlay (dl state, onDownloadProgress), hover download button, refined watermark.
- Phase 4: Slideshow — DONE 2026-07-03 (iteration_7). components/Slideshow.js: music picker (3 self-generated royalty-free WAV tracks in frontend/public/music via scripts/gen_music.py), 4s intro, Ken Burns (.kb1-4 CSS) dual-layer crossfade, auto-hiding controls (mute/pause/share/close), progress dots/counter, keyboard Space/M/Esc, audio fades.
- Phase 5: Video pipeline — DONE 2026-07-03 (backend logic only; untestable in preview, no ffmpeg/GPU). media.py: video_poster (frame@1s -> thumb/preview), ensure_video_faststart, transcode_web (VAAPI h264_vaapi + CPU libx264 fallback, 1080p 5Mbps +faststart), process_video orchestrator, sign_video_uri (nginx secure_link md5 base64url). galleries.py upload submits process_video to transcode_executor. public_share.py GET /share/{token}/video-url/{file_id} -> signed NGINX url (if NGINX_VIDEO_BASE_URL set + web_ready) else /media/original fallback. Frontend components/VideoPlayer.js (video.js, playbackRates/PiP). Env: NGINX_VIDEO_BASE_URL, VAAPI_DEVICE.
- Phase 6: Print Ordering + PayPal — DONE 2026-07-03 (iteration_8, backend 11/11, frontend 100%). routes/orders.py: super-admin PayPal config (DB, secret masked), tenant print-sizes CRUD + orders list/status, public print-sizes + print-order (server-computed totals; PayPal Orders v2 approve/capture if configured, else awaiting_contact). Frontend: SuperAdmin Payments modal, Settings 'Prints & Orders' tab, components/PrintOrderModal.js, PayPal return capture in ShareView. NOTE: live PayPal untested (user adds keys in super-admin).
- Phase 7: QR-code PDFs — DONE 2026-07-03 (iteration_9). qr_pdf.py (Minimal/Classic/Botanical A6 PDFs via PIL+qrcode). shares.py GET /shares/{sid}/qr-pdf?design=. Frontend: QR menu per share in AdminGalleryDetail (blob download).
- Phase 8: Email templates + expiry reminders — DONE 2026-07-03 (iteration_9). email.py: email-templates CRUD, /galleries/{gid}/send-template ({couple_name}/{gallery_link}/{password} tokens), run_expiry_reminders() (7-day pre-expiry, once per link, main links only) scheduled hourly in server.py startup. Frontend: Settings templates-card, Notify modal template dropdown.

## ALL 8 CLIENT-GALLERY PHASES COMPLETE. Deployment env vars required on TrueNAS: EMERGENT_LLM_KEY, PUBLIC_BASE_URL, NGINX_VIDEO_BASE_URL, VAAPI_DEVICE, NGINX_VIDEO_SECRET (all in compose.example.yaml). Video transcoding + live PayPal only work on the user's hardware.
- Phase 3: Browsing (masonry grid, CSS watermark, progressive lightbox + smart preload, single & ZIP download progress, sticky header).
- Phase 4: Cinematic slideshow (Ken Burns, dual-layer crossfade, music picker — agent to source 3 royalty-free tracks, intro sequence, auto-hide controls).
- Phase 5: Video pipeline (VAAPI/FFmpeg transcode + faststart, NGINX secure_link, video.js) — backend only, untestable in preview.
- Phase 6: Print ordering + PayPal (user will add PayPal creds in super admin panel).
- Phase 7: QR-code PDFs (Minimal/Classic/Botanical).
- Phase 8: Email — expiry reminders (background job) + reusable templates with {couple_name}/{gallery_link} tokens.

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

## Fork continuation (2026-06 — video pipeline alignment)
- P0 FIXED & TESTED (iteration_13, backend 8/8 + frontend 100%): Aligned video pipeline to reference repo `180226galleryrepo`.
  - `media.py video_poster()`: was using ffmpeg INPUT seeking (`-ss 1 -i`) with no fallback → thumbnails silently failed. Now uses OUTPUT seeking (`-i <src> -ss 00:00:01 -vframes 1 -q:v 2`) with fallback to frame 0. Verified: has_thumb=True in ~1s, /api/media/thumb serves valid JPEG.
  - `media.py transcode_web()`: now writes to `{stem}.web.tmp.mp4` then renames to `{stem}.web.mp4` on success (no partial files served). GPU VAAPI first → CPU fallback. .web.mp4 produced, no leftover tmp.
  - `compose.example.yaml`: added `group_add: ["44","993"]` on backend service so container has render/video group perms → the real cause of GPU→CPU fallback on TrueNAS (device was passed but group perms missing). USER MUST VERIFY GPU on Minisforum 780M (no GPU in preview pod).
- P1 DONE & TESTED: Added reference-parity "Thank You" modal to ShareView after favourites submit (data-testid thank-you-modal / thank-you-close), tenant-branded.

## Remaining backlog (post-fork)
- P1: Chunked large-file uploads for 40GB+ videos. NOTE: galleries.upload_files currently does `await uf.read()` (full bytes in memory) → OOM risk on big/concurrent uploads; switch to streaming `shutil.copyfileobj(uf.file, ...)`.
- P1: PayPal webhook for bulletproof payment capture (currently manual redirect capture).
- P1: Share album select-mode + bulk delete (reference has it via guestDeleteFiles; needs a new backend delete endpoint in public_share.py). Deferred — not yet ported.
- P2: "Download favourites only" ZIP button. Clean up demo tenants. 2FA (pyotp). Live visitor tracking + activity archiving.

## Share select + bulk-delete ported from reference (2026-06)
- Terminology: "client" of the SaaS = the PHOTOGRAPHER (tenant). The photographer's clients (couples/guests) use the share galleries.
- Backend: POST /api/share/{token}/delete (public_share.py) — gated on access_level == "full" (returns allow_delete in share meta + files payload). Deletes original + thumb + preview + db record + favourites, decrements tenant storage_used_bytes. TESTED: 403 on download-level share; full E2E delete on full-access share works.
- Frontend (ShareView.js): album view Select toggle (shown only when access_level=full), per-tile checkboxes + gold selection ring, header Cancel + "Delete (N)", confirmation modal. TESTED via screenshot, no JS errors.
- GPU compose simplified to `devices: /dev/dri:/dev/dri` (no group_add/GID needed) — ffmpeg auto-uses 780M VAAPI or falls back to CPU, matching reference behaviour. No user host commands required.

## Dedicated "Allow clients to delete files" toggle (2026-06)
- ShareCreate.allow_delete (models.py) stored on share (shares.py). Delete gating = allow_delete OR access_level=="full" (backward-compat). Payloads surface computed allow_delete.
- Admin UI: checkbox "Allow clients to delete files" in create-share form (AdminGalleryDetail.js, data-testid sh-allow-delete).
- TESTED: download-level share + toggle → delete works; download-level without toggle → 403.

## Path-style namespaced share URLs (2026-06)
- New public URL format: /s/{tenant.subdomain}/{slug} e.g. /s/weddingsbymark/couples-name. Chosen over subdomain style (weddingsbymark.domain.uk) to avoid wildcard DNS/SSL.
- Frontend: App.js adds route /s/:tenant/:slug (kept /s/:token for backward compat). ShareView reads token = params.slug || params.token, so all /api/share/{id}/... calls are unchanged. PayPal replaceState uses window.location.pathname.
- Admin: AdminGalleryDetail uses useAuth().tenant.subdomain via shareUrl(s) helper for copyLink, notify default + select options (email templates get the namespaced URL).
- NOTE: slugs remain GLOBALLY unique (auto -N suffix); the tenant segment is branding/readability — the slug alone still resolves the share. TESTED: namespaced URL renders + old URL still works.
