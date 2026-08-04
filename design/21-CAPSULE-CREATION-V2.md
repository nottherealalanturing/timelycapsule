# Capsule Creation V2

> The authoritative specification for the composer. Supersedes `plan/02-UX-DESIGN.md
> §5.5` and the composer-relevant parts of `§6` — that document still governs
> every other screen. Extends `07-EXPERIENCE-BIBLE.md`, in particular §IX
> (Composition) and §V (Interaction Constitution); where a decision here
> resolves a question `07` left open, the resolution is recorded and `07` is
> not re-litigated.
>
> Discharges the closing obligation of `07 §XVIII`: *"the redesign ends by
> rewriting `plan/02-UX-DESIGN.md §6`, or future sessions build against the
> stale spec and silently undo all of this."* That rewrite did not happen when
> `07` shipped, and the composer drifted for a full pass before anyone
> noticed. This document and the accompanying edit to `02` are that rewrite,
> arriving late.
>
> Implementation: `apps/web/src/components/composer/v2/*`, wired into
> `apps/web/src/components/composer/Composer.tsx` (authenticated) and
> `apps/web/src/app/try/page.tsx` (guest).

---

## I. What was wrong with V1

`plan/02-UX-DESIGN.md §5.5` and `§6` — the spec V1 was built from — still
specified Fraunces/Inter, parchment `#FAF7F2`, dusk-violet, wax-seal
iconography, spinners, shimmer skeletons, spring easing, confetti and
illustration. Every one of those is on the permanent-never list in
`07 §XVI`. This was not drift in the ordinary sense: `07 §XVIII` said the
composer rewrite was the very next thing to do, ahead of the logo and the
design system, and it never happened. V1 was a faithful implementation of a
document that had already been superseded.

The second problem was the one that mattered emotionally. `07 §IV` names
Composition as phase 2, *"the hardest moment in the product,"* which
*"fails when we treat it as data entry,"* and states plainly: *"Phase 2 is
where people actually struggle, and it is where they abandon."* V1 was eight
labelled form sections in a single vertical scroll — cover picker, title,
letter, media, recipients, schedule, seals, accordion. It was data entry. It
was the named failure mode, not an edge case of it.

Specific defects, since they explain choices below:

- **The timezone control never re-anchored.** Changing the zone rewrote the
  displayed label without moving the stored instant, so a capsule could claim
  a different zone than the one it would actually open in. Fixed
  independently of this redesign (see `apps/web/src/lib/zoned-time.ts`) —
  it was a correctness bug, not a design question, and shipped first.
- **The letter rendered as a form field**, not a record. Paper and serif were
  specified for exactly this surface in `05-IDENTITY-DECISION.md`'s register
  table and never applied.
- **The order was inverted.** Title (a naming task) came first; recipients
  came after the letter, so a person wrote to nobody and was told who it was
  for afterward — the opposite of what `07 §IX` asks for.
- **Prompts were inserted into the document** as a blockquote, which is the
  product writing in someone's letter — `07 §IX` forbids this outright.
- **The review before sealing showed four facts**, one of them a byte count,
  and dropped the unlock time from its date formatting entirely.
- **The guest flow (`/try`) was a second, shorter composer** — a plain
  `<textarea>`, its own gradient presets, its own date inputs carrying the
  same timezone bug independently. Nothing structurally stopped the two from
  diverging, and they had.

---

## II. The frame: three movements, not a wizard

`plan/02-UX-DESIGN.md §5.5` said *"single scrolling document, not a wizard"*.
`07`'s Interaction Constitution 2 says *"one decision per screen at any
emotionally loaded moment."* Composition satisfies both by being three
movements — full surfaces, freely navigable, not gated in either direction:

| | Movement | The one job |
|---|---|---|
| **I** | **Address** | Who this is for, and when it opens |
| **II** | **Compose** | The record, and what travels with it |
| **III** | **Seal** | Conditions, review, commit |

