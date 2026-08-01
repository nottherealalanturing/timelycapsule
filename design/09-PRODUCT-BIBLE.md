# The TimelyCapsule Product Bible

> Behaviour, not features. What role this plays in a human life over thirty
> years.
>
> **Companion artifact:** https://claude.ai/code/artifact/226512a4-1e86-4ec4-867b-dcb7f860e883
> Source: `design/10-product-bible.html` — republish that path to update the same
> URL.
>
> Final strategic document before implementation. Extends `01`–`08`.
> Contradictions recorded explicitly in Part XIV.

---

## Part I · The fact that reframes everything

Before any behavioural theory, one number.

> **Roughly 80–90% of physical time capsules are never recovered. An estimated
> 95% are lost track of within five years of being sealed.**
> — International Time Capsule Society

Read the failure reasons carefully, because they are not what anyone assumes.
The containers do not fail. The concrete holds. The documents survive. What fails
is that **nobody remembers the capsule exists** — the people who buried it moved
away, the building was replaced, the plaque came off, the institution forgot.

Time capsules are not defeated by decay. They are defeated by **oblivion**, and
oblivion currently wins nine times out of ten.

### What this means for us, precisely

We have been engineering trust against the wrong threat. `19`, `02` and the
marketing plan in `07 §X` all treat institutional survival as the central
question — will the company exist, are there backups, is there an escrow. That
is a real risk and the work was correct.

But it is not the likeliest failure. The likeliest failure is this:

> **In 2041 the capsule is intact, the servers are running, the encryption is
> sound, the delivery job fires exactly on schedule — and the email address died
> in 2033.**
>
> We deliver perfectly, into a void, and never know.

That is the digital form of the forgotten capsule, and our current architecture
walks straight into it. A recipient address captured once, in 2026, and never
touched again, is a fifteen-year bet on an email account. Nobody should take that
bet.

**This is an architecture problem, not a design problem**, and it is the single
most important thing in this document.

### The consequence: proof of life is load-bearing

`07 §XI` specified a "proof of life" notification as a trust gesture — *still
here, still counting, nothing for you to do.* That was right for the wrong
reason.

Its real job is **address validation**. A periodic, low-key message to creator
*and* recipient is the only mechanism that tells us an address has died — and it
tells us **ten years before it matters**, while there is still a living person to
ask for a new one.

The gesture and the infrastructure are the same object. That is the good kind of
design coincidence, and it upgrades proof of life from *nice* to *mandatory*.

**Implied requirements** (for the build plan, not for design):

- More than one contact route per recipient, captured at creation.
- Periodic quiet re-verification of every pending capsule's addresses.
- Escalation to the creator when a recipient route goes dark.
- A named fallback custodian — a human who can be asked.

---

## Part II · What we actually are over thirty years

Not an app someone uses. **A standing arrangement someone has made**, which they
touch perhaps twenty times in three decades.

The nearest true analogues are not software:

| Analogue | Touched | Remembered because |
|---|---|---|
| A safe deposit box | Rarely | The bank sends an annual notice |
| A will | 2–4 times a life | A solicitor holds it and writes to you |
| A life insurance policy | Almost never | A premium leaves your account monthly |
| A vaccination record | At transitions | An institution requests it |

Every durable thirty-year arrangement in a human life is kept alive by **a third
party who periodically makes contact.** Not by the person remembering.

That is what we must be. Not a destination — **a correspondent.**

---

## Part III · The tradition audit

The brief asked what makes things traditions rather than utilities. Studying the
list — journals, photo albums, annual letters, ornaments, baby books, memory
boxes — five properties recur, and family-ritual research supports all five:
predictability, a calendar anchor, collective sign-on, visible continuity, and
adaptation over time.

**Scored honestly against what we have designed so far:**

