# Implementation Alignment Report

> Reconciles `plan/PROGRESS.md` + `plan/05-BUILD-PLAYBOOK.md` against the
> decisions in `design/00`–`10`.
>
> **This is a review, not a roadmap.** `PROGRESS.md` is unmodified and Fable owns
> it. Recommendations for Fable are collected in the final section.
>
> Codebase claims below were verified against the repo, not inferred from the
> plan text — the two had drifted in three places.

---

## 0 · Position

- **T-01 → T-20 are done.** Stages A, B, C complete; Stage D half complete.
- **T-21 (Marketing site) is next**, per `PROGRESS.md` line 6.
- Remaining: T-21, T-22 · Stage E (T-23–29, mobile) · Stage F (T-30–36) ·
  Stage G (phase 2).

**The single most consequential fact in this report:** T-21 is next, and the
strategy work invalidated the visual system T-21 would be built on. Building it
now guarantees rebuilding it. See §3.

---

## 1 · What remains valid

Most of the plan survives. The strategy work changed *how* things look and
*which* notifications exist — it did not change the architecture of the core
loop.

| Ticket | Status | Why it survives |
|---|---|---|
| **T-22** Hardening | Valid, scope grows | Rate limits, CSP, load test all unaffected. A11y scope expands — see §9 |
| **T-23** Mobile shell | Valid | Navigation, secure storage, deep links are register-agnostic |
| **T-24** Mobile ports | Valid **except sound** | See §5 — a direct contradiction |
| **T-25** Composer + offline | Valid | Offline drafts, resumable uploads unaffected. `09 §IX` adds requirements, doesn't remove any |
| **T-26** Push | Valid, scope shrinks | Transport is fine; the *number of sends* collapses — see §5 |
| **T-27** Apple + biometric | Valid | Untouched by strategy |
| **T-28** Store readiness | Valid **except onboarding** | See §5 |
| **T-29** Share extension + widget | Valid, and now more important | The widget is a Dual Clock on the home screen — `07 §III` device 2 |
| **T-30** Billing | Valid | `04`'s payment policy and `07`'s "delivery never gated by payment" already agree |
| **T-33** Security completeness | Valid | 2FA, link rotation, report queue all unaffected |
| **T-34** Admin panel | Valid | Metadata-only inspector already correct per `03 §18` |
| **T-36** Launch checklist | Valid | Content changes; structure holds |

**The E2E/zero-access architecture is entirely unaffected.** Nothing in
`00`–`10` asks for a change to `packages/crypto`, the capsule state machine, or
the `scheduled_actions` model. That is a good sign: the strategy work was
downstream of the architecture, not in conflict with it.

---

## 2 · Assumptions now outdated

### 2.1 · The Meridian visual spec — **the big one**

`plan/02-UX-DESIGN.md §6` defines the design system that T-06 through T-18 were
built against. It is superseded by `05-IDENTITY-DECISION.md` and `07`. Verified
in the codebase:

| Shipped | Decision | Source |
|---|---|---|
| `Fraunces` + `Inter` via `next/font/google` (`apps/web/src/app/layout.tsx:2`) | **Source Serif 4 + IBM Plex Sans + IBM Plex Mono**, self-hosted, all SIL OFL | `05 §Typography` (Pairing C) |
| Single-register token set in Tailwind `@theme inline` | **Two registers** — instrument (dark/sans) and record (paper/serif) | `05` · Gate 1 |
| Original ramp | **Corrected ramp** — the original failed WCAG at 2.72 and 1.97 | `05 §Temperature ramps` |

**Why it matters:** this is not a re-skin. The Dual Register changes which
surfaces are which colour *and* which typeface, so it touches component APIs, not
just token values.

### 2.2 · Three shipped components violate the Motion Constitution

Verified, not theorised:

| File | Violation | Rule |
|---|---|---|
| `packages/ui-web/src/Skeleton.tsx:8` | `animate-pulse` | "No skeleton pulse" — `07 §VI.3` |
| `packages/ui-web/src/Button.tsx:51` | `animate-spin` spinner | "No spinners" — `07 §VI.3`, `07 §XVI` |
| `packages/ui-web/src/StateChip.tsx:41` | `animate-pulse` on `unlocked` | Nothing may read as loading; also pulses a *terminal* state |

Small fixes, but they are in `packages/ui-web` — every surface inherits them, and
mobile will copy the patterns at T-24 if they are not corrected first.

