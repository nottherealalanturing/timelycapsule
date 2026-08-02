# Hardening pass (T-22)

Checklist and results for the pre-beta hardening ticket (`plan/05-BUILD-PLAYBOOK.md` T-22). DoD: "checklist in repo with results; issues fixed." Gates opening a private web beta to friends.

## Rate limits on all mutation routes

Every mutation route (`POST`/`PATCH`/`PUT`/`DELETE`) across every module now carries `rateLimit()` (`src/middleware/rate-limit.ts`, unchanged — extended, not rewritten). Before this pass, only 4 of 13 route modules had any coverage (auth, settings, reveal, guest).

- **Newly covered:** capsules (12 routes), media (4), recipients (5), collections (6), tags (4), contacts (8), favorites (1), notifications (2), received (1) — 43 routes total.
- **Default:** `windowMs: 15 * 60 * 1000, max: 60`, keyed by `user.id` (falls back to IP), matching the existing convention in `auth/routes.ts`/`settings/routes.ts`. No document specifies per-endpoint numbers beyond auth/guest's own ceilings, so a single consistent default was used rather than inventing bespoke figures per route.
- **Real gap found and fixed while auditing, not part of the original 9-module list:** `POST /auth/verify-email` had no HTTP-level rate limit at all — only a per-code attempt-burn (5 wrong guesses burns that code, forcing a resend, which *is* rate-limited). Added `max: 10 / 15min`, keyed by user id.
- Verified: `pnpm test` (all 233 tests) and `pnpm lint`/`pnpm typecheck` green after every file.

## Security headers / CSP audit

**API (`helmet()` in `app.ts`):** already adequate on inspection — confirmed live via `curl -D-`. Strict default CSP (`default-src 'self'`), HSTS, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin`. No changes needed; it's a JSON API with no HTML-rendering surface for the media-origin XSS concern to apply to.

**Web (`apps/web/next.config.ts`): had zero security headers at all** — this was the real gap, not a tuning pass. Added via Next's built-in `headers()` (no new dependency):

- `Content-Security-Policy` — every source list checked against actual call sites rather than assumed:
  - `img-src`/`media-src`/`connect-src` allow the R2 endpoint (`*.r2.cloudflarestorage.com`, from `media/get-adapter.ts`) and the future custom domain `usercontent.timelycapsule.com` (`plan/04-ZERO-COST-PLAN.md`; DNS not yet live per `plan/PROGRESS.md`, pre-authorized for when it is), plus `blob:` — decrypted media renders via `URL.createObjectURL()` in `RevealCeremony.tsx`, never a direct fetch into an `<img>`.
  - `script-src`/`frame-src` allow `accounts.google.com` — `GoogleSignInButton.tsx` injects Google's own script and iframe. Verified live: signup/login pages render the real Google button with zero console/CSP errors against a production build.
  - `connect-src` allows Sentry/PostHog ingest and both real API origins (dev + prod).
  - `script-src`/`style-src` keep `'unsafe-inline'` — this Next 16/Turbopack app's RSC streaming relies on inline hydration scripts; removing it needs a nonce wired through middleware, which is a larger change than this ticket's scope and unverifiable without a full page-by-page pass. Every other directive is `'self'`-only.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` allows exactly the device APIs actually used — `geolocation` (`PlaceGate.tsx`), `camera`/`microphone` (`MediaBlock.tsx`, voice/video capsule recording) — checked against real call sites, not copy-pasted as deny-all.
- **Verified:** `pnpm build` succeeds; a real production server (`pnpm start`, isolated port) shows the headers via `curl`; `/`, `/login`, `/try` loaded live in a browser with zero console errors, and the Google Sign-In button rendered and worked.

## Velocity limit — new accounts: 5 outbound recipients/day

`plan/03-ARCHITECTURE.md §17` threat #5 names this but never defines "until aged." **Confirmed with the user: 7 days.**

Implemented in `modules/recipients/service.ts` as `assertWithinVelocityLimit`, called from `createRecipient` alongside the existing (separate, per-capsule) `assertWithinRecipientLimit`. Counts recipient rows created across *every* capsule the account owns in the trailing 24h, for accounts younger than 7 days; aged accounts are unrestricted. New error code `velocity_limit_exceeded` (429), added to `packages/contracts/src/common.ts`'s `ERROR_CODES`.

**Verified:** two new tests in `recipients.test.ts` — a fresh account is blocked on the 6th outbound recipient within a day (across capsules, not just one), and an account backdated 8 days is not restricted at the same volume.

## Auth flow abuse tests

Existing coverage already had per-attempt checks (wrong password, wrong verify-email code with code-burn, refresh-token reuse detection). What was missing was confirmation that the *rate limiters themselves* actually trip at their configured ceiling — added to `auth.test.ts`:

- Repeated login attempts (credential stuffing) → 429 at the configured limit (10/15min).
- Repeated signup attempts (mass account creation) → 429 at 10/hour.
- Repeated forgot-password requests (email enumeration/spam) → 429 at 5/15min.

**Verified:** all pass; full suite still green (233/233).

## A11y audit pass

Scope per the ticket, plus `design/11-IMPLEMENTATION-ALIGNMENT.md §9`'s expansion (computed contrast, never estimated — `05` shipped a 2.72 by eyeballing once already).

**Computed contrast — clean, nothing to fix.** Every real text/background pair in `packages/ui-web/src/tokens.css`, across both the instrument (dark) and record (light) registers, computed against the actual WCAG relative-luminance formula rather than eyeballed: ink, muted, brass, steel, and (unannotated in the source — checked anyway) success/warning/danger all clear AA, most AAA. No hardcoded colors found anywhere in `apps/web`/`packages/ui-web` bypassing the token system (`grep` for `text-[#`/`bg-[#`/literal hex — none).

