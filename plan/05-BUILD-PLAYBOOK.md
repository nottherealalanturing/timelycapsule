# TimelyCapsule — Build Playbook (execute in order)

> Note: zero-access E2E encryption, the Seals system, expiry, and the time-travel voice ([06-FEATURE-ADDENDUM.md](06-FEATURE-ADDENDUM.md)) are **already integrated** into the tickets below — no separate patching needed.

**How to use:** Work through tickets T-01 → T-42 in order with Sonnet. Each ticket says what to build (endpoints from 03-ARCHITECTURE §14, screens from 02-UX-DESIGN §5), where it lives, and its Definition of Done (DoD). Blocks marked **🧑 HUMAN SETUP** are things Sonnet cannot do — accounts, keys, DNS — do them before starting that ticket. Zero-cost stack per 04-ZERO-COST-PLAN applies throughout.

Prompt pattern for Sonnet per ticket:
> "Read plan/00-INDEX.md, plan/03-ARCHITECTURE.md, plan/04-ZERO-COST-PLAN.md (and plan/02-UX-DESIGN.md for UI tickets). Implement ticket T-XX from plan/05-BUILD-PLAYBOOK.md exactly. Don't build ahead of the ticket."

---

## STAGE A — Foundations (T-01 → T-06)

### 🧑 HUMAN SETUP — before T-01
- [ ] Create GitHub repo(s) (recommended: one monorepo `timelycapsule` — simpler; keep your three folders as `apps/api`, `apps/web`, `apps/mobile` inside it. If you keep 3 repos, contracts get painful).
- [ ] Install locally: Node 20+, pnpm, Docker Desktop, Xcode + Android Studio (for mobile later).
- [ ] Buy domain (Cloudflare Registrar, ~$10): `timelycapsule.com` or your pick. Create free Cloudflare account, add domain.

### T-01 Monorepo scaffold
Turborepo + pnpm workspaces: `apps/api` (Express 5 + TS), `apps/web` (Next.js 15 App Router + Tailwind + Radix), `apps/mobile` (Expo, custom dev client), `packages/contracts` (Zod schemas + inferred types), `packages/core` (tz/countdown utils), `packages/ui-web`. ESLint/Prettier/tsconfig shared. GitHub Actions CI: typecheck + lint + test on PR.
**DoD:** `pnpm dev` runs api (:4000) + web (:3000); CI green.

### T-02 Database & ORM
Docker Compose for local Postgres 16. Drizzle setup + migrations for **core Stage A–C tables only** (users, oauth_accounts, sessions, recovery_codes, push_tokens, capsules, capsule_recipients, media_items, scheduled_actions, notifications, notification_prefs, outbound_messages, audit_events, tags, capsule_tags, favorites, contacts, entitlements, reactions) per 03 §13. Seed script (dev users + sample capsules). `audit()` helper writing audit_events.
**DoD:** `pnpm db:migrate && pnpm db:seed` works; schema matches spec.

### T-03 API skeleton & conventions
Express app: Zod request validation middleware, error envelope (`{error:{code,message,requestId}}`), pino logging, helmet/CORS, cursor pagination helper, `Idempotency-Key` middleware (table-backed), per-IP rate limiter (in-memory), `/health`, `/v1/system/time`. Module folder structure with public `index.ts` boundaries + lint rule.
**DoD:** conventions doc in repo; sample route tested with Supertest.

### T-04 Auth module (backend)
Endpoints: `POST /auth/signup, /auth/login, /auth/refresh, /auth/logout, /auth/verify-email, /auth/verify-email/resend, /auth/password/forgot, /auth/password/reset`, `GET/DELETE /auth/sessions[/:id]`, `GET/PATCH /me`. Argon2id, JWT RS256 15-min access + rotating refresh (hashed, reuse-detection revokes family), email OTP codes (log to console until T-07), login rate limits, new-device detection stub. 2FA (`/auth/totp/*`) **deferred to T-33**.
**DoD:** full auth lifecycle passes integration tests incl. refresh-reuse attack test.