### 2.3 · "OG cards correct" (T-21 DoD) is unreachable as written

T-20 deleted `(reveal)/c/[token]/opengraph-image.tsx` because `next/og` pulls
~1.5 MB of wasm and pushed the Worker over Cloudflare's 3 MiB free-tier cap
(`PROGRESS.md` line 10). Current usage: **2316 KiB of 3072 KiB — ~756 KiB
headroom**, into which T-21's entire marketing site and three self-hosted font
families must fit.

**Recommendation: static per-capsule-*type* OG images, not dynamic per-token
renders.** Two reasons beyond bundle size: dynamic per-capsule images risk
leaking metadata about a sealed capsule, and `07 §XVI` forbids any preview of
sealed content anywhere. The cheap option is also the correct one.

### 2.4 · The playbook says trustee tables exist. They do not.

`05-BUILD-PLAYBOOK.md` T-37: *"Legacy & trustees (F5/F6 + tables already
schema'd)"*. The built schema has 29 tables and **none of them is a trustee or
custodian table.** T-02 scoped itself to "19 core Stage A–C tables"; the Stage
D–F tables were correctly deferred.

`capsules.legacyConfig` jsonb does exist with `trigger: "trustee"` as a value, so
the *capsule side* is anticipated — but there is nothing to point it at. This
matters because `09 §XI.5` makes inheritance a trust barrier, not a phase-2 nicety.

---

## 3 · Reprioritisation

### 3.1 · The design system must precede T-21 — **highest-value change**

**Current:** T-21 (marketing) is next. **Recommended:** design system refresh
first.

**Why:** T-21 builds the landing page, pricing, three occasion pages, legal pages
and ten help articles — the largest volume of new UI remaining on web. Built on
Fraunces/Inter and the single-register token set, all of it is rework the moment
the refresh lands. `07 §X` also redefines what the landing page *is* (a thesis
and a survival argument, not a feature tour), so T-21's content brief changes
independently of its styling.

Doing T-21 first spends the most effort on the most-invalidated ticket.

### 3.2 · Gate 5 before any UI work

`07 §XV.3` established that Gate 1 validated the register transition **for the
creator**, who has learned the instrument register over years. The recipient
arrives cold, from a link, on a phone, having never seen it. For them there is no
register *change*.

Since `09 §VIII` then established that the recipient path is the **acquisition
funnel** and not merely an accessibility courtesy, the cold-recipient experience
is now both the least validated and the most commercially important surface.

**Gate 5 should run before the design system refresh**, because a failure there
changes what the design system needs to express.

### 3.3 · The annual rite moves out of phase 2

Currently Stage G T-39 ("Recurring series"). `09 §IV` argues it is the only
calendar anchor available to us and the only honest answer to a frequency problem
that no amount of design solves — and that it fixes four of the five failed
tradition-audit rows at once.

**It is also cheaper than it looks.** The `action_kind` enum already contains
`series_spawn` (`apps/api/src/db/schema/enums.ts`), so the scheduler's vocabulary
anticipates recurrence. The work is handler + UI, not a schema migration.

**Recommend: promote a narrow slice of T-39 — the annual rite only — to Stage D,
before T-21.** Not the full recurring-series feature.

### 3.4 · Deliverability work belongs in Stage D, not later

`09 §I` is the strongest finding in the strategy work: 80–90% of physical time
capsules are never recovered, and the cause is almost never container failure —
it is that nobody remembers the capsule exists. Our equivalent is a dead
recipient address.

This is not a design concern and cannot be deferred to phase 2, because every
capsule sealed between now and then accumulates the risk.

---

## 4 · New tasks required

Each tied to the decision that creates it.

| # | Task | Why | Source |
|---|---|---|---|
| **N1** | **Recipient contact routes** — multiple routes per recipient, with verification state and priority | A single address captured once is a 15-year bet on an email account | `09 §I` |
| **N2** | **Address re-verification job** — periodic, low-key, doubling as proof of life | Detects a dead route ~10 years before it matters, while someone is alive to ask | `09 §I` |
| **N3** | **Route-dark escalation** — notify the creator when a recipient route stops resolving | Without it, N2 detects failure and does nothing | `09 §I` |
| **N4** | **Account custodian** — named person, inheritance path | Nobody can inherit an account in a product about outliving people | `09 §XI.5` |
| **N5** | **The annual rite** | The only calendar anchor available to us | `09 §IV` |
| **N6** | **Design system refresh** — verified tokens, Pairing C, dual register, corrected ramp | `plan/02 §6` is superseded | `05` |
| **N7** | **Ceremony scaling** — held beat proportional to duration × relationship | Uniform ceremony taxes trivial capsules out of existence and cheapens serious ones | `09 §XIV.2` |
| **N8** | **Short-form capsule path** — deliberately un-ceremonious | The Future Self is the on-ramp archetype and is currently unserved | `09 §VI`, `§XIV.3` |
| **N9** | **Past-tense delivery copy sweep** — audit every template and notification | We never know whether the sender is alive; present tense to the bereaved is unrecoverable, and we would never find out | `09 §VI` |
| **N10** | **Motion-constitution fix** in `packages/ui-web` | Three shipped violations, inherited by every surface | `07 §VI`, §2.2 above |

