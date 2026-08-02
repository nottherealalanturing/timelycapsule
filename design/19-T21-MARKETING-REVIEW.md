# T-21 — Marketing Experience Review

> UX and information-architecture review only. No strategy is changed; every
> recommendation traces to `01`–`11` as already approved. No implementation.

---

## 0 · Diagnosis

The page is not badly built. Two of its parts — the **Thesis Clock** and the
**Orbit Scrub** — are real working instruments, and guest mode already ships at
`/try`. The problem is what surrounds them.

**Three specific failures.**

### 0.1 · The page is arranged as a SaaS explainer, not as the product's own life

Current order: hero → ten years compressed → how it works → how it is kept →
what arrives → occasions → pricing + FAQ.

That is the standard shape: *hook, explain, reassure, convert*. It means the two
genuinely good instruments are sandwiched between claim-based sections that
dilute them. A visitor meets a live decade in section 2, then immediately reads
three cards explaining what they just felt.

`07 §IV` already contains the right sequence — the emotional timeline the
product itself runs on. The landing page should be that timeline, compressed.

### 0.2 · Nothing on the page can be *done*

Every section is read or watched. The one exception is the Orbit Scrub, and
what it scrubs is a demonstration rather than the visitor's own thing.

Meanwhile **guest mode exists, requires no account, and is never used on the
landing page.** That is the single largest unused asset in T-21. `07 §XI` says
there is no onboarding and the first act is composition; `09 §IV` says the blank
page is the largest barrier in the product. Putting a working composer on the
landing page attacks both at once.

### 0.3 · The pricing tiers are a category error

`PlanCards` currently ships four tiers, including:

- **Family** — "6 seats"
- **Business** — "$10/seat/mo", "1000 recipients per campaign"

*Seats* and *campaigns* are the vocabulary of team software and marketing
automation. This is a product whose one word is **Kept** (`02 §VI`) and whose
promise is made to a single named person. A seat-based B2B tier is not a
mismatch of tone; it describes a different product.

`09 §IX` already established that institutions — schools, weddings, companies —
have a *different custody model*, not a bigger plan. They should not be a
pricing tier at all.

> **The claim/evidence rule this review applies throughout:** for a trust
> product, a feature section is a *claim* and a working instrument is
> *evidence*. Claims cost credibility. Demonstrations earn it. Every section
> below is judged on which one it is.

---

## 1 · Proposed structure, top to bottom

Eleven sections. The spine is `07 §IV`'s emotional timeline: **see time → feel a
decade → write something → seal it → wait → receive → verify → decide.**

| # | Section | One-line job |
|---|---|---|
| 0 | **Header** | Get out of the way |
| 1 | **The thesis** | Show time moving before saying anything |
| 2 | **Ten years, compressed** | Let a decade be *felt*, not described |
| 3 | **Write one** | Turn a reader into a participant |
| 4 | **Seal it** | Deliver the signature rhythm — the held beat |
| 5 | **The years between** | Make waiting look like custody, not storage |
| 6 | **What arrives** | Pay off the wait with the register change |
| 7 | **Will you still exist?** | Answer the only real objection, with evidence |
| 8 | **Occasions** | Let people find their own reason |
| 9 | **What it costs** | Two numbers and one unusual promise |
| 10 | **Questions** | Remove the last small frictions |
| 11 | **Footer** | Institutional, quiet, complete |

---

## 2 · Purpose of every section

### 0 · Header
Mark, wordmark, `Sign in`, one CTA. Nothing else. No nav menu of feature pages —
there are no feature pages.

### 1 · The thesis
**Purpose:** establish, before any sentence, that this product is about elapsed
time. Per `07 §X.1`, the opening *is* a Dual Clock — a real duration, moving, no
explanation. One line of copy carries the promise from `02 §V`. One CTA.

**Currently:** correct in kind, but sits above a conventional headline block that
argues with it. The clock should be the largest thing on the screen.

### 2 · Ten years, compressed
**Purpose:** the one permitted spectacle (`07 §X.2`). A visitor cannot be shown a
decade any other way.

**Change:** the scrub should drive **the real waiting screen**, not an
abstraction. As the visitor drags, they should watch the actual Dual Clock, the
actual Transit motif and the actual temperature ramp move across ten years —
i.e. the exact component the app renders. That converts the section from a
diagram into a preview of ownership.

### 3 · Write one
**Purpose:** participation. The visitor writes a real line to a real person and
picks a real date, in the real composer, with no account.

This is the emotional turn of the page and the top of the funnel. It also does
what `09 §IV` says nothing else in the product does: it gets someone past the
blank page while their motivation is highest.

**Constraint:** it must be the *short-form* path (`09 §XIV.3` / `§XVI.7`), not
the full composer. One field, one date. Anything heavier and we have put the
hardest emotional labour in the product on a stranger's first scroll.