These are not wizard steps. `MovementNav`
(`apps/web/src/components/composer/v2/MovementNav.tsx`) names the current one
in a hallmark — `ADDRESS · COMPOSE · SEAL`, mono, uppercase, tracked — never
dots, a bar, a percentage, or numbering, because `03 §V.2` bans progress
grammar outright and a capsule being written is not a task being completed.
Movements already answered stay lit and clickable; a movement is unlit only
when it cannot yet be entered at all (Seal before a letter exists), never as
a gate on revision.

Two structural rules justify the split:

- **Address must precede Compose.** `07 §IX` gives exactly two levers against
  the blank page — address the reader before the writing, and perform the
  arithmetic on their future age. Both require knowing who and when *before*
  the editor appears. If those questions sit below the letter in one scroll,
  the writer meets the blank page first and neither lever can fire. This is
  not sequencing for its own sake; it is the only order in which the levers
  work.
- **Sealing must be a deliberate movement, not a scroll away.** `07 §IX`:
  *"Sealing must be separable from writing. The decision to commit is its
  own emotional act and must never be a side-effect of finishing a
  sentence."* Movement II has no sticky advance control — see §IV below —
  so reaching Seal is something a writer travels to.

Backwards is always free, in both directions of the word: no field is
validated-and-locked, and clicking an earlier movement in the nav costs
nothing. The draft is one object being progressively addressed, not a form
submitted in stages.

---

## III. Movement I — Address

`AddressMovement` (`.../v2/AddressMovement.tsx`), composed from
`AddresseeBeat.tsx`, `Horizon.tsx` and `ExactMoment.tsx`.

### Beat 1 — who this is for

`AddresseeBeat.tsx`. Two sentences, not disabled chips: *"Someone else — they
are told when it opens"* / *"Myself — it comes back to you, and no one
else."* V1 rendered this exact choice as `disabled` buttons captioned "Type
is set at creation", which was true only because nothing let the type be set
anywhere else. `capsule.type` is now a patchable field (see §IX) precisely so
this question is answerable here.

Choosing "Someone else" reveals a recipient field with contact-autocomplete,
matching `RecipientsBlock`'s old behaviour but relocated to where the
decision is actually made. The beat is omitted entirely — not shown
disabled — when `capabilities.recipients` is false (the guest entry point;
see §VII).

The second beat (when it opens) only appears once the first is answered, per
`answeredWho` in `AddressMovement.tsx` — this is the one place inside a
movement where a question is deliberately withheld until its precondition is
met, because the arithmetic in the Horizon's moments literally depends on
who the letter is for.

### Beat 2 — when it opens: the Horizon

`Horizon.tsx`. This is not a date picker with decoration, and the distinction
is load-bearing rather than aesthetic: a date field is the right tool for
*editing a timestamp* and the wrong tool for *deciding when a message
belongs*, because it asks someone holding an intention — *when she's grown*,
*the next time the year turns* — to convert it into arithmetic themselves
before the interface will accept it. The Horizon inverts that: the offered
candidates are moments with meaning, and the arithmetic (which exact instant
that moment resolves to) is the product's job.

**Moments over lengths.** Every candidate carries a `kind`, `'moment'` or
`'length'` (`apps/web/src/lib/horizons.ts`):

- A **moment** is an occasion — a birthday, the turn of a year, the turn of a
  decade. Where a recipient's (or, for a self capsule, the writer's own)
  birthday is known, moments are computed against real ages: *"When Amara
  turns ten"*, not an interval.
- A **length** is a measurement — *"Ten years from now."* Useful, sometimes
  exactly right, but a duration rather than an occasion.

Moments are shown at full weight; lengths are dimmed (`text-secondary`) and
exist only to fill gaps where no occasion falls nearby. Selection is banded
across the log-scale line and each band keeps its best candidate — moments
win ties — which is a compromise reached after two failed approaches: strict
priority buried every non-birthday choice behind six of one person's
birthdays, and strict chronological thinning let a round number of years
displace an actual birthday. See the comment above `horizonCandidates` in
`horizons.ts` for the full reasoning.

