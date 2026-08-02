# The TimelyCapsule Experience Bible

> The creative foundation. The logo, the design system, T-21, the web app and the
> mobile app all inherit from this document.
>
> **Companion artifact:** https://claude.ai/code/artifact/ad00c57c-c038-4054-97bd-511bdd83b5a6
> Source: `design/08-experience-bible.html` — republish that path to update the
> same URL.
>
> Supersedes nothing. Extends `01`–`06`. Where it contradicts them, §XV records
> the contradiction explicitly — no silent revisions.

---

## Part I · The Manifesto

### The problem nobody has stated yet

We have spent five documents answering *what it looks like*. That work is sound.
But it has been chasing a goal it cannot reach on its own, and it is time to say
so plainly.

The brief is: **be recognisable in seconds, like Apple, Linear, Stripe, Arc,
Nothing.** So look at how each of those is actually recognised:

| Brand | Recognised by | Mechanism |
|---|---|---|
| Nothing | Dot-matrix type, transparency | One gimmick, applied without exception |
| Arc | Colour, spatial play | Personality through motion |
| Apple | Scroll-driven product cinema | Spectacle, expensively made |
| Stripe | Gradient, density handled gracefully | Craft at high information volume |
| Linear | Zero latency, keyboard-first | **Speed** |

Now notice: **we have forbidden ourselves four of those five mechanisms.**
No spectacle (`01 §VII`). No decoration for its own sake (`04`). No depiction of
our metaphors (`05`). And we cannot own speed — Linear owns it, and our whole
premise is that some things are worth waiting for.

That is not a failure of the previous work. It is the logical consequence of
being honest about the brand. But it means recognisability cannot come from
addition, and it cannot come from speed.

### The answer

> ## We will be recognised by our **timing**.
>
> Not our colour, not our type, not our motion. Our **rhythm**.

Every piece of software on earth has the same rhythm: uniform responsiveness.
Press a thing, it answers in about 100ms. Press another thing, same. The tempo
never varies, because varying it is considered a defect.

Ours is **bimodal, and the split carries meaning**:

- Everything reversible is **instant**. Settings, navigation, typing, toggles,
  scrolling, search. No slower than Linear. Reverence in a settings pane is not
  reverence, it is a slow app.
- Everything irreversible is **held**. It stops, completely, before it happens.

Nobody owns this. It is perceptible within seconds of first use. It cannot be
screenshotted, which means it cannot be casually copied. And unlike a gimmick, it
gets *more* meaningful the longer you use the product, because the rhythm is
teaching you which of your actions can be taken back.

### The one sentence

> **Duration is a function of consequence, never of aesthetics.**

If you can undo it, it is instant. If you cannot, it is held. Every timing
decision in this product is decided by that sentence, and any timing that cannot
be justified by it is decoration and gets cut.

### What we are actually making

Not an app. Not a service. **A promise with an interface attached.**

The interface's job is to make the promise believable, then get out of the way
for a decade, then hand over a document and disappear again. We are the
stationery, the vault and the courier. We are never the letter.

---

## Part II · Creative Principles

Ten. Each one is a decision procedure, not a sentiment.

**1 · Duration is a function of consequence.**
The whole system in one line. See above.

**2 · The institution never changes; the instruments always do.**
Carried from `02 §IV`. Chrome, mark, frame and typography hold absolutely still.
Position, temperature, elapsed count and language move constantly. A user
returning after six months must find the building identical and the readings
different.

**3 · Behave, don't depict.**
We never draw an hourglass, a vault, a stamp, a clock face or a capsule. We
*behave* like an instrument: things settle, register, hold, resist. The moment we
illustrate our own metaphor we have admitted the interface isn't carrying it.

**4 · The record is an object, never a background.**
From Gate 1. Bounded on all four sides, at every breakpoint, forever.

**5 · Silence is a design material, and it is the one we spend most.**
Empty frames, held beats, dead air, unfilled space, unsent notifications. Where
other products add, we withhold. This is the single most likely thing to be
"fixed" by well-meaning contributors.

