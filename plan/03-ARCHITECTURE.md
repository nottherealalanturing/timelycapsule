# TimelyCapsule — Technical Design & System Architecture

> Part 3 of 4. Covers §8 capsule system, §9 media, §10 scheduling, §11 notifications, §12 backend, §13 database, §14 API, §17 security, §18 admin, §19 analytics, §24 tech recommendations, §25 edge cases.

---

## 12. Backend Architecture — Overview

### Decision: Modular monolith (Express + TypeScript), not microservices
One deployable API service with strict internal module boundaries (`modules/auth`, `modules/capsules`, `modules/media`, `modules/scheduling`, `modules/notifications`, `modules/billing`, `modules/orgs`, `modules/admin`), plus **separate worker processes** consuming queues, sharing the same codebase/DB layer. Why:
- Team of 1 AI + 1 human: microservices' operational tax (service discovery, distributed tracing, N deploys) buys nothing at this scale.
- The workloads that genuinely need isolation — media transcoding, scheduled delivery, notification fan-out — are isolated as **workers on queues**, which captures 90% of the benefit.
- Module boundaries enforced by lint rules (no cross-module imports except via each module's `index.ts` public interface) keep a future extraction cheap.

### Topology
```
Clients (Next.js SSR/CSR, RN apps)
   │ HTTPS
Cloudflare (CDN, WAF, rate-limit edge)
   │
API service (Express, N instances, stateless)  ──── Redis (cache, rate limits, sessions aux, BullMQ)
   │                                                 │
PostgreSQL (primary + read replica)              Workers (media, delivery, notifications, digests, cleanup)
   │                                                 │
S3-compatible object storage (media)  ← presigned  ──┘
   + CloudFront/CF CDN for delivery (signed URLs)
External: Stripe, Apple/Google IAP, Postmark (email), Twilio (SMS), FCM/APNs, Sentry, PostHog
```

### Stack choices (with reasons)
| Concern | Choice | Why |
|---|---|---|
| API | **Express 5 + TypeScript + Zod** | User-mandated; Zod schemas double as validation + OpenAPI generation + shared types with clients via `@tc/contracts` package |
| ORM | **Drizzle** | SQL-transparent, great TS types, easy raw SQL for the scheduler's hot queries (Prisma's query engine indirection hurts there) |
| DB | **PostgreSQL 16** (managed: Neon/RDS) | Relational fits the domain; FTS, JSONB, partitioning for events; boring and durable — a 30-year product needs a 30-year database |
| Queue | **BullMQ on Redis** | Delayed jobs native, but we do NOT rely on year-long delayed jobs (see §10); BullMQ handles near-term execution; Postgres is the source of truth for schedules |
| Storage | **S3 + CloudFront** (or Cloudflare R2 — zero egress — recommended) | Presigned multipart uploads direct from clients; API never proxies bytes |
| Email | Postmark (transactional) + Resend/broadcast for lifecycle | Deliverability is existential for unlock emails |
| Push | APNs + FCM directly (via `apn`/`firebase-admin`) | No 3rd-party lock-in on the most critical channel |
| Monorepo | Turborepo + pnpm: `apps/api`, `apps/web`, `apps/mobile`, `apps/admin`, `packages/contracts`, `packages/ui-web`, `packages/core` (shared domain logic: countdown math, tz utils) | One PR can change API + clients + types atomically |
| Auth tokens | JWT access (15 min, RS256) + rotating refresh tokens (hashed in DB, 30d, per-device) | Stateless API scale + revocability |
| Observability | Sentry (errors), OpenTelemetry → Grafana Cloud (traces/metrics), pino structured logs | |
| CI/CD | GitHub Actions → Docker → Fly.io or Railway initially (API+workers), Vercel (web), EAS (mobile) | Fast to ship; containers keep an AWS migration trivial |

---

## 13. Database Design (PostgreSQL)

Conventions: `id uuid pk default gen_random_uuid()`, `created_at/updated_at timestamptz not null default now()`, soft-delete via state fields not `deleted_at` flags (except noted), all FKs indexed, all enums as PG enums.