| Property | Why it matters | TimelyCapsule today |
|---|---|---|
| **A calendar anchor** | Ornaments happen at Christmas. Without a recurring date external to the product, no tradition forms | ❌ None |
| **Visible accumulation** | The ornament box fills. The album thickens. Growth must be *seen* | ❌ A list is not accumulation |
| **Low per-instance cost** | Traditions survive because each instance is cheap | ❌ Our ceremony makes every capsule heavy |
| **Inheritance** | Someone receives the box when you die | ❌ Nobody can inherit an account |
| **Collective sign-on** | Others know you do it; they participate | ⚠️ Deliberately suppressed |

> ### We score zero out of five.
>
> We have designed a beautiful utility and called it a ritual.

This is the central product finding, and every recommendation below is an attempt
to move one of these rows.

---

## Part IV · Frequency — the thing we cannot fake

A normal person encounters a natural reason to seal a capsule **one to three
times per decade.** Births, weddings, diagnoses, graduations, moves, deaths.

Habit products require frequency. We have none, and the standard responses to low
frequency — notifications, streaks, prompts, re-engagement — are precisely the
toolkit we forfeited in `01 §VII` and banned in `07 §XVI`.

So we must stop pursuing retention, which is impossible, and pursue two other
things instead.

### 1 · Recurrence — be present at the eight moments

We do not create the occasion. We are **available** when it occurs, and
recognisable enough to be thought of.

| Life event | Typical duration | Recipient | Frequency |
|---|---|---|---|
| Birth of a child | 18–21 years | The child | Once or twice a life |
| Wedding / union | 1, 10, 25 years | Spouse, both | Once, then anniversaries |
| Diagnosis / end of life | Weeks to decades | Everyone close | Once, urgently |
| Graduation | 10 years | Self, cohort | Once per stage |
| Milestone birthday | 10 years | Future self | Every decade |
| Emigration / major move | 5–10 years | Self, those left | Rare |
| Retirement | 10–20 years | Grandchildren | Once |
| Loss, divorce, recovery | 1–2 years | Self | Unpredictable |
| **The annual rite** | **1 year** | **Self, family** | **Every year** |

Eight are external and outside our control. **The ninth is the only one we can
build**, and it is worth more than the other eight combined — because it is the
only calendar anchor available to us.

### 2 · The annual rite — the highest-leverage thing in this document

One deliberate occasion per year, on a date the household chooses, where the
family writes to itself twelve months out. Last year's arrives as this year's is
written.

It is the only mechanism that simultaneously fixes four of the five audit rows:

- **Calendar anchor** — a fixed recurring date, owned by the family, not by us.
- **Accumulation** — the arriving letter is visible proof of the last one.
- **Low cost** — a year is short, the stakes are small, it can be four sentences.
- **Collective sign-on** — everyone at the table writes one.

It is culturally precedented (the annual Christmas letter, New Year resolutions,
Rosh Hashanah reflection, the school "letter to your future self"), and it
requires no nagging because **the arrival is the reminder.** The product does not
prompt; last year's capsule does.

**This should be built before the marketing site.**

---

## Part V · Why people return, and why they stop

### Return

1. **A capsule arrived.** Overwhelmingly the strongest, and it is automatic. The
   act of receiving is the act of recruiting.
2. **A life event occurred.** External. We influence only whether we are
   remembered — see Part I.
3. **The annual rite.** The only honest engine we can build.
4. **They witnessed someone else's arrival.** Offline, at a kitchen table. This
   is our real growth channel and it is invisible to analytics.
5. **Address maintenance.** Boring, and a perfectly legitimate reason to touch
   the product. It should feel like updating a policy, not like a chore.

### Stop

1. **They forgot we exist.** The 90% problem. Not a churn metric — an oblivion
   metric, and we will not see it in a dashboard.
2. **They lost the master key.** Unrecoverable, catastrophic, and *our fault*.
   The single largest self-inflicted risk in the product.
3. **The first arrival disappointed.** The letter was thin, because writing is
   hard and we did not help (`07 §IV`). A disappointing arrival kills the second
   capsule permanently.