**6 · Certainty before feeling.**
From `03 §IV`. Anticipation is pleasant only when the outcome is not in doubt.
Every gram of certainty we manufacture converts directly into pleasure during the
wait. So: no ambiguous states, no "should arrive around", no soft language about
delivery. Ever.

**7 · The moment belongs to the recipient.**
Not to us. No branding in the reveal, no "powered by", no celebration of our own
cleverness, no confetti, no share prompt at the emotional peak. We are not in the
room.

**8 · Never simulate what we can state.**
No fake progress, no optimistic UI on anything consequential, no animated
"encrypting…" theatre. If we say it is sealed, it is sealed. Security theatre is
the fastest way to lose the trust the whole product runs on.

**9 · Design for the worst day, not the best.**
The person composing may be dying. The person receiving may be grieving.
Research on end-of-life products is unambiguous: **grief impairs attention.** One
decision per screen, no dashboards at emotional moments, no cleverness that
requires concentration to parse.

**10 · Reliability is the marketing.**
Nobody will tell a friend about our easing curves. They will tell a friend that
it arrived. Every engineering hour spent on delivery guarantees is a creative
investment, and the reverse is not true.

---

## Part III · The Five Signature Devices

A brand is recognised by a small number of things applied without exception.
Five, and no more. Anything not on this list is supporting cast.

### 1 · The Held Beat — *the rhythm*
The stillness before consequence. Our signature interaction, and the one that
makes us recognisable in seconds. Specified in Part VI.

### 2 · The Dual Clock — *the component*
Elapsed and remaining, weighted equally, always together. Carries more brand
than the logo (`03 §VII`). It is the thing that appears in every screenshot
because it is on every screen.

### 3 · The Two Registers — *the surface*
Instrument dark and sans; record paper and serif. Validated at Gate 1.

### 4 · The Duration Stamp — *the artifact*
The postmark of duration. The most screenshotted object in the product, and the
only thing we make that is designed to leave the product.

### 5 · The Meridian — *the mark*
The reference line. It is the logo, the transit point, the origin of the reveal,
and the axis of the waiting screen. One geometric idea doing five jobs.

**The discipline:** if a proposed element is not one of these five and does not
directly serve one of them, it is decoration. Cut it.

---

## Part IV · The Emotional Timeline

Seven phases. Each names the dominant feeling, the failure mode, and the design
obligation. **This is the most useful table in the document** — every screen we
build sits in exactly one row.

| # | Phase | Dominant feeling | Fails when | Obligation |
|---|---|---|---|---|
| 1 | **Arrival** (stranger) | Curiosity + scepticism — *"will this still exist in 2041?"* | We answer with charm instead of evidence | Make the wait *felt* in seconds, then answer the survival question honestly |
| 2 | **Composition** | Vulnerability, blankness, avoidance | We treat it as data entry | **The hardest moment in the product.** Get them past the blank page |
| 3 | **Sealing** | Commitment, a flinch of fear | We make it feel casual | The held beat at full weight. Irreversibility stated plainly, once |
| 4 | **The long wait** | Trust decaying into doubt | Silence reads as abandonment | Proof of life. Position, not progress |
| 5 | **Approach** | Anticipation sharpening | We nag, or we go quiet | Legibility without urgency |
| 6 | **Reveal** (recipient) | Being addressed across time | We are visible in the moment | Disappear |
| 7 | **Custody** | Wanting to keep it | We make it feel rented | Export, print, download. It is theirs, not ours |

### The finding this table produces

> **Almost all of our craft has gone into phase 6, which lasts six seconds.
> Phase 2 is where people actually struggle, and it is where they abandon.**

Writing to someone in the future is genuinely difficult. People open the composer
and freeze — not because the UI is unclear, but because the task is emotionally
enormous. A blank field addressed to your daughter in fourteen years is one of the
harder things software has ever asked of anybody.

We have designed a magnificent reveal for letters that never got written.

**This is the largest single gap in the work so far**, and it is now the priority
ahead of the logo and the design system. See Part IX.

---

## Part V · The Interaction Constitution

