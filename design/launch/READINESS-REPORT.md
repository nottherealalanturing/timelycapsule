# TimelyCapsule — Launch Readiness Report

> Final pass over the launch pack: engineering fixes, then a full audit of the
> publishing package. Closes the launch-pack stream — see the note at the foot.

---

## 1 · Assets produced

**46 files** in `design/brand/` (Version 1 identity: mark, wordmark, lockups,
icons in both registers, maskable variants, favicon.ico, social avatars) —
unchanged this session except the favicon.ico fix (§2).

**40 files** in `design/launch/final/` — the frozen, approved set:

| Group | Count | Contents |
|---|---|---|
| `x/` | 6 | Header, pinned/Tweet-1 image, dual-clock, decade, held-beat, kept |
| `instagram/` | 15 | 9-post grid + 6 highlight covers |
| `screenshots/` | 6 | Real UI, captured and framed |
| `artwork/` | 7 | Coming soon, launch day, 3 quote cards, 2 waiting cards |
| `og/` | 5 | Open Graph cards |
| — | 1 | `FROZEN-AT.txt`, the freeze manifest |

**Copy deck** — `design/launch/COPY.md`, 465 lines, fully audited (§3).

**Product wiring** — `apps/web/src/app/`: `favicon.ico`, `icon.svg`,
`apple-icon.png`, `manifest.ts`, and four route-level `opengraph-image.png`
files (home, pricing, help, reveal), all verified live against the running
dev server.

---

## 2 · Engineering fixes made this pass

Every item below was a genuine defect found during verification, not a
style choice.

1. **The launch builder couldn't run end-to-end.** My own cleanup had deleted
   `design/launch/.raw/crops/`, which the marketing-screenshot section reads
   at build time. Folded capture *and* crop into `design/.build-launch.mjs`
   itself (`ensureRawCaptures()`) — a bare `node design/.build-launch.mjs`
   now captures the live app, crops six regions, and renders all 38 assets
   with zero manual steps. Verified by deleting `.raw/` entirely and
   re-running from nothing: 110 seconds, 38/38 assets.
2. **The raw screenshots are no longer a fragile hand-run artifact** — same
   fix as above. `try.png`/`specimen.png`/`pricing.png` (three exploratory
   captures from the original session) were not restored: nothing in the
   builder or the copy deck ever referenced them. Confirmed via grep before
   leaving them out — they were dead files, not a dependency.
3. **AA contrast failure fixed.** `artwork/coming-soon.png`'s caption used
   `--i-muted` at `opacity:.75`, which computed to 3.99:1 against the dark
   ground — below the 4.5 AA threshold. Removed the opacity override; the
   verified token alone measures 6.26:1. Confirmed by computing WCAG relative
   luminance directly, not by eye.
4. **Icons and manifest installed into the Next app** — previously built in
   `design/brand/` but never wired: `favicon.ico`, `icon.svg`, `apple-icon.png`
   at the app root; `icons/icon-{192,512}.png` and the maskable variants in
   `public/`; `app/manifest.ts` referencing them, using the paper ground
   (current shipped default) for `theme_color`/`background_color`.
5. **A real bug surfaced by that wiring, and fixed at the source:**
   Turbopack rejected the hand-assembled `favicon.ico` outright — *"the PNG
   is not in RGBA format"*. The embedded PNGs were RGB (opaque, no alpha
   channel), which Chrome's headless screenshot produces by default and which
   at least one real consumer refuses. Fixed in `design/.build-brand.mjs`'s
   ICO-assembly step: the three embedded PNGs are now re-encoded to true
   RGBA before packing (via Pillow, already available), while the standalone
   `favicon-*.png` files are left alone since browsers accept them either
   way. Verified byte-for-byte: all three embedded entries now report
   colour type 6 (RGBA), and the dev server's `/manifest.webmanifest` and
   `/` both went from `500` to `200`.
6. **Open Graph images wired into Next metadata** as route-segment
   `opengraph-image.png` files (the file-convention approach, which works
   regardless of whether the page is a server or client component — the
   reveal page is `'use client'` and has no metadata export, so this was the
   only wiring option available for it). Added `metadataBase` to the root
   layout so the generated `og:image` URLs resolve absolutely. Verified live:
   all four routes (`/`, `/pricing`, `/help`, `/c/[token]`) emit correct,
   distinct `og:image` tags with the right dimensions.
7. **The approved set is now frozen** at `design/launch/final/` via
   `node design/.build-launch.mjs --freeze` — a copy step the generator never
   runs on its own, so a later unreviewed change to `.build-launch.mjs`
   cannot silently alter something already shipped. `COPY.md`'s 35 asset
   references were repointed at `final/` and re-verified to exist.
8. **A second-order bug from my own recovery work, caught and fixed before it
   shipped:** restoring the interrupted brand rebuild required regenerating
   the full raster set, which — at the original ~40-second-per-asset rate
   inherited from `design/.build-brand.mjs`'s unfixed `raster()` function —
   would have cost 20 minutes. Backported the same file-polling fix already
   used in `build-launch.mjs` (watch the output file for a stable size
   instead of waiting on the Chrome process, which never exits on its own).
   Full brand rebuild now takes 61 seconds. Also added `--ico-only` and kept
   `--sheet-only`, so neither the icon fix nor a contact-sheet review ever
   needs to pay for a full raster pass again.
