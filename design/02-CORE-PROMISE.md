# TimelyCapsule — The Core Promise

> The synthesis document. Supersedes the A-vs-B framing in
> `00-CREATIVE-DIRECTION.md`. Read `01-BRAND-MANIFESTO.md` first for the trust
> asymmetry that makes this necessary.
>
> **Status:** proposed synthesis, awaiting sign-off. Nothing built against it yet.

---

## I. The correction

I framed Direction A as **astronomy** — space, orbits, celestial mechanics. That
was a mistake, and it's the reason A carried a "reads cold and sci-fi" risk that
needed patching with a borrowed warmth mechanism.

The right territory was never space. It's **horology** — the measurement and
keeping of time.

The difference matters enormously:

| Astronomy | Horology |
|---|---|
| Space, distance, cosmos | Time, precision, duration |
| Cold, vast, indifferent | Made, maintained, cared for |
| Glass and vacuum | Brass, wood, engraved metal, paper |
| Sci-fi adjacency | Craft and institution adjacency |
| Nobody's responsibility | Somebody's *job* |

A marine chronometer in its wooden box is simultaneously the most precise object
in the room and one of the warmest. That combination — **precision expressed
through craft** — is exactly the register this product needs, and it's what
astronomy couldn't give me.

---

## II. The synthesis: an observatory *is* an institution

The two directions were never in tension. They're the same object seen from two
angles, and the real world proves it:

- **The Royal Observatory, Greenwich** — an institution that exists to define
  time. The entire world agreed to measure longitude from a line in its floor.
- **The US Naval Observatory** — operates the master clock that GPS depends on.
  Boring, permanent, trusted absolutely.
- **The BIPM** — the bureau that keeps the second itself.
- **Harrison's marine chronometers** — instruments built so sailors could trust
  time at sea, tested over decades before anyone believed them.
- **The Nautical Almanac** — published annually since 1767, predicting celestial
  positions *years ahead*, and trusted enough to navigate by.

Every one of these is **an institution whose sole purpose is precise timekeeping,
maintained permanently, and trusted without verification.**

That is a one-line description of TimelyCapsule.

Nobody worries whether Greenwich will still be there. Nobody audits the master
clock. That unexamined confidence is precisely the emotional state Section IV of
the manifesto says we must manufacture aesthetically — and here is a whole
material culture that already does it.

**We are not merging two brands. We are naming one thing correctly.**

---

## III. Meridian — the name was always right

`plan/02-UX-DESIGN.md §6` already calls the design system **"Meridian."**

Under the old cream-and-gold execution the name meant nothing — there was no
meridian anywhere in it. Under this synthesis it becomes literal and
load-bearing:

> A **meridian** is the line at an observatory against which the exact moment is
> determined. A star's *transit* — its crossing of that line — is its precise
> moment, measured by an institution that maintains the line permanently.

Everything the brand needs is in that one sentence: a fixed reference, a moment
of crossing, and an institution keeping it.

**Keep the name. Fix its meaning.** This also means `§6`'s rewrite is a
redefinition rather than a rename, which reduces churn across the plan docs.

### Why the meridian is the right single motif

It is **one line**. That is the entire anti-clutter argument.

| Use | Expression |
|---|---|
| Logo | A line, or a circle crossed by a line |
| Countdown | The capsule approaching the line |
| Unlock | **Transit** — the crossing itself |
| Dividers | Meridian rules in the UI |
| Timeline | The line is the present; capsules approach from the right |
| Empty states | The line, alone |

A motif this reduced cannot become cluttered, because there is nothing to
accumulate. Compare the alternative — a museum of horological references
(escapements, astrolabes, sundials, filing cabinets, wax seals) — which is
exactly how brands in this territory usually fail.

"Transit" is also a genuine double meaning we get for free: the astronomical
crossing, and the passage of something in the post.

---

## IV. How the two layers coexist without clutter

The failure mode is blending. The fix is **hierarchy** — each layer owns a
different dimension, so they never compete for the same real estate.

### Rule 1 — Static is institution. Motion is observatory.

| Layer | Owns | Expressed in |
|---|---|---|
| **Institution** | What it *is* when nothing moves | Typography, palette, materials, structure, logo, spacing, the record |
| **Observatory** | What it *does* over time | Motion, state, countdown, transit, live instruments |

Look at a stopped chronometer and you see an institution: engraved dial,
hallmarks, case, maker's name. Start it and you see an observatory: the beat, the
hands, the approach. Same object. Never confused.

This rule is enforceable in code review: *if it moves, it's observatory; if it
holds still, it's institution.*

### Rule 2 — One instrument, not a collection.

The meridian line is the motif. Not the telescope, the sextant, the hourglass,
the filing cabinet, the wax seal, the envelope, and the orbit. **One.**

Every additional horological object dilutes the first and moves us toward pastiche.

### Rule 3 — Behave, don't depict. *(the anti-literalism rule)*

We never draw an observatory. We never draw an archive. No telescopes, no domes,
no library shelves, no brass instruments rendered as illustration.