Twelve rules. Testable in review. A PR either complies or does not.

1. **Reversible is instant; irreversible is held.** No exceptions, no "this one
   feels better slow".
2. **One decision per screen at any emotionally loaded moment.** Composition,
   sealing, recovery, and reveal. Density is permitted only in management views.
3. **Never surface a memory without consent.** No "on this day", no unbidden
   excerpt, no preview of sealed content anywhere, ever — including our own
   admin surfaces, which cannot read it anyway.
4. **State is always stated in text**, not only in colour, position, or motion.
   The temperature ramp is never the only carrier of meaning (`05 §Two rules`).
5. **Ceremony is skippable at any point, always, without penalty.** A tap
   advances to the end state. The reveal belongs to the recipient; if they want
   the letter now, they get the letter now.
6. **Ceremony never repeats.** Returning to an opened capsule shows the record at
   rest. Ceremony repeated is spectacle.
7. **But re-reading is trivial and unlimited.** Rule 6 governs the *animation*,
   never the *document*. Someone re-reading a letter from a dead parent must
   never be made to wait, and must be able to keep a copy outside our walls.
8. **No modal ever interrupts the wait or the reveal.** Consent, upsell, cookie,
   review prompt, feature tour: none of these exist on those paths.
9. **The recipient path assumes nothing.** No account, no app, no modern browser,
   no fast connection, no prior exposure to our conventions (`P8`).
10. **Errors state what happened and what happens next**, in the record register,
    never in red-alert visual language. A delivery problem is an institutional
    failure and is written like one.
11. **Nothing is ever undone silently, and nothing consequential is ever
    optimistic.** We do not show success before we have it.
12. **No dark patterns, at any scale.** No urgency, no scarcity, no streaks, no
    friction on cancellation, no dimmed decline buttons. We permanently forfeited
    the urgency toolkit in `01 §VII`; this is the operational form of it.

---

## Part VI · The Motion Constitution

### The three tiers

| Tier | Applies to | Timing | Easing |
|---|---|---|---|
| **Instant** | Navigation, settings, typing, toggles, search, scroll, tabs | 0–120ms, or no transition at all | `cubic-bezier(.2,0,0,1)` |
| **Considered** | Entering the composer, opening a capsule, changing what you are looking at | 200–400ms | `cubic-bezier(.2,0,0,1)` |
| **Held** | Seal, transit, reveal, permanent deletion | **A full stop of 200–400ms**, then 800–2500ms | `linear` or `cubic-bezier(.32,0,.24,1)` |

### The held beat, specified

The signature. It has three parts and all three are mandatory:

1. **The approach** — constant velocity. Never eases *out*, because easing out
   anticipates arrival and the whole point is that arrival is not yet.
2. **The stop** — 200–400ms of total stillness. Not a slow section. **Zero
   movement.** Every animation library, and every engineer, will want to peak
   here. Stopping instead is what converts a transition into a threshold.
3. **The consequence** — which then happens as an *instant state change*, not a
   tween. A seal is either intact or it isn't.

### Rules

1. **Constant velocity by default.** Springs, bounces and overshoot are
   permanently banned. Physical materials in an instrument do not bounce.
2. **Never ease out into completion**, except at transit, where arrival is the
   entire point.
3. **Nothing may read as *loading*.** No spinners, no progress bars, no
   shimmer, no skeleton pulse. Layout-stable placeholders in the instrument
   register, and no animation on them.
4. **Silence is timing, not motion — so it survives `prefers-reduced-motion`.**
   All held beats are preserved when motion is reduced. This is not a
   concession; the beats *are* the meaning, and the reduced-motion version is
   arguably the purer one.
5. **The mark never animates.** Institution is static.
6. **One orchestrated moment beats five scattered ones.** Hover
   micro-interactions are near-zero across the product.
7. **Registers never overlap in time.** From Gate 1. Instrument clears → empty
   frame → record arrives. Never a crossfade.
8. **CSS unless proven otherwise.** Gate 1 built the full reveal from a single
   scalar in plain CSS. Three.js and all WebGL remain permanently out (`05`).
