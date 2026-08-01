# TimelyCapsule — Visual Identity Redesign

> **Continuity document.** This is the working record for the visual identity
> redesign that precedes T-21. It exists so the work survives a session break.
>
> **This file is NOT project management.** Fable owns `plan/PROGRESS.md` and all
> task/progress tracking. This document holds *design decisions and rationale only*.
>
> **Status:** Phase 3 (Creative Discovery) — visual pitches delivered, awaiting selection.
>
> **Read `01-BRAND-MANIFESTO.md` first.** It was written after these directions
> and re-scores them against a filter the visual brief didn't contain (the trust
> asymmetry). Net effect: A still leads, B is raised, C/D/E fall behind.
>
> **Visual pitch deck:** https://claude.ai/code/artifact/9e5a45f6-a6f1-4443-833c-94b4f21df9ae
> All five directions rendered as live, committed visual systems (palette, type,
> motion, iconography, components, hero mockup, signature interaction, influences),
> plus five candidate signature moments with working demos. Source:
> `scratchpad/directions.html` — republish the same path to update the same URL.

---

## Why this redesign is happening

The founder flagged that the current UI (web + mobile) reads as generic. That
instinct is correct and diagnosable, not vague dissatisfaction.

Anthropic's official `frontend-design` skill contains a calibration section
naming the three visual defaults that AI-generated design currently clusters
around. The first one:

> "a warm cream background (near #F4F1EA) with a high-contrast serif display and
> a terracotta accent"

The current "Meridian" system (`plan/02-UX-DESIGN.md §6`) is:

| Meridian token | Value | AI-cliché #1 |
|---|---|---|
| `parchment` (light bg) | `#FAF7F2` | warm cream ≈ `#F4F1EA` |
| Display face | Fraunces (high-contrast serif) | high-contrast serif display |
| `amber-gold` accent | `#D4A24E` | terracotta accent |

