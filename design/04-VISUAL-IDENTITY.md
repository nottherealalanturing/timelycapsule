# Meridian — Visual Identity

**The design foundation for TimelyCapsule.** Every subsequent phase inherits
this: logo, design system, marketing site, web UI, mobile UI, email, brand assets.

> **Accepted constraints** (settled, not reopened): stewardship not storage ·
> waiting is the manufacturing process · the recipient changes, the capsule
> doesn't · trust is the product · precision + permanence + promise produce
> anticipation · no urgency · no gamified waiting · we behave like an institution
> that keeps promises · craftsmanship, permanence, care · **Meridian** is the
> system name, rooted in horology.
>
> **The two filters.** Every decision below answers to both:
> 1. *Does this make the promise more believable?*
> 2. *Does the waiting state look like something valuable is happening?*
>
> **Status:** proposal. Colour and typography deliberately present alternatives
> rather than conclusions. Nothing implemented.

---

## 1. Brand Personality — described as behaviour

Adjectives don't constrain designers; behaviours do. Each rule below has a
design consequence you can check in review.

| # | The product… | Design consequence |
|---|---|---|
| 1 | **Answers precisely.** It knows and it says. | No vague durations anywhere — *"3 years, 2 months, 6 days"*, never *"in a few years"*. If we can compute it, we state it. |
| 2 | **Never raises its voice.** | No exclamation marks in product copy. No all-caps for emphasis. No red badge counts. Emphasis is achieved with scale and space. |
| 3 | **Doesn't celebrate itself.** | Confirmations state fact — *"Sealed."* Not *"Woohoo, you did it!"* We celebrate the user's act by treating it seriously, not by cheering. |
| 4 | **Says the thing and stops.** | No helper text explaining the helper text. One sentence where one sentence works. Silence is an acceptable UI state. |
| 5 | **Never apologises for existing.** | No *"Sorry to interrupt!"*, no *"Just checking in"*. We only apologise when we have actually failed. |
| 6 | **Never flinches at gravity.** | Legacy, death, illness handled in plain language. No euphemism, no drama, no softening into vagueness. Dignity is achieved by being direct. |
| 7 | **Is witty, never clever.** | Wit survives a decade; cleverness dates in eighteen months. No puns in durable copy. The voice guide's register is the ceiling. |
| 8 | **Remembers.** | Never asks for something it already knows. Never re-onboards a returning user. |
| 9 | **Doesn't hurry, and isn't slow.** | Utility surfaces are fast. Ceremonial moments take their time. Confusing the two is the most common failure mode. |
| 10 | **Is never surprised.** | No "Oops!", no jaunty error states. When something breaks, it reports the fact and the remedy in the same tone as everything else. |

**The single sentence:** *TimelyCapsule behaves like a master horologist — exact,
unhurried, quietly warm, and entirely uninterested in impressing you.*

---

## 2. Visual Language

Six properties, ranked. Rank matters: when two conflict, the higher one wins.

### 1. Alignment — the highest-priority property

Misalignment is not an aesthetic flaw here. It is **evidence of institutional
carelessness**, and it directly undermines the promise. A product asking to be
trusted for twenty years cannot have a label two pixels off its baseline.

- Optical alignment beats mathematical alignment wherever they disagree.
- Every element aligns to something declared. Nothing floats.
- Numerals hold their columns across every magnitude (`tabular-nums` is
  mandatory anywhere digits stack or update).

### 2. Precision

Expressed in three places:

- **Values.** No arbitrary numbers. Every spacing, size, and duration comes from
  a declared scale. A one-off `padding: 13px` is a defect.
- **Data.** Exact durations, exact dates, exact counts.
- **Execution.** Consistent stroke weights, consistent radii, consistent optical
  sizing.

### 3. Restraint

Permanence requires it. Anything fashionable is a **trust liability** — it
signals a company that will redesign again, and by implication may not be here in
twenty years. When in doubt, remove.

### 4. Negative space

Space is how *nothing is happening* becomes *something is being kept*.

Generous space communicates that we are not hurrying you and not competing for
your attention. It is the visual form of patience, and it is the cheapest,
most durable luxury signal available.

Discipline: **considered ≠ sparse.** Space must feel deliberate, framing content,
not merely left over. Sparse says *nothing here*; considered says *this is what
matters*.