### 🧑 HUMAN SETUP — before T-05
- [ ] Google Cloud console: create OAuth client (Web + iOS + Android IDs). Free.
- [ ] (Defer Apple Sign-In until T-28 mobile; needs Apple Developer $99 — skip for now, web launches with email+Google.)

### T-05 Google OAuth + account linking
`POST /auth/oauth/google {idToken}` — verify, auto-link on verified-email match, create user else. Ghost-claim logic: on any signup/OAuth with verified email matching `capsule_recipients.email`, attach those recipient rows to the user.
**DoD:** OAuth flow works locally; ghost-claim covered by test.

### T-06 Web app shell + auth screens
Next.js: route groups `(marketing)`, `(app)`, `(reveal)`. Meridian tokens as Tailwind theme (02 §6: colors, Fraunces+Inter, radii, dark mode via class + system). Base components: Button, Input, Dialog, Toast, Skeleton, StateChip, EmptyState. Screens: `/signup`, `/login`, `/reset`, `/verify` per 02 §5.2 (OTP boxes, strength meter, generic errors). React Query + API client generated from contracts. Auth context, protected layout, session persistence.
**DoD:** signup → verify → login → empty `/home` works in browser, light+dark.

---

## STAGE B — Capsule core (T-07 → T-13)

### 🧑 HUMAN SETUP — before T-07
- [ ] Resend account (free): add + verify your domain (Sonnet gives you the exact SPF/DKIM/DMARC DNS records to paste into Cloudflare). Create API key → `.env RESEND_API_KEY`.
- [ ] Cloudflare R2: create buckets `tc-media` (private) and `tc-backups` (private). Create R2 API token → `.env R2_*`. Add custom domain `usercontent.<domain>` to media bucket later (T-12 tells you).

### T-07 Email infrastructure
`outbound_messages` ledger + provider adapter interface + Resend adapter + dev console adapter. MJML (or react-email) base template with brand styling; templates: verify-email, password-reset, new-device. Wire auth flows to real email. Webhook `POST /webhooks/resend` for bounces → update ledger.
**DoD:** real verification email lands in your inbox with passing DKIM.

### T-07b Crypto package ⚠️ build before any capsule content code
`packages/crypto` (shared web + RN via WebCrypto / react-native-quick-crypto): capsule key generation, AES-GCM streaming file encrypt/decrypt (chunked for large video), key wrapping (owner master key under Argon2id(password), recipient link-fragment wraps, passphrase wraps), master-key lifecycle (signup generation, password-change re-wrap, recovery-kit generate/restore), published **test vectors** consumed by both platforms' test suites. Threat notes + audit-readiness doc.
**DoD:** cross-platform round-trip tests green (encrypt on web-sim, decrypt on RN-sim and vice versa); recovery-kit restore test; 1 GB streaming file encrypts within memory budget.

### T-08 Capsule CRUD + state machine (backend)
Endpoints: `POST /capsules`, `GET /capsules` (filters state/type/tag/q/cursor), `GET/PATCH /capsules/:id` (draft-only PATCH, 409 `capsule_sealed`), `POST /capsules/:id/seal` (validations: unlock ≥now+5min ≤+50yr, media ready, plan limits), `/duplicate`, `/archive`, `/unarchive`, `/trash`, `/restore`, `/withdraw`, `/extend` (once ≤30d), `GET /capsules/:id/activity`. State machine per 03 §8 with all invariants server-enforced + tests for each invariant — including new `expired` state (`capsule_expire`/`expire_purge` actions, strict vs default expiry, ephemeral mode, forbidden-on-legacy), `public_id` generation (8-char unambiguous alphabet), and `seals jsonb` validation (Time always; Place/Passphrase/Identity configs; max 3 beyond Time). Server never sees passphrases or keys — only hints and wrapped blobs. Capsule versions (draft snapshots, keep 20). Plan-limit service reading `entitlements` (free defaults).
**DoD:** invariant test suite green (seal immutability, trash rules, extend-once, withdraw semantics).