4. **The relationship ended.** The sealed capsule became a liability. See Part
   XIV.4.
5. **The life stage passed.** The children grew up. Natural, and fine.
6. **Doubt crept in.** They stopped believing we would last, and quietly stopped
   adding. Silent, and invisible to us.

Note that four of six are invisible in product analytics. **Our instrumentation
will systematically over-report health.**

---

## Part VI · Archetypes

### Creators

| Archetype | Duration | Stakes | Notes |
|---|---|---|---|
| **The Parent** | 15–21 yrs | Highest | The core. Longest durations, most emotional load, most likely to become a tradition |
| **The Future Self** | 6 mo–5 yrs | Low | The on-ramp. High frequency, low stakes, forgiving. **The product must not be too solemn for them** |
| **The Terminal** | Weeks–decades | Absolute | Rare, most important. Time-poor, often unwell. Every friction is cruelty. Must never require a working memory of a password |
| **The Couple** | 1–25 yrs | High | Two-sided, ritual-friendly, and exposed to relationship change |
| **The Archivist** | Any | Medium | Systematic, completionist, small in number, disproportionately evangelistic |
| **The Institution** | 10–50 yrs | Medium | Schools, companies, communities. Genuinely a different product — see Part IX |

**The Future Self is the acquisition archetype and the Parent is the retention
archetype.** A product tuned only for the Parent has no on-ramp; a product tuned
only for the Future Self never becomes a tradition. We need both, and they want
opposite tones.

### Recipients

| Archetype | Context on arrival | Design consequence |
|---|---|---|
| **The Grown Child** | No account, no context, phone, possibly ambushed | The emotional core of the product. `P8` exists for them |
| **The Self** | Expected, low ceremony | Should be light. Ceremony here is overbearing |
| **The Bereaved** | Sender is dead | **Highest stakes in the entire product.** See below |
| **The Cohort** | Reunion, group setting, semi-public | Different tone; social, not intimate |

### The fact we can never know

> **We do not know whether the sender is alive when the capsule arrives.**

We cannot know, we must not ask, and the two cases are emotionally opposite. A
cheerful present-tense line — *"Your father has a message for you"* — delivered
to someone whose father died last year is a catastrophic failure, and **we would
never find out we had done it.**

**Rule (absolute, joins the copy constitution):** all delivery language is in the
past tense and refers only to the act of sealing, never to the sender's present
state.

> ✅ "Sealed by Michael Adeyemi on 14 March 2026."
> ❌ "Michael has sent you a capsule." · ❌ "A message is waiting from Michael."

This costs us nothing and prevents the worst thing the product could do.

### Capsules

Two axes govern everything: **duration** and **relationship**.

| | To self | To one other | To many |
|---|---|---|---|
| **< 1 year** | Note (ordinary) | Nudge | Cohort check-in |
| **1–5 years** | Reflection | Letter | Group capsule |
| **5–20 years** | The long view | **The Letter** — the archetypal product | Family capsule |
| **20+ years** | Rare | Legacy letter | Institutional capsule |

**Ceremony must scale with this matrix**, not be applied uniformly. See Part
XIV.2.

---

## Part VII · Sacred and ordinary

The brief asks what becomes sacred and what must remain ordinary. This is a real
design constraint, not a mood.

> **Sanctity is spent only at the boundary between private and permanent.**
> Everything on either side of that boundary is administration.

| Sacred — five things only | Ordinary — everything else |
|---|---|
| The moment of sealing | Browsing the archive |
| The arrival | Editing a draft |
| The recovery kit | Settings, billing, export |
| The delivery promise itself | Updating an address |
| The record as an object | Short, low-stakes capsules |

### Why the ordinary column matters more than it looks

**If everything is sacred, nothing is, and the product becomes unusable.** A
solemn interface around a note to yourself in six months is absurd, and worse, it
makes the trivial capsule too expensive to write — which removes the on-ramp that
produces the Parent five years later.