### 5. Rhythm

The horological property. Consistent intervals — vertical rhythm, repeated
spacing, predictable cadence — read as a mechanism running correctly. Irregular
spacing reads as a mechanism with a fault.

### 6. Hierarchy — through scale and space only

Because **colour is reserved for state** (§3), hierarchy cannot borrow it.
Establish hierarchy with size, weight, and space. This is a harder discipline and
produces a more durable result.

### Explicitly rejected

Decorative flourishes · asymmetry-for-drama · drop shadows as depth theatre ·
gradients as decoration · "delight" moments unattached to meaning · anything
whose only justification is that it looks nice.

---

## 3. Colour System — three directions

Colour has one job in this product: **encode state.** Decoration is not among its
responsibilities. Everything below serves that.

### The structural requirement

Whichever direction wins must support a **temperature ramp** — a perceptually
even progression from *cold/distant* to *warm/imminent* that makes the
accumulating gap legible (`03 §V.1`). This is not decoration; it is the primary
information display.

Hard constraint: **every step in the ramp must hold WCAG AA against the text set
on it.** A ramp that fails at step four is not a ramp. Validate all steps, not
endpoints.

Second constraint: **never state by colour alone.** The ramp always accompanies a
literal date or duration.

---

### Direction 1 — The Instrument Room *(dark-primary)*

Observatory instrument rooms are kept dark to preserve the observer's night
vision. The interface is the room; content is what's lit.

| Token | Value | Role |
|---|---|---|
| `ground` | `#0B0E14` | Near-black with a blue cast — never pure black |
| `raised` | `#141922` | Panels, cards |
| `overlay` | `#1C2230` | Sheets, modals |
| `ink` | `#E6E8EC` | Primary text |
| `muted` | `#8B93A3` | Secondary, labels |
| `rule` | `rgba(230,232,236,.11)` | Hairlines |
| `brass` | `#C9A227` | Warm metal — the *imminent* end of the ramp |
| `steel` | `#7F8FA6` | Cool metal — the *distant* end |

**Temperature ramp:** `#4A5878` → `#6B6A8A` → `#8C6F84` → `#A87A72` → `#C08B5C`
→ `#C9A227`

**Emotional impact.** Focus, seriousness, night-work, instruments. Content
appears lit rather than printed. The most cinematic of the three, and the best
ground for a warming ramp — warmth reads far more clearly emerging from darkness
than from paper.

**Accessibility.** Dark grounds make AA easier for large text, harder for thin
type and low-contrast hairlines. Requires minimum 400 weight for body and careful
rule contrast. Reduces eye strain in the evening, when the PRD says P1 writes.

**Light mode strategy.** A genuine second theme, not an inversion — a daylight
instrument room: `#F2F3F5` ground, `#1A1D24` ink, ramp desaturated ~12% to hold
contrast on light.

**Accent usage.** Brass appears only on *sealed/waiting* state and primary
action. Never navigation, never decoration.

**Risk.** Dark-primary emotional products can read cold or clinical. Mitigated by
warm metals and generous space, but real.

---

### Direction 2 — The Record *(light-primary)*

The institution's other face: not the instrument room but the ledger. Paper,
ink, oxidised metal.

| Token | Value | Role |
|---|---|---|
| `ground` | `#E9EAE6` | Cool grey-green paper — **deliberately not cream** |
| `raised` | `#F3F4F0` | Cards, leaves |
| `ink` | `#16181A` | Primary text |
| `muted` | `#6B7069` | Secondary |
| `rule` | `#C8CAC3` | Ruled lines |
| `verdigris` | `#3F6154` | Oxidised copper — the institutional accent |
| `iron` | `#2C3A4A` | Cool structural accent |

**Temperature ramp:** `#5A6E7A` → `#6E7476` → `#877672` → `#9E7A66` → `#B08256`
→ `#BE8C3C`

**Emotional impact.** Permanence, legibility, officialdom, the reassurance of
paper. Reads as *record* rather than *app*, which is exactly the institution
layer.

**Accessibility.** Easiest of the three to pass AA. Best for long-form reading —
and the letter is the product. Best print and email fidelity.

**Dark mode strategy.** A genuine dark theme is harder here: it becomes Direction
1 by another route, which risks two unrelated identities.