### T-09 Recipients (backend)
`POST/PATCH/DELETE /capsules/:id/recipients[...]`, dedup, limits by plan, access token generation (26-char base32, stored hashed), fallback recipient field, blocks table + suppression logic (masked success), `resend-invite` stub.
**DoD:** recipient lifecycle tests green incl. block suppression.

### T-10 Media upload pipeline
`POST /capsules/:id/media/tickets` (plan/quota/MIME checks → R2 multipart presigned part URLs), `POST /media/:id/complete`, `DELETE /media/:id`, `PATCH /media/:id`, `GET /media/:id/view` (signed GET URL, 15-min). **All content encrypted client-side via `packages/crypto` before upload (06 §A):** clients generate thumbs (320/1080), blurhash, posters, waveforms, and strip EXIF locally pre-encryption, uploading them as encrypted sidecars; server worker (pg-boss) only verifies object existence/size, records `enc_meta`, and enforces quotas — it can no longer sniff or process content (compensating controls per 04: size caps at presign, attachment disposition, isolated media origin). `size_bytes` accounting on user + capsule. Serve rule: everything `Content-Disposition: attachment` except images/posters, from media domain.
**DoD:** upload image+video+pdf from a test script → items reach `ready`; quota enforcement test; seal blocks on non-ready media.

### T-11 Composer (web)
`/capsule/new` + `/capsule/:id/edit` full-screen per 02 §5.5: cover picker (gradient presets + image), title, type chips (Self/Someone else), TipTap rich text (minimal marks, slash menu, markdown shortcuts), prompts drawer (static prompt packs), MediaUploader (drag-drop, progress, reorder, captions, resumable multipart), voice recorder (MediaRecorder, waveform), recipients block (chips, options: shared list, allow download, announce toggle), Schedule block — build **DateTimeSchedulePicker** as specified (calendar + year jump + time + tz selector + natural-language parse + summary sentence), occasion shortcuts, **Seals & Expiry accordion** per 02 §5.5 (Place Seal map picker + radius, Passphrase Seal + hint, Identity toggle, expiry selector incl. ephemeral confirm; wax-stamp preview), break-glass for self, autosave (3s idle, status text; drafts encrypted with a draft key before server sync), footer completeness hints, seal confirmation sheet, **seal ceremony animation** (Framer Motion; reduced-motion variant).
**DoD:** full F1 flow in browser < 4 min; refresh mid-edit loses nothing.

### T-12 Home / Timeline (web)
`/home` per 02 §5.4: greeting, "Waiting for you", "Opening soon", timeline grouped by time buckets, grid toggle, filter bar, CapsuleCard + CountdownDisplay (adaptive granularity, `/system/time` offset sync), empty states, skeletons. Capsule detail owner view `/capsule/:id` per 02 §5.6 (overview, recipients status table, activity, actions bar incl. withdraw/extend dialogs; contents visibility rules).
**🧑 HUMAN SETUP:** point `usercontent.<domain>` at R2 bucket (Cloudflare dashboard, Sonnet gives steps).
**DoD:** sealed capsules from T-11 render with live countdowns; all states visually distinct.

### T-13 Scheduler engine ⚠️ build test-first
`scheduled_actions` promoter (30s tick, `FOR UPDATE SKIP LOCKED`, 5-min lookahead → pg-boss), sweeper (re-arm + missed-schedule alarm log), handlers: `capsule_unlock` (sealed→unlocked, spawn recipient_unlock), `recipient_unlock`, `announce`, `trash_purge`, `breakglass_open`, `reminder`. Wall-clock storage + nightly re-resolver (60-day horizon). Daily reconciliation job ("no capsule left behind": every sealed capsule has a pending unlock action; discrepancy → alert log + heal). **Simulation test suite with virtual clock:** DST spring/fall, ambiguous/nonexistent times, Feb 29, 50-year horizon, queue-loss recovery, 10k-unlock burst.
**DoD:** simulation suite green in CI; a capsule sealed for now+2min unlocks and flips state end-to-end locally.

---

## STAGE C — Delivery loop (T-14 → T-18) — the product-proving stage