9. **Cap every glow at 6% opacity.** Lighting effects grow every time somebody
   touches them.

---

## Part VII · Sound Philosophy

> ### There is no sound. That is the sound design.

`06` proposed one soft mechanical release at the seal, default off. **Reversing
that to a permanent never**, on reflection about where reveals actually happen.

A reveal occurs on an unknown device, in an unknown room, at an unknown moment.
It may be a commute, an open-plan office, a hospital ward, a funeral. We have no
idea, we cannot ask, and the recipient has no relationship with us that would
license us to make noise in their space.

Silence is also the only choice consistent with everything else: we do not
decorate, we do not celebrate ourselves, and we are not in the room.

**The single narrow exception**, and only if it is ever requested: haptics on the
*seal*, on the creator's own device, in an interaction they initiated. That is
the one moment where the user is deliberately present, has consented by acting,
and is on hardware they chose. Never on the reveal. Never audio.

---

## Part VIII · Copy Philosophy

### Voice

Plain, exact, unhurried. The register of an institution that has no need to
impress you because it expects to outlive you. Closer to a shipping manifest or a
land registry than to a greetings card.

### Rules

1. **State, never sell.** "Sealed until 14 March 2041." Not "Your memory is
   safely on its way!"
2. **Never apologise for the wait, never celebrate its end as relief.**
3. **Name the gap in human terms, sparingly** (`03 §V.6`). `2036-05-14` is a
   string; *"the spring she turns eighteen"* is a scene. This is where copy
   outweighs visual design, and it is also where we are one adjective away from
   being cloying.
4. **Dates are always literal and absolute.** Relative time may accompany a date;
   it may never replace one.
5. **No exclamation marks.** No emoji. Not in product, notification, email or
   marketing. This is absolute, and it is one of the cheapest recognisability
   wins available.
6. **Second person for the creator, third for the institution.** "You sealed
   this." "It will be delivered." We do not say "we" — an institution is not a
   personality.
7. **Never use the word "just".** It minimises, and nothing here is small.
8. **Errors:** what happened, what it means, what happens next. No apology, no
   blame, no jargon.

### The vocabulary

| Use | Never |
|---|---|
| Seal, sealed | Save, submit, lock |
| Record | Post, entry, content |
| Deliver, delivered | Send, push, drop |
| Travelled / remaining | Progress, % complete, ETA |
| Kept | Stored, retained, backed up |
| Recipient | User, contact, friend |
| The wait | The countdown, the delay |

---

## Part IX · Composition — the underweighted phase

The gap identified in Part IV. Direction, not yet design.

**The task:** a person must write something true to someone who will read it at a
distance they cannot imagine. The obstacle is not the interface; it is that the
task is enormous and the page is blank.

**What is forbidden:** templates, prompts-as-content, AI-written suggestions,
mood pickers, and anything that would produce a letter the person did not write.
The value of the artifact is that it is *theirs*. We would be automating away the
only thing that matters.

**What is available:**

- **Address the reader before the writing.** Naming who it is for, and what age
  they will be, converts an abstraction into a person. The recipient's future age
  is the single most affecting piece of arithmetic we can perform.
- **Questions, not templates.** *"What do you want them to know that you might
  not say out loud?"* — a question produces the person's own words; a template
  produces ours. One at a time, dismissible, never inserted into the document.
- **Make it resumable without shame.** A draft that sits for three weeks is
  normal, not a failure. No streaks, no nudges, no "you left something unfinished".
- **Sealing must be separable from writing.** The decision to commit is its own
  emotional act and must never be a side-effect of finishing a sentence.
- **One decision per screen** (Constitution 2). The composer is the most likely
  place for us to violate this and the least affordable.

---

## Part X · Landing Page Philosophy · T-21

**The job is not to explain the product. It is to make a stranger feel the wait,
then answer the only question that actually matters.**

That question is: **"will you still exist?"** Every other objection is
downstream. A person deciding whether to write to their daughter in fourteen
years is evaluating our institutional durability, not our feature set.

### Structure

