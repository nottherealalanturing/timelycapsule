# TimelyCapsule — Master Plan Index & Build Guide

**Audience:** the implementing AI (Claude Sonnet) and the human builder. These four documents are the product decisions; do not re-litigate them during implementation. Where a detail is genuinely unspecified, choose the option most consistent with the product principles in `01-PRODUCT.md §1` (trust > delight > growth) and note the choice in a `DECISIONS.md` log.

## Documents
1. **[01-PRODUCT.md](01-PRODUCT.md)** — vision, personas, 130 user stories (US-xxx), module feature breakdown, monetization, growth, accessibility, roadmap, delight backlog.
2. **[02-UX-DESIGN.md](02-UX-DESIGN.md)** — "Meridian" design system (tokens, components), every screen spec, key flows (F1–F10), mobile & web platform specifics.
3. **[04-ZERO-COST-PLAN.md](04-ZERO-COST-PLAN.md)** — **read after 03; it OVERRIDES infra/vendor picks** for the bootstrap phase (solo founder, ~$0 budget): single VPS/Oracle-free-tier deploy, pg-boss instead of Redis, Resend email, deferred video transcoding/SMS/IAP, mandatory dead-man's-switch monitoring.
4. **[05-BUILD-PLAYBOOK.md](05-BUILD-PLAYBOOK.md)** — **the execution script**: 42 ordered tickets (T-01→T-42) with exact endpoints, screens, DoD per ticket, and 🧑 HUMAN SETUP checklists (accounts, DNS, keys) before each stage. Start here when building; it supersedes the coarse M0–M5 milestones below.
5. **[06-FEATURE-ADDENDUM.md](06-FEATURE-ADDENDUM.md)** — zero-access E2E encryption rationale + key model, the **Seals** system (composable Time/Place/Passphrase/Identity unlock conditions), capsule expiry ("completed journeys", incl. ephemeral mode), and the **"warm time-travel" voice guide** with canonical copy for loading/404/withdrawn/countdown/expired/gate pages. Its structural changes are already merged into 02/03/05; this doc holds rationale and copy, and wins any residual conflict.
6. **[03-ARCHITECTURE.md](03-ARCHITECTURE.md)** — backend architecture, full Postgres schema, capsule state machine & invariants, media pipeline, scheduling engine, notification matrix, REST API surface, security/threat model, admin platform, analytics plan, edge-case decision table, stack picks.

## Repos (existing folders — treat as empty, start fresh)
- `timely-capsule-api/` → Express 5 + TS API **and** worker/scheduler processes (one codebase, multiple entrypoints: `api`, `worker`, `scheduler`). Include `packages/contracts` here initially (Zod schemas + generated types) published/linked to both clients. If converting to a proper monorepo, move all three apps under one Turborepo — preferred if the human agrees; otherwise link contracts via git or npm.
- `timelycapsule/` → Next.js 15 web app (marketing + app + reveal pages). Admin panel lives at `timelycapsule/apps/admin` or a route-group `/admin` behind auth — recommended: separate Next.js app later (Phase 2); Phase 1 admin can be a protected route group.
- `timelycapsule-mobile/` → Expo (custom dev client) React Native app.

## Build order (Phase 1, dependency-sorted milestones)

**M0 — Foundations (week 1–2)**
Monorepo/tooling, CI, Postgres + Drizzle schema (§13 core tables: users→capsules→recipients→media→scheduled_actions→notifications→entitlements), Zod contracts package, auth module (signup/login/OAuth/verify/refresh/2FA), seed + test harness. Exit: authenticated hello-world on web + mobile against real API.

**M1 — Capsule core (week 3–5)**
Capsule CRUD + draft autosave + state machine + invariants, media tickets/presigned upload/processing worker (images + audio first, video next), composer UI (web then mobile) per §5.5, timeline/home per §5.4. Exit: can create, attach media, and seal a self-capsule.

**M2 — Scheduling & delivery (week 5–7)** ← the heart; build with the simulation test suite from day one
`scheduled_actions` ledger + promoter/sweeper/workers (§10), unlock flow, notification module (email via Postmark + in-app; push after mobile shell ready), recipient model + token links + no-account reveal page (§5.7), reactions. Exit: end-to-end F2 flow works — seal → wait → recipient email → reveal → reaction → sender notified. **This is the demo that proves the product.**

**M3 — Product completeness (week 7–10)**
Received inbox, contacts, tags/collections/favorites/archive/trash, search (PG FTS), settings (all panels except legacy), notifications center + prefs + quiet hours, activity/audit surfaces, withdraw/extend/break-glass, GDPR export/delete flows.

**M4 — Money & polish (week 10–12)**
Stripe checkout + webhooks + entitlements, IAP (StoreKit2/Play) reconciliation, contextual paywalls, plan limit enforcement everywhere, referral v1, marketing site + pricing + occasion pages, seal/unlock ceremony animations + haptics, empty/loading/error state pass, a11y audit, load test (unlock storm), security pass (rate limits, headers, abuse velocity limits), admin v1 (users, reports, refunds, delivery ops).

**M5 — Launch hardening**
Backups + restore drill, "no capsule left behind" reconciliation job, status page, on-call alerts, store listings, beta (TestFlight/Play internal), fix, ship.

Phase 2+ scope (legacy/trustees, Seals expansion — dead-drop/quests/world capsule, groups, series, public pages, widgets, family plan…) is specified across the docs but explicitly **not** in the first build. (Zero-access E2E encryption IS Phase 1 core, via T-07b.)

## Non-negotiable implementation rules
1. Sealed content immutability enforced server-side (not just UI) — §8 invariants.
2. Postgres `scheduled_actions` is the only source of truth for future work; Redis is disposable — §10.
3. Capsule contents never reach servers in plaintext — zero-access E2E via `packages/crypto` (T-07b) for the content doc AND every media file/sidecar; only envelope metadata (title, cover, dates) is plaintext. No content in logs, analytics, server search indexes, or OG images.
3b. Recipient decryption keys travel only in URL fragments or passphrase wraps; never in request bodies, query strings, or storage.
4. Recipient reveal must work with no account, no app install, on a 3-year-old phone browser.
5. Delivery of already-sealed capsules is never gated by payment state.
6. Every POST with side effects honors `Idempotency-Key`.
7. All user-facing strings through i18n from the first commit; all colors/spacing through Meridian tokens.
8. The scheduler simulation suite (virtual clock: DST spring/fall, leap day, tz-rule change, 50-year horizon, Redis-loss recovery) must pass in CI before M2 merges.
