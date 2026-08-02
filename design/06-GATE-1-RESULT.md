# Gate 1 — The Register Transition

> **Result: PASS**, with two constraints, one of which is new and was not in
> `05-IDENTITY-DECISION.md`.
>
> **Prototype:** https://claude.ai/code/artifact/7e4d80ad-b5be-4f25-b4cd-0d3262584ad6
> Source: `design/gate1.html` — republish that path to update the same URL.
>
> Closes gate 1 of the four listed in `05 §Prototype gates`.

---

## The question

Does crossing from the Instrument Register (dark, sans) to the Record Register
(paper, serif) read as **ceremony** rather than a theme switch?

If no, Direction 3 collapses to Direction 1 with Pairing C.

---

## Verdict

**Direction 3 survives — but the version signed off in `05` failed.** It took two
structural changes to pass, both found by building it rather than reasoning about
it.

### Constraint 1 · The record is an object, never a background

Bounded on all four sides, with the instrument surround visible around it at
every breakpoint. The moment paper becomes the page ground, it is a theme toggle
— immediately and irrecoverably.

The correct mental model is **a lit document in a dark room**, not a move to a
light room.

### Constraint 2 · The registers never overlap in time — *new*

Instrument clears → **empty frame** → record arrives. Never a crossfade.

The first build ran the paper reveal over the still-present instrument face.
Every mid-transition frame sliced the headline mid-word, and the result read as a
slide-deck wipe. Changing the *mechanic* did not help — a vertical "withdrawal"
variant just read as a modal dropping in. The problem was sequencing, not easing.

Both rules belong in the Design Constitution (`04 §15`).

---

## What prototyping changed

| # | Found | Fix |
|---|---|---|
| 1 | Reveal sliced live instrument text at every mid-transition frame | Clear the instrument *before* the record arrives; two acts with a pause |
| 2 | The empty frame — added only as a spacer — turned out to carry the entire moment | Promote it to a protected beat, 200ms |
| 3 | The transit marker kept moving during the "silence", so the silence wasn't silent | Zero and the crossing are now the same event at 2000ms; marker holds still to 2400 |

**The threshold is the empty frame**, not the paper's arrival — the instant the
instrument has given way and the record has not yet come. That beat was not in
the original design.

---

## Final timeline

| Time (ms) | Beat | Easing |
|---|---|---|
| 0–2000 | Approach. Marker travels to the meridian, countdown 00:03 → 00:00 | `linear` |
| 2000–2400 | **Silence.** Nothing moves. | — |
| 2400–2700 | Transit completes; meridian brightens .42 → .85 | `linear` |
| 2700 | Seal opens — **instant state change**, not a tween | `step` |
| 2705–3050 | Instrument recedes: face fades, settles 6px | `ease-out` |
| 3050–3250 | **The empty frame.** Line and broken seal only. | — |
| 3250–4100 | Record arrives: `inset` wipe from the meridian, 30%→0 / 70%→0 (asymmetric), `scale .985→1`, warm rise capped 6% | `cubic-bezier(.32,0,.24,1)` |
| 4100–4700 | Letter, three lines staggered 90ms | `ease-out` |
| 4700–5400 | **Stillness.** | — |
| 5400–5800 | Duration stamp franks in at 88% | `ease-out` |

Three silences. All three are timing, not motion, so **all three survive
`prefers-reduced-motion`.**

### Reduced motion

No wipe, no lift, no stagger, no glow. Instrument fades 150ms → empty frame →
paper cross-fades 300ms, letter and stamp with it. The no-overlap rule holds.

### Typography note

**Nothing morphs.** Instrument text is sans and stays sans; the letter is serif
and did not exist before, so it arrives already set. No text ever crossfades
between faces — which is where this kind of transition normally looks cheap.

---

## Answers to the six questions

| # | Question | Answer |
|---|---|---|
| 1 | Ceremony, not a theme switch? | **Yes**, on the two constraints above. Both load-bearing. |
| 2 | Strengthens trust? | **Yes.** The permanent things — meridian, hallmark, frame — visibly hold still while everything else moves. |
| 3 | Reinforces waiting as manufacture? | **Partially — the weakest answer.** It dramatises arrival, not the wait. The idea rides entirely on the duration stamp, which lands last and quietest. |
| 4 | Understood without explanation? | **Yes.** The physical grammar needs no product literacy. Still test on the P8 path (no account, old phone, arriving cold). |
| 5 | Worth making the defining interaction? | **No — keep the Seal.** The seal is the creator's moment: active, irreversible, and experienced by everyone. This is the recipient's counterpart. Pair them: you press to seal, you watch to receive. |
| 6 | If not, what replaces it? | **Nothing.** No fallback to Direction 1 required. |

On (3): if it needs strengthening, the fix belongs in the **static composition**
of the record, not in more motion.

---

## Implementation

- **CSS only.** The whole sequence is `clip-path`, opacity and transform driven
  by one scalar. **This revises `05 §Motion`: GSAP is not needed for the
  reveal.** It may still earn its place on the *seal* timeline, where a
  user-controlled reversible scrub is genuinely harder. It does not earn it here,
  and this is the path that must run on old phones.
- **Drive from a single timeline scalar** (0→1), not chained transitions — that
  is what makes it scrubbable, interruptible and skippable for free.
- **Skippable at any point.** Tap advances to the end state. The reveal belongs
  to the recipient; if they want the letter now, they get the letter now.
- **Never replay.** Returning to an opened capsule shows the record at rest.
  Ceremony repeated is spectacle.
- **Sound, if ever:** one soft mechanical release at the seal. Never musical,
  never at arrival, default off.
- **Accessibility:** `aria-live="polite"` announces "Capsule opened. Travelled
  three years."; focus moves to the letter heading; all state also carried in
  text.

---

## Risks

- **The silences will be "fixed."** A 400ms freeze and a 200ms empty frame both
  look like bugs. The empty frame is the more fragile — it reads as a failed
  render. Comment both in code.
- **The overlap will creep back.** Crossfading the registers is the obvious cheap
  implementation and is exactly what fails. Any PR animating instrument-out and
  record-in concurrently has broken the gate.
- **The full-bleed temptation on mobile.** The record will want to fill the
  viewport. It must not — the surround has to survive at every breakpoint. **This
  is the most likely way the identity quietly dies.**
- **Lighting creep.** The warm rise is capped at 6% opacity. Glow effects grow
  every time someone touches them.

---

## Next

Gates 2–4 remain (`05 §Prototype gates`): serif-led UI at density · the
corrected ramp on real hardware · the Dual Clock. Then final logo (system
v + ii) → design system refresh → T-21 → web → mobile.