### T-14 Notifications (backend + email templates)
`notifications` writes + prefs (`PUT /me/notification-prefs`, quiet hours), `GET /notifications`, `POST /notifications/read`. Email templates: something-is-waiting (announce), unlock ("Your capsule is open"), pre-unlock reminders (T-7d/T-1d sender+opted recipients), opened-notice to sender, reaction-received, bounce-alert escalation. All through outbound ledger with retry (pg-boss backoff).
**DoD:** sealing an announced capsule emails the recipient; unlock emails fire from T-13 handler.

### T-15 Recipient reveal experience (web, no account)
`(reveal)` routes SSR: `GET /r/:token` backing endpoints per 03 §14. Locked page per 02 §5.7 (cover, sender, Capsule ID, Seal stamps row, countdown in viewer tz, notify-me email capture, ICS download, surprise-mode 404 rule, live T-0 flip into reveal), Seal gates (Place gate with distance/bearing + `POST /r/:token/place-check`, Passphrase gate with client-side unwrap + soft throttle, Identity OTP gate), client-side decryption of content via link-fragment key, **System Pages** per 02 §5.15 with voice.md copy (loading, 404/missing, withdrawn variant, expired page + `capsule_expire` reminder emails, rotated-link, rate-limited), unlocked **reveal ceremony** per 02 §5.7 (paced scroll reveal, Fraunces reading column, media gallery with MediaViewer, sign-off), reactions + thank-you note (`POST /r/:token/react`), download-all (zip job → email link), report (`POST /r/:token/report`), save-to-account CTA (`POST /r/:token/save` for logged-in claim), OG image generation (cover + countdown via @vercel/og — never content), tz-inference write for recipient_local mode.
**DoD:** full F2 on a phone browser with no account, fast on 3G throttle; OG preview correct in link-preview checker.

### T-15b Guest mode (web) — per 01 §4.1b / 02 §5.2a / 03 §14 GUEST
Backend: `guest_sessions` table + `capsules.guest_session_id` (+ `owner_id` made nullable) migration; `POST /guest/sessions`; guest-scoped capsule create/patch/seal (text-only micro type, ≤5,000 chars, unlock ≤ +1yr, 1 draft + 1 sealed per session, aggressive per-IP velocity limits); claim: `/auth/signup` + `/auth/oauth/google` accept optional `guestToken` → transfer capsules to the new user, burn the session (mirrors ghost-claim). E2E note: guest capsules have **no** `owner_key_wrap` (no master key exists) — the link fragment is the only key; on claim, the client re-wraps the capsule key under the new account's master key if the link is still on-device, else the capsule stays link-only (envelope shows a "link-only key" badge). Web: `/try` slimmed composer (locked rows for media/recipients/seals with signup affordances), link handoff sheet with the no-recovery warning, `/try/capsule` status page, contextual signup CTAs (post-seal, status page, second-capsule attempt). Sealed guest capsules deliver via the standard T-13/T-15 pipeline regardless of conversion (hard rule 5).
**DoD:** full F11 in browser: guest seals a note → copies link → recipient reveal works account-free → guest signs up → capsule appears on `/home` claimed; velocity limits + 1-capsule cap tested; unconverted guest capsule still unlocks on schedule (test).

### T-16 Received inbox + contacts (web)
`/received` per 02 §5.8 (waiting/upcoming/opened, block+report row actions), `/people` per 02 §5.9 (contacts CRUD `GET/POST/PATCH/DELETE /contacts`, groups, birthday-upcoming section, composer autocomplete integration).
**DoD:** claimed recipient sees capsule in inbox; contact birthdays suggest capsules.

### T-17 Organization & search (web + backend)
Tags CRUD + `PUT /capsules/:id/tags`, favorites, archive view, trash view (restore/purge countdown), collections (`/collections` grid + detail, add/remove/reorder), search: server PG FTS over titles/tags/recipients ONLY (E2E — content never reaches server plaintext), plus a **client-side content index** (IndexedDB/SQLite) built from locally decrypted *opened* capsules, merged in the UI; `GET /search`, web ⌘K palette + full search page per 02 §5.11.
**DoD:** server index provably contains no content (test asserts FTS columns exclude content); client index finds text inside an opened capsule; ⌘K navigates.