1. **A thesis, not a hero.** The most characteristic thing in our world is the
   passage of time made legible. The opening should *be* a dual clock — a real
   duration, moving, with no explanation. Not a headline about memories.
2. **Compress the wait.** The one place we may accelerate time, because
   demonstrating a decade is otherwise impossible. This is the Orbit Scrub's real
   job (`03 §VII`) and the only permitted spectacle in the entire product.
3. **Answer survival with evidence.** Open architecture, escrow arrangements,
   export guarantees, what happens if the company dies. Boring, specific, and
   the most persuasive section on the page. Most competitors will not dare.
4. **Show the record, not the app.** One paper artifact. No device mockups, no
   floating UI cards, no dashboard screenshots.
5. **No testimonials at launch.** We have not kept anything yet. Claiming
   otherwise on a trust product is the worst available trade.

### The unusual rule

**The marketing site must be slower than the app** — in tempo, not performance.
It is the only surface allowed to hold a beat for effect rather than for
consequence, because its job is to transmit a feeling rather than to execute a
task. Everywhere else, tempo is earned. Here it is the message.

---

## Part XI · Onboarding, Notification, Empty State, Loading

### Onboarding

**There isn't one.** No tour, no checklist, no progress meter, no sample capsule.
The first act is composition, and anything preceding it delays the only thing
that matters. What we owe instead: the master-key and recovery-kit moment handled
with total clarity, because it is the one genuinely unfamiliar concept and the
one place where confusion is unrecoverable.

### Notifications

Four sends in a decade, and no more:

1. **Sealed** — a receipt. The only immediate one.
2. **Proof of life** — rare, unrequested, un-actionable. *Still here, still
   counting, nothing for you to do.* No CTA, no metric, no streak (`03 §VI`).
   Building it, in the record register, framed as a custody receipt.
3. **Approach** — once, close to transit, to the recipient. Factual.
4. **Delivered** — the arrival.

Everything else is forbidden: anniversaries, re-engagement, feature
announcements, "your capsule misses you", and — per Interaction Constitution 3 —
anything that surfaces a memory the person did not ask to be shown.

### Empty states

**The waiting state is the primary screen** (`03 §V.3`) and gets more craft than
the composer or the reveal. A genuinely empty account, however, gets one line and
one action. No illustration, no mascot, no encouragement.

**Acceptance test, unchanged from `03 §VII`:** *does a sealed capsule sitting
untouched for three years look like something valuable is happening — or like
nothing is happening?*

### Loading

We mostly should not have any. The app is small state over a fast API. Where it
is unavoidable: layout-stable placeholders in the instrument register, **no
shimmer, no pulse, no spinner**. Motion Constitution 3 makes this absolute. If a
surface genuinely needs a loading indicator, that is a performance bug filed
against engineering, not a design problem to be decorated.

---

## Part XII · Imagery, Iconography, Illustration

**Photography:** objects only, never people. Instruments, paper, seals, cases,
mechanisms — shot flat and forensically, evenly lit, at scale, like a museum
accession photograph or an auction catalogue plate. Never lifestyle, never a
model looking wistfully at a phone, never hands holding a device.

**Illustration: none.** Permanently. We do not illustrate our own metaphors
(`05`).

**Iconography:** drawn as engraved marks, not as UI glyphs — single weight,
geometric, unrounded, no filled variants. An icon never appears without a label
at any consequential moment.

**The imagery of the product is its own artifacts.** The record, the stamp, the
seal, the clock. We photograph nothing we did not make, and we make very little.

---

## Part XIII · Accessibility & Performance Philosophy

**Accessibility is the trust argument, not a compliance exercise.** A product
whose entire premise is *this will reach the person you intend* cannot ship a
reveal that fails for someone using a screen reader. That is not an edge case;
it is the product failing at the only thing it does.

- Every state carried in text, never in colour or motion alone.
- All held beats preserved under `prefers-reduced-motion`.
- WCAG AA minimum, computed and never estimated. The corrected ramp (`05`) is the
  precedent: eyeballing shipped a 2.72 contrast into the most-viewed component.