**N9 is the cheapest high-value item in this report.** It is a copy audit across
existing templates, costs almost nothing, and prevents the worst thing the
product can do.

**N1–N3 are the only genuinely architectural additions.** See §13.

---

## 5 · Tasks to remove or cut down

### 5.1 · T-35 — remove most of it

Currently: *"Monthly digest job, seal-anniversary memory notices, lifecycle: D0
welcome/first-seal nudge, D3 prompts, pre-unlock hype, post-open reply nudge, 60d
win-back."*

`07 §XI` permits **exactly four sends in a decade**: sealed, proof of life,
approach, delivered. Measured against that:

| T-35 item | Verdict | Why |
|---|---|---|
| Monthly digest | ❌ Remove | Recurring engagement mail; not one of the four |
| **Seal-anniversary memory notices** | ❌ **Remove — worst offender** | Surfaces a memory without consent, violating Interaction Constitution 3. Also the exact pattern that harms the bereaved |
| D0 welcome / first-seal nudge | ⚠️ Reduce | The *sealed receipt* is permitted. A "nudge" is not |
| D3 prompts | ❌ Remove | Nagging |
| Pre-unlock hype | ⚠️ Rename + keep | Permitted as the factual **approach** notice. "Hype" is the banned register |
| Post-open reply nudge | ❌ Remove | Prompt at the emotional peak — `07 §II.7` |
| 60d win-back | ❌ Remove | Re-engagement, explicitly banned in `07 §XVI` |

**T-35 should be replaced by N2/N3** (proof of life and escalation), which is
what the ticket's slot in the plan should actually be spent on.

### 5.2 · T-32 — delete the achievements half

*"Achievements engine (keys from 01 §4.19) + earned toasts + profile shelf."*

`07 §XVI` bans streaks, badges and gamified waiting outright. `09 §VIII` names
the real growth loop as arrival → new creator, which is unrelated to achievements.

Referrals may stay, minus any referral prompt at an emotional moment
(`07 §XVI`) — so no referral CTA in the reveal, the composer, or the seal
confirmation.

### 5.3 · T-28 — remove the 3-step onboarding

`07 §XI`: *"There isn't one. No tour, no checklist, no progress meter, no sample
capsule."* The first act is composition. What T-28 owes instead is the
master-key / recovery-kit moment handled with total clarity — which is the one
genuinely unfamiliar concept, and where T-20's live testing already found two
real dead ends (`PROGRESS.md` line 13).

### 5.4 · T-24 — remove the sound

*"In-app reveal ceremony with haptics (seal thud/unlock crack)."*

"Thud" and "crack" are audio. `07 §VII` reverses `06`'s earlier "default off"
position to a permanent **never**: a reveal happens on an unknown device in an
unknown room — a commute, an office, a ward, a funeral — and we have no licence
to make noise in that space.

**Keep:** haptics on the **seal**, on the creator's own device, in an interaction
they initiated. **Remove:** anything on the unlock/reveal path, and all audio.

---

## 6 · Tasks to split

### 6.1 · T-21 → three tickets

The strategy work pulled T-21's parts apart. They now have different owners,
different risk and different dependencies.

- **T-21a · The thesis page.** Landing only. Depends on the design system
  refresh, and on the "compress the wait" interaction — the only permitted
  spectacle in the product (`07 §X`).
- **T-21b · Trust evidence.** The survival argument: escrow, export guarantees,
  what happens if the company dies. `07 §X` calls this the most persuasive
  section on the page and notes most competitors will not dare. It is
  research-and-writing work, not design work, and it can proceed in parallel.