**Reading, not restating.** Once a moment is chosen, the line beneath the
date states *why* — `reasonFor()` in `horizons.ts` — rather than the distance
a second time: *"Amara will be 10,"* *"The first morning of 2027,"* not "Ten
years from now" repeated under a date that already says so. A hand-picked
date that happens to land on a known birthday still earns an age reading
rather than a bare gap phrase.

**The line's own calibration.** `positionOf()` in `Horizon.tsx` deliberately
does *not* reuse `MeridianApproach`'s `approachDistance` — this is the one
place the waiting-screen instrument and the composing instrument disagree on
purpose. `approachDistance` anchors its near end at one hour, correct for a
capsule counting down to transit. Nobody *chooses* an hour while composing;
borrowing that scale crushed five months through twenty-five years into the
leftmost third of the line. The Horizon anchors instead at one day, which is
realistic for the range actually being chosen across (a day to fifty years),
while keeping the same log character and the same meridian on the right.

**Not draggable.** On a log scale, a few pixels at the far end represent
years, so dragging would be imprecise exactly where precision is least
recoverable — and a line you drag reads as a progress bar, banned outright by
`03 §V.2`. The line is read; the listed choices decide; `ExactMoment` handles
what neither covers.

**Ghost marks.** Every candidate's position is drawn on the line
simultaneously (`aria-hidden`, since `07 §V.4` requires state to be carried
in text, never by position or colour alone), so a choice is made while seeing
how far apart the offered moments actually are — the one thing a list of
dates on their own cannot show.

### The exact moment

`ExactMoment.tsx`. Present on the surface, not behind a disclosure — "Or a
particular day" sits directly under the Horizon's list, always visible.
Leading with a date field would turn the whole movement into a scheduling
form; putting it second but hidden would refuse anyone who already knows
their date (an anniversary, a court date) a place to put it without hunting.
Every field here reads and writes through the selected zone
(`lib/zoned-time.ts`), so the field, the Horizon's reading, and the stored
instant cannot disagree — this is the same module the standalone timezone fix
introduced, reused rather than re-implemented.

### The zone picker

`ZonePicker.tsx` + `lib/zones.ts`. Replaces a raw `<select>` of ~430 IANA
identifiers in alphabetical order (previously opening on `Africa/Abidjan`)
with: *use my current time zone* → *recipient's local time* (hidden where
there is no recipient) → a curated ~60-city list with country and UTC offset
→ full-database search behind that for anything the curated list misses.
The **stored value is unchanged** — still the IANA identifier — this is
presentation only.

Search resolves common aliases (`pst` → Los Angeles, `india` → Mumbai) via
`searchZones()`'s scoring function, not just prefix match on the city name.

### Self capsules get their own milestones

`user.birthday` (`packages/contracts/src/auth.ts`) is now exposed on
`UserSchema` — the column existed since T-02, `PatchMeRequest` always
accepted it, nothing ever read it back. A capsule addressed to yourself now
offers *"Your next birthday,"* *"When you turn 50,"* with grammar switching
to second person throughout (`HorizonPerson.self` in `horizons.ts`).

---

## IV. Movement II — Compose

`ComposeMovement.tsx`, composed from `RecordLetter.tsx`, `AddressHallmark.tsx`,
`MarginPrompt.tsx` and `Enclosures.tsx`.

### The letter is a record

`RecordLetter.tsx` wraps the TipTap editor in `@tc/ui-web`'s `Record`
component — paper, Source Serif 4, permanently, in both themes, per
`05-IDENTITY-DECISION.md`'s register table. Two rules from Gate 1 hold here
and are the actual reason this is a separate component rather than a
className change to the old editor:

1. **A record is an object, never a background.** The instrument ground
   (`bg-[var(--color-bg-primary)]`) stays visible on all four sides at every
   breakpoint — verified at 375px down to a 12px surround. The moment paper
   reaches the viewport edge, the register change reads as a theme toggle
   and Gate 1's ceremony is gone.