### 4 · Seal it
**Purpose:** deliver the thing `07 §I` says we are recognised by — **timing**.

Pressing seal runs the real ceremony: approach at constant velocity, a 400ms
dead stop, then an instant state change. This is the only place a stranger can
experience the held beat, and it is the most ownable two seconds we have.

### 5 · The years between
**Purpose:** answer "what does owning this actually feel like for a decade?"

Shows the real waiting screen at rest, and states the custody behaviours plainly
— proof of life, address re-verification, export. `03 §VII`'s acceptance test
applies verbatim: *does a sealed capsule sitting untouched for three years look
like something valuable is happening?* If this section reads as empty, the
section has failed.

**No streaks, no engagement mechanics, no notifications-as-features** — those are
banned (`07 §XVI`) and would invert the whole argument.

### 6 · What arrives
**Purpose:** the payoff, and the only place the record register appears.

Play Gate 1's transition: instrument clears → empty frame → the record arrives,
paper and serif, bounded. Then let the visitor read a real letter and see the
Duration Stamp.

This is legitimate here. `07 §II.7` forbids *us* being present at the recipient's
real moment; it does not forbid demonstrating the moment to a stranger who owns
nothing yet.

### 7 · Will you still exist?
**Purpose:** the section `07 §X.3` calls the most persuasive on the page and the
one most competitors will not dare to write.

Specific, boring, verifiable: zero-access encryption stated as arithmetic
(`09 §VIII` — we *cannot* read contents, so we can never build a feed), export
guarantees, what happens to sealed capsules if the company dies, what happens if
you lose your key, and how we keep being able to *find* your recipient
(`09 §I` — the failure that beats 90% of physical time capsules).

**No testimonials** (`07 §X.5`). We have not kept anything yet.

### 8 · Occasions
**Purpose:** let a visitor self-identify. Keep the three occasion pages, but
reframe from use-case cards to **durations**: *eighteen years · ten years · one
year*. `09 §IV`'s eight life events are the source; the three shipped pages
(future self, new parents, couples) map to the Future Self, Parent and Couple
archetypes and should stay.

### 9 · What it costs
**Purpose:** remove money as a source of doubt. See §6 below.

### 10 · Questions
Six to eight, factual, no marketing voice. The ones that actually block: *can I
change it after sealing? what if they change email? what if I die? what if you
die? can you read it? what if I stop paying?*

### 11 · Footer
Legal, help, contact, the mark. Institutional and quiet.

---

## 3 · Sections that must contain real product UI

Not screenshots, not illustrations — the shipped components.

| Section | Real component |
|---|---|
| 1 Thesis | `DualClock` (already) |
| 2 Compressed | The **waiting screen** itself, scrubbed |
| 3 Write one | Composer letter + schedule blocks (short-form) |
| 4 Seal it | `SealCeremony` |
| 5 Years between | Waiting screen at rest, `TransitMotif` |
| 6 What arrives | Reveal transition, `Record`, Duration Stamp |
| 7 Survival | The real recovery-kit record and a real export artifact |

**Zero illustrations anywhere.** `07 §XII` already forbids illustration and
photography of people; the imagery of this product is its own artifacts.

**One consequence worth flagging:** this makes the marketing site depend on
`@tc/ui-web` and several app components. That is the point — it guarantees the
site cannot drift from the product — but it does mean marketing changes can
break on component changes, and the T-20 bundle budget (**~738 KiB headroom**)
now has to cover the marketing route too. Worth watching, not a blocker.

---

## 4 · Interactions that should be live

Five. Everything else is static.

1. **The thesis clock ticks.** Already true.
2. **The decade scrubs.** Visitor-driven only — `07 §XVI` bans scroll-jacking and
   parallax. It moves when they move it.
3. **The composer accepts real input.** Type, pick a date.
4. **The seal ceremony runs on demand.** Skippable, per Interaction
   Constitution 5.
5. **The reveal plays on demand**, and is replayable *here only* — the product
   itself never replays a ceremony (Interaction Constitution 6).

**Deliberately not live:** no auto-playing anything, no scroll-triggered
reveals, no counters animating on entry, no hover flourishes. `07 §VI.6` — one
orchestrated moment beats five scattered ones.

---

## 5 · Product moments that become marketing moments

| Product moment | Marketing role |
|---|---|
| **Dual Clock** | The hero. It is on every screen, so it is the honest thing to lead with |
| **Ten-year scrub** | The only permitted spectacle |
| **Held beat / seal** | The signature rhythm — our one ownable two seconds |
| **Waiting screen** | The proof that waiting looks like custody |
| **Register change** | The payoff, and the only appearance of paper |
| **Duration Stamp** | The shareable artifact — content-blind by construction |
| **Transit motif** | The connective tissue between sections |