- **T-21c · Legal, help, occasion pages.** Ten help articles, terms, privacy,
  three occasion pages. Nearly independent of the visual refresh, so it can start
  immediately.

**Also: drop testimonials from T-21 entirely.** `07 §X` — we have not kept
anything yet, and claiming otherwise on a trust product is the worst available
trade.

### 6.2 · T-22 → two passes

Security/load hardening and the accessibility pass have become different-sized
jobs. `07 §XIII` reframes accessibility as the trust argument — a product whose
premise is *this will reach the person you intend* cannot ship a reveal that
fails a screen reader. Combined with `09 §VIII` making the recipient path the
funnel, **T-22's a11y half now deserves its own ticket**, focused on the
unauthenticated reveal path.

### 6.3 · N1–N3 should be one ticket, not three

They are worthless individually: routes without verification decay silently,
verification without escalation detects failure and does nothing.

---

## 7 · Dependencies changed

| Dependency | Was | Now | Why |
|---|---|---|---|
| T-21 → design system | Independent | **Blocked by N6** | Otherwise all of T-21 is rework — §3.1 |
| N6 → Gate 5 | n/a | **Blocked by Gate 5** | A cold-recipient failure changes what the system must express — §3.2 |
| T-24 → `packages/ui-web` | Copies web patterns | **Blocked by N10** | Mobile will inherit the three motion violations |
| Annual rite → scheduler | Phase 2 | **Unblocked now** | `series_spawn` already exists in the enum |
| N4 custodian → T-37 | "tables already schema'd" | **Needs a migration** | No trustee table exists — §2.4 |
| T-35 → N2 | Digest infrastructure | **Replaced** | §5.1 |
| Font loading → bundle budget | Not tracked | **Live constraint** | 756 KiB headroom on a 3 MiB cap — §2.3 |

---

## 8 · Prototype gates before implementation

In recommended order. Gates 1–4 come from `05`; Gate 5 from `07 §XV.3`.

| Gate | Status | Why it must precede implementation |
|---|---|---|
| **1 · Register transition** | ✅ **Passed** (`06`) | Two constraints emerged: record is an object never a background; registers never overlap in time |
| **5 · Cold recipient path** | ⬜ **Run first** | The transition is unvalidated for the person it belongs to, on the surface that is also the acquisition funnel |
| **2 · Serif-led UI at density** | ⬜ Required before N6 | If Source Serif 4 fails at density, Pairing C falls back to Pairing A — a token-level change if caught now, a rewrite if caught later |
| **4 · The Dual Clock** | ⬜ Required before N6 | Carries more brand than the logo, and `09 §XIV.5` added the shifting-weight refinement, which is unproven |
| **3 · Corrected ramp on real hardware** | ⬜ Before N6 ships | Computed values clear AA; cheap Android LCDs were never tested |

**Gate 4 is now larger than `05` scoped it.** `09 §XIV.5` established that equal
weighting breaks at both ends — *"Travelled: 0 days"* on day one of a decade is
demoralising, and elapsed is irrelevant in the final hours. The gate must prove
the weighting shift, not just legibility across magnitudes.

---

## 9 · Which decisions affect engineering

1. **Deliverability (N1–N3)** — `09 §I`. New schema, new scheduler handler, new
   escalation path. The largest engineering item created by the strategy work.
2. **No spinners, no skeleton pulse** — `07 §VI.3`. Three concrete fixes in
   `packages/ui-web`; also means genuinely slow surfaces become performance bugs
   rather than design problems.
3. **Held beats survive `prefers-reduced-motion`** — `07 §VI.4`. Unusual, and
   engineers will "fix" it. The silences are timing, not motion.
4. **CSS-only reveal, no GSAP** — `06`. Gate 1 built the full sequence from one
   scalar. Removes a dependency the plan anticipated.
5. **Bundle budget is a live constraint** — 756 KiB headroom. Self-hosted fonts
   must be subset; T-21 must be measured, not assumed.
6. **A11y is the trust argument** — `07 §XIII`. `aria-live` on reveal, focus
   management, computed contrast (never estimated — `05` shipped a 2.72 by
   eyeballing).
7. **Recurrence must live in `scheduled_actions`** — the annual rite cannot be a
   cron. `CLAUDE.md` hard rule: `scheduled_actions` is the only source of truth
   for future work.

---

## 10 · Which decisions affect design

1. **The design system refresh (N6)** — `05`. Two registers, Pairing C, corrected
   ramp.