**Accent usage.** Verdigris for institutional marks and structure; the warm ramp
end reserved for imminence.

**Risk.** Cool grey-green paper is one careless step from clinical or medical.
The distance from Default 1 (`#F4F1EA`) is deliberate and must be held — drifting
warm reintroduces the cliché.

---

### Direction 3 — The Dual Register *(semantic, not a mode)*

Not a compromise between 1 and 2 — a **semantic rule** that falls directly out of
the synthesis (`02 §IV`).

> **Instruments are dark. Records are paper.**

| Surface | Treatment | Rationale |
|---|---|---|
| App chrome, timeline, countdown, waiting state, composer shell | **Dark** — Direction 1 tokens | These are instruments. You read a dial in a dark room. |
| The letter, the reveal, exports, emails, printed keepsakes | **Paper** — Direction 2 tokens | These are records. You read a record on paper. |

**Why this is more than a mode.** Lightness carries *meaning*: dark tells you
you're looking at the mechanism, paper tells you you're looking at the thing
being kept. A user learns the distinction without being taught, and the reveal
gains genuine drama — the moment of transit is the moment the record emerges from
the instrument room.

**Practical wins.** Email renders on paper surfaces, which is what email clients
want anyway — no fighting dark-mode email. Exports and print inherit paper for
free. Long-form reading always happens on the surface best suited to it.

**Emotional impact.** The most distinctive of the three, and the only one where
the colour system itself carries the brand's central idea.

**Accessibility.** Requires two fully validated token sets and disciplined
boundaries. More work, but each surface gets the treatment it's actually best at.

**Light/dark strategy.** Genuinely subtle: the *user's* theme preference shifts
both registers (dark theme = darker instruments, warm-grey records; light theme =
daylight instruments, brighter paper) while the semantic relationship holds. This
is the hardest of the three to specify and the most valuable if we get it right.

**Risk.** Two systems means two ways to be inconsistent. Needs a bright-line rule
in the constitution — one has been drafted (§12.10).

---

### Assessment

Direction 3 is the strongest idea and the most work. Direction 1 is the safest
strong answer. Direction 2 alone under-serves the waiting state — paper is a poor
ground for a warming ramp, and the waiting state is our primary screen.

**Not choosing here, per instruction.** The decision belongs with the logo, since
the mark must be born into whichever world wins.

---

## 4. Typography

Established constraint (`03 §VII`): **numerals are the primary selection
criterion**, ahead of the display face's character. The face must handle `00:47`,
`9 days`, and `3 years, 2 months, 6 days` with equal authority.

### The permanence argument for licensing

A consideration most brand work skips, and one this brand cannot:

> **Font licensing is a permanence decision.**

A proprietary webfont subscription is a dependency that can lapse, be repriced,
or be withdrawn. For a product whose entire promise is *whatever happens in
between*, a typeface that could stop being legally available in 2034 is the exact
category of decade-scale failure we're designing against.

Open-licence (SIL OFL) faces can be self-hosted permanently, cannot be revoked,
and will still render in 2040. **This is not a budget argument — it is a direct
expression of the permanence pillar.**

Second consideration: **i18n is a first-commit constraint** (`00-INDEX` rule 7).
Boutique foundry faces typically ship Latin-plus; institutional families ship
100+ languages. Global script coverage is a permanence property too.

---

### Pairing A — "The Standard" (single superfamily, open licence)

**IBM Plex Sans** (UI/data) · **IBM Plex Serif** (reading) · **IBM Plex Mono** (records)

| Criterion | Assessment |
|---|---|
| Readability | Strong. Plex Serif is a capable long-form reading face. |
| Tabular numerals | Excellent, consistent across all three cuts. |
| Authority | High — designed *for* an institution founded in 1911, explicitly to express the relationship between engineering and humanity. Thematically exact. |
| Warmth | Moderate. The serif carries it; the sans is cooler. |
| Craftsmanship | High and legible as such — visible design decisions, not neutral defaults. |
| i18n | Outstanding. 100+ languages, Arabic, Devanagari, CJK, Cyrillic, Thai. |
| Variable | Yes, all cuts. |
| Permanence | **Best available.** OFL, self-hostable forever, corporate-backed. |

**Why it fits.** One superfamily across all three roles yields effortless
coherence and drastically simplifies the mobile bundle. Its institutional origin
is not a coincidence we're exploiting — it's the same brief.

