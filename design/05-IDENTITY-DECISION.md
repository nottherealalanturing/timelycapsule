# Meridian — Identity Decision Record

> Concludes the identity phase. Recommendation pending founder sign-off.
>
> **Visual exploration:** https://claude.ai/code/artifact/cd15c825-4d81-4396-b094-e3ac5ca9bc30
> Source: `scratchpad/identity.html` — republish that path to update the same URL.
>
> Supersedes the open decisions in `04-VISUAL-IDENTITY.md §13`.

---

## The recommendation

> ### Direction 3 · Dual Register, with Pairing C · The Almanac
>
> **Instruments are dark and set in sans. Records are paper and set in serif.**

One rule governs colour *and* typography simultaneously. That single sentence is
the whole system — two designers given only it would produce interfaces that
agree.

| Layer | Surface | Colour | Type |
|---|---|---|---|
| **Instrument** | App chrome, timeline, countdown, waiting state, composer shell | Dark — `#0B0E14` ground | IBM Plex Sans + Plex Mono |
| **Record** | The letter, reveal, exports, emails, print, keepsakes | Paper — `#E9EAE6` ground | Source Serif 4 |

---

## Verified colour tokens

All ratios computed against WCAG 2.1 relative luminance. **Do not re-derive by
eye.**

### Instrument register

| Token | Hex | On ground | On raised |
|---|---|---|---|
| `ground` | `#0B0E14` | — | — |
| `raised` | `#141922` | — | — |
| `overlay` | `#1C2230` | — | — |
| `ink` | `#E6E8EC` | 15.75 AAA | 14.36 AAA |
| `muted` | `#8B93A3` | 6.26 AA | 5.71 AA |
| `brass` (waiting) | `#E0B84A` | 10.23 AAA | 9.33 AA |
| `steel` | `#7A8AB0` | 5.60 AA | 5.11 AA |

### Record register

| Token | Hex | On ground | On raised |
|---|---|---|---|
| `ground` | `#E9EAE6` | — | — |
| `raised` | `#F3F4F0` | — | — |
| `ink` | `#16181A` | 14.73 AAA | 16.11 AAA |
| `muted` | `#5E635C` | 5.09 AA | 5.57 AA |
| `verdigris` | `#3F6154` | 5.70 AA | 6.23 AA |
| `iron` | `#2C3A4A` | 9.59 AAA | 10.50 AAA |

### Temperature ramps — corrected

**The original ramp from `04 §3` failed accessibility.** Cold end scored 2.72 as
text on `#0B0E14`; warm end scored 1.97 for ink placed on it. Validating only the
endpoints would have shipped an inaccessible core component. Corrected so every
step clears AA:

**Instrument** (cold → warm): `#7A8AB0` 5.60 · `#8E88B2` 5.81 · `#A78CA6` 6.39 ·
`#BE9186` 6.98 · `#D0A06A` 8.20 · `#E0B84A` 10.23

**Record** (cold → warm): `#4A5C74` 5.65 · `#5A5674` 5.76 · `#6E566A` 5.43 ·
`#7A5348` 5.50 · `#7C5520` 5.47 · `#6E5A0E` 5.55

### Semantic states

| State | Instrument | Record |
|---|---|---|
| Waiting / sealed | `#E0B84A` | `#6E5A0E` |
| Revealed / transit | *register change* | *register change* |
| Success | `#4E9E76` | `#2F6B4C` |
| Warning | `#C8923C` | `#7A5A18` |
| Error | `#D2694E` | `#A33F28` |
| Disabled | ink @ 38% | ink @ 38% |
| Interactive | `#7A8AB0` | `#2C3A4A` |

### Two rules that hold the system together

1. **The ramp never carries text and is never a text-bearing surface.** It
   colours markers, rules and glyphs only, always alongside a literal date.
2. **Brass means *waiting* and nothing else.** The moment it decorates a heading,
   the reserved meaning is gone.

---

## Typography

**Pairing C — The Almanac.** Source Serif 4 (records, reading, headlines) ·
IBM Plex Sans (instruments, dense data) · IBM Plex Mono (hallmarks, metadata).
All SIL OFL, all variable, all self-hostable permanently.

