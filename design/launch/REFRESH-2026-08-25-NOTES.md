# TimelyCapsule — Marketing Refresh (2026-08-25)

> Supersedes `design/launch/READINESS-REPORT.md` and the discarded, never-
> committed 2026-08-24 pass. This session's premise: the product is live,
> the previous asset pack's "screenshots" were never real product UI, and
> the copy had drifted formal/manifesto-heavy past the point of being fun
> to read. All three are addressed below.

---

## 1 · What this session actually found, that no prior pass had caught

**Every "real UI" screenshot in the previous launch pack (`screenshots/01-06`,
and by extension every social post built from them) was a crop of the
public marketing homepage's own demo/illustration components** —
`WriteAndSeal`, `ArrivalDemo`, `OrbitScrub` — not the authenticated
composer, dashboard, or reveal page. `design/.build-launch.mjs` only ever
navigates to `http://localhost:3001/`; it has no login path and never did.
This was traced by reading the capture pipeline in full, not assumed.

Confirmed independently: none of it was *dishonest* — the marketing page's
demo components are themselves careful, real-token-driven reproductions,
labelled as demos in-product — but "screenshots/03-composer.png" captioned
as if it showed the real composer was, in fact, a crop of a landing-page
illustration of the composer. This pass replaces those with the real
authenticated app and the real public reveal page, captured hands-on this
session (§3).

## 2 · Theme fix (prerequisite, done earlier this session — see `plan/PROGRESS.md`)

Light/paper confirmed as the unconditional default; a hydration-mismatch
bug that was silently reverting logged-in users to light on marketing pages
regardless of their stored dark preference was found and fixed; a
cross-instance theme-toggle desync bug was found and fixed; an
authenticated-route redirect regression introduced by the first fix was
found and fixed. Full account in `plan/PROGRESS.md`'s 2026-08-25 entry.
This is the reason every asset below is safely light-mode: the product
itself now reliably defaults there.

## 3 · How the real screenshots were actually captured

Three mechanisms, all read-only against the real running app, all
dev-only/NODE_ENV-gated:

1. **A dev-only session-token seed** (`apps/web/src/app/layout.tsx`,
   `DEV_SESSION_SEED_SCRIPT`) — reads `__seed_at`/`__seed_rt` query params
   and writes them to `localStorage` before React mounts, so a one-shot
   headless Chrome screenshot (no click/type capability) can land on an
   authenticated page in a single navigation. Used for the dashboard
   ("waiting") capture.
2. **The existing `dev/schedule` composer harness**, extended with a
   `?movement=` query param (address/compose/seal) and a
   `SealMovement`-level `defaultConditionsOpen` prop (both additive, opt-in,
   every real caller leaves them unset) — used for the composer and
   before-sealing captures. Its specimen letter ("Dear Amara...") is
   unchanged, pre-existing, and was already a declared specimen.
3. **The real public `/c/[token]#k=...` reveal link** — needs no auth at
   all by design (the decryption key lives in the URL fragment), so this
   one was the simplest: sealed a real test capsule to a real recipient
   address, ran the actual scheduler + worker processes once to promote
   and unlock it for real, then screenshotted the live reveal page —
   including a real reply sent through the real reply flow.