```sql
-- ============ IDENTITY ============
users (
  id uuid PK,
  email citext UNIQUE NOT NULL,
  email_verified_at timestamptz,
  password_hash text,                    -- null for oauth-only
  display_name text NOT NULL,
  handle citext UNIQUE,                  -- nullable until public features used
  avatar_key text,
  birthday date,
  timezone text NOT NULL DEFAULT 'UTC',  -- IANA
  locale text NOT NULL DEFAULT 'en',
  status user_status NOT NULL DEFAULT 'unverified',
    -- enum: unverified|active|suspended|pending_deletion|deleted|ghost
  ghost_claimed_at timestamptz,
  totp_secret_enc text, totp_enabled bool DEFAULT false,
  quiet_hours jsonb,                     -- {start:"22:00",end:"08:00"}
  marketing_opt_in bool DEFAULT false,
  deletion_requested_at timestamptz,
  last_active_at timestamptz             -- for legacy inactivity checks
)
oauth_accounts (id, user_id FK, provider enum(apple|google), provider_user_id, UNIQUE(provider, provider_user_id))
sessions (id, user_id FK, refresh_token_hash UNIQUE, device_name, platform enum(web|ios|android),
          ip inet, user_agent, last_used_at, expires_at, revoked_at)
recovery_codes (id, user_id FK, code_hash, used_at)
push_tokens (id, user_id FK, token UNIQUE, platform, last_seen_at, invalid_at)
guest_sessions (id, token_hash UNIQUE, ip inet, created_at, last_used_at,
                claimed_by_user_id FK NULL, claimed_at)   -- guest mode (01 §4.1b); burned on claim

-- ============ CAPSULES ============
capsules (
  id uuid PK,
  public_id text UNIQUE NOT NULL,        -- 8-char human-readable handle (06 §D)
  seals jsonb NOT NULL DEFAULT '[]',     -- unlock conditions beyond time (06 §B)
  expires_after interval, expiry_strict bool DEFAULT false, expired_at timestamptz,
  owner_id uuid FK->users NULL,          -- NULL only for unclaimed guest capsules
  guest_session_id uuid FK->guest_sessions NULL,  -- exactly one of owner_id/guest_session_id set pre-claim
  org_id uuid FK->orgs NULL,
  type capsule_type NOT NULL,           -- self|personal|group|birthday|anniversary|public|legacy|emergency|campaign|micro
  state capsule_state NOT NULL DEFAULT 'draft',
    -- draft|sealing|sealed|unlocked|expired|withdrawn (opened is per-recipient, not capsule-level)
  title text, cover jsonb,               -- {kind:gradient|image, value, theme}
  teaser text,
  content_doc_enc bytea,                 -- E2E ciphertext of rich-text AST (always encrypted; 06 §A)
  owner_key_wrap bytea,                  -- capsule key wrapped to owner master key
  passphrase_hint text,                  -- Passphrase Seal hint (plaintext by design)
  size_bytes bigint NOT NULL DEFAULT 0,
  -- scheduling (see §10 for semantics)
  unlock_mode unlock_mode NOT NULL DEFAULT 'absolute',  -- absolute|recipient_local|trustee|chained
  unlock_at timestamptz,                 -- resolved UTC instant (absolute mode / resolved local)
  unlock_local jsonb,                    -- {date:"2027-06-01", time:"09:00", tz:"creator|recipient|<IANA>"}
  seal_deadline_at timestamptz,          -- group capsules
  sealed_at timestamptz,
  extended_once bool DEFAULT false,
  recurrence jsonb,                      -- {freq:"yearly", count|until} -> series
  series_id uuid NULL,                   -- groups recurring instances
  chain_parent_id uuid FK->capsules NULL, chain_delay interval NULL,
  -- options
  allow_download bool DEFAULT true,
  recipients_visible bool DEFAULT false, -- shared list vs bcc
  announce_on_seal bool DEFAULT true,
  break_glass enum(disabled|allowed) DEFAULT 'disabled',
  break_glass_requested_at timestamptz,
  require_recipient_verification bool DEFAULT false,
  reply_prompt text,
  location jsonb,                        -- {lat,lng,name}
  sealed_day_snapshot jsonb,             -- weather/headlines captured at seal (delight feature)
  -- lifecycle side-states
  archived_at timestamptz, trashed_at timestamptz, purge_after timestamptz,
  withdrawn_at timestamptz,
  legacy_config jsonb                    -- {trigger:"date|trustee|first_of|last_of"}
)
INDEXES: (owner_id, state), (state, unlock_at) -- the scheduler's hot index
         (org_id), (series_id), (trashed_at) WHERE trashed_at IS NOT NULL

capsule_recipients (
  id uuid PK, capsule_id FK, 
  user_id uuid FK NULL,                  -- linked account (incl. ghosts)
  email citext NULL, phone text NULL,    -- at least one of user_id/email/phone
  display_name text,
  access_token_hash text UNIQUE NOT NULL,-- the /c/:token secret, hashed
  status recipient_status NOT NULL DEFAULT 'added',
    -- added|invited|notified|viewed_locked|opened|bounced|blocked_suppressed
  first_opened_at timestamptz, last_viewed_at timestamptz,
  tz_inferred text,                      -- from locked-page visit (recipient_local mode)
  resolved_unlock_at timestamptz,        -- per-recipient instant for recipient_local mode
  verification_required bool, verified_at timestamptz,
  is_fallback bool DEFAULT false, fallback_after interval,
  reminder_opt_in jsonb,                 -- channels recipient chose on locked page
  UNIQUE(capsule_id, email), UNIQUE(capsule_id, user_id)
)
capsule_collaborators (capsule_id, user_id, role enum(coauthor), invited_by, accepted_at)
media_items (
  id uuid PK, capsule_id FK, uploader_id FK->users,
  kind enum(image|video|audio|voice|document|archive|link|location),
  storage_key text, original_name text, mime text, size_bytes bigint,
  duration_ms int, width int, height int,
  caption text, position int NOT NULL,
  blurhash text, thumb_key text, preview_key text, hls_key text,
  enc_meta jsonb,                        -- E2E per-file IVs/chunking info (all files encrypted; 06 §A)
  status enum(uploading|processing|ready|failed|infected) DEFAULT 'uploading',
  scan_result jsonb, exif_captured_at timestamptz
)
reactions (id, capsule_id FK, recipient_id FK->capsule_recipients, emoji text, note text, created_at)
comments (id, capsule_id FK, author_user_id/recipient_id, body text, created_at)  -- shared capsules, post-unlock
capsule_versions (id, capsule_id FK, snapshot jsonb, created_at)  -- draft history, pruned to last 20

-- ============ ORGANIZATION OF CONTENT ============
tags (id, user_id FK, name citext, UNIQUE(user_id, name))
capsule_tags (capsule_id, tag_id, PK(capsule_id, tag_id))
collections (id, user_id FK, name, cover jsonb, position int)
collection_items (collection_id, capsule_id, position, PK(collection_id, capsule_id))
favorites (user_id, capsule_id, PK(user_id, capsule_id))
contacts (id, owner_id FK, name, email citext, phone, birthday date, linked_user_id FK NULL, notes)
contact_groups (id, owner_id, name) / contact_group_members (group_id, contact_id)

-- ============ LEGACY ============
trustees (id, owner_id FK, trustee_user_id FK NULL, email citext, relationship text,
          status enum(invited|active|revoked), accepted_at)
legacy_settings (user_id PK, checkin_interval_days int, threshold int, last_checkin_at,
                 waiting_period_days int DEFAULT 14)
legacy_triggers (id, owner_id FK, initiated_by_trustee_id FK, state enum(collecting|waiting|cancelled|released),
                 attestation text, document_keys text[], threshold_met_at, waiting_ends_at,
                 cancelled_by enum(owner_login|admin) NULL, released_at)
legacy_trigger_confirmations (trigger_id, trustee_id, confirmed_at, PK(trigger_id, trustee_id))

-- ============ SCHEDULING & DELIVERY ============
scheduled_actions (               -- SOURCE OF TRUTH for all future work
  id uuid PK,
  kind action_kind NOT NULL,      -- capsule_unlock|recipient_unlock|reminder|checkin|breakglass_open|
                                  -- trash_purge|trigger_release|chain_unlock|series_spawn|announce|
                                  -- capsule_expire|expire_purge
  subject_id uuid NOT NULL,       -- capsule/recipient/user id per kind
  run_at timestamptz NOT NULL,
  state enum(pending|enqueued|done|failed|cancelled) DEFAULT 'pending',
  attempts int DEFAULT 0, last_error text, locked_by text, locked_at timestamptz,
  idempotency_key text UNIQUE
)
INDEX (state, run_at)             -- THE index; partial WHERE state='pending'

-- ============ NOTIFICATIONS ============
notifications (id, user_id FK NULL, recipient_id FK NULL, category notif_category, 
               title, body, data jsonb, read_at, created_at)
  -- categories: unlock|reminder|delivery|social|security|billing|product|digest
notification_prefs (user_id PK, prefs jsonb)   -- {unlock:{push,email,sms}, ...}
outbound_messages (id, channel enum(email|sms|push), to_ref, template, payload jsonb,
                   state enum(queued|sent|delivered|bounced|failed), provider_id, attempts, created_at)
  -- audit + retry ledger for every external send

-- ============ BILLING ============
entitlements (user_id PK, plan enum(free|premium|family|business|enterprise),
              source enum(stripe|apple|google|gift|comp), storage_quota_bytes bigint,
              seats int, family_owner_id FK NULL, valid_until, grace_until, updated_at)
subscriptions (id, user_id FK, provider, provider_sub_id UNIQUE, plan, status, current_period_end, raw jsonb)
purchases (id, user_id, kind enum(gift_pass|keepsake), provider, provider_ref, consumed_capsule_id NULL)
invoices_cache (id, user_id, provider_invoice_id, amount, currency, pdf_url, created_at)

-- ============ ORGS ============
orgs (id, name, slug UNIQUE, branding jsonb, sso_config jsonb, settings jsonb)
org_members (org_id, user_id, role enum(owner|admin|member), joined_at, PK(org_id,user_id))
campaigns (id, org_id FK, name, template_capsule_id FK, schedule jsonb, state, stats jsonb)
campaign_recipients (id, campaign_id FK, email, merge_vars jsonb, capsule_id FK NULL, status)

-- ============ TRUST & SAFETY / SYSTEM ============
reports (id, reporter_ref, capsule_id, reason enum, details, state enum(open|reviewing|actioned|dismissed), handled_by, resolution)
blocks (blocker_user_id, blocked_email citext, created_at, PK(blocker, blocked_email))
audit_events (id bigserial, actor_type enum(user|recipient|admin|system), actor_id, action text,
              subject_type, subject_id, metadata jsonb, ip, created_at)
  -- PARTITIONED BY RANGE (created_at), monthly; append-only, no UPDATE grants
admin_users (id, email, role enum(superadmin|support|trust_safety|finance), totp required)
admin_breakglass_requests (id, requested_by, capsule_id, reason, approved_by NULL, expires_at, used_at)
feature_flags (key PK, rules jsonb, updated_by)
referrals (id, referrer_id FK, code UNIQUE, referee_id FK NULL, state enum(created|signed_up|rewarded|fraud), rewarded_at)
achievements (user_id, key, earned_at, PK(user_id, key))
```

