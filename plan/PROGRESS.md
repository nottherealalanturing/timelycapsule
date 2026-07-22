# TimelyCapsule — Build Progress Tracker

> **Every session must update this file before ending.** This is the cross-session memory: next ticket, decisions made, and anything blocked. Keep entries short.

## Current status
- **Next ticket:** T-03 (API skeleton & conventions)
- **Stage:** A — Foundations
- **Blockers / pending 🧑 HUMAN SETUP:** none for T-03. Domain + Cloudflare account needed before T-07 (not yet).

## Ticket log
| Ticket | Status | Date | Notes |
|---|---|---|---|
| T-01 | done | 2026-07-22 | Turborepo + pnpm workspaces scaffolded: apps/{api,web,mobile}, packages/{contracts,core,ui-web,eslint-config}. CI (GitHub Actions) green: lint/typecheck/test/build all pass. `pnpm dev` verified end-to-end (api JSON + web page rendering via @tc/core). |
| T-02 | done | 2026-07-22 | Docker Compose Postgres 16 (host port 5433). Drizzle schema for all 19 core Stage A–C tables per 03 §13 (identity, capsules incl. 06 amendments — seals/public_id/expiry/E2E columns, scheduling, notifications, organization, billing, audit_events). Generated + applied migration (19 tables, correct partial/unique indexes verified via psql). `audit()` helper + integration test. Seed script (2 users, draft+sealed capsule, recipient, media item, tag, favorite, scheduled_action) — idempotent, reran cleanly. citext case-insensitivity verified live. CI updated with a Postgres service container so DB-backed tests run in GitHub Actions too, not just locally. |
| T-03 | not started | | |

## Decisions log (deviations/clarifications vs. the plan docs)
- **Local dev ports changed to API :4001 / web :3001** (plan examples used :4000/:3000). This machine runs an unrelated project (`~/Documents/sandbox/grc-v3/digitalencodeGRC_api` + `_web`) that already occupies 3000/4000. Purely a local-dev convenience; production deploy (T-19+) is unaffected (Caddy/Cloudflare Pages don't hardcode these). Configurable via `PORT` env var (api) / `-p` flag (web).
- **Next.js 16** installed instead of the plan's "Next.js 15" (latest stable at scaffold time; App Router conventions carry over, no known plan conflict). Same for React 19.2, Expo SDK 57 — all "latest at build time," not pinned versions from the plan.
- **`packages/contracts`, `packages/core`, `packages/ui-web`** ship as raw TS (no build step) — `main`/`types` point straight at `src/index.ts`, consumed via workspace linking + each consumer's own bundler (tsx/Next/Expo). No `build` script defined for these packages; Turbo skips packages without a `build` script, so this doesn't break `pnpm build`. Keeps iteration fast; revisit only if publishing standalone ever matters.
- **ESLint:** `apps/web` and `apps/mobile` use their framework's own generated flat config (create-next-app / eslint-config-expo) rather than the shared `@tc/eslint-config` base, since those frameworks require specific plugin setups. `apps/api` + all `packages/*` use `@tc/eslint-config` (typescript-eslint + prettier).
- Next.js and Expo each auto-generated a nested `AGENTS.md`/`CLAUDE.md` pointing at their own versioned docs (both frameworks are newer than any training data) — kept intentionally; they load automatically when a session works inside `apps/web` or `apps/mobile`.
- **Local Postgres on host port 5433, not 5432** — same reasoning as the app ports (avoid the unrelated sandbox project). `docker-compose.yml` at repo root; `pnpm db:up`/`db:down` wrap it.
- **`citext`/`inet` implemented via Drizzle's `customType`** (no first-class column builder for either in drizzle-orm/pg-core). `citext` extension is enabled by `db:migrate` itself (`CREATE EXTENSION IF NOT EXISTS citext` runs before applying migrations) rather than living in a migration file, so a fresh DB never fails on table creation order.
- **`audit_events` is NOT partitioned yet** despite 03 §13 specifying monthly range partitioning at scale. Deferred — a single table is correct pre-launch and the column shape is unaffected by migrating to partitions later. Revisit when volume warrants it (see comment in `apps/api/src/db/schema/system.ts`).
- **`capsules.org_id` and `capsules.chain_parent_id`** are plain columns without FK constraints to `orgs`/self yet where the referenced table doesn't exist (orgs is Phase 3/T-42); `chain_parent_id` self-references `capsules` and does have its FK live now. FK to `orgs` gets added in T-42's migration.
- Added a **Postgres service container to `.github/workflows/ci.yml`** (not in T-01's original CI) so `pnpm db:migrate` and DB-backed tests run in CI — this was a T-02 necessity, not scope creep, since every ticket from here on writes DB-touching tests.

## Environment setup checklist (from 05 §env master list — tick as configured)
- [x] Local: Node 20+ (v24 installed, .nvmrc pins 20 for consistency), pnpm 9, Docker
- [x] GitHub repo created — github.com/nottherealalanturing/timelycapsule (old legacy content wiped per founder decision, main branch clean)
- [ ] Domain + Cloudflare
- [ ] Resend (before T-07)
- [ ] Cloudflare R2 buckets (before T-07)
- [ ] Google OAuth client (before T-05)
- [ ] Oracle/Hetzner VM, B2, healthchecks.io, UptimeRobot, Sentry, PostHog (before T-19)
- [ ] Expo/Play/Apple/Firebase (before T-23)
- [ ] Stripe (before T-30)