New one-off script: `design/.capture-marketing-raw.mjs` (uses its own
Chrome profile dir, not `.build-launch.mjs`'s, so none of this leaks into
that script's own homepage capture). Raw captures in
`design/launch/.raw/*.png`; crops in `design/launch/.raw/crops/*.png`,
cut with Pillow rather than the existing background-position re-render
trick — same output location, `bare()`/`framed()` don't care how a crop
file was produced.

Test data cleanup: the throwaway account, its two test capsules, and the
scheduler/worker processes started to promote them are all cleaned up
(§7). Nothing test-related was left running or in the database.

## 4 · Capability verification (hands-on, this session, against the real dev server)

| Capability | Verdict | Evidence |
|---|---|---|
| Composer (Address/Compose/Seal) | Real, working, light-themed | Walked a full real capsule through all three movements as an authenticated user |
| Sealing | Real | Real `POST /capsules/:id/seal` → 200, real "Sealed. See you on \<date\>." toast |
| Waiting / dashboard | Real | Real dashboard row, real Dual Clock component, `TRAVELLED`/`REMAINING` correct |
| Enclosures (photo, voice note, place) | Real | Composer's "Enclose something" menu confirmed; voice recorder UI (`Start recording`) confirmed real but not capturable headlessly (needs a live mic — see video recommendations) |
| One reading only | Real, verified destroying behavior (matches `plan/PROGRESS.md`'s earlier verified fix) | Live Conditions panel copy confirmed: "The record is destroyed once they have read it. There is no copy, and this cannot be undone." No screenshot — the panel needs a click, which headless capture can't do; used as a typographic post instead (real quoted copy) |
| Reveal / transit | Real | Sealed a capsule with a near-future unlock time, ran the real scheduler + worker, watched it flip from locked to opened for real |
| Replies | Real, real E2E round-trip | Sent a real reply through the real reveal page's "Write back" flow, confirmed it appears under "What was written back" |
| Guest media (no account) | Real | `/try` confirmed: "Optional — a photo, or a voice note. 5 MB guest allowance" |
| Guest composer (`/try`, no account) | Real | Full Address → Compose flow confirmed, "No account needed. Up to a year out — accounts go to fifty years." |
| Decade scrubber (landing page `OrbitScrub`) | Real, unchanged | Confirmed still live on `/`; no `?scrub=` capture hook currently wired (was in the discarded pass, not rebuilt this session — see video recommendations) |

## 5 · Asset audit

**Kept, unchanged:** `x/header.png`, `x/post-mark.png`, `x/post-dualclock.png`,
`x/post-decade.png`, `x/post-kept.png`, `x/post-held-beat.png`,
`instagram/01-the-mark.png`, `02-two-registers.png`, `03-dual-clock.png`,
`04-a-decade.png`, `05-held-beat.png`, `06-hallmark.png`, `07-refusals.png`,
`08-kept.png`, all 6 highlight covers, both avatars, `artwork/*` (quote
cards, waiting cards, launch-day — no date claims, no product-UI
dependency), `og/og-pricing.png`, `og/og-help.png`, `og/og-reveal.png`.

**Regenerated:** `og/og-home.png` — the *actually installed, live-in-
production* Open Graph image at
`apps/web/src/app/(marketing)/opengraph-image.png` still read "Sealed on
your device · opening 2026" (a real bug, independent of the theme work,
reintroduced when the discarded 2026-08-24 pass was rolled back — this
session found and fixed it again, reinstalled, verified byte-identical
between the design source and the installed file).

**New (real UI, this session):** `x/post-composer.png` +
`instagram/10-composer.png`, `x/post-sealing.png` +
`instagram/11-sealing.png`, `x/post-waiting.png` +
`instagram/12-waiting.png`, `x/post-reveal.png` +
`instagram/13-reveal.png`, `x/post-replies.png` +
`instagram/14-replies.png`, `x/post-one-reading.png` (typographic) +
`instagram/15-one-reading-only.png` (typographic).

**Retired (excluded from the calendar, not deleted from disk):**
`instagram/09-the-date.png`, `artwork/coming-soon.png` (both said "opening
2026" / "not yet" — false now), `og/og-capsule-shared.png` (still no public
route to attach it to, unchanged finding from the original pack).

**Old, now-inaccurate real-UI screenshots retired:** `screenshots/01-06`
(the old `.raw/crops`-based set) — these were the marketing-homepage-demo
crops described in §1. `screenshots/05-hero.png` (the one genuinely
accurate one — it really is the live landing page) is kept, held in
reserve. The other five are superseded by the new real-UI posts above, not
separately kept, to avoid two competing "composer" or "reveal" images in
the same pack.

## 6 · Copy rewrite

Full rewrite, not a polish pass — see `design/launch/COPY.md`. Away from
the previous "institution / notice board of a standards body" register
(still respecting the underlying constitution: no exclamation marks, no
emoji, no "we" for the institution, no "just", no manufactured urgency, no
testimonials — all verified programmatically, zero violations found across
every bio/pinned/post) and toward shorter, wittier, more specific lines
grounded in real, verified product behavior rather than abstract design
philosophy. Eleven posts, down from the previous thirteen-slot calendar —
a smaller, stronger set per instruction, with the composer/sealing/
waiting/reveal/replies/one-reading-only sequence now demonstrating the
actual product journey instead of only its visual identity.

## 7 · Cleanup performed

- Throwaway account `marketing-demo-20260825@timelycapsule.com` and its two
  test capsules deleted from the dev database.
- `pnpm dev:scheduler` / `pnpm dev:worker` processes (started to promote
  the reveal-demo capsule for real, since neither runs by default in local
  dev) stopped.
- Browser `localStorage` reset to empty.

## 8 · What's still blocked or deliberately not produced

1. **Voice notes has no asset**, same gap the discarded pass also flagged
   and for the same reason: the recorder UI is real, but a synthetic mic
   capture would be exactly the "fake UI" the constitution rules out, and
   this session's tooling has no live microphone to record with. Needs a
   human, once, for ~15 seconds.
2. **The decade-scrubber video/GIF** wasn't rebuilt this session (the
   capture harness for it existed only in the discarded 2026-08-24 pass,
   which mounted it on dark theme and was rolled back along with
   everything else in that pass). The underlying `OrbitScrub` component is
   unchanged and still capturable the same way; just didn't fit this
   session's scope alongside everything else above.
3. **The full write → seal → wait → reveal journey as one stitched video**
   — every individual piece exists as a screenshot now; nobody has
   recorded the whole arc back to back.
4. **`brand/IDENTITY.md §8`'s "name is provisional" language** reads as
   overtaken by events (the product has shipped and run live under this
   name for weeks) but wasn't edited — out of this pass's authority per
   instruction not to reopen brand identity.