The brand is expressed through **how precisely things are set and how they move** —
not through pictures of the things that inspired it. An interface that is
perfectly aligned, whose numerals hold their columns, whose motion is constant
and never springy, *is* the observatory. Drawing one would be an admission that
the design isn't doing its job.

This is the single rule that keeps this from becoming a themed restaurant.

### Rule 4 — Spend the metaphor only where it's earned.

Seal, wait, transit, arrive. Those four moments carry it.

Settings, billing and the tag manager do not get meridian lines. A brand that
applies its metaphor everywhere has stopped meaning anything by the third screen.

---

## V. The core promise

Every decision — logo, type, colour, motion, interaction, landing page, product
UI — must reinforce exactly one thing:

> ## What you seal will come back.
> ### Exactly when you said. Whatever happens in between.

Three clauses, each doing work:

- **"What you seal will come back"** — not stored, not saved. *Returned.* The
  transit metaphor, and the North Star metric (delivery, not creation).
- **"Exactly when you said"** — precision. Not early, not late. The observatory
  layer, and the `never open early` invariant.
- **"Whatever happens in between"** — permanence through company pivots, format
  changes, device churn, decades. The institution layer, and the trust asymmetry.

The promise contains both layers without naming either. That's the test of a
correct synthesis.

### The decision filter

For every design decision, one question:

> **Does this make the promise more believable?**

It adjudicates cleanly, including the uncomfortable cases:

| Decision | Filter |
|---|---|
| Trend-forward gradient | ✗ Suggests we'll redesign again — undermines *whatever happens in between* |
| Misaligned numerals | ✗ Institutional carelessness — undermines *exactly when you said* |
| Springy, bouncy easing | ✗ Springiness reads as uncertainty — undermines *exactly* |
| Confetti at seal | ✗ Whimsy at an irreversible moment — undermines all three |
| Tabular figures holding across magnitudes | ✓ Precision made visible |
| Restraint, boring durability | ✓ The most believable thing we can do |

---

## VI. The one feeling, ten years later

> If someone uses TimelyCapsule once and remembers only one feeling a decade
> later, what should it be?

Not delight. Not beauty. Not nostalgia. Those are all felt *in the moment* and
decay.

The feeling is:

> ## Being kept faith with.

The quiet, rare, slightly astonishing experience of something having kept its
promise to you across a span of time long enough that you'd stopped expecting it
to.

It is unusual precisely because so little does. Companies fold, apps shut down,
formats rot, links break, and everyone has learned to expect that. To have
something arrive, a decade later, exactly as promised, is a small violation of
how the digital world normally behaves — and that violation is the entire
emotional payload of the product.

Note what it isn't: it's not a feeling *about us*. It's the feeling of having
been right to trust. We're the occasion for it, not the object of it — which is
consistent with the manifesto's answer that people should remember a person and a
date rather than a brand.

### The word

One word carries the whole thing, and English gives it to us for free:

> # Kept

- **Kept time** — the horological term. A chronometer keeps time.
- **Kept safe** — stewardship. The institution keeps the record.
- **Kept its word** — the promise. The reason any of it matters.
- **A keepsake** — what the recipient is left holding.
- **The Keeper** — persona P7 is literally named this in the PRD.

Four meanings, one word, no strain. When a single word sits at the intersection
of every layer of a brand, that's usually the brand.

**Brand line candidate:** *We keep time.* — true in both senses simultaneously,
and quietly confident rather than sentimental.

---

## VII. What this means per surface

Not yet designed — direction only, for the phases that follow.

| Surface | Expression |
|---|---|
| **Logo** | The meridian: a mark that reads as a fixed reference with something crossing it. Must work engraved, at 16px, and in one colour. Institution layer — it never animates. |
| **Typography** | Institution. A face with authority and *exceptional tabular figures* — the numerals are the product. Serif remains permissible against a dark ground; the cliché was cream-plus-serif, not serif. |
| **Colour** | Institution. Deep, permanent, unfashionable-on-purpose. One reserved state colour that means *waiting*, so the eye learns it. Avoid anything that will read as "2026". |
| **Motion** | Observatory, and only here. Constant velocity, never springy. Approach and transit. If it bounces, it's wrong. |
| **Interaction** | The Seal (press-and-hold) is commitment — institution. The countdown and transit are observatory. Duration stamp is the artifact. |
| **Landing page** | The promise, stated plainly, with one live instrument demonstrating it. Not a tour of features. |
| **Product UI** | Mostly institution: quiet, precise, exact. Observatory appears at the four earned moments and nowhere else. |

---

## VIII. Open questions

1. **Sign-off on the synthesis** — one institution that keeps time, expressed as
   Meridian, with the static/motion split.
2. **Does "We keep time." survive as the line?** It's strong, but it should be
   pressure-tested against how it reads on a landing page above the promise.
3. **How dark is the ground?** Observatory instruments live in dark rooms; the
   institution's *records* live on paper. The unresolved question is whether the
   product is dark-primary with light record surfaces, or the inverse. This is
   the first real question for the identity phase.