2. **Ceremony scaling (N7)** — `09 §XIV.2`. Consequence is continuous, not binary.
3. **A tonal register for the ordinary capsule (N8)** — `09 §XIV.3`. Nothing in
   the identity currently makes room for a light capsule; this is a hierarchy
   question, not a screen question, so it must be resolved *inside* N6.
4. **The archive is a shelf, not a queue** — `09 §XII`. A list of pending items
   with dates is a task manager, which is the opposite of the intended feeling.
   Affects T-12/T-17's existing surfaces.
5. **Accumulation must be visible** — `09 §III`. Currently unrepresented anywhere.
6. **No onboarding** — `07 §XI`. Affects T-28 and the web first-run.
7. **The five signature devices** — `07 §III`. Anything not serving one of them
   is decoration.

---

## 11 · Which decisions affect product

1. **The annual rite (N5)** — `09 §IV`. The only calendar anchor available.
2. **Custodian / inheritance (N4)** — `09 §XI.5`.
3. **Four notification sends in a decade** — `07 §XI`. Guts T-35 (§5.1).
4. **No achievements** — `07 §XVI`. Cuts T-32 (§5.2).
5. **Death-triggered release must be custodian-confirmed, never inferred** —
   `09 §IX`. A false positive delivers a dead person's final letters to their
   living family. This constrains T-37 permanently and should be written into the
   ticket now, while it is still cheap.
6. **Public/historical capsules are a different product** — `09 §IX`. Not
   zero-access, different key architecture. Affects Stage G T-40's dead-drop
   capsules; must not be quietly blended into the private product.
7. **Instrumentation will over-report health** — `09 §V`. Four of six churn
   reasons are invisible to analytics. Affects T-36's PostHog dashboards:
   *deliveries succeeded* is not *deliveries received*.

### One correction to my own strategy document

`09 §XIV.4` raised a "right of withdrawal" as an open founder decision. **It is
already built.** `apps/api/src/modules/capsules/state-machine.ts:46` implements
`assertCanWithdraw` — pre-unlock only, blocked once any recipient has opened, and
T-08 wires it to cancel the `capsule_unlock` action and schedule a `trash_purge`.

Content immutability and delivery irrevocability were already correctly
separated in the build. What remains is a **product** question — whether
withdrawal is discoverable and how it is described — not an architectural one.
The estrangement scenario in `09` is already handled by the engine.

---

## 12 · Which decisions affect marketing

1. **T-21 is a survival argument, not a feature tour** — `07 §X`. The only
   question that matters is *"will you still exist?"*
2. **No testimonials at launch** — `07 §X`. Removes a planned T-21 section.
3. **The share artifact is duration-only** — `07 §XIV`. Zero-access means we
   cannot build content sharing; the constraint is the sharpest asset we have and
   should be led with, not apologised for.
4. **"We can never build a feed" is arithmetic, not policy** — `09 §VIII`. The
   most credible claim available to us, because we could not break it if we
   wanted to.
5. **No exclamation marks, no emoji, anywhere** — `07 §VIII`. Including
   marketing. One of the cheapest recognisability wins available.
6. **The occasion pages are validated** — `09 §IV`'s eight life events support
   T-21's three planned occasion pages; new-parents and couples map directly to
   the Parent and Couple archetypes.
7. **Reliability is the marketing** — `07 §II.10`, `09 §VIII`. Word of mouth is
   *that it arrived*. Every engineering hour on delivery guarantees is a
   marketing investment.

---

## 13 · Which decisions require architectural changes

Only three. Everything else is design, copy, or scope.

**A · Recipient contact routes (N1)** — `09 §I`.
`capsule_recipients` already carries both `email` and `phone`, so a second route
partially exists. What is missing: per-route verification state, priority
ordering, and last-confirmed timestamps. Note the existing
`capsule_recipients_capsule_email_unique` index assumes one email per recipient
per capsule — **that constraint will need revisiting.**

**B · Address re-verification as a scheduled action (N2)** — `09 §I`.
The `action_kind` enum already contains `checkin`, which is close to the needed
semantics. Requires a new handler in T-13's engine and must respect the
`scheduled_actions`-as-only-source-of-truth rule.

**C · Custodian table (N4)** — `09 §XI.5`.
Genuinely new. `capsules.legacyConfig` anticipates `trigger: "trustee"` but there
is no table to point it at, and the playbook's claim that these are "already
schema'd" is incorrect (§2.4).