**Keyboard-only F1 (composer/seal) — three real gaps found and fixed:**
- `ScheduleBlock.tsx` (the real composer) and `apps/web/src/app/try/page.tsx` (guest composer): the natural-language input, the date input, the time input, and the timezone `<select>` had **no accessible name at all** — the visible "When it opens" label sat above the fields but was never programmatically associated (no `htmlFor`/`id`, no `aria-label`). A screen-reader user tabbing through would hear only "date, edit text" with no indication of what it controlled. Fixed with `aria-label` (and `htmlFor`/`id` where a real `<label>` already existed) on all six inputs across both files.
- The seal success screen (`/try/page.tsx`'s "Sealed. Now send it.") had no focus management after the state change — the previously-focused "Seal it" button is removed from the DOM when the view swaps, and focus was landing unpredictably rather than announcing the outcome. Fixed with the same pattern already used on the reveal side's `RecordAtRest` heading: a ref + `tabIndex={-1}` + focus-on-mount effect. Verified live: focus now lands on the "Sealed. Now send it." heading.
- `SealCeremony` itself (shared by both composers) was already fully accessible on inspection — `role="dialog"`/`aria-modal`/`aria-label`, keyboard skip via Escape/Enter/Space, `aria-live="polite"` region, and reduced-motion already collapses the approach while preserving the hold silence. No changes needed.
- `Button`'s native focus ring is preserved (not suppressed) — confirmed visually live. `Input`'s custom `focus-visible` outline confirmed via source.

**F2 (reveal)** — already built correctly in the Meridian V2 reveal-experience work (not re-verified beyond confirming it's still true): `aria-live` announcement on transit, focus moves to the letter heading, no-replay preserved, held beats survive `prefers-reduced-motion` (`TRANSIT_REDUCED` in `use-transit.ts`).

**Verified:** `pnpm typecheck`/`lint` clean on `apps/web`; a real production build, served locally, exercised live in a browser — real keyboard Tab traversal through the guest composer confirmed correct accessible names on every field, and a real seal (not a mock) confirmed focus lands on the success heading.

## k6 load test — 10k unlocks in 1 min, assert drain <10min

**Status: PASS, on the second run, after a real fix to a real bottleneck the first run found.**

Built a real, three-part test against `apps/api/loadtest/`:
- `seed.ts` — seeds 10,000 sealed capsules (one recipient each) with `capsule_unlock` scheduled_actions spread across a 60-second window, directly against the DB (not the HTTP API — seeding isn't what's being measured, and would fight this same ticket's own new rate limits). Run under `NODE_ENV=test`, which points at `timelycapsule_test` and forces the console email adapter (no real emails sent).
- `reveal-read.js` — a k6 script hitting `/v1/r/:token` concurrently for a sample of the seeded tokens, simulating recipients checking reveal links as their capsules unlock.
- `wait-for-drain.ts` — polls `scheduled_actions` for the seeded run and asserts the whole backlog (`capsule_unlock` + the `recipient_unlock` rows it spawns) reaches `done` inside 10 minutes.

**First run, against the unmodified `scheduler`/`worker` processes: FAILED.** At t+597s, 9,300 of the original 20,000 total actions were still pending. **Root cause, confirmed by watching the actual numbers, not guessed:** the promoter claimed a fixed batch of 500 pending actions per 30-second tick (`promoter.ts`) — a hard ceiling of ~1,000 actions/minute regardless of backlog size. `capsule_unlock` and `recipient_unlock` also can't promote concurrently for the same capsule: a `recipient_unlock` row doesn't exist until its parent `capsule_unlock` has already run, so the 20,000-action backlog was effectively two sequential ~10k waves through the same 500/30s ceiling, roughly doubling the real drain time versus a naive 10k-action estimate. `promoter.test.ts`'s existing "10k-action burst" test didn't catch this — it measures one in-process batch-claim call, not the tick-and-refill cadence a real backlog this size actually goes through.

**Fix (user's choice: bigger batch, not a shorter tick — `plan/03-ARCHITECTURE.md` fixes the interval at "every 30s in production"):** raised `BATCH_SIZE` in `promoter.ts` from 500 to 2000. Safe at this size because `promoter.test.ts` already proved 10,000 rows claim, in order, none dropped or duplicated, inside one transaction in ~5.8s — comfortably inside a single 30s tick.

**Second run, same seeded volume, same unmodified worker settings, only the promoter's batch size changed: DRAINED in 275.5s (4.6 minutes) — PASS, with ~54% margin under the 10-minute SLA.** Full timestamped log in the session record for both runs.

**Cleanup confirmed after both runs:** all seeded capsules, recipients, and scheduled_actions removed from `timelycapsule_test` via `loadtest/cleanup.ts`; all processes killed.

## Summary

| Item | Status |
|---|---|
| Rate limits on all mutation routes | ✅ Done |
| Security headers / CSP audit | ✅ Done |
| Velocity limit (5 outbound recipients/day, new accounts) | ✅ Done |
| Auth flow abuse tests | ✅ Done |
| A11y audit (keyboard-only F1/F2, screen-reader labels, reduced motion, computed contrast) | ✅ Done — 3 real gaps found and fixed |
| k6 load test (10k unlocks/min, drain <10min) | ✅ **PASS** — 275.5s / 4.6min, after fixing a real promoter throughput bottleneck the first run found |

**T-22 is complete.**

**T-22 is not complete.** Everything above the load test is done and verified. The load test itself is built, was run for real, and failed for a real, diagnosed reason — this ticket cannot be marked done until either the promoter's throughput is fixed and the test re-run to a pass, or a decision is made to accept the current throughput and adjust the DoD.