2. **The editable area fills the paper.** ProseMirror's own contenteditable
   only grows to its content; without an explicit `min-h` on the inner
   `.ProseMirror` element a short letter leaves most of the sheet inert to
   clicks. `RecordLetter` also focuses the editor on any click within its
   bed, including the empty space below the last line.

### The address stays visible while writing

`AddressHallmark.tsx` renders `FOR AMARA · OPENS 25 DECEMBER 2041` above the
record for the duration of Compose. This is what makes the blank page
survivable — the two things settled in Address are held in view rather than
receding the moment the writer starts typing.

### Prompts are questions, never templates, never inserted

`MarginPrompt.tsx`. `07 §IX` is explicit on both halves: mood pickers and
inserted suggestions are forbidden because they produce a letter the person
did not write, and a question does the opposite — it produces their own
words. The chosen prompt sits beside the record (the margin on desktop,
above it on mobile, dismissible either way) and **has no access to the
editor at all** — there is no code path by which it could be inserted, which
is a stronger guarantee than "we chose not to insert it."

Two question banks, not one template with a pronoun fallback
(`QUESTIONS_FOR_OTHERS` / `QUESTIONS_FOR_SELF`): a null addressee always
means a self capsule by the time Compose is reachable, and "What do you want
*them* to know" cannot be patched into reading as second-person no matter
what the fallback string is. Found and fixed during the pre-ship walkthrough
after it surfaced directly under a hallmark reading `FOR YOURSELF`.

### Enclosing: one affordance, three kinds

`Enclosures.tsx` + `use-enclosures.ts`. V1 had three separate UI regions for
this — a dashed drop zone, a bordered recorder strip, a map buried inside the
"Seals & Expiry" accordion. A file, a voice note, and a place are all things
you *enclose*, so there is one "Enclose something" control offering all
three kinds it supports.