- Reveal announces via `aria-live`, focus moves to the letter heading.
- The record register is the accessible-by-default surface: paper, serif, high
  contrast, no motion. That the recipient path is our most accessible surface is
  by design, not coincidence.

**Performance is a trust signal.** A slow product does not feel like it will last
a decade. Lighthouse ≥95, and the reveal path must work on a three-year-old
Android over a poor connection — that is `P8`, and it is why WebGL is
permanently out.

---

## Part XIV · Memorable, Screenshotted, Shared, Told

### They will screenshot: **the Duration Stamp**
The one object designed to leave the product. Composed at share aspect ratio,
legible at thumbnail, content-blind by construction. It says how long, and
nothing about what.

### They will share: **the commitment, never the content**
Zero-access encryption means we *cannot* build content sharing. Rather than a
limitation, this is the sharpest brand asset we have: our share artifact contains
a duration and nothing else. *"Sealed until 14 March 2041."* Necessarily
mysterious, because the mystery is architectural.

The constraint is the feature. Do not apologise for it; lead with it.

### They will remember: **the empty frame**
Gate 1's discovery. The 200ms where the instrument has gone and the record has
not arrived. People do not remember animations; they remember the moment they
held their breath.

### They will tell friends: **that it arrived**
Not about our design. About the fact that a thing they set up in 2026 turned up
in 2041 exactly as promised. This is the only word-of-mouth we will ever get, and
it is earned entirely in engineering. Creative Principle 10.

---

## Part XV · Challenges to previous decisions

The brief asked me to challenge everything. Seven, ordered by how much they cost
if ignored.

### 1 · The name works against the brand — **unresolved, and the biggest risk**

We have built an identity that is grave, institutional and horological, for a
product called **TimelyCapsule**.

*Timely* means punctual or opportune — a business-software word, and mildly
ironic for a product about long waits. *Capsule* is fine but generic. The
compound is a SaaS name, and it will fight every piece of design we make.

You cannot be recognised in three seconds if the first word people read
contradicts everything the next three seconds say.

This is a founder decision, not a design one, and I am not going to make it
inside a design document. But it is the largest unaddressed threat to the
recognisability goal in this brief, and it gets harder to change every week.

### 2 · "Meridian" and "TimelyCapsule" are not reconciled

`02 §II–III` says *"one institution that keeps time — Meridian"*. `05` uses
Meridian as the design-system name. These are different claims. Meridian is
currently both the brand and a subsystem, which is a contradiction we will
propagate into token names, component names and marketing copy.

**Recommendation:** Meridian is the *institution* — the name of the thing that
keeps the promise. The design system should take a subordinate name. This is also
the cheapest available route out of challenge 1, if you want one.

### 3 · Gate 1 was validated for the creator. The recipient is untested.

**Gate 1 stands**, but its scope was narrower than the verdict claimed, and I
should say so before it gets built on.

The register transition reads as ceremony **because you have learned the
instrument register**. You have watched that dark screen for years. The paper
arriving means something because you know what it replaced.

**The recipient has never seen the instrument register.** They arrive cold, from
a link, often on a phone, with no account and no exposure to our conventions
(`P8`). For them there is no register *change*, because there was no register.
They see a dark screen for a few seconds and then a letter.

That may still be good — the physical grammar of a seal opening needs no product
literacy, which is what Gate 1 answered in Q4. But it is a different experience
than the one we validated, and it belongs to the person the moment is *for*.

**Action:** add **Gate 5 — the cold recipient path**, tested with someone who has
never seen the product, on a real cheap Android, from a real link. It should
outrank gates 2–4. Everything else we are polishing is for the creator; this is
for the person who matters.

### 4 · Sound: reverse "default off" to "never" — **changed**
Part VII. `06`'s implementation note is superseded.

### 5 · "Show elapsed as prominently as remaining" breaks at both ends — **refined**

`03 §V.1` is right in the middle and wrong at the edges.

On day one of a ten-year wait, *"Travelled: 0 days"* against *"Remaining: 3,652
days"* is demoralising — the exact impatience the principle exists to prevent.
And in the last hours, elapsed is emotionally irrelevant; the reader is not
contemplating a journey.