**Against.** Plex is widely used and recognisable; we'd earn distinction through
setting rather than selection. That's harder, and it's a real cost.

---

### Pairing B — "The Chronometer" (licensed craft)

**Söhne** or **Suisse Int'l** (UI/data) · **Tiempos Text** (reading) · **Söhne Mono** (records)

| Criterion | Assessment |
|---|---|
| Readability | Excellent. Tiempos Text is among the best screen reading serifs made. |
| Tabular numerals | Excellent, and more characterful than Plex. |
| Authority | Very high — Swiss lineage, editorial credibility. |
| Warmth | Strong. Söhne is a warm grotesque; Tiempos is warm-authoritative. |
| Craftsmanship | The highest of the three. These are exceptional faces. |
| i18n | **Weak.** Latin-plus. Non-Latin scripts require a separate family, breaking coherence exactly where it matters most. |
| Variable | Partial. |
| Permanence | **Weakest.** Perpetual licence needed; web licences are typically term-based. |

**Why it fits.** Delivers the most craft per glyph and the most distinctive
result. If TimelyCapsule wants to feel expensive, this is how.

**Against.** Fails the two constraints this brand cares most about — i18n breadth
and licence permanence. Choosing it means accepting a known contradiction with
the philosophy, knowingly.

---

### Pairing C — "The Almanac" (serif-led, open licence)

**Source Serif 4** or **Literata** (primary voice — headlines, UI labels, reading)
· **IBM Plex Sans** (dense data only) · **IBM Plex Mono** (records)

| Criterion | Assessment |
|---|---|
| Readability | Excellent — both faces were designed for extended reading. |
| Tabular numerals | Good in the serif; excellent in Plex where it matters most. |
| Authority | High, and of a different kind: scholarly rather than corporate. |
| Warmth | **Highest of the three.** A serif-led interface reads human before it reads systematic. |
| Craftsmanship | High. Source Serif 4 is a genuinely refined variable family. |
| i18n | Very good (Source Serif 4 covers Latin/Greek/Cyrillic; Plex fills the rest). |
| Variable | Yes, full axes. |
| Permanence | Excellent. OFL throughout. |

**Why it fits.** Inverts the default. Most products are sans-led; a serif-led
interface reads as *record* and *institution* immediately — an almanac, not an
app. It also directly answers the warmth problem that dogged the Observatory
direction, without borrowing a mechanism.

**Against.** Serif-led UI is harder to execute — dense data and small labels want
a sans, and the boundary needs constant judgement. And it approaches Default 1
territory, which must be held off by the ground colour (never cream) and by
choosing an institutional serif over a high-contrast display serif. **Source Serif
is not Fraunces**, and that distinction is load-bearing.

---

### Type scale (all pairings)

Retain the existing 4pt-derived scale from `plan/02 §6` — it's sound and
unchanged by this work. One addition:

**A dedicated numeral scale.** Countdowns range from `00:47` to
`3 years, 2 months, 6 days` and must feel authoritative at every magnitude.
Define discrete numeral sizes matched to proximity (`03 §V`), not a continuous
interpolation — a small fixed set reads as deliberate, continuous scaling reads
as a gimmick.

---

## 5. Iconography — philosophy

> **Icons are engraved, not drawn.**

They should read as markings etched into an instrument by someone whose job was
accuracy — not as illustrations of concepts.

**Construction**
- Uniform stroke weight throughout. No variable weight, no tapering, no duotone,
  no fills except where a filled state carries meaning.
- Built from true circles and straight lines on a strict grid. Nothing
  hand-drawn, nothing organic, nothing hand-lettered.
- **Square terminals, mitred joins.** Round caps read friendly and consumer;
  square reads machined. This is a deliberate, checkable rule.
- Optical correction applied — a true circle reads smaller than a square of equal
  dimension, so circles are drawn fractionally larger.

**Behaviour**
- **Icons do not animate.** They belong to the institution layer, which is static
  (`02 §IV`). Motion belongs to instruments.
- Icons never carry state through colour alone.
- Icons never appear where a word would do the job better. **Prefer words.** An
  interface with too few icons reads as serious; one with too many reads as an
  app trying to be friendly.