The drop zone is no longer the primary control: V1's was a bare `<div>` with
a click handler and no ARIA role, unreachable by keyboard entirely. Dragging
onto the movement still works, as an enhancement layered on top of the real
button (`ComposeMovement.tsx`'s `onDragOver`/`onDrop`), matching
`plan/02-UX-DESIGN.md §16`'s own spec for how drag-and-drop should behave.

**Unavailable kinds are omitted, not shown disabled.** Where
`capabilities.enclosures` or `capabilities.placeMemory` is false, that kind
is absent from the menu rather than present-and-greyed with an upgrade
label. See §VII — this was a live design decision, reversed once already
during this build.

### Place as memory, separated from the Place Seal

`PlaceMemoryDialog.tsx` + `lib/letter-envelope.ts`. V1 had only the
cryptographic gate and called it a Seal. These are opposite in kind: a
**memory** ("where this was written") is a fact about the record the
recipient reads; a **gate** ("it opens only at a place," Movement III) is a
cryptographic constraint that can stop them reading anything at all.
Conflating them made the memory feel like configuration.

Because it is content the recipient reads, place-as-memory is **not a
plaintext database column** — that would hand the server the writer's
location, breaking the zero-access hard rule in `plan/00-INDEX.md`. It
travels inside the same encrypted envelope as the letter itself:

```ts
interface LetterEnvelope {
  doc: unknown;        // TipTap document JSON
  writtenAt: PlaceMemory | null;
}
```

`readEnvelope()` accepts both this shape and the bare TipTap document older
capsules hold, so there was no migration to run — every reader
(`RevealCeremony.tsx`, the owner's own capsule-detail view) goes through
`envelopeText()`/`readEnvelope()` and degrades safely on either shape.

---

## V. Movement III — Seal

`SealMovement.tsx`, with conditions split into `ConditionsPanel.tsx`.

### Confidence, not confirmation

This is the governing design decision for the whole movement, given
explicitly during the build: *optimise for confidence rather than
confirmation.* A confirmation dialog asks you to assent to a summary — a card
of a few facts and a button meaning "yes, really" — which manufactures a
moment of doubt and then resolves it. That is the wrong shape for the most
irreversible act in the product.

So Movement III **is the record**, not a summary of it: paper, serif, the
actual letter, the actual enclosures, the actual address, exactly as they
will be received. Nothing is condensed into prose describing the letter,
because a summary is what you check *against* when you are not sure — the
whole point here is to remove that uncertainty by showing the real thing.
The surface deliberately resembles the reveal (`07 §XIV` — the record is what
people remember) without rehearsing it: no ceremony, no transit, no
animation. The writer meets the artifact once before it leaves and
recognises it years later from the other side.

Irreversibility is stated once, in plain language, beside the action —
*"Once sealed, what is inside cannot be changed. You can withdraw it at any
time before it opens."* Not a checkbox, not a second dialog, not a typed
confirmation. `07 §IV` phase 3 calls for the held beat at full weight and
irreversibility "stated plainly, once" — saying a true thing once and
trusting the person is what that looks like in copy rather than motion.
`SealCeremony.tsx` — the held-beat animation itself — is untouched by this
work; it was already correct.

### The optional title

The "Called" row in `SealMovement.tsx`. Framed explicitly as filing, not
address: *"For finding it again. {Addressee} never sees this."* Completeness
(`completeness.ts`) no longer requires a title at all — V1 demanded one
before anything else, which made naming a letter the first obstacle to
writing it. What completeness now requires is words and a moment, the two
things a capsule cannot exist without.

### Conditions: a detour, not a phase

`ConditionsPanel.tsx`, opened from a single "Conditions" row that defaults to
reading *"None beyond the date."* Most capsules carry no conditions, so this
keeps the common path to one decision (Interaction Constitution 2) while
leaving the capability fully reachable for anyone who wants it — a detour,
not a step everyone walks through.

Gathered inside it, deliberately together:

- **Delivery** — tell them now vs. surprise (`announceOnSeal`), whether they
  can keep a copy (`allowDownload`), whether they can see co-recipients
  (`recipientsVisible`). These are answers to *"under what conditions does
  this reach them"* exactly as much as the cryptographic gates below are,
  and V1 split them between the (now-removed) recipients block and the
  Seals accordion, so they were never presented as one question.
- **Beyond the date** — the Place Seal (a map, a radius, distinct from
  place-as-memory in Compose), the Passphrase Seal, and identity
  verification.
- **After it is opened** — kept / kept for a while, then gone / one reading
  only. Two questions rather than V1's nine-radio ladder (forever, 1yr, 30d,
  7d, 24h, 1hr, 30min, 5min, ephemeral treated as peers). "One reading only"
  is visually separated (a red-bordered box) because it differs in *kind*,
  not magnitude — every other option retires the record; this one destroys
  it, with no copy, irreversibly.

**Identity is one control, not two.** The server treats
`requireRecipientVerification` and an `identity` seal as the same gate —
`apps/api/src/modules/reveal/service.ts` ORs them. `ConditionsPanel` writes
both fields from a single checkbox rather than exposing what was, in the
data model, one switch presented as two.

### Break-glass

For self capsules only, moved here from a separate section in V1: *"Let
yourself open it early — forty-eight hours between asking and opening,
cancellable throughout."* Grouped with the other conditions because it is
one, even though it applies to the writer rather than a recipient.

---

## VI. What travels with the letter — the encrypted envelope

Documented in full at the top of `apps/web/src/lib/letter-envelope.ts`;
summarised here because it is a real schema decision, not composer UI. The
capsule's `contentDocEnc` blob now holds `{ doc, writtenAt }` rather than a
bare TipTap document. Every consumer (`use-capsule-draft.ts`,
`use-guest-draft.ts`, `RevealCeremony.tsx`, the owner capsule-detail page,
`envelopeText()`) reads through `readEnvelope()`, which accepts the old bare
shape as well — capsules sealed before this pass keep opening correctly, and
nothing needed a migration.

---

## VII. One experience, two entry points

Explicit constraint given during the build: *the landing page's guest
composer must not diverge from the authenticated composer — one Capsule
Creation V2 experience, used in both places.*

**The seam is `CapsuleDraft`.** It was already an interface. The
authenticated composer backs it with `useCapsuleDraft` (the real API);
`/try` backs it with `useGuestDraft` (`lib/use-guest-draft.ts`, session
storage, no server round-trip until the capsule is sealed). Every movement
component is written against the interface and does not know which backing
it has.

**Capabilities are resolved at the container, not asked for by components.**
`ComposerCapabilities` (`.../v2/capabilities.ts`) is a plain object —
`enclosures`, `placeMemory`, `recipients`, `conditions`, `maxHorizonMs` — and
a component never asks "am I in guest mode?"; it asks whether the thing it
is about to render is switched on. `ACCOUNT_CAPABILITIES` enables
everything, to a fifty-year horizon; `GUEST_CAPABILITIES` disables all four
booleans and caps the horizon at one year.

**Unavailable capabilities are omitted, not shown disabled with an upgrade
label.** This reversed an earlier decision made during the same build. The
first pass rendered a dashed row — *"Photographs, voice notes and places ·
FREE ACCOUNT"* — reasoning that `01 §4.1b`'s "invitations upward, never
absences" phrasing meant the capability should stay visible. On review this
read as a paywall inside the writing surface rather than a composer, and
contradicted the guest flow needing to feel complete on its own. The
resolution: a capability an entry point cannot support is left out of that
entry point's UI entirely (`Enclosures.tsx`'s `nothingAvailable` branch,
`ConditionsPanel`'s `hasRecipients` gate); where an account genuinely adds
something, that surfaces naturally at the moment of creating one — the seal
handoff, the signup screen — not as a persistent locked row beside the
letter.

**`/try` renders all three movements**, through the same `MovementNav`, in
the same order, with the same review-before-sealing in Movement III. This
did not hold at first: a pre-ship pass found `/try` still assembling Address
and Compose onto a single page in the wrong order (letter before schedule)
with a bare title field and a plain button standing in for Seal — a
different, shorter product than the one just specified above, discovered
only by walking through it as a first-time visitor rather than checking that
each component worked in isolation. Fixed before this document was written.

**Horizons never offer what an entry point cannot schedule.** A guest was
briefly offered "Ten years from now" and would have met a validation error
after choosing it — the same broken promise as a disabled row, arrived at
from the opposite direction. `horizonCandidates()` filters candidates by
`capabilities.maxHorizonMs` before they are ever rendered.

---

## VIII. Scheduling correctness

Shipped standalone, ahead of and independent from the redesign above, but
foundational to it — every date shown anywhere in Address or Seal goes
through this module. `apps/web/src/lib/zoned-time.ts` is the single place an
instant and a wall-clock reading convert into each other, built on `Intl`
rather than a new dependency (the platform already carries the full IANA
database, including future DST transitions).

The bug: the composer read time values back with
`date.toISOString().slice(11, 16)` (UTC) while writing them with
`date.setHours()` (the browser's own zone), so the displayed field and the
stated summary sentence disagreed by exactly the browser's offset from UTC —
invisible in London, an hour in Lagos, five and a half in Kolkata. Worse, the
zone selector never re-anchored the stored instant when changed, so picking
a different zone altered what a capsule *claimed* without altering when it
would actually open — a certainty bug on a product whose stated promise is
"exactly when you said."

The fix: the composer stores an **instant**; every control reads and writes
that instant through whichever zone is currently selected.
`instantFrom()`/`wallClockIn()` handle the conversion; changing the selected
zone re-anchors (`reanchor()`) — the chosen wall-clock reading is preserved
and the underlying instant moves under it, because "09:00 in New York" and
"09:00 in Lagos" are different moments and picking a zone is a statement
about which one is meant.

One consequence worth recording for anyone touching `unlockMode`: the
selected zone is **not** written to `unlockLocal` in absolute mode — it is
component state (`ScheduleBlock`/`AddressMovement`'s local `zone`). The
scheduler (`apps/api/src/modules/scheduler/resolver.ts`) keys DST
re-resolution off `unlockLocal` being non-null, not off `unlockMode`;
persisting the display zone there for an absolute-mode capsule would
silently opt it into wall-clock rescheduling it was never meant to have.

---

## IX. Supporting API changes

Two contract additions, both gated to what was already true of the
underlying columns:

- **`type` becomes patchable** (`PatchCapsuleRequestSchema`,
  `apps/api/src/modules/capsules/service.ts`'s `DRAFT_FIELDS`). Required for
  Address's addressee beat to mean anything — previously the type could only
  be set at creation, which is why V1's chips were `disabled`. Safe because
  patching is gated to `draft`-state capsules (`state-machine.ts`'s
  `assertCanPatch`); a sealed capsule's type is exactly as immutable as its
  contents.
- **`birthday` is exposed on `UserSchema`** (`packages/contracts/src/auth.ts`,
  `apps/api/src/modules/auth/service.ts`'s `toUserResponse`). The column has
  existed since T-02 and `PatchMeRequest` has always accepted writes to it;
  nothing ever read it back. Powers the Horizon's self-capsule milestones
  (§III).

Both are additive, backward-compatible, and required for Movement I to
function — the API must deploy alongside the web app; the composer breaks
without either.

---

## X. What was removed

`CoverBlock.tsx`, `RecipientsBlock.tsx`, `ScheduleBlock.tsx`,
`SealsBlock.tsx`, `SealConfirmSheet.tsx`, `LetterBlock.tsx`, `MediaBlock.tsx`
— all superseded by the components named above. Also cut from the
experience itself, not merely refactored:

- The cover gradient picker as a primary element, and the raw off-system hex
  gradients it used (`#F4A261`→`#E76F51` and siblings) — the only place in
  the product using colour outside the token system. Not replaced; if a
  visual treatment returns to the composer it should derive from Meridian
  itself (temperature, duration, register), not decoration.
- Three of V1's four scheduling mechanisms (year-shortcut pills, the raw date
  input as the primary control, the always-live natural-language parser that
  thrashed the date on every keystroke that happened to parse). Natural
  language does not currently have a V2 equivalent; if it returns, it should
  preview what it parsed before committing rather than writing on every
  keystroke.
- The "Seals & Expiry" accordion as a container — dissolved rather than
  redesigned, since place-as-memory, the Place/Passphrase/Identity gates, and
  expiry each found a more specific home.
- The disabled Self/Someone-else chips, replaced by an actually-answerable
  question (§III).

---

## XI. Open items

Carried forward rather than resolved here, since none block shipping the
above:

1. **Place-as-memory's reveal rendering** is minimal — `envelopeText()`
   extracts paragraph text only; the reveal does not yet render the enclosed
   place distinctly from the letter body the way the composer's review does.
   Cosmetic, not a data problem: the field is already captured and encrypted
   correctly.
2. **Guest → account conversion** (`F11` in `plan/02-UX-DESIGN.md §7`) was
   not touched by this pass. The claim flow still operates on the pre-V2
   guest capsule shape; worth a pass once V2 guest capsules exist in
   production in volume.
3. **Natural-language date entry** has no V2 home. Worth deciding
   deliberately — reintroduce inside `ExactMoment` with a preview-before-commit
   affordance, or leave it retired — rather than by omission.
4. **Mobile app parity.** This document and the implementation it describes
   are web-only (`apps/web`). `plan/02-UX-DESIGN.md §15` (Mobile Apps) still
   describes V1's composer shape; that section needs its own pass before
   mobile composer work resumes.

---

*This document is the spec. Where `plan/02-UX-DESIGN.md` and this document
disagree on the composer, this document is correct — see the edit made to
`02` alongside this file for where its text was brought into line.*