### T-18 Settings v1
`/settings/*` two-pane: Account (email change w/ re-verify, password, sessions list/revoke), Profile (avatar upload, tz auto-detect + edit, locale), Notifications (category × channel matrix, quiet hours), Storage (meter, largest capsules), Privacy (blocklist mgmt), Appearance (theme), Data (export `POST /me/export` async zip job → email link; delete account F8 flow with per-capsule deliver/withdraw decisions + 30-day pending). Danger zone styling.
**DoD:** export zip contains all content + metadata JSON; deletion flow honors capsule decisions.

---

## STAGE D — Deploy & beta on web (T-19 → T-22)

### 🧑 HUMAN SETUP — before T-19
- [ ] Oracle Cloud account → provision Always Free ARM VM (Ubuntu 22.04, 4 OCPU/24GB) — or Hetzner CX22 (~$5) if you can. Note public IP.
- [ ] Cloudflare DNS: `api.<domain>` → VM IP (proxied), `usercontent.<domain>` → R2.
- [ ] Backblaze B2 free account → bucket `tc-db-backups`, app key.
- [ ] healthchecks.io free account → create check "scheduler-heartbeat", copy ping URL.
- [ ] UptimeRobot free → monitor `https://api.<domain>/health` + web root.
- [ ] Sentry free account → 3 projects (api, web, mobile), copy DSNs.
- [ ] PostHog Cloud free → project key.

### T-19 Production deploy
Dockerfiles (api, worker, scheduler — one image, 3 commands), docker-compose.prod (Caddy TLS, Postgres with named volume, the 3 services), GitHub Actions deploy workflow (build → push GHCR → SSH pull/up), `.env.production` template documenting every var, nightly pg_dump → B2 script (cron container) + monthly restore-drill doc, scheduler pings healthchecks.io each tick. Firewall (ufw: 80/443/22 only), fail2ban.
**DoD:** api live on `https://api.<domain>`; kill scheduler container → healthchecks emails you within 10 min; restore drill from a real dump succeeds.

### T-20 Web deploy
**🧑 HUMAN SETUP:** Cloudflare Pages project linked to repo (Sonnet configures next-on-pages), env vars in dashboard.
Sentry + PostHog wired (content-blind event names per 03 §19 activation funnel), cookie-less analytics config, robots/sitemap.
**DoD:** `https://<domain>` serves production web; F1+F2 work end-to-end in prod; events visible in PostHog.

### T-21 Marketing site
`(marketing)`: hero CTA routes into T-15b guest mode — landing per 02 §5.1 (hero with interactive demo capsule, how-it-works, use-cases, trust section, FAQ, footer), `/pricing` (plan cards, annual toggle — "Premium coming soon" until T-26), 3 occasion pages (`/for/letters-to-my-future-self`, `/for/new-parents`, `/for/couples`) with template deep-links, `/legal/terms`, `/legal/privacy` (**🧑 HUMAN: generate from a template service e.g. Termly free, review, paste**), help section (10 markdown articles: what is sealing, can I open early, recipient guide, etc.).
**DoD:** Lighthouse ≥95 perf/SEO/a11y on landing; OG cards correct.

### T-22 Hardening pass
Rate limits on all mutation routes, security headers/CSP audit (separate media origin verified), auth flow abuse tests, velocity limit (new accounts: 5 outbound recipients/day), a11y audit pass on core flows (keyboard-only F1/F2, screen-reader labels, reduced motion), k6 load test: 10k unlocks in 1 min on prod-like local (assert drain <10 min).
**DoD:** checklist in repo with results; issues fixed. **→ Open a private web beta to friends here.**

---

## STAGE E — Mobile app (T-23 → T-29)