**Refinement:** the Dual Clock's *weighting* shifts across the life of the
capsule — remaining-led at the start, genuinely equal through the long middle,
and remaining-led again at the approach. Both figures are always present; the
emphasis moves. This makes the component itself an instrument that changes with
time, which is Creative Principle 2 applied to the thing that carries the most
brand.

### 6 · Proof of life: build it — **decided**
`03 §IX.3` left it open. It is the only answer to decade-long silence, and
silence is the failure mode of the entire trust asymmetry. Specified in Part XI
as a custody receipt in the record register.

### 7 · Priority order changes — **changed**

`05` scheduled: logo → design system → T-21 → web → mobile.

Part IV shows the composer is where people abandon and where the least thought
has gone. A perfect logo on a product nobody finishes writing in is worthless.

**Recommended order:** cold-recipient gate → **composition experience** → logo →
design system → T-21 → web → mobile.

---

## Part XVI · Anti-patterns — the permanent never list

Additions marked ★; the rest are consolidated from `01`–`06`.

**Motion & feedback:** spinners · progress bars · skeleton shimmer ·
spring/overshoot easing · confetti · parallax ★ · scroll-jacking ★ · hover
flourishes ★ · animated logos · countdown urgency animation ★

**Sound:** all of it ★

**Growth & engagement:** streaks · badges · gamified waiting · re-engagement
notifications · anniversary nudges · "your capsule misses you" · referral
prompts at emotional moments ★ · social proof counters ★ · testimonials before we
have kept anything ★

**Copy:** exclamation marks ★ · emoji ★ · the word "just" ★ · "oops" ★ ·
apologising for the wait · relative dates without absolute ones ★ · "we" as a
personality ★

**Visual:** celestial imagery · photography of people · illustration of our
metaphors · cream grounds · device mockups ★ · floating UI cards ★ · filled
icons ★ · the uncorrected ramp · brass used for anything except waiting

**Structural:** Three.js and all WebGL · paper as a page background · registers
crossfading ★ · modals on the wait or reveal path ★ · optimistic UI on
consequential actions ★ · onboarding tours ★ · AI-generated letter content ★ ·
any preview of sealed content anywhere ★

**Business:** dark patterns of every kind · friction on cancellation ·
gating delivery of a sealed capsule behind payment state, under any
circumstances, ever

---

## Part XVII · The North Star

Every previous document has produced a filter. This is the last one, and it
outranks them.

> ## Nobody says *"what a beautiful app."*
> ## They say *"I can't believe it actually came."*

The product succeeds by being **forgotten in favour of its contents**. The
highest possible outcome is that someone reads a letter from a person they have
lost, is undone by it, and cannot afterwards describe a single thing about the
interface.

This is an uncomfortable north star for a design team, which is exactly why it is
the right one. It means our craft is measured by how little of it is noticed — and
it makes every decision in this document testable:

> **Does this make the letter matter more, or does it make us matter more?**

If the second, it does not ship, regardless of how good it is.

### The three filters, in order

1. Does this make the promise more believable? (`02 §V`)
2. Does the waiting state look like something valuable is happening? (`03 §VII`)
3. Does this make the letter matter more than us? (`07`)

---

## Part XVIII · What happens next

1. **Gate 5 — the cold recipient path.** Elevated above gates 2–4. §XV.3.
2. **The composition experience.** The largest gap. Part IX.
3. Gates 2–4: serif at density · corrected ramp on real hardware · the Dual Clock
   (now including the shifting-weight refinement, §XV.5).
4. Logo — system v + ii.
5. Design system refresh, then T-21, web, mobile.

**Two founder decisions blocking nothing but getting more expensive:** the name
(§XV.1) and the Meridian/TimelyCapsule reconciliation (§XV.2).

**Closing obligation, carried since `00 §governance`:** the redesign ends by
rewriting `plan/02-UX-DESIGN.md §6`, or future sessions build against the stale
spec and silently undo all of this.