**Inventory discipline**
- The set is **closed**. Adding an icon requires justification in review.
- This directly enforces "one instrument, not a collection" (`02 §IV.2`). An
  ever-growing icon set is how a disciplined identity becomes a pastiche.

**Explicitly rejected.** Rounded-friendly sets · duotone · filled-and-outlined
pairs used decoratively · emoji anywhere in product surfaces · icons illustrating
our own metaphors (telescopes, hourglasses, filing cabinets — see §8).

---

## 6. Motion Language — principles

Every rule reinforces trust. The unifying idea: **the system never appears to
strain, guess, correct itself, or fight the user.**

### Two registers

Falls out of the static/motion split (`02 §IV.1`):

| Register | Applies to | Character |
|---|---|---|
| **Instrument** | Countdown, approach, transit, temperature shift | Linear or near-linear. Constant. Unhurried. A clock hand does not ease. |
| **Interface** | Panels, sheets, menus, navigation, toasts | Standard easing. Short. Efficient. Respects the user's time. |

Confusing these is the most common failure mode: a slow settings panel is not
reverence, it's a slow app.

### The principles

1. **Nothing springs, bounces, or overshoots.** Overshoot means the system
   momentarily got it wrong and corrected — a micro-failure of precision repeated
   across the interface. Structurally forbidden.
2. **Constant velocity for anything representing time.** Deceleration implies
   arrival; only *transit* is allowed to arrive.
3. **Durations.** Interface `120–200ms`. Instrument moments `400–800ms`.
   Ceremonies up to `2500ms`, always skippable. Never exceed interface durations
   on utility surfaces.
4. **Motion is always interruptible, and interruption is graceful.** If the user
   acts mid-animation, the system yields — never snaps, never blocks, never
   finishes its performance first. *The system never fights the user.*
5. **Orchestrate; never scatter.** One element leads, others follow at 40–60ms
   intervals. Simultaneous mass animation reads as a page reacting rather than a
   system behaving.
6. **Animation-anticipation is reserved for the seal.** The classical wind-up
   before an action implies effort, and our system should never appear to strain.
   The one exception is the press-and-hold, where effort is the entire point.
7. **Nothing may read as loading.** No spinners in content areas — skeletons that
   match the real layout. A spinner declares that waiting is failure, which is
   the opposite of our thesis.
8. **Motion must be honest.** Never animate to imply progress that isn't
   occurring. No indeterminate bars, no fake percentages.
9. **Reduced motion is a first-class path, not a fallback.** The three signature
   moments degrade to ≤300ms cross-fades; haptics are preserved. Test it as a
   real experience, not a compliance checkbox.

---

## 7. Shape Language

> **Architectural at page scale. Instrument-like at component scale.**

**Radius.** Small, consistent, deliberate. Zero radius reads harsh and drifts
toward Default 3's broadsheet; large radius reads consumer-app and toy-like.

- Controls, inputs, chips: `3px`
- Cards, panels: `6px`
- Sheets, modals: `10px`
- Fully round **only** for genuinely circular objects — avatars, dials, the
  transit marker.

Rationale: an instrument case has a specific, small, machined radius. It was cut
to a tolerance, not softened for comfort.

**Edges over elevation.** Components are defined by **1px rules**, not by drop
shadows. Instruments don't hover; institutions don't float. In dark registers,
separate surfaces by luminance step. Reserve shadow exclusively for genuinely
overlaying elements (modals, popovers) where it communicates real z-order.

**Hairlines are instrument markings.** The 1px low-contrast rule is a core
element of the language, not a divider of last resort. Used with the same
intent as graduations on a dial.

**Machined consistency.** Components should feel cut to a tolerance: the same
radius, the same stroke, the same optical weight everywhere. Arbitrary variation
is the defect.

**Rejected.** Blobs, organic shapes, hand-drawn edges, glassmorphism, neumorphism,
decorative borders, accent rails on cards, anything with a bevel.

---

## 8. Layout System

**Base unit.** 4pt grid, retained from `plan/02 §6`: `4 · 8 · 12 · 16 · 24 · 32 ·
48 · 64 · 96`. No value outside the scale.

**Vertical rhythm — the escapement.** An 8px baseline grid with type set to it.
Consistent interval is the horological property made structural: a page whose
rhythm holds reads as a mechanism running correctly.