The rare, devastating capsule lands *because* it sits among ordinary ones. Gravity
requires contrast.

---

## Part VIII · Growth without becoming social media

The strongest guarantee we have is structural rather than promised:

> **Zero-access encryption means we cannot read capsule contents. Therefore we
> can never build a feed, a recommendation, a trending page, or a discovery
> surface. It is not a policy we might reverse under investor pressure — it is
> arithmetic.**

Say this plainly and often. It is the most credible commitment in the product,
because it is the only one we could not break if we wanted to.

**The growth model, in order of real-world weight:**

1. **Arrival → new creator.** Every delivered capsule produces a candidate
   creator who has just experienced the product at full strength. Slow, measured
   in years, and it compounds.
2. **The witnessed arrival.** Someone opens a letter at a table with other people
   present. Invisible to us; probably our largest channel.
3. **The duration-only share artifact** (`07 §XIV`). Content-blind by
   construction.
4. **Institutions.** A school seals 200 capsules in one afternoon.

**This reframes `P8`.** The recipient path is not an accessibility constraint we
accepted for decency. **It is the acquisition funnel.** It deserves the most
engineering, not the least — which is exactly the opposite of how a normal
product would resource an unauthenticated read-only page.

**Never:** profiles, followers, feeds, likes, public galleries, capsule counts,
leaderboards, "people near you", or any surface where users encounter strangers.

---

## Part IX · Institutions, and the one that is a different product

Schools, weddings, companies, communities, memorials.

**Institutions solve our hardest problem for free.** A school holds alumni
records and has a permanent address; the institution is the custodian, and
institutional memory outlives every individual in it. A school cohort capsule is
*more* likely to be delivered than a private one.

| Context | Pattern | Note |
|---|---|---|
| **Schools** | Cohort seals on entry, opens at graduation or +10 yrs | Best institutional fit. The school is the custodian |
| **Weddings** | Couple + guests seal; opens at 1st, 10th, 25th | Natural, gift-shaped, and exposed to divorce (Part XIV.4) |
| **Funerals / memorial** | Capsules *from* the deceased, released after death | See warning below |
| **Companies** | Founding, milestones, anniversaries | Low emotional value, real archival value |
| **Communities** | Civic, religious, neighbourhood | Closest to the historical form |
| **Historical preservation** | Public archival deposit | **A different product — see below** |

### Two warnings

**1 · Death-triggered release is the most requested and most dangerous feature we
will ever be asked for.** A false positive delivers a dead person's final letters
to their living family. Automated death detection is not acceptable at any
confidence level. If built at all, it must be **custodian-confirmed release** — a
named human being who asserts the death — never an inference from inactivity, a
data broker, or a missed check-in.

**2 · Public/historical capsules break our cryptography.** A capsule meant for
future historians is by definition not addressed to a person and not
zero-access — the whole point is that anyone may open it. That is a different
threat model, a different key architecture, and a different product. **Do not
quietly blend it into the private product.** If it is ever built, it is a
separate surface with separate language.

---

## Part X · The psychological barriers

Ranked by how many people they stop.

1. **The blank page.** Already identified as the largest gap (`07 §IV`). It is
   the top of this list too.
2. **Superstition about the future.** Writing to your child at eighteen means
   contemplating not being there. A meaningful number of people will start and
   close the tab, and no interface fixes this — only tone does. Never make the
   mortality explicit; let the person bring it.
3. **"Who am I to think this matters?"** People underestimate how much a letter
   from a dead parent will mean. The single most persuasive marketing asset is
   not a feature list but the testimony of someone who received one — which we
   will not have for years, and must not fake (`07 §X`).
4. **Fear of being embarrassed by your past self.** Real, and mostly a Future
   Self concern. Mitigated by making short, low-stakes capsules normal.