**Not used in marketing:** the mark never animates (`05`); no notification
demos (there are only four sends in a decade and none of them is a feature).

---

## 6 · Pricing — recommend simplifying to two tiers

### Remove
- **Business** ($10/seat, "1000 recipients per campaign"). Seats and campaigns
  describe team software. `09 §IX` says institutions are a different product with
  a different custody model; they belong behind a single sentence and an email
  address, not a card.
- **Family** ("6 seats"). A family is not seats. `09` makes families the
  retention archetype and the annual rite a family behaviour, so a family
  offering is right *eventually* — but it should be designed from that
  behaviour, not shipped as a seat count. Defer.

### Keep
- **Free** — enough to prove the promise is real.
- **Premium** — monthly and annual, at the figures already set in the build plan
  ($7.99 / $59.99). Annual priced at ten months, as now.

Two cards, not four. A product with one job should not present four decisions.

### Add one line that no competitor can copy

> **If you stop paying, everything you have already sealed still arrives.**

This is already true — "delivery of sealed capsules is never gated by payment
state" is a hard rule in `CLAUDE.md`. Stating it on the pricing page converts an
internal guarantee into the most disarming sentence on the site, and it directly
answers the fear that stops people committing to a decade-long product.

**Gift Pass** ($4.99) stays, but as a line under Free rather than a third card.

---

## 7 · Existing T-21 ideas — keep / change / remove

| Idea | Verdict | Reason |
|---|---|---|
| Thesis Clock hero | **Keep**, enlarge | Already correct per `07 §X.1`; needs to dominate rather than share the fold |
| Orbit Scrub | **Keep**, re-point | Should scrub the *real waiting screen*, not an abstraction |
| "How it works" 3 steps | **Change** | Becomes sections 3–4, where the steps are *performed* instead of described |
| "How it is kept" | **Change** | Becomes §7 Survival — evidence, not reassurance |
| "What arrives" | **Change** | Becomes the live register change, not a description of it |
| Occasions | **Keep**, reframe | Durations rather than use cases; three pages already shipped |
| Pricing cards ×4 | **Change** | Two tiers; see §6 |
| FAQ | **Keep**, tighten | Answer objections, not features |
| Legal + help | **Keep** | Already correct and quiet |
| Guest-mode CTA | **Keep**, promote | Should be the section-3 composer, not just a button |
| Business tier | **Remove** | Category error |
| Family tier | **Remove for now** | Right idea, wrong shape |
| Testimonials | **Stays out** | `07 §X.5` — we have kept nothing yet |
| OG images | **Unchanged** | Static per-capsule-type, per `11 §2.3` |

---

## 8 · How it should feel, first scroll to final CTA

A deliberate emotional progression, not a mood.

| Section | Intended feeling | Failure mode |
|---|---|---|
| 1 Thesis | *Oh — this is about time.* Recognition before comprehension | Reads as a countdown gimmick |
| 2 Compressed | *A decade is longer than I hold in my head.* Slight vertigo | Reads as a slider toy |
| 3 Write one | *I have someone in mind.* The turn from reading to meaning it | Feels like a signup form |
| 4 Seal it | *That stopped.* The first thing that feels unlike other software | Reads as a loading state |
| 5 Years between | *It would be looked after.* Calm, not boredom | Reads as an empty screen |
| 6 What arrives | *Oh.* The payoff — quiet, not triumphant | Reads as a product demo |
| 7 Survival | *These people have thought about this.* Sober confidence | Reads as legal boilerplate |
| 8 Occasions | *That one is mine.* Self-recognition | Reads as personas |
| 9 Cost | *That is fair, and I am not trapped.* Relief | Reads as a paywall |
| 10 CTA | *I want to write it now.* Resolve, not urgency | Reads as a conversion push |

**The through-line:** the page should get *slower* as it descends, not faster.
`07 §X` is explicit — the marketing site is the one surface allowed to hold a
beat for effect rather than for consequence. Most sites accelerate toward the
CTA; this one should decelerate into it, so the final action feels considered
rather than pushed.

**One sentence for the whole page:**

> A stranger should finish it having *already waited a little*, and know exactly
> who they would write to.

---

## 9 · What I need from you before implementing

1. **Approve or amend the eleven-section structure** (§1).
2. **Confirm pricing simplification to Free + Premium** and the removal of
   Business/Family (§6). This is a product decision, not a design one.
3. **Confirm the landing composer writes a real guest capsule** rather than a
   sandbox. Real is far stronger, but it means a stranger can create data from
   the marketing page — worth being deliberate about.

Nothing else blocks. Once the structure is agreed, implementation is
straightforward: most components already exist, and the work is composition plus
one new short-form composer path.