**Grid.** 12 columns at desktop, 6 at tablet, 4 at mobile. Content max 1200px;
**reading column 65–72ch** (~720px) — the letter is the product, so the reading
measure is a brand-level constraint, not a page-level one.

**Proportion.** Type scale on a consistent ratio (~1.25, major third). Rational
and repeatable — no golden-ratio mysticism, which is decoration disguised as
rigour.

**Density.** Medium-low. Generous but never sparse (§2.4). Dense data — timelines,
tables, activity — may tighten to the 4/8 end of the scale, but never below.

**Alignment.** Left-aligned dominant. Centre-alignment only for genuinely
symmetrical moments (transit, the seal ceremony). **RTL must work from the first
component**, not be retrofitted — the meridian line mirrors, the reading
direction flips, the numerals don't.

**Asymmetry is permitted only when it encodes information.** The meridian's
position on a timeline means *now*. Asymmetry for visual interest is decoration
and is rejected.

---

## 9. Imagery

The governing rule, already established (`02 §IV.3`): **behave, don't depict.**

### No illustration of our own metaphors

No observatories, telescopes, domes, star fields, planets, orrery diagrams,
hourglasses, filing cabinets, archives, envelopes, or wax seals rendered as
pictures. Depicting the metaphor is an admission the design isn't carrying it.

**Celestial imagery is explicitly rejected.** That was the astronomy mistake
(`02 §I`). The meridian is a *line*, not a picture of the sky.

### No photography of people

Stronger than a taste preference — a structural argument:

> Any person we depict is not the user's person, and the entire emotional force
> of the product is that it is *their* specific person. A stock photograph of a
> family actively displaces the mental image we want the user forming.

The most powerful image in this product is the one the user supplies themselves,
in their head. We should not compete with it.

### What imagery actually is here

1. **Data as imagery.** The timeline, the approach, the real countdown, the real
   duration. The most beautiful object we can display is a true number that means
   something. This is our primary visual asset.
2. **Typography as imagery.** Large, precisely set type carrying a moment.
3. **Material, minimally.** In the paper register, an almost imperceptible grain.
   Never a texture you'd notice; only one you'd miss.

Consequence, and a welcome one: an almost image-free product is **fast**. This
materially serves the Lighthouse ≥95 target and the three-year-old-phone
constraint. The identity and the performance budget point the same way.

---

## 10. Signature Elements

Five. Each must appear across web, mobile, landing, email, and brand assets — and
each is recognisable in a screenshot with the logo cropped out.

### 1. The Meridian Line
A persistent vertical reference. In the timeline it marks *now*. In layouts it's
the structural spine. In email it's the rule. In the logo it's the mark. **One
line, doing many jobs** — the anti-clutter argument made structural (`02 §III`).

### 2. The Dual Clock
Elapsed and remaining, displayed together with equal weight (`03 §V.1`). Almost
nothing in software does this. It converts a countdown into a journey, and it is
the single component carrying the most brand meaning — more than the logo.

### 3. The Hallmark
The Capsule ID (`TC-84KZQM3P`) always visible, always in the same monospaced
treatment. Every instrument carries its maker's mark and serial number; every
capsule carries its own. Turns an existing support string into an identity
element and a trust signal.

### 4. The Duration Stamp
Elapsed time franked at the moment of opening — *TRAVELLED 3 YEARS, 2 MONTHS, 6
DAYS.* The most screenshottable object in the product (`01 §VIII.3`), content-free
by construction, and legible to a stranger.

### 5. The Reserved Transit Colour
One colour that appears **nowhere** in the product until a capsule arrives. Users
learn its meaning without being told. Holds only if the discipline holds
everywhere else — which makes it a permanent constraint on every other decision.

---

## 11. Logo Directions

Constraints the mark must satisfy, all derived above:

- Works **engraved** — single colour, no gradient, no shadow.
- Works at **16px** (favicon, app icon) and at architectural scale.
- **Static.** It's institution, so it never animates (`02 §IV.1`).
- Holds **tension, not completion** — a moment about to happen (`03 §VII`).
- Reads correctly in both colour registers.

### Direction i — The Transit
A circular form approaching, or just touching, a vertical line. The instant
before crossing, held still. Most directly expresses the core promise: something
on its way, arriving exactly. **Risk:** at 16px the relationship may collapse into
a generic geometric mark.