### 🧑 HUMAN SETUP — before T-23
- [ ] Expo account (free). Google Play Console ($25 one-time). Apple Developer ($99/yr — required for TestFlight/App Store; can delay iOS and ship Android first if cash-tight).
- [ ] Firebase project (free) for FCM; upload google-services files per Sonnet's instructions.

### T-23 Mobile shell
Expo custom dev client, navigation (tabs: Home/Received/FAB/Notifications/Profile per 02 §15), Meridian native theme, auth screens + secure token storage (expo-secure-store), deep link config (`/c/*` universal links — **🧑 HUMAN:** apple-app-site-association + assetlinks.json hosting steps), API client from contracts.
**DoD:** login + home timeline render on your physical phone via dev client.
Also: onboarding offers **"Continue without an account"** → mobile guest mode (same T-15b endpoints + rules; slimmed composer + status screen per 02 §5.2a); claim-on-signup passes the stored `guestToken`.

### T-24 Mobile timeline, detail, received, reveal
Ports of T-12/T-15/T-16 with native patterns: FlashList, pull-to-refresh, blurhash placeholders, long-press context menus, swipe actions, in-app reveal ceremony with haptics (seal thud/unlock crack), gallery with pinch-zoom.
**DoD:** open a received capsule end-to-end on device, 60fps scroll on mid-tier Android.

### T-25 Mobile composer + offline
Composer parity per 02 §5.5 with source sheet (camera/library/voice/video/files), client-side compression (720p/1080p re-encode on device, poster frame extraction), resumable background uploads (expo-task-manager; wifi-only toggle >50MB), offline drafts (SQLite, `pending_sync` seal per 02 §15 incl. passed-unlock-time prompt), draft conflict rule (server draft wins, local preserved as copy).
**DoD:** airplane-mode compose+seal → reconnect → capsule seals server-side; kill app mid-upload → resumes.

### T-26 Push notifications
Expo push service: token registration (`PUT /push-tokens`), backend push adapter alongside email, categories with actions ("Open capsule", "Remind me tonight"), quiet-hours respect, badge counts, notification center screen, token pruning on invalid.
**DoD:** sealing→unlock pushes arrive on both OSes; deep-link opens reveal.

### T-27 Apple Sign-In + biometric lock
`POST /auth/oauth/apple` (required by App Store when offering Google login), optional app lock (Face ID/Touch ID + PIN fallback, background timeout).
**DoD:** Apple auth round-trips; lock engages after backgrounding.

### T-28 Store readiness & release
App icons/splash, onboarding (3 steps per 02 §5.3), store listings (screenshots via device frames, descriptions), privacy manifests/labels (**🧑 HUMAN:** fill App Store privacy questionnaire + Play data-safety with Sonnet-drafted answers), EAS build profiles, TestFlight + Play internal track upload (**🧑 HUMAN:** create app records in both consoles, submit builds Sonnet produces).
**DoD:** installable beta on both stores' test tracks.

### T-29 Share extension + widget (fast wins)
Share-to-draft extension (photos/text → draft picker sheet), home-screen widget (next unlock countdown; iOS WidgetKit + Android Glance via config-plugin/native module).
**DoD:** share a photo from Photos into a draft; widget updates daily + on unlock.

---

## STAGE F — Monetization & launch (T-30 → T-36)

### 🧑 HUMAN SETUP — before T-30
- [ ] Stripe account (activate with business/individual details, connect bank). Create Products: Premium monthly $7.99 / annual $59.99; Gift Pass $4.99 one-time. Copy price IDs + webhook secret.

### T-30 Billing (web-first per 04)
Entitlement service (single source, plan limits map), `GET /billing/plans|/entitlements`, `POST /billing/checkout` (Stripe Checkout hosted), `POST /billing/portal`, `POST /webhooks/stripe` (checkout.completed, sub updated/deleted, invoice.payment_failed → grace flow F7: 7-day grace, dunning emails, downgrade job — sealed capsules untouched, test this), Gift Pass purchase + redemption (`purchases` consuming on capsule seal). Mobile: "Manage subscription on web" screen (no IAP yet, per 04 policy note).
**DoD:** live-mode test purchase upgrades limits instantly; webhook replay-safe (idempotent); grace flow simulated via Stripe test clocks.