5. **Choice paralysis on the date.** "When?" is a genuinely hard question with
   infinite options. Offer anchored answers — *when she turns eighteen*, *our
   tenth anniversary* — not a date picker alone.

---

## Part XI · The trust barriers

1. **"Will you exist?"** Already the centre of `07 §X`.
2. **"Will you be able to find them?"** Part I. **Currently unaddressed, and more
   likely to bite than #1.**
3. **"What if I lose the key?"** Our most self-inflicted risk. Zero-access means
   a lost master key is unrecoverable, and the person who loses it will
   reasonably experience this as us having destroyed their letters.
4. **"Can you read it?"** Answerable with architecture, and our strongest answer.
5. **"What happens when I die?"** Nobody can inherit an account today. For a
   product explicitly about outliving people, this is a conspicuous hole. Digital
   estate research is consistent: accounts linger, terms of service block
   transfer, and heirs are left without access.
6. **"What if I change my mind?"** Part XIV.4.

---

## Part XII · The behavioural risks

- **We will over-report our own health.** Four of six churn reasons are invisible
  in analytics (Part V). Deliveries succeeded ≠ deliveries received.
- **We will optimise for the creator** because the creator is who we can see. The
  recipient is unauthenticated, anonymous, and generates almost no telemetry —
  and is the more important person.
- **We will be tempted to manufacture frequency** the moment growth flattens.
  Every mitigation for low frequency that is not the annual rite is a banned
  pattern wearing a hat.
- **The archive will silently become a to-do list.** A list of pending capsules
  with dates is functionally a task manager, which is the opposite of the
  intended feeling. It must read as a shelf, not a queue.
- **The product will drift solemn.** Every design decision in `01`–`08` pushes
  toward gravity. Nothing so far pushes back. The Future Self archetype is our
  only counterweight and it is currently unserved.

---

## Part XIII · Thirty years

### Success

- Someone opens a letter from a parent who died fifteen years earlier, and it is
  the most valuable object they own.
- **A family has a date.** Every year, the same evening, everyone writes.
  Children who grew up with it start doing it in their own households.
- **An account has been inherited** — a custodian named, a transfer executed, the
  arrangement continuing past the death of the person who made it.
- A school opens the capsules its 2027 intake sealed, and it is on the calendar
  as an institution, not as a project someone champions.
- **We are boring.** Nobody discusses our design. The letters are discussed.

### Failure — and it is not bankruptcy

The instructive failure is silent:

> **We deliver flawlessly for thirty years into addresses that died in the
> 2030s. Every job succeeds. Every dashboard is green. Nobody receives anything.
> We become the 90%, with better uptime.**

The second failure is subtler and more likely to be self-inflicted:

> **We solve low frequency the way software always solves low frequency.** A
> nudge here, a streak there, an anniversary email, a feed of public capsules.
> Each defensible alone. Collectively they convert a thirty-year arrangement into
> an app that people churn out of in eight weeks.

Both failures are avoidable, and neither is prevented by anything in `01`–`08`.

---

## Part XIV · Challenges to documents 01–08

### 1 · Trust engineering is aimed at the wrong threat — **new, and the biggest**

`02`, `07 §X` and the deployment work all centre institutional survival.
Deliverability is the likelier failure by a wide margin and appears nowhere.
Proof of life is promoted from gesture to infrastructure (Part I). Multiple
contact routes and periodic re-verification become requirements.

### 2 · Uniform ceremony is wrong — **refines `07 §VI`**

I wrote that the held beat applies to everything irreversible. Applied uniformly,
it makes a six-month note to yourself as solemn as a deathbed letter — which both
cheapens the serious capsule and taxes the trivial one out of existence.

**Refinement, consistent with the original rule rather than a reversal:**
*consequence* is not binary. Ceremony scales with duration × relationship (Part
VI matrix). A one-year note to self seals with a brief hold. A twenty-year letter
to a child gets the full sequence. The principle — *duration is a function of
consequence* — is unchanged; I had been treating a continuous variable as a
switch.