**Fallback:** Pairing A (IBM Plex superfamily throughout) if serif-led UI proves
unworkable at density. Cooler, but coherent, and a cheap retreat.

**Rejected:** Pairing B (Söhne + Tiempos). Highest craft of the three, and it
knowingly contradicts the permanence pillar (revocable web licence) and the i18n
constraint (Latin-plus only). Recorded so the decision isn't quietly revisited on
aesthetic grounds.

---

## Logo

**System: v + ii.** Wordmark for lockups and marketing; the reduced meridian mark
as the symbol for favicon, app icon and embossing.

- **v — The Wordmark.** Meridian line set *between* the two words, as the
  reference the name pivots on.
- **ii — The Meridian Mark.** Vertical reference with a single graduation.
  Engraves and embosses ideally; holds at 16px.
- **i — The Transit** remains the strongest standalone pictorial mark if one is
  wanted later.
- **iv — The Dial Segment: abandoned.** Fails below 24px, and closest to
  depicting the metaphor.

**The mark never animates.** It is institution, and institution is static.

---

## Motion

Two registers, per `04 §6`.

| | Instrument | Interface |
|---|---|---|
| Easing | `linear` / `cubic-bezier(.4,0,.6,1)` | `cubic-bezier(.2,0,0,1)` |
| Duration | 400–800ms; ceremony ≤2500ms, skippable | 120–200ms |

**Technology verdict:**

- **CSS alone — ~90% of the system.** The default. Reaching past it needs
  justification.
- **GSAP — at most one place:** the *seal* timeline, where a user-controlled
  reversible scrub is genuinely harder. Never on the recipient reveal path.
  **Revised by gate 1:** the reveal was built end-to-end in plain CSS driven by a
  single scalar, so GSAP is not needed there. See `06-GATE-1-RESULT.md`.
- **Three.js — recommended against entirely.** Fails the three-year-old-phone
  constraint, threatens Lighthouse ≥95, and violates *behave, don't depict* —
  a 3D scene is depiction.

---

## What was abandoned permanently

Three.js and all WebGL · logo concept iv · celestial imagery · photography of
people · illustration of our own metaphors · cream grounds · spinners · progress
bars · spring/overshoot easing · confetti · **the original uncorrected ramp**.

---

## Prototype gates — before any production code

In order. Gate 1 is not optional.

1. ~~**The register transition.**~~ ✅ **PASSED — see `06-GATE-1-RESULT.md`.**
   Direction 3 holds, subject to two constraints: *the record is an object,
   never a background*, and *the registers never overlap in time*. The second is
   new. Note that gate 1 also revised the GSAP verdict in §Motion below — the
   reveal is CSS-only.
2. **Serif-led UI at density.** Set a real timeline and settings screen in Source
   Serif 4. Confirm the sans boundary is drawable before committing to Pairing C.
3. **The corrected ramp on real hardware.** Verify the six steps stay
   distinguishable on a cheap Android LCD, not a calibrated display.
4. **The Dual Clock.** It carries more brand than the logo. Prove elapsed +
   remaining reads clearly from seconds to decades.

---

## Remaining risks

- **Dual Register's failure mode is incoherence, not dullness.** It's the most
  conceptually ambitious option; two token sets means two ways to drift. Needs
  the bright-line rule enforced in review.
- **The register change must stay rare.** At transit and almost nowhere else. If
  users cross it constantly it becomes noise instead of ceremony.
- **Dark-primary UI is currently fashionable** and will cycle. Partly hedged:
  records are permanently paper, so if dark falls from favour we lose chrome, not
  identity.

---

## Next phases (unblocked by this decision)

1. Final logo design — system v + ii
2. Meridian design system refresh — `tokens.css`, then 12 primitives, then 65 components
3. T-21 marketing experience
4. Web UI refresh
5. Mobile UI (install the `expo` plugin here)

**Closing obligation, carried since `00 §governance`:** the redesign must end by
rewriting `plan/02-UX-DESIGN.md §6`, or future sessions will build against the
stale Meridian spec and silently undo this work.