Three for three. The plan argued for gold on distinctiveness grounds ("nobody in
the comparison set owns it") — likely true when written, since overtaken by
AI-default drift.

**Important nuance:** the 2026 trend research shows a genuine serif renaissance
in editorial/brand work. Serif display type is *not* the problem. The problem is
this specific **cream + high-contrast-serif + warm-accent** combination. A serif
can survive the redesign if the palette moves decisively.

---

## Scope discovered during audit prep

- **Web:** 65 `.tsx` files across `apps/web/src` + `packages/ui-web/src`.
  12 shared primitives. `tokens.css` is 78 lines.
- **Mobile:** `apps/mobile` contains **one** file (`App.tsx`). T-23 has not been
  built. **There is no mobile UI to redesign** — this work is about getting the
  system right *before* T-23 builds ~30 screens on it.
- **Production is live** (`timelycapsule.com`, auto-deploys from `main`), so this
  should land as one reviewable branch, not incremental half-restyled merges.

---

## Governance decision required

`CLAUDE.md` states the `plan/` docs are the single source of truth and their
decisions must not be re-litigated. Meridian is a plan decision, so this redesign
is formally a **plan amendment**.

**Therefore: this work must end by rewriting `plan/02-UX-DESIGN.md §6`.** If it
doesn't, every future session will build against the stale spec and silently
undo the redesign.

*(Founder approved the redesign and the workflow. The §6 rewrite is a required
closing step, not optional.)*

---

## Constraints any direction must satisfy

Non-negotiable, from `plan/00-INDEX.md`, `03-ARCHITECTURE.md`, `06-FEATURE-ADDENDUM.md`:

1. **Recipient reveal must work with no account, no app, on a 3-year-old phone
   browser.** This caps the motion/asset budget hard. Rules out heavy WebGL on
   the reveal path.
2. **Lighthouse ≥95 perf/SEO/a11y** on the landing page (T-21 DoD).
3. **Zero-access E2E** — no capsule content in OG images, logs, or analytics.
4. **`prefers-reduced-motion`** — the three signature moments degrade to ≤300ms
   cross-fades; haptics preserved.
5. **Dark mode is first-class**, not an afterthought. All tokens paired,
   contrast re-validated per pair.
6. **i18n from first commit** — no English-only visual puns in core strings.
7. **Semantic tokens only** in components (`--color-bg-primary`, never raw hex).

## What is already good and should survive

- **The voice.** `06-FEATURE-ADDENDUM §D` — "Retrieving your capsule from the
  timestream…", "Lost in time.", "This capsule has completed its journey."
  This register is genuinely distinctive and is currently *ahead* of the visual
  identity. The visuals should rise to meet the copy.
- **Structural motifs**: wax seal, orbit, hourglass, capsule. The concepts are
  sound; the palette and type execution are what failed.
- **The three signature moments** (seal ceremony, unlock reveal, countdown flip).
  This is where the brand actually lives. A redesign that doesn't nail the seal
  ceremony hasn't done its job.
- **Capsule IDs** (`TC-84KZQM3P`, 8-char unambiguous alphabet) — an existing,
  underused asset with real identity potential.

---

## Research inputs (2026)

Synthesized from award/inspiration ecosystem research — techniques and
principles, deliberately **not** layouts to copy.

- **"Directed motion"** — the dominant award criterion. Motion with a director:
  choreography that carries meaning, transitions that signal something true,
  micro-interactions that reward attention. Animation for its own sake now reads
  as dated (and as AI-generated).
- **Archival Index aesthetic** — structured data as visual storytelling. Grids,
  labels, annotations, catalogue numbering. "Equal parts library and gallery."
- **Kinetic typography** — type that responds to action/time/scroll. Typography
  as choreography rather than a neutral delivery vehicle.
- **Serif renaissance** — expressive, high-contrast, opinionated serifs signal
  confidence in editorial and product contexts alike.
- **User-driven pacing** — when people control progression they become
  participants, not observers. Visual transitions used to signal *shifts in time*
  (directly relevant to this product).
- **Restraint as differentiator** — the studios setting the bar (Active Theory,
  Lusion) do heavy WebGL, but that path conflicts with constraint #1 and #2 here.
  Our differentiation must come from *direction*, not GPU budget.

---

## The five creative directions

Each is a genuinely different bet, not a variation. Full detail below;
recommendation at the end.

---

### A — "The Observatory" ⭐ RECOMMENDED

**Narrative.** Time as astronomy. A sealed capsule is in orbit; it returns at its
appointed moment. Delivery isn't a feature — it's celestial mechanics: precise,
predicted, inevitable. The product's promise ("delivered at exactly the right
moment") becomes a law of physics rather than a marketing claim.

**Visual identity.** Deep night-sky as the *primary* surface, not a dark-mode
afterthought — but indigo/prussian, never pure black. Star-field at very low
density. Orbital ellipses and precise hairline arcs borrowed from astronomical
charts. Light mode is "daybreak": pale, cool, high-altitude sky. Accent reserved
for the sealed/pending state, so the eye learns it means *waiting*.

**Typography.** A precise grotesque for UI (instrument-panel register) paired
with a display face with astronomical/scientific character. **Numerals are the
critical selection criterion** — this product is countdowns; the face needs
excellent tabular figures. Type does measurement, not decoration.

**Motion language.** Orbital and inevitable. Elements arrive along elliptical
paths, never bounce. Nothing is springy — springiness implies uncertainty, and
this product's whole promise is certainty. The countdown behaves like a predicted
celestial event. Reduced-motion degrades cleanly since paths become fades.

**Interaction ideas.**
- Hero: a live orbital diagram where a capsule's position on its ellipse encodes
  time-until-unlock. Drag to scrub through time and watch it approach.
- Timeline reimagined as orbital periods rather than a vertical list.
- Seal ceremony: the capsule is *launched* into its orbit, landing at its date.
- Unlock: orbital return — it comes back to you.

**Inspiration (techniques, not layouts).** NASA/JPL mission pages, planetarium
software, astronomical almanacs and star charts, orrery mechanics.

**Technical feasibility. HIGH — the cheapest of all five.** Orbits are SVG paths
and CSS transforms. No WebGL, no heavy libs. Excellent Lighthouse. Dark-primary
is battery-friendly on mobile. Star-fields must be CSS/SVG, not images, to keep
the payload honest.

**Why it fits TimelyCapsule.** Inevitability *is* the trust promise — "no capsule
left behind" is literally an architecture invariant, and this direction makes
that visible. The orbital motif is already sanctioned in `§6`. It's awe-inducing
without being sentimental, which keeps it optimistic rather than mournful. And it
differentiates hard: every competitor in this space skews scrapbook/nostalgia.

**Risk.** Can read cold or sci-fi if pushed too far. **Mitigation is mandatory:**
import the time-driven warmth mechanism from Direction C (below) so the palette
warms measurably as a capsule nears its unlock. Cold at 10 years out, warm at
10 minutes out.

---

### B — "The Archive"

**Narrative.** You are depositing into an institution designed to outlive you.
The plan's own trust commitment — "your capsules outlive our roadmap" — taken
literally as the visual thesis.

**Visual identity.** Paper-adjacent but deliberately *not* cream/terracotta:
cool archival greys, oxidized brass and verdigris, deep ink. Ruled lines, index
cards, catalogue numbering, marginal annotations. Wax seal reinterpreted as an
official **stamp/impression**.

**Typography.** A workhorse text serif or slab for reading, plus a **monospace
for IDs, dates and metadata**. The monospace is the "official record" voice and
carries most of the identity.

**Motion language.** Minimal, mechanical, precise. Card filing, drawer slides,
stamp impressions landing. Motion as *procedure*, never flourish.

**Interaction ideas.**
- Hero: a live archival index — "4,182 capsules sealed · next opens in 3h 12m" —
  anonymized, content-blind (satisfies the E2E constraint by construction).
- Capsule IDs (`TC-84KZQM3P`) promoted to first-class identity elements.
- Browse the archive as a catalogue rather than a feed.

**Inspiration.** Library card catalogues, museum collection interfaces, the 2026
"Archival Index" trend, government/legal record design.

**Technical feasibility. VERY HIGH.** Type-led, near-zero motion cost, superb
Lighthouse scores.

**Why it fits.** Strongest *trust* signal of the five, and it activates an asset
that already exists (Capsule IDs). Institutional permanence is a real product
claim here, not a metaphor.

**Risk.** Leans cold and bureaucratic — directly conflicts with the "warm" brief
requirement. Also sits closest to **AI-cliché #3** (broadsheet layout, hairline
rules, zero border-radius) and would need active steering away from it.