### T-31 Contextual paywalls + plan enforcement sweep
Paywall bottom-sheet component naming the exact limit (02 §5.14), triggers audited at every limit (capsule count, storage, video length, recipient count), composer state preserved through upgrade, pricing page live toggle.
**DoD:** each limit hit shows correct paywall; upgrade mid-compose loses nothing.

### T-32 Referrals + achievements v1
`GET /referrals/me`, `POST /referrals/redeem`, reward on referee first-seal (+1GB both, cap 10, fraud checks: disposable-email blocklist, IP/device heuristic), achievements engine (keys from 01 §4.19) + earned toasts + profile shelf.
**DoD:** two test accounts complete referral loop; reward appears in storage meter.

### T-33 Security completeness
TOTP 2FA + recovery codes (+ settings UI, mobile support), new-device login emails, session anomaly basics, link rotation endpoint + UI, admin-facing report queue backend (`reports` triage endpoints).
**DoD:** 2FA end-to-end incl. recovery-code login; rotation invalidates old link (test).

### T-34 Admin panel v1
Protected route group `/admin` (admin_users, TOTP-required): dashboard tiles (signups, seals/day, unlocks next 24h, delivery success, failed actions, open reports), user lookup + actions (verify, suspend, comp premium, trigger export/deletion), capsule metadata inspector (**content structurally unviewable — E2E; metadata-only per 03 §18**), reports queue UI (dismiss/warn/withdraw/suspend, recipient-evidence attachments), delivery ops (failed scheduled_actions retry/force), feature flags table + `GET /flags`.
**DoD:** you can resolve a report and retry a failed action from the UI.

### T-35 Notification digests + lifecycle emails
Monthly digest job ("2 capsules unlock next month"), seal-anniversary memory notices, lifecycle: D0 welcome/first-seal nudge, D3 prompts, pre-unlock hype, post-open reply nudge, 60d win-back — all respecting marketing opt-in + unsubscribe links (**one-click unsubscribe headers**).
**DoD:** digest renders correctly for seeded account; unsubscribe honored.

### T-36 Launch checklist
Final a11y + i18n string extraction pass (en shipped, structure ready), error-state sweep (kill API → web/mobile degrade gracefully), status page, App Store/Play production submission (**🧑 HUMAN:** submit + respond to review), Product Hunt/launch assets, PostHog dashboards for activation funnel + delivery SLOs, on-call doc (what to do when healthchecks fires).
**DoD:** production launch. 🚀

---

## STAGE G — Phase 2 (post-launch, re-plan then build)
T-37 Legacy & trustees (F5/F6 + tables already schema'd; recipient-wrapped keys per 06 §A) · T-38 Group/co-authored capsules (F9, shared capsule-key wraps per collaborator) · T-39 Recurring series · T-40 Seals expansion: dead-drop capsules (QR + no named recipient), quest chains, world capsule (per-viewer local-midnight Time Seal) · T-41 Public countdown pages + Year in Capsules · T-42 Family plan. Each has full spec in 01/02/03; write a short ticket breakdown like the above when you get there.

---

## Environment variable master list (fill as setups complete)
`DATABASE_URL, JWT_PRIVATE_KEY/PUBLIC_KEY, RESEND_API_KEY, EMAIL_FROM, R2_ACCOUNT_ID/ACCESS_KEY/SECRET/BUCKET, MEDIA_CDN_BASE, B2_KEY_ID/APP_KEY/BUCKET, GOOGLE_OAUTH_CLIENT_ID/SECRET, APPLE_* (T-27), STRIPE_SECRET/WEBHOOK_SECRET/PRICE_IDS, EXPO_ACCESS_TOKEN, FCM_SERVICE_ACCOUNT, SENTRY_DSN_*, POSTHOG_KEY, HEALTHCHECKS_PING_URL, APP_CONTENT_KEY (column encryption), ADMIN_ALLOWED_EMAILS`