Normalization: 3NF for core entities; deliberate JSONB for polymorphic config (cover, recurrence, prefs) that never needs relational queries. Scale path: `audit_events` and `notifications` partitioned; `scheduled_actions` stays small (rows deleted/archived after done); media bytes never in DB.

---

## 8. Capsule System — rules engine

### State machine
```
draft ──seal()──▶ sealing ──uploads ready──▶ sealed ──clock──▶ unlocked ──viewing window──▶ expired
  │                                            │
  ├─▶ trashed ─▶ purged                        ├─▶ withdrawn (owner action, pre-unlock)
  └─▶ (delete)                                 └─▶ unlocked-early (break-glass, self only)
per-recipient overlay: added → invited → notified → viewed_locked → opened
side flags (post-unlock): archived, trashed
```

### Invariants (enforce in service layer + DB constraints where possible)
1. `sealed` content (content_doc, media set, unlock semantics) is immutable. Allowed post-seal mutations: recipient email correction, add/remove recipient (until unlock), extend unlock once ≤30d, withdraw, cover/teaser edits are NOT allowed (they're part of the sealed artifact).
2. `unlock_at` must be ≥ now+5min at seal time, ≤ now+50yr.
3. A capsule with any recipient `opened` can never be withdrawn or trashed by owner (recipients keep access; owner may archive their own view).
4. Trash forbidden for: sealed capsules with third-party recipients (must withdraw), legacy/emergency capsules (must disable legacy config first — deliberate friction).
5. Ownership transfer: only drafts and self-capsules; recipient-facing sealed capsules never change sender identity.
6. Withdrawn/trashed sealed content is retained (encrypted, inaccessible) until purge_after (30d) for anti-abuse forensics, then hard-purged including object storage.
7. Every state transition writes `audit_events`.

### Encryption model — zero-access by default (per 06-FEATURE-ADDENDUM §A)
- **All capsule contents are E2E encrypted client-side.** Client generates a 256-bit capsule key (AES-GCM); content doc + every file encrypted before upload; server stores ciphertext only. Envelope metadata (title, cover, teaser, dates, sizes) stays plaintext — needed for timelines, emails, OG images; UX says so explicitly.
- Key wraps: owner master key (generated at signup, encrypted under Argon2id(password), re-wrapped on password change), per-recipient wrap in link URL fragment (`#k=…`, never reaches server), optional Passphrase Seal wrap, printable recovery kit (mandatory nag; lose password+kit = unrecoverable by design).
- Consequences (accepted, do not regress): thumbnails/posters/waveforms/blurhash generated client-side pre-encryption as encrypted sidecars; EXIF stripped client-side; no server content search (client-side index of opened content; server FTS = titles/tags only); no server AV of contents (compensating controls per 04); exports assembled client-side; admin moderation metadata-only.
- Legacy: keys wrapped to designated recipients at seal; trustees trigger release, never read.
- Access links: 26-char base32 (130 bits) tokens, stored hashed (SHA-256); rotation invalidates old.

### Seals (unlock conditions) & expiry (per 06 §B–C)
- `seals jsonb` on capsule: array of `{type: time|place|passphrase|identity, config}`. Time always present. Place: `{lat,lng,radius_m,name}` — client geolocation gates key-unwrap, server gates ciphertext download by reported location (best-effort, documented as ceremony not cryptography). Passphrase: hint plaintext, wrap client-side only. Max 3 seals beyond Time; Legacy capsules: Identity only.
- Expiry: optional viewing window post-unlock (`expires_after interval`, `expiry_strict bool`, ephemeral mode = single session + strict). New state `expired` (`unlocked → expired` via `capsule_expire` action); prior openers keep access unless strict; ciphertext purged expiry+30d, envelope kept for expired page. Forbidden on Legacy.
- `public_id` (8-char unambiguous alphabet, `TC-` prefix in UI): human-readable support/display handle, distinct from secret token; unique index.

---

## 9. Media Pipeline

1. Client requests upload ticket → API validates (plan quota, file size, MIME allow-list) → returns S3 multipart presigned URLs + `media_item(uploading)`.
2. Client uploads directly to S3 (resumable parts, 8 MB chunks).
3. Client calls `complete` → API verifies object exists + size → enqueues `media.process` job.
4. ~~Server content processing~~ **Superseded by 06 §A (zero-access E2E):** all steps below move client-side, pre-encryption; server worker only verifies object existence/size and records metadata. Kept for reference of *what clients must do*:
   - Images: EXIF strip (capture date → metadata), thumbs (320/1080), blurhash, HEIC→JPEG re-encode — then encrypt + upload as sidecars.
   - Video: on-device compression to 720p/1080p H.264, poster frame + blurhash, chunked streaming AES-GCM encryption (no server HLS — see 04).
   - Audio: waveform peaks JSON generated client-side, AAC.
   - Docs: PDF page-1 thumb rendered client-side (pdf.js); Office files get generic type icons Phase 1; ZIP attached opaque.
5. All items `ready` → capsule seal unblocks. `failed` → item flagged, user notified, seal blocked until removed.
6. Serving: R2 signed URLs (15-min TTL) minted per authorized view (post-seal-gate checks incl. Place Seal); clients decrypt while downloading (streaming chunks). Originals/download-all gated by `allow_download`, assembled client-side.
7. Storage classes: originals → infrequent-access after unlock+90d; sealed long-horizon (>2yr) originals → archive class with restore-ahead job scheduled 7 days pre-unlock (cost: ~80% cheaper cold storage; the scheduler knows the future — use it).

---

## 10. Scheduling Engine (the crown jewel)

### Principles
- **Postgres is the source of truth** (`scheduled_actions`). Queues are execution vehicles, never the ledger. A year-long Redis delayed job is a data-loss time bomb; a DB row is forever.
- Idempotent handlers + idempotency keys ⇒ at-least-once execution is safe.

### Mechanics
1. **Promoter loop** (scheduler process, leader-elected via Postgres advisory lock, 2 replicas for HA): every 30s, `SELECT ... FROM scheduled_actions WHERE state='pending' AND run_at <= now()+interval '5 min' ORDER BY run_at LIMIT 1000 FOR UPDATE SKIP LOCKED` → enqueue into BullMQ with `delay = run_at - now()`, mark `enqueued`. Skip-locked = safe concurrency; 5-min lookahead keeps Redis holding only imminent jobs.
2. **Workers** execute at run_at: e.g. `capsule_unlock` → transactionally flip `sealed→unlocked`, spawn per-recipient `recipient_unlock` actions → each sends notifications (channels per prefs), marks `done`.
3. **Sweeper** (every 5 min): re-arms `enqueued` actions older than 15 min without completion (Redis loss recovery) and alerts on `pending` rows with `run_at < now()-10min` (missed-schedule alarm → on-call). Result: Redis can die completely and no unlock is ever lost, at worst delayed minutes.
4. **Retries:** handler failures → exponential backoff (1m, 5m, 30m, 2h, 12h ×3) then `failed` + PagerDuty. Notification sends retry independently via `outbound_messages` ledger.
5. **Precision:** unlocks fire within seconds of target. For public "live" countdowns, the reveal page also self-checks server time and flips client-side at T0 even if the backend event lags seconds.

### Timezones & DST
- Absolute mode: store resolved `timestamptz`, done.
- Wall-clock semantics for long horizons: store `{date, time, tz}`; resolve to UTC instant **at scheduling time AND re-resolve nightly for rows within 60 days** (a "resolver" job) — this absorbs future tz-database/DST rule changes (governments change DST rules more often than people think; a 2035 capsule must honor 2035's rules, not 2026's guess).
- Recipient-local mode: per-recipient `resolved_unlock_at` using tz fallback chain (profile → inferred from locked-page visit → sender tz), re-resolved nightly.
- Nonexistent local times (DST spring-forward 02:30) → shift to 03:00; ambiguous (fall-back) → first occurrence. Documented, deterministic.
- Leap day: Feb 29 → Feb 28 in non-leap years for recurrences; one-off Feb 29 targets fire on the chosen instant (it exists).

### Scale (millions of sealed capsules)
- The hot query touches only near-term rows via partial index — total sealed count is irrelevant to scheduler load.
- Fan-out spikes (New Year 00:00 across timezones): unlocks per tz-hour bucket are naturally staggered; per-recipient notification jobs go through rate-limited queues per provider (Postmark 100/s etc.); worker pool autoscales on queue depth. Load test target: 100k unlocks in one minute → notifications drain < 10 min, unlock state flips < 60 s.
- Recurring series: instances materialized lazily — next instance's `scheduled_action` + capsule row spawned when prior seals/unlocks (never 50 years of rows upfront).

---

## 11. Notification System

### Matrix (event × channel defaults)
| Event | Push | Email | SMS | In-app |
|---|---|---|---|---|
| Your capsule unlocked (recipient) | ✓ | ✓ | opt-in | ✓ |
| Capsule opened by recipient (sender) | ✓ | digest-batched | — | ✓ |
| Something is waiting (announce) | ✓ | ✓ | opt | ✓ |
| Pre-unlock reminders T-7d / T-1d / T-1h (recipient opt-in; sender always T-1d "your words arrive tomorrow") | ✓ | ✓ | opt | ✓ |
| Reaction/thank-you received | ✓ | batched | — | ✓ |
| Group: contribution reminders, seal-deadline T-48h/24h | ✓ | ✓ | — | ✓ |
| Bounce alert (fix recipient email) — escalates T-30d/7d/1d pre-unlock | ✓ | ✓ | — | ✓ |
| Legacy check-in ("still with us? tap to confirm") | ✓ | ✓ | ✓ | ✓ |
| Legacy trigger warning (waiting period) | ✓ ALL CHANNELS, daily | ✓ | ✓ | ✓ |
| Security (new device, password change) | ✓ | ✓ always (non-optional) | — | ✓ |
| Billing (renewal T-7d annual, failure, grace) | ✓ | ✓ | — | ✓ |
| Monthly digest / Year in Capsules | — | ✓ | — | ✓ |

### Rules
- Quiet hours delay non-critical pushes (unlock notifications override only if the user opted into "wake me for unlocks").
- Every send recorded in `outbound_messages`; bounce/complaint webhooks (Postmark) update state + trigger the bounce-alert flow; 2 hard bounces → address flagged, sender prompted.
- Recipient (no-account) notifications: email primary; if sender provided phone + plan supports, SMS with short link. Unsubscribe per-category links (legally required); transactional unlock emails exempt from marketing unsubscribes but still respect a full recipient block.
- Templates: MJML → HTML, localized, plain-text alt, never include capsule content — only cover/teaser/sender/date.
- In-app: `notifications` table + WebSocket (Socket.IO) push to active sessions; badge counts via lightweight endpoint.

---

## 14. API Design (REST)

Base `https://api.timelycapsule.com/v1`. JSON, camelCase. Auth: `Authorization: Bearer <jwt>`; recipient endpoints accept capsule token auth. Versioning in path. Errors: `{ error: { code: "capsule_sealed", message, details?, requestId } }`, HTTP-correct statuses. Pagination: cursor-based `?cursor=&limit=` → `{ data, nextCursor }`. Idempotency: `Idempotency-Key` header honored on all POSTs with side effects. Rate limits: per-user + per-IP token bucket (Redis), headers `X-RateLimit-*`.

```
AUTH
POST /auth/signup {email,password,displayName}        → 201 {user, tokens}
POST /auth/login {email,password} → 200 | 202 {mfaToken} (2FA step)
POST /auth/mfa/verify {mfaToken, code}
POST /auth/oauth/{apple|google} {idToken}
POST /auth/refresh {refreshToken}          POST /auth/logout
POST /auth/verify-email {code}             POST /auth/verify-email/resend
POST /auth/password/forgot {email}         POST /auth/password/reset {token,newPassword}
GET  /auth/sessions                        DELETE /auth/sessions/:id
POST /auth/totp/setup → {qr,secret}        POST /auth/totp/confirm {code} → {recoveryCodes}

GUEST (per 01 §4.1b — anonymous, heavily rate-limited per IP)
POST /guest/sessions → 201 {guestToken}    -- opaque token, stored hashed; client persists locally
POST /guest/capsules {…} → draft           -- Bearer guestToken; text-only, 1 draft + 1 sealed max
PATCH /guest/capsules/:id                  POST /guest/capsules/:id/seal   (unlock ≤ now+1yr)
GET  /guest/capsules/:id                   -- status page data (envelope only)
-- claim: /auth/signup and /auth/oauth/* accept optional {guestToken}; on success the guest
-- session's capsules get user_id set and the guest session is burned (guest → claimed)

USERS & SETTINGS
GET/PATCH /me                              GET /me/storage → {used, quota, largest[]}
PUT /me/notification-prefs                 GET/PUT /me/quiet-hours
POST /me/export → 202 {jobId} (async ZIP, emailed link)
DELETE /me {password, capsuleDecisions:[{capsuleId, action:"deliver"|"withdraw"}]}
GET/POST/PATCH/DELETE /contacts, /contact-groups
GET/POST/DELETE /blocks

CAPSULES
POST /capsules {type} → draft
GET  /capsules?state=&type=&tag=&collection=&q=&cursor=       (own, incl. filters/sort)
GET  /capsules/:id                         PATCH /capsules/:id      (draft only; 409 capsule_sealed otherwise)
POST /capsules/:id/seal → 200 sealed | 202 sealing (uploads pending)
POST /capsules/:id/withdraw               POST /capsules/:id/extend {newUnlockAt}   (once, ≤30d)
POST /capsules/:id/break-glass            DELETE /capsules/:id/break-glass          (cancel)
POST /capsules/:id/duplicate              POST /capsules/:id/archive|unarchive
POST /capsules/:id/trash                  POST /capsules/:id/restore
POST /capsules/:id/transfer {toUserId}    GET  /capsules/:id/activity
GET  /capsules/:id/export → 202           GET  /capsules/:id/versions (drafts)
POST /capsules/:id/collaborators {email}  DELETE .../collaborators/:userId

RECIPIENTS (sender side)
POST /capsules/:id/recipients {email|phone|contactId, options}
PATCH /capsules/:id/recipients/:rid {email}    DELETE ...   (until unlock)
POST /capsules/:id/recipients/:rid/resend-invite

MEDIA
POST /capsules/:id/media/tickets {name,mime,sizeBytes} → {mediaId, uploadId, partUrls[]}
POST /media/:id/complete {parts[]}         DELETE /media/:id
PATCH /media/:id {caption, position}       GET /media/:id/view → {signedUrl|hlsManifest}

RECIPIENT (token-auth, no account needed)
GET  /r/:token → locked{cover,sender,unlockAt,countdown} | unlocked{full content}
POST /r/:token/verify {code}  (Identity Seal; code sent to their address)
POST /r/:token/place-check {lat,lng} → {withinRange, distanceM}  (Place Seal server gate for ciphertext URLs)
POST /r/:token/remind {channel, address?}       POST /r/:token/react {emoji, note?}
POST /r/:token/save   (auth'd: claim into account)   GET /r/:token/download → 202 zip job
POST /r/:token/report {reason, details}          GET /r/:token/calendar.ics

ORGANIZATION OF CONTENT
GET/POST/PATCH/DELETE /tags, /collections, /collections/:id/items
PUT /capsules/:id/tags {tagIds[]}          PUT /capsules/:id/favorite {value}
GET /search?q=&filters → grouped results   -- server FTS over titles/tags/recipients ONLY (E2E);
                                           -- content search is a client-side index of opened capsules (06 §A)

LEGACY
GET/PUT /legacy/settings                   GET/POST/DELETE /legacy/trustees
POST /legacy/checkin  (also via signed email link)
PUT /capsules/:id/legacy {trigger config}
-- trustee side:
GET  /trustee/estates                      POST /trustee/estates/:ownerId/trigger {attestation}
POST /trustee/triggers/:id/confirm

NOTIFICATIONS
GET /notifications?cursor=                 POST /notifications/read {ids[]|all}
PUT /push-tokens {token, platform}         DELETE /push-tokens/:token

BILLING
GET /billing/plans                          POST /billing/checkout {plan, interval} → {stripeUrl}
POST /billing/portal → {url}                GET /billing/entitlements
POST /billing/iap/apple {receipt}           POST /billing/iap/google {purchaseToken}
POST /billing/gift-pass/checkout            Webhooks: /webhooks/stripe, /webhooks/postmark, /webhooks/twilio

ORGS (Phase 3)  /orgs, /orgs/:id/members, /orgs/:id/campaigns[...]/recipients/import (CSV), /orgs/:id/analytics

REFERRALS & MISC
GET /referrals/me → {code, stats}           POST /referrals/redeem {code}
GET /achievements                           GET /flags (evaluated client flags)
POST /feedback                              GET /system/time (client clock sync for countdowns)
```

Error codes (subset): `validation_failed`, `unauthorized`, `forbidden`, `not_found`, `capsule_sealed`, `capsule_withdrawn`, `unlock_in_past`, `quota_exceeded{limit}`, `plan_required{feature}`, `recipient_blocked` (masked as success externally), `rate_limited{retryAfter}`, `upload_incomplete`, `media_infected`, `idempotency_conflict`.

---

## 17. Security

### Threat model (top risks → mitigations)
1. **Early content disclosure** (insider, breach, bug) → structurally impossible for contents: zero-access E2E means servers hold ciphertext only (06 §A); signed URLs minted post-authorization; envelope metadata never includes content; no server-side content indexes/logs/analytics. Residual risk shifts to client code integrity → SRI/signed releases, crypto module test vectors, third-party audit of `packages/crypto` when affordable.
2. **Access-token leakage** (recipient links forwarded/leaked) → 130-bit tokens hashed at rest, optional OTP identity verification, sender-triggered rotation, link visit anomaly alerts (many IPs/geos → sender notified).
3. **Account takeover** → Argon2id password hashing, 2FA, new-device emails, refresh rotation with reuse detection (reuse → revoke whole family), session list/revoke, login rate limits + credential-stuffing detection (IP + fingerprint velocity).
4. **Malicious trustee / false death trigger** → threshold confirmations, 14-day all-channels waiting period, any-login cancel, complete audit visible to all trustees, support escalation path.
5. **Abuse: harassment via capsules** → recipient block (silently suppresses future delivery), report flow pre/post open, sender velocity limits (new accounts: 5 outbound recipients/day until aged), content hash-matching (CSAM) at upload, spam heuristics (identical capsule to many recipients → review queue).
6. **Payment fraud / referral fraud** → Stripe Radar, IAP server-side receipt validation, referral reward only on referee first-seal + device/payment fingerprint checks.
7. **Data loss** (the brand-killer) → PITR Postgres backups (5-min RPO), cross-region S3 replication, quarterly restore drills, object versioning + delete-marker protection on media bucket, `scheduled_actions` reconciliation audit (daily job proves every sealed capsule has a pending unlock action — the "no capsule left behind" check).
8. **Injection/standard web** → Zod validation on every input, parameterized queries only, CSP strict on reveal pages (user content rendered from sanitized AST, never raw HTML), SSRF-safe link unfurler (deny private IPs), file-type sniffing, upload size enforcement at presign.

### Privacy & compliance
- GDPR: export (US-119), erasure (F8 flow; recipient-delivered content: sender identity anonymized, content retained for the recipient — documented lawful basis: the recipient's legitimate interest in received correspondence), DPAs with processors, EU data residency option (Phase 4), consent for contacts import, no third-party ad trackers ever.
- Data minimization: EXIF stripped by default; IP addresses in audit logs pruned to /24 after 90d; analytics content-blind (event metadata only, never content).
- Retention: purged trash 30d; withdrawn sealed content 30d then purge; `outbound_messages` 12mo; audit 7yr (legal).

---

## 18. Admin Platform (`apps/admin`, internal, SSO + hardware-key 2FA)

- **Dashboard:** live tiles — signups, seals/day, unlocks scheduled next 24h, delivery success rate (24h), queue depths, failed actions, open reports, MRR, storage growth.
- **Users:** search (email/handle/id) → profile: status, plan, sessions, capsule *metadata list* (titles/states/dates — never content), audit trail; actions: verify email, reset 2FA (identity protocol), suspend (freezes delivery? NO — suspension blocks login + creation; already-sealed capsules to third parties still deliver unless T&S rules them abusive), comp premium, trigger export, process deletion.
- **Capsule inspector:** metadata + delivery timeline + outbound message log. **Content is never viewable — zero-access E2E (06 §A).** Moderation acts on envelope metadata, sender behavior, and recipient-submitted evidence; remedies: withdraw, suspend, ban, purge. (The old dual-approval content break-glass is removed; `admin_breakglass_requests` table repurposed for *metadata* deep-inspection approvals only.)
- **Reports queue:** triage list, evidence panel, actions (dismiss, warn sender, withdraw capsule, suspend, ban + purge), macros, SLA timers.
- **Legacy escalations:** death-certificate review workflow (dual review, checklist, doc storage).
- **Delivery ops:** failed `scheduled_actions` with retry/force buttons; bounce dashboards; provider health.
- **Billing ops:** refunds (Stripe in-panel), entitlement overrides, dunning views.
- **Feature flags:** targeting rules (%, plan, platform, user list), kill-switches for uploads/signups/notifications.
- **Audit:** every admin action logged immutably; superadmin can read audit but not delete.

---

## 19. Analytics (PostHog, content-blind)

- **Activation funnel:** signup → composer opened → content added → scheduled → **first seal** (activation event) — target 40% D0.
- **Delivery quality (SLOs):** unlock precision p99 < 60s; notification delivery success > 99.5%; recipient open rate within 30d (north-star input) target 70%.
- **Retention:** creator W4/M3/M12 (M12 matters more than typical apps — usage is episodic by design; define "retained" as any seal OR open in trailing 90d); resurrection rate from unlock events.
- **Virality:** K-factor decomposition (recipients/capsule × recipient signup % × referee seal %); referral funnel.
- **Revenue:** trial-less conversion % by trigger (which paywall converted), MRR, churn (voluntary/involuntary), LTV by persona cohort (intent answer from onboarding), gift-pass attach.
- **Engagement:** seals/creator/quarter, media types mix, avg horizon length (leading indicator of trust!), reaction rate, reply-capsule rate.
- Guardrails: crash-free %, upload success %, p95 API latency, notification complaint rate < 0.1%.

---

## 25. Edge Cases (decisions, not questions)

| Case | Decision |
|---|---|
| Creator dies (no legacy setup) | Next of kin contacts support → death-cert protocol → sealed capsules to others still deliver as scheduled (sender's intent honored); self-capsules and drafts frozen, releasable to estate only via legal order. |
| Recipient dies before unlock | Sender can withdraw or re-address; if nobody acts, capsule unlocks and sits unopened; fallback-recipient feature covers proactively. |
| Recipient email bounces | Escalating sender alerts from first bounce through T-1d; capsule still "delivers" to the link (sender can share manually); status shows `bounced`. |
| Recipient changed email | Old-address OTP proves control → self-service re-address; else sender edits pre-unlock; post-unlock links keep working. |
| Sender email compromised pre-unlock | Session revoke-all + password reset does NOT auto-withdraw capsules; security review flow lists recently created/edited capsules for one-tap withdraw. |
| User changes timezone / travels | Absolute capsules unaffected; wall-clock capsules follow the stored tz choice, not current location; UI always names the tz. |
| DST rule changes by law | Nightly re-resolver within 60d horizon picks up tzdata updates (see §10). |
| Feb 29 recurrence | → Feb 28 non-leap years. |
| Storage quota exceeded (downgrade) | Existing sealed capsules untouched; creation blocked over quota; oversized *drafts* read-only until resolved. |
| Subscription lapses with 20-yr legacy capsule | Delivered anyway. Preservation is unconditional (see US-085/104). Cost is a rounding error; trust is the product. |
| Upload dies at 95% (huge file) | Multipart resume from last part; parts expire after 7d → ticket renewal; draft shows resumable state across devices (web can't resume mobile's file — shows "started on iPhone"). |
| Duplicate recipient (same person, email + phone) | Normalized dedup on add; if discovered later (ghost claim links both), recipient sees one capsule, both notification channels. |
| Clock skew on client | Countdowns sync via `/system/time` offset; server time is truth; reveal gates server-side always. |
| Redis total loss | Sweeper re-arms from Postgres; worst case minutes of delay, zero loss (§10.3). |
| Region outage | Multi-AZ primary; cross-region replicas + object replication; RTO 4h, RPO 5min; status page honest. |
| Millions unlock at New Year midnight | Naturally tz-staggered + rate-limited fan-out queues + autoscaled workers; pre-warm scheduled (we KNOW the spike date — capacity plan is a calendar entry). |
| Capsule to self, account deleted before unlock | Deletion flow warns; self-capsules purged with account (nobody left to receive). |
| Legal demand for sealed content | Counsel-reviewed; break-glass protocol; user notified unless legally gagged; transparency report annually. |
| Recipient opens link in country where service blocked | Reveal pages served static-first from CDN edge; no login required; best-effort accessibility. |
| Two co-authors edit simultaneously | Draft locking per block (soft locks + last-write-wins with version history); real-time CRDT explicitly out of scope until Phase 3. |
| App uninstalled, push token dead | Token invalidation feedback loops prune; email remains the guaranteed channel for anything critical. |

---

## 24. Technical Recommendations Summary (why-table)

| Area | Pick | Core reason |
|---|---|---|
| Web | **Next.js 15 (App Router) + React Query + Tailwind + Radix** | SSR for reveal/marketing (SEO+speed), CSR app shell; Radix = accessible primitives to skin with Meridian |
| Mobile | **React Native + Expo (dev client) + FlashList + Reanimated + WatermelonDB** | Shared TS contracts with API; EAS OTA updates; native modules where needed (background upload, widgets via native extensions) |
| Backend | Express 5 + TS + Zod + Drizzle (modular monolith + workers) | Mandated + §12 rationale |
| DB | Postgres 16 (Neon → RDS at scale) | §13 |
| Queue | BullMQ/Redis, Postgres-backed schedule ledger | §10 |
| Storage/CDN | Cloudflare R2 + CF CDN (zero egress — media-heavy product) | Egress is the #1 cost risk; R2 kills it. S3 Deep Archive equivalent for cold originals via R2 infrequent or AWS split. |
| Search | Postgres FTS → OpenSearch later behind interface | Don't run a search cluster before 1M capsules |
| Email/SMS | Postmark / Twilio | Deliverability, webhooks |
| Payments | Stripe + StoreKit2 + Play Billing, server entitlement service | §4.15 |
| Analytics | PostHog (self-serve funnels, flags optional) | Content-blind product analytics |
| Errors/APM | Sentry + OTel + Grafana Cloud | |
| CI/CD | GitHub Actions; API/workers Docker→Fly.io; web Vercel; mobile EAS + store fastlane | |
| Testing | Vitest (unit), Supertest (API), Playwright (web e2e), Maestro (mobile e2e), k6 (unlock-storm load test), mandatory scheduler simulation suite (virtual clock tests for DST/leap/50-yr cases) | The scheduler test suite is non-negotiable |
| IaC | Terraform from day 1 (small surface, huge later payoff) | |

---
*End of Part 3.*