---

### C — "The Long Light"

**Narrative.** Time rendered as light. A sealed capsule sits in darkness;
unlocking is dawn. The interface's temperature is a *function of time remaining* —
the product visibly warms as the moment approaches.

**Visual identity.** Gradient-driven, but earned rather than decorative (`§6`
already gestures at "gradients that shift with time of day"). Deep dusk → dawn
across the countdown. Each capsule carries its own light temperature derived from
its unlock date, so a wall of capsules reads as a spectrum of nearness.

**Typography.** Soft high-contrast display with real optical refinement, paired
with a humanist sans. Type stays quiet; light does the talking.

**Motion language.** Light-based rather than positional. Bloom, glow, lengthening
shadow, slow exposure shifts. Things illuminate rather than travel — which
degrades gracefully under reduced-motion.

**Interaction ideas.**
- Signature: ambient page light responds to both the viewer's local time *and*
  the nearest capsule's countdown. A living surface.
- Unlock reveal as sunrise.
- Countdown communicated as much by temperature as by digits.

**Inspiration.** Dynamic environmental wallpapers, high-craft weather interfaces,
atmospheric picks from the Godly/Awwwards ecosystem.

**Technical feasibility. MEDIUM.** CSS gradients + a handful of JS-driven CSS
variables is cheap. **But dynamic backgrounds make WCAG AA contrast genuinely
hard** — every text/background pair must be validated across the *entire*
gradient range, not just endpoints. That's real, ongoing work, and it collides
with the Lighthouse a11y ≥95 DoD.

**Why it fits.** The most emotionally direct of the five, and the best match for
"warm, optimistic." Makes waiting itself feel meaningful rather than empty.

**Risk.** Gradient-heavy interfaces read as "AI SaaS" without severe discipline.
Plus the a11y burden above. Best used — as recommended — as a *mechanism inside*
another direction rather than as the whole identity.

---

### D — "Correspondence"

**Narrative.** This is mail. A postal service that delivers across time rather
than distance. Intimate, personal, addressed — one human to another.

**Visual identity.** Envelope geometry, postmark circles, perforation edges,
airmail striping as accent. Rich saturated inks rather than pastels. The wax seal
finally gets its literal home.

**Typography.** A text serif genuinely optimized for *reading letters* — the
letter content is the actual product — plus a condensed utility face for postal
metadata. (`§6` already specifies letter content at 1.125 / 1.7 line-height;
this direction makes that reading experience the centrepiece.)

**Motion language.** Folding, unfolding, sealing. Restrained paper physics.

**Interaction ideas.**
- Hero: an envelope you actually open, revealing a sample letter postmarked with
  a future date.
- Sealing = the wax stamp pressing.
- Received capsules arrive with visible postmarks showing their journey duration.

**Inspiration.** Postal design history, airmail systems, editorial letter layouts.

**Technical feasibility. HIGH.** Fold effects via CSS 3D transforms; no heavy
dependencies.

**Why it fits.** The warmest and most human option. Reading is genuinely core to
the product, and this direction privileges it above all else.

**Risk.** The nostalgia trap. Skeuomorphic postal design very easily reads
*dated* rather than *timeless* — and "timeless" is an explicit brief requirement.
Also the least differentiated: memory/letter products already cluster here.

---

### E — "The Threshold"

**Narrative.** Only the moment of arrival matters. This product is 99% waiting
and 1% revelation — so design honestly for that ratio. Radical restraint
throughout, then one overwhelming moment.