### Direction ii — The Meridian Mark
Radical reduction: a vertical stroke with a single fine graduation, like a
meridian marking on a dial. Nearly a punctuation mark — small enough it could be
set inline in text. Maximum restraint, maximum permanence. **Risk:** may be too
reduced to be memorable, and reduction can read as absence rather than confidence.

### Direction iii — The Hallmark
A letterform or monogram inside a precise geometric container — a silver
hallmark, an instrument maker's stamp. Foregrounds craft, authenticity and
institution. Excellent as a physical artifact (keepsake cards, print, embossing).
**Risk:** monogram-in-a-shape is a crowded convention; distinction must come
entirely from execution.

### Direction iv — The Dial Segment
A cropped arc carrying graduated tick marks. Suggests a measuring instrument
without depicting one; the graduations *are* precision. **Risk:** closest to
depicting the metaphor, and arcs are common in tech marks.

### Direction v — The Wordmark
No symbol at all. Identity carried by a precisely set wordmark with one
distinctive detail — a meridian line replacing or crossing a stroke. Most
institutions of record (standards bodies, universities, banks) have wordmarks, not
symbols, and it's the most timeless option available. **Risk:** needs a symbol
eventually for app icons and favicons, so this likely resolves into a wordmark
*plus* a reduced mark from (i) or (ii).

**Note for the logo phase.** Directions i and ii share a root and could resolve
into one system — a wordmark for full lockups, a reduced transit mark for small
sizes. That's how this most likely wants to end.

---

## 12. The Design Constitution

Fifteen immutable principles. Every design review, pull request and UI decision is
evaluated against these. A change failing any one of them does not ship,
regardless of how attractive it is.

1. **Every decision must make the promise more believable.** If it doesn't, it is
   decoration.
2. **The waiting state must look like something valuable is happening.** If a
   screenshot of a sealed capsule reads as empty, we've failed.
3. **Never manufacture urgency.** No countdowns on pricing, no streaks, no
   expiring anything, no red badges. The only clock is the one the user set.
4. **Never make someone feel late.** No guilt, no "you haven't…", no lapsed-user
   shaming.
5. **Colour encodes state; it never decorates.** Hierarchy comes from scale and
   space. Never state by colour alone.
6. **Nothing springs, bounces, or overshoots.** Overshoot is a visible failure of
   precision.
7. **Show elapsed alongside remaining. Never a progress bar.** Position, not
   progress.
8. **Be precise in language.** Exact durations and dates. If we can compute it,
   we state it.
9. **Behave, don't depict.** No illustration of our own metaphors. No celestial
   imagery. No photography of people.
10. **If it moves, it's an instrument. If it holds still, it's the institution.**
    Dark surfaces are instruments; paper surfaces are records.
11. **Every screen a recipient can reach must be legible to a stranger** — logged
    out, no context, on an old phone, in three seconds.
12. **Never display capsule content anywhere the user didn't put it.** No content
    in previews, notifications, OG images, or analytics. Zero-access is a visual
    discipline, not only a cryptographic one.
13. **Nothing cute at irreversible moments.** Sealing, withdrawing and deleting
    carry gravity. No confetti, ever.
14. **Alignment is not negotiable.** Optical over mathematical. Every value from
    the declared scale. `tabular-nums` wherever digits stack or update.
15. **If it would embarrass us in 2035, it fails now.** Fashion is a trust
    liability. When in doubt, remove.

---

## 13. Open decisions for the next phase

Carried forward deliberately, not overlooked:

| # | Decision | Blocks |
|---|---|---|
| 1 | **Colour direction** — Instrument Room, Record, or Dual Register | Logo, palette, everything |
| 2 | **Typography pairing** — Standard, Chronometer, or Almanac | Logo wordmark |
| 3 | **Logo direction** — and whether i/ii resolve into one system | Brand assets |
| 4 | **The reserved transit colour** — cannot be chosen until the palette is | Motion, state design |
| 5 | Does **"We keep time."** survive as the line? | Marketing, T-21 |
| 6 | **Elapsed + remaining together** — confirm as a product decision | Component design |

Decisions 1 and 2 are the gate. Everything downstream inherits them, and they
should be made together rather than in sequence — the serif-led pairing reads
very differently on a dark instrument ground than on paper.