**Not architectural, despite appearances:** the annual rite (`series_spawn`
exists), the right of withdrawal (already built), ceremony scaling (presentation
only), and the Dual Register (token and component layer only).

---

# Recommended updates for Fable

Changes to `PROGRESS.md` only. Not made here.

### Reprioritise

1. **Insert `Gate 5 — cold recipient path` as the next item, ahead of T-21.**
   *Why:* `07 §XV.3` — Gate 1 validated the transition for the creator, not the
   recipient; `09 §VIII` makes that path the acquisition funnel.
2. **Insert `N6 — design system refresh` before T-21.**
   *Why:* `plan/02 §6` is superseded by `05`; T-21 is the largest remaining
   volume of new web UI and would be entirely rework.
3. **Promote the annual rite from Stage G (T-39) into Stage D.**
   *Why:* `09 §IV` — the only calendar anchor available; cheap because
   `series_spawn` already exists in `action_kind`.
4. **Move the deliverability work (N1–N3) into Stage D.**
   *Why:* `09 §I` — every capsule sealed before it lands accumulates the risk.

### Add

5. **N1–N3 as one ticket: "Recipient deliverability."** Multiple verified contact
   routes, periodic re-verification doubling as proof of life, creator escalation
   when a route goes dark. *Why:* `09 §I`.
6. **N4: Account custodian.** Named person, inheritance path, and the only
   permitted basis for post-death release. *Why:* `09 §XI.5`, `§IX`.
7. **N9: Past-tense delivery copy sweep.** *Why:* `09 §VI` — we never know if the
   sender is alive. Cheapest high-value item in this report.
8. **N10: Motion-constitution fix in `packages/ui-web`.** Remove `animate-pulse`
   from `Skeleton.tsx:8` and `StateChip.tsx:41`; remove the `animate-spin`
   spinner from `Button.tsx:51`. *Why:* `07 §VI.3`; must land before T-24 copies
   the patterns.

### Remove

9. **Gut T-35.** Delete the monthly digest, seal-anniversary notices, D3 prompts,
   post-open reply nudge, and 60d win-back. Keep only a factual approach notice.
   *Why:* `07 §XI` permits four sends in a decade; anniversary notices also
   violate Interaction Constitution 3.
10. **Delete T-32's achievements half** — engine, toasts, profile shelf. Keep
    referrals, minus any prompt at an emotional moment. *Why:* `07 §XVI`.
11. **Delete T-28's 3-step onboarding.** Replace with a master-key /
    recovery-kit clarity pass. *Why:* `07 §XI`.
12. **Remove sound from T-24** ("seal thud/unlock crack"). Keep haptics on the
    seal only, on the creator's own device. *Why:* `07 §VII`, which reverses
    `06`'s earlier position.
13. **Remove testimonials from T-21.** *Why:* `07 §X` — we have not kept anything
    yet.

### Split

14. **T-21 → T-21a thesis page · T-21b trust evidence · T-21c legal/help/occasion
    pages.** *Why:* different dependencies; T-21c can start immediately, T-21a
    cannot. See §6.1.
15. **T-22 → hardening pass + a dedicated a11y pass on the unauthenticated
    reveal path.** *Why:* `07 §XIII`, `09 §VIII`.

### Amend in place

16. **T-21 DoD:** replace "OG cards correct" with static per-capsule-*type* OG
    images. *Why:* §2.3 — bundle budget, and no preview of sealed content.
17. **T-37:** correct "tables already schema'd" — no trustee table exists. Add
    the constraint that post-death release must be **custodian-confirmed, never
    inferred from inactivity**. *Why:* §2.4, `09 §IX`.
18. **T-36:** note that *deliveries succeeded* ≠ *deliveries received*, and that
    four of six churn reasons are invisible to analytics. *Why:* `09 §V`, `§XII`.
19. **Add a standing bundle-budget note:** 2316 KiB of 3072 KiB used; ~756 KiB
    for all of T-21 plus three self-hosted font families. *Why:* §2.3.
20. **Record the closing obligation:** `plan/02-UX-DESIGN.md §6` must be rewritten
    when N6 lands, or future sessions will build against the stale Meridian spec.
    *Why:* carried since `00 §governance`; it is the one item that silently
    undoes all of this if missed.

### Not a change — a correction to the strategy docs

21. **The "right of withdrawal" in `09 §XIV.4` needs no decision.** It is already
    implemented (`state-machine.ts:46`). Only the product question — how
    discoverable it is — remains open.