**Visual identity.** Near-monochrome. Extreme discipline. **One colour reserved
exclusively for the unlock moment**, never used anywhere else in the product —
so when you finally see it, you know without being told.

**Typography.** A single superb variable face carrying everything across a wide
weight/size range. Typography does 100% of the work.

**Motion language.** Almost none — until the reveal, which is genuinely cinematic
by contrast. Restraint everywhere else is what makes it land.

**Interaction ideas.**
- Hero: one line of type and a countdown. Nothing else.
- Scroll reveals very little; the page refuses to entertain you.
- The unlock is the only spectacle in the entire product.

**Inspiration.** Linear's restraint, high-end jewellery and fashion houses,
Swiss typographic tradition.

**Technical feasibility. HIGHEST.** Fastest to build, best Lighthouse scores,
most durable over time.

**Why it fits.** Nails "timeless, calm, premium" more precisely than any other
direction, and the reserved-colour device is a genuinely strong idea.

**Risk.** Fails "warm" and "memorable" on first impression — a landing page this
austere is hard to market with, and an emotional product that feels cold at the
front door may not earn the signup. Highest-confidence execution, lowest-
confidence commercial outcome.

---

## Recommendation: A — "The Observatory", warmed by C's light mechanism

**The bet:** inevitability, rendered as celestial mechanics — with warmth
supplied by a time-driven temperature shift rather than by a warm palette.

**Why A over the others:**

- **It makes the actual product promise visible.** "No capsule left behind" is an
  architecture invariant (`03 §10`, reconciliation job). Orbital motion is that
  invariant made visual: predicted, inevitable, on schedule. No other direction
  turns the engineering into the aesthetic.
- **It's differentiated where the category is crowded.** Competitors cluster on
  scrapbook/nostalgia (which is D's territory). Nobody in this space owns
  precision-and-awe.
- **It's the cheapest to execute well** — SVG + CSS transforms, no WebGL — which
  matters enormously against the 3-year-old-phone constraint and the Lighthouse
  ≥95 DoD. Directions that need GPU budget are effectively disqualified by
  constraint #1.
- **Dark-primary is native to it**, and the plan already wants first-class dark
  mode. The other directions treat dark as a port.
- **It escapes all three AI clichés cleanly** — not cream/serif/terracotta, not
  black-with-acid-accent (indigo, and the accent is reserved and semantic), not
  broadsheet.
- **It's already sanctioned**: `§6` names "circular/orbital shapes" as a motif.
  This is less a departure than a decision to actually commit to what was written
  and never executed.

**The one mandatory refinement:** A alone risks reading cold and sci-fi, which
would fail the "warm" requirement. So import exactly one mechanism from C — the
interface's colour temperature is a function of time-until-unlock. Cold and
distant at ten years out; warm and close at ten minutes. This is a single
derived CSS variable, cheap to build, and it converts A's greatest weakness into
a signature behaviour no competitor has.

**Explicitly not merging further.** B, D and E stay unbuilt. One direction, one
borrowed mechanism — anything more becomes mush.

**What I'd carry forward from the rejected directions later (not now):**
- From B: promoting Capsule IDs to real identity elements.
- From E: one colour reserved exclusively for the unlock moment.

Both are compatible with A and can be evaluated during the design-system phase.

---

## Open questions for the founder

1. **Direction selection** — A as recommended, or another?
2. **Does a serif survive?** The serif renaissance is real; the cliché is
   specifically cream+serif+terracotta. Under A a serif display could work
   against an indigo palette — or we go fully grotesque. Preference?
3. **How far does the accent move?** Amber-gold is diagnosed as cliché-adjacent,
   but gold-on-indigo is a materially different (and much less common) pairing
   than gold-on-cream. Retire gold entirely, or re-home it?

---

## Workflow (founder-approved)

| # | Phase | Status |
|---|---|---|
| 1 | Plugin install (`frontend-design`) | Pending — needs interactive terminal |
| 2 | **Creative Discovery** | **Directions presented — awaiting selection** |
| 3 | UI audit (screenshots, Lighthouse baseline, token-drift check) | Not started |
| 4 | Brand identity (lock palette, type, motion, signature) | Not started |
| 5 | Logo | Not started |
| 6 | Design system refresh (`tokens.css` → 12 primitives → 65 components) | Not started |
| 7 | Landing page / T-21 | Not started |
| 8 | Mobile (T-23+) | Not started — install `expo` plugin here |
| 9 | **Rewrite `plan/02-UX-DESIGN.md §6`** | Required closing step |

*Note: phase order swaps discovery ahead of audit per founder request; the audit
now validates the chosen direction against the existing surface rather than
feeding into it.*