9. **A missing X asset, found during the calendar audit:** Tweet 2 referenced
   `screenshots/01-dual-clock.png`, a 4:5 image — exactly the "letterboxed in
   a timeline" failure the pack's own rule exists to prevent (every other
   tweet already had a dedicated 16:9 variant). Built `x/post-dualclock.png`
   from the same component functions already used for the other X posts.

---

## 3 · Publishing-package audit results

Every check below was run programmatically against the actual file, not
inspected by eye.

| Check | Result |
|---|---|
| Voice (exclamation marks, first-person "we/our/us", "just", emoji) | **1 violation found and fixed** last session ("our words" → "the company's words"); **0 violations** on this pass across all 28 fenced copy blocks |
| X character limit (280) | **4 of 5 numbered tweets were over** — up to 320 characters. All five rewritten, none copy-pasted from Instagram; tightest now has 18 characters of headroom, others 75–105 |
| X bio character count | Claimed 133, actual 133 — correct |
| Instagram bio character count | Claimed 118, actual 120 — **off by 2, corrected** |
| Duplicated messaging, X vs Instagram | **5 of 5 numbered tweets were near-verbatim copies** of their Instagram captions. Rewritten with distinct wording and a different emphasis per platform; documented inline in `COPY.md` so the reasoning survives the next edit |
| Duplicated messaging within Instagram's 9 posts | Checked pairwise (6-word n-gram overlap) — none found |
| Duplicated messaging, Instagram vs screenshot captions | **1 found** (a shared sentence between "Two registers" and the reveal-screenshot caption) and rewritten |
| Hashtags | 6 total across the whole deck (`#kept`×3, `#designsystem`, `#motiondesign`, `#typography`) — none generic or spammy, none exceed the stated "max 2 per post" rule. `#kept` recurring 3× is deliberate (the brand's one word), not filler |
| Links | `timelycapsule.com/opening` used consistently everywhere — one canonical form, no `http://`/`www.` variants found |
| Handles | `@timelycapsule` plus four documented fallbacks, used consistently; no typos found |
| Every image referenced by the copy actually exists | **35 unique paths checked, 0 missing** — including a self-inflicted one caught mid-audit (a `sed` rewrite briefly repointed the wrong caption at the wrong file; found by re-running the same existence check immediately after, fixed before freezing) |
| Posting calendar references real assets | Original calendar (`20-LAUNCH-PACK.md` Part 7) referenced asset IDs (`P01`–`P10`, `S01`–`S06`, `M01`–`M06`) that don't exist. **Replaced** with a 13-slot calendar in `COPY.md` itself, every one of its 25 asset references verified against `design/launch/final/` |
| Platform image shape (X wants 16:9, not 4:5) | **1 violation found** (Tweet 2) and fixed — see §2.9 |

---

## 4 · Remaining product dependencies

Real, and outside a launch pack's power to close:

1. **No Open Graph route exists for a "capsule shared" card.** `og-capsule-shared.png` was built speculatively but there is no public route to attach it to — only the content-blind reveal (`/c/[token]`) exists, and it already has its own, deliberately emptier, image. Left unwired rather than forced onto a route it doesn't describe.
2. **`timelycapsule.com/opening` does not exist.** Both bios and the link field point at it. Building this page is outside a social-asset pass.
3. **The Open Graph wiring in §2.6 depends on `NEXT_PUBLIC_SITE_URL` being set correctly in production** (`apps/web/src/lib/site.ts` falls back to `https://timelycapsule.com`, which resolves absolute image URLs correctly only if that's the real deployed domain).

---

## 5 · Remaining marketing dependencies

1. **The name.** `brand/IDENTITY.md §8` still records it as the largest unresolved brand risk; the wordmark is provisional. Registering any handle is the first irreversible public step. Unchanged recommendation: claim `@timelycapsule` and the four fallbacks defensively, publish nothing, until the name is settled.
2. **The opening date.** Every bio, the pinned tweet, IG post 9, and two artwork pieces say "2026" — a year, deliberately, because a full date isn't confirmed. The calendar's weekday slots are relative (Wk1 Mon…) for the same reason. This is the one placeholder that must be resolved before Slot 1 posts, not before the whole calendar is built.
3. **Handle and domain availability were never checked** against the live platforms — this report only verifies the pack's internal consistency, not external registration status.

---

## 6 · Anything that would prevent publishing today

**Nothing, conditional on the two items in §5.** Every asset the copy deck
references exists in the frozen, reviewed set. Every caption passes the voice
rules. Every X post fits the platform's character limit. No caption
duplicates another word-for-word. The calendar points at real files. The
product-side icon, manifest, and Open Graph wiring is live and verified
against the running app.

The two open items are not defects in the pack — they are founder decisions
(the name, the date) that were flagged from the first draft and were never
this pack's authority to resolve.

---

## The launch pack is considered complete and frozen.

No further engineering or copy work is recommended on it. `design/launch/final/`
is the artifact to publish from; `design/launch/COPY.md` is the copy to paste
from. Re-open this stream only if the product or the brand identity itself
changes — a new component, a new register rule, a renamed product — not to
polish wording or regenerate images that already pass every check above.