### 3 · The product is too solemn, and has no on-ramp — **challenges `01`–`08` collectively**

Every foundational document pushes toward gravity, permanence and institutional
weight. That is right for the Parent and the Terminal. It is wrong for the Future
Self, who is where nearly everyone starts, and who supplies the ordinary capsules
that make the rare one land (Part VII).

**Nothing in the identity currently makes room for a light capsule.** This needs
resolving before component design, because it is a tone and hierarchy question,
not a screen question.

### 4 · Immutability and irrevocability are being conflated — **founder decision**

The hard rule is that **sealed content is immutable**. That must not change, and
nothing here proposes changing it.

But immutability of *content* is a different property from irrevocability of
*delivery*, and we have been treating them as one. The human consequence:

> Someone seals a letter to their spouse for their twenty-fifth anniversary. They
> divorce in year eight. The letter will be delivered.

We become a machine that reliably delivers letters from marriages that ended, to
people who are now estranged, sometimes from people who are dead.

**Proposed resolution — a right of withdrawal:** a creator may **destroy** a
sealed capsule before delivery. They may never **alter** it.

This is stricter than most archival practice and preserves the cryptographic
guarantee exactly: *records may be destroyed; they may never be forged.* It also
does not weaken the promise, because the promise in `02` is made to the
**creator** — *"what you seal will come back"* — and the recipient does not know
the capsule exists.

Flagging rather than deciding: it touches a hard rule's neighbourhood and it is
yours to settle.

### 5 · `P8` is the funnel, not a courtesy — **reframes `01`/`07`**

The recipient path was justified on decency and accessibility grounds. It is also
the primary acquisition channel (Part VIII). It should be resourced as the most
important surface in the product rather than the most constrained.

### 6 · There is no inheritance model — **gap**

For a product about outliving people, nobody can inherit an account. Needs a
named custodian at minimum. This is also the honest answer to trust barrier #5
and a precondition for the funeral/memorial use cases.

### 7 · The annual rite should precede the marketing site — **changes `07 §XVIII`**

`07` ordered: recipient gate → composition → logo → design system → T-21. The
annual rite is the only calendar anchor available to us and the only honest
answer to our frequency problem. It belongs alongside composition, ahead of
T-21 — and it changes what the marketing site is selling.

**Revised order:** cold-recipient gate → composition experience → **annual
rite** → logo → design system → T-21 → web → mobile.

---

## Part XV · The one sentence

Everything above reduces to this:

> ## We are not a place people go. We are a correspondent who keeps writing to them, so that in thirty years the letter is not lost.
>
> The product's central job is **not** storage, encryption, or ceremony. Those
> are solved. The central job is **to still be able to find the person.**

### The four filters, final

1. Does this make the promise more believable? (`02`)
2. Does the waiting state look like something valuable is happening? (`03`)
3. Does this make the letter matter more than us? (`07`)
4. **Does this make it more likely we can still find them in 2041?** (`09`)

---

## Part XVI · What implementation inherits

**Product requirements this document creates** (for the build plan, not design):

1. Multiple contact routes per recipient, captured at creation.
2. Periodic address re-verification, doubling as proof of life.
3. Escalation to the creator when a route goes dark.
4. A named custodian per account — inheritance, and the only acceptable basis for
   any post-death release.
5. The annual rite.
6. A right of withdrawal — destroy, never alter — *pending founder decision*.
7. Short-form capsules as a first-class, deliberately un-ceremonious path.
8. An archive that reads as a shelf, not a queue.

**Design work this document creates:**

- Ceremony that scales with duration × relationship.
- A tonal register for the ordinary capsule that does not break the identity.
- Past-tense-only delivery language, everywhere, absolutely.
- Accumulation made visible.

**Closing obligation, carried since `00 §governance`:** the redesign ends by
rewriting `plan/02-UX-DESIGN.md §6`, or future sessions build against the stale
spec and silently undo all of this.
