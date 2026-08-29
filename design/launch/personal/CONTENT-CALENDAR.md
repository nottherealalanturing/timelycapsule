# Content strategy + 30-day calendar (2026-08-29)

> Continues `design/launch/personal/PERSONAL-PRESENCE.md` (positioning +
> profile copy, 2026-08-28) and `design/launch/COPY.md` (TimelyCapsule's own
> X/Instagram pack). This file is the scheduling/strategy layer: content
> pillars, the actual personal-post pool (rewritten — see §0), the 30-day
> calendar across all accounts, cross-account mapping, the repurposing
> matrix, the Instagram plan, and the final publishing dashboard.

---

## 0 · What changed from the existing personal-presence work

Audited against the new clarification — **TimelyCapsule is something Assad
is currently working on, not the entirety of his identity** — before writing
anything new.

| Item | Verdict | Why |
|---|---|---|
| Positioning ("Software engineer. Currently: TimelyCapsule.") | **Keep** | Already leads with engineer, TC as current work — exactly the relationship asked for |
| LinkedIn headline | **Keep** | Same reason |
| LinkedIn Experience entry (Title: Founder) | **Keep** | Correctly scoped — a structured field, not the public identity, per your own explicit instruction that this is fine there |
| X bio | **Keep** | Leads with "Software engineer," doesn't overclaim |
| Instagram bio | **Keep** | Same |
| GitHub bio | **Keep** | Same |
| GitHub profile README | **Rewrite (small)** | Opening line said "most of my time currently goes to TimelyCapsule" — read as TC being the dominant fact about him rather than current work among others. Changed to "Currently building TimelyCapsule, among other things." One-word-level fix, not a rewrite of the whole thing. |
| Personal LinkedIn banner | **Keep** | Already hierarchy-correct: "Software engineer" is the larger line, "Currently building TimelyCapsule" the smaller one |
| LinkedIn company page + 9 company posts | **Keep** | Correctly TC-voice throughout — this is the account allowed to be entirely about the product |
| **The 10 personal posts (5 LinkedIn + 5 X)** | **Rewrite — the real finding** | Every single one referenced TimelyCapsule. Zero were TC-free. This is the opposite of what was just asked for ("some personal posts should have ZERO TimelyCapsule mention... this is important"). Replaced with a larger, deliberately mixed pool — §2 below. |
| Content pillars, 30-day calendar, cross-account map, repurposing matrix, Instagram stories/highlights, full asset inventory | **Create — didn't exist yet** | The previous pass delivered profiles and two content pools; it never built the scheduling/strategy layer this request asks for. |

**Product state re-verified, not assumed:** `git log`/`git status` show no
web-app or `design/launch/` changes since the 2026-08-25 marketing pass —
only backend notification work and the mobile app (Stage E, still
ticket-based, not publicly shipped). Every feature claim below rests on the
same hands-on verification as before (`REFRESH-2026-08-25-NOTES.md` §4):
composer, sealing, waiting, reveal, replies, one-reading-only, and guest
mode are all real; voice notes are real but still uncaptured as an asset;
Premium pricing is priced but not purchasable. Nothing here claims the
mobile app publicly — it's real, current work, referenced in one Assad post
below (§2) as work-in-progress, not as a shipped capability.

---

## 1 · Account roles

| Account | Role | Voice |
|---|---|---|
| TimelyCapsule X | Product/brand | Full institutional voice, third person, `COPY.md` register |
| TimelyCapsule Instagram | Visual/product/brand | Same voice, longer captions, real UI |
| TimelyCapsule LinkedIn | Product + engineering + philosophy | Same voice, longest form, technical detail allowed |
| Assad LinkedIn | Personal engineering perspective | First person, "I" — TC appears sometimes, not always |
| Assad X | Personal thoughts + engineering, occasional TC | First person, shortest, driest |
| Assad Instagram | Personal — evaluated below, kept light | First person, mostly not about TC |
| Assad GitHub | Developer identity | No voice/cadence — profile only, no posting |

**How they complement each other, concretely:** the TC accounts describe
what the product *is* and *does* — never "I," always the record and the
recipient. Assad's accounts describe what it's like to *build* it, and just
as often describe something that has nothing to do with it at all. A reader
who follows both should get two different things: TimelyCapsule's accounts
answer "what is this," Assad's answer "who writes software like this, and
what else do they think about."

---

## 2 · Content pillars

### A. TimelyCapsule (7 pillars — unchanged from the working set already
proven in `COPY.md` and the 9 LinkedIn posts, just named explicitly)

| # | Pillar | Type | Best platform | Example topics | Frequency | Visual needed? |
|---|---|---|---|---|---|---|
| 1 | Product moments | Real-UI screenshot + short copy | IG, X | Composer, sealing, waiting, reveal | Weekly | Always |
| 2 | Privacy/encryption architecture | Explainer | LinkedIn, X | Zero-access design, what "can't read it" actually means | Biweekly | Sometimes |
| 3 | The philosophy of waiting | Thesis/opinion | LinkedIn, IG | Anti-engagement, refusals, no streaks | Biweekly | Sometimes |
| 4 | Correspondence (Replies) | Feature explainer | All three | The reply flow, "not the last word" | Monthly | Always |
| 5 | Custody/destruction | Trust/feature | All three | One-reading-only, real verified deletion | Monthly | Sometimes |
| 6 | Design decisions | Craft explainer | LinkedIn, X | The held beat, Dual Clock, two registers | Monthly | Usually |
| 7 | Honest status | Grounding | LinkedIn | Where the product actually is, no traction claims | Monthly | Sometimes |

### B. Assad (8 pillars — rebuilt, roughly half deliberately TC-free)

| # | Pillar | TC involved? | Best platform | Example topics | Frequency | Visual? |
|---|---|---|---|---|---|---|
| 1 | Software engineering craft | Rarely | LinkedIn, X | Debugging war stories, dependency audits, naming things | Weekly-ish | No |
| 2 | Things I'm building | Sometimes | LinkedIn, X | TimelyCapsule *and* other work (the mobile client, other tools) | Biweekly | Sometimes |
| 3 | Technical lessons/postmortems | Sometimes | LinkedIn | Real bugs, real fixes — TC-sourced or not | Monthly | No |
| 4 | Interesting implementation problems | Sometimes | X | Encryption, scheduling, or anything else technically interesting that week | Biweekly | No |
| 5 | Product/design opinions | Sometimes | LinkedIn | Why he builds the way he does — can reference TC without being *about* TC | Monthly | No |
| 6 | TimelyCapsule — explicit | Yes, deliberately occasional | Both | A specific ship, a specific decision | Monthly | Sometimes |
| 7 | Solo-building life | No | LinkedIn, X | Process, decision logs, the actual texture of building alone | Monthly | No |
| 8 | Developer culture, dry observations | No | X | Industry takes, tooling gripes, the Windows-95 site | Weekly-ish | No |

Deliberately not using the eight categories you sketched verbatim —
collapsed "interesting problems" and "other projects" together (both are
"what's technically alive right now," better as one pillar than two thin
ones), and added "developer culture, dry observations" as its own pillar
because it's the single easiest lever for making the account *not* read as
a TimelyCapsule fan page — it's the pillar with the least gravitational pull
back toward the product.

---

## 3 · The personal post pool (rewritten)

Tagged `[TC]` / `[TC-adjacent]` (references a real TC detail without
naming/promoting it) / `[non-TC]` (no TimelyCapsule content at all). Ratio
across the pool: **9 of 26 explicitly `[TC]`, 4 `[TC-adjacent]`, 13
`[non-TC]`** — just over half genuinely unrelated, matching "should not
dominate" and "sometimes zero mention."

### 3.1 · LinkedIn pool (10 — pick ~5–6 for 30 days, rest held in reserve)

**L1 · `[TC]` What most of the actual work is**
```
Somewhere around the third rewrite of the encryption flow, I realized the interesting problem was never "how do I build a time capsule app." It was "how do I build something where the correct answer to almost every feature request is no."

No read receipts. No "seen by." No preview of what's inside before it opens. No way for me — the person who runs the servers — to see what anyone wrote. Every one of those is a feature I chose not to build, on purpose, more than once.

That's most of what I actually do most days now — not adding things, holding a line on what doesn't get added. Stranger kind of engineering work than I expected. I like it more than I thought I would.
```

**L2 · `[TC]` Shipping replies**
```
Shipped replies to TimelyCapsule this week — a capsule's recipient can now write back, sealed the same way the original letter was.

The interesting part wasn't the crypto (mostly reused work I'd already done). It was resisting the urge to make it feel like every other reply feature I've built before: no read receipt, no typing indicator, no notification with a content preview. It just says someone replied. You still have to go open it to find out what they said — same as the letter that started it.

Staying consistent with a product's own principles is more work than building the feature.
```

**L3 · `[TC]` Testing a delete button**
```
Wrote a whole test suite this week for a feature whose only job is to delete something.

TimelyCapsule has a "one reading only" mode — read it once, and the record is destroyed, no copy anywhere. The hard part wasn't the deletion logic. It was making sure it could never fire by accident: not on a page load, not on a link-preview bot crawling the URL before a real person opens it, not on a browser prefetch.

Confirmed-read only, verified against an actual test suite — not eyeballed once and shipped. Destructive features earn a different level of paranoia than the rest of the codebase.
```

**L4 · `[non-TC]` The dependency I never audited**
```
Spent an embarrassing amount of time this week convinced a race condition was in my own code. It was in a library I'd imported for one utility function two years ago and never looked at again past the README.

"I only need one function from this" is exactly the reasoning that gets you here. Auditing dependencies you only "need one function from" is one of those lessons that doesn't stay learned — I'll be back here again in six months, differently annoyed.
```

**L5 · `[non-TC]` Building alone**
```
Nobody warns you that building alone means you're also QA, support, and the person who has to explain to yourself why a decision from four months ago made sense at the time.

Started keeping a written log of decisions as I make them — not for anyone else, just so future-me has something better to work from than "I'm sure I had a reason." Small habit. Has already saved me from re-litigating two decisions I'd already made correctly once.
```

**L6 · `[TC-adjacent]` Making a decade feel true**
```
A decade is 3,653 days. Written down like that it barely registers — small enough that a calendar app could show you a countdown without embarrassing itself.

Most of what I've actually worked on this year has been trying to make that distance feel true inside an interface, instead of just numerically correct. Two numbers — travelled, remaining — turned out to do more of that work than any animation would have.
```

**L7 · `[non-TC]` Tests that lie**
```
The tests I trust least are the ones I wrote in a hurry to make CI green, then never looked at again. Found three of those this week, all subtly wrong in the same direction — asserting the mock's behavior instead of the real one's.

None of them were catching anything. All three had been green for months. A passing test suite is a claim, not a proof, and I'd stopped checking which one I actually had.
```

**L8 · `[non-TC]` The four-word code review**
```
The best code review comment I got this year was four words: "why does this exist."

Not unkind. Just correct. I didn't have a good answer, so I deleted forty lines instead of defending them. Most of the code I'm least proud of has survived exactly because nobody asked that question at the right moment.
```

**L9 · `[TC]` A bug that only existed because a fix was too good**
```
Shipped a fix recently so a logged-in user's dark-mode preference would stick properly on the marketing pages. Verified it worked. Moved on.

Two days later: every hard refresh of a logged-in page was bouncing real, authenticated users straight back to the login screen — a session with valid tokens sitting right there, ignored.

The cause: a loading-state variable that used to safely default to "false" (not loading) now needed a third state — "haven't checked yet" — and defaulting it to false meant the route guard concluded "not loading, no user, redirect" before the code that reads the tokens ever ran. False and unknown had been silently treated as the same value.

Fixed by giving it three real states instead of two. A very small diff for how long it took to notice.
```

**L10 · `[non-TC]` The Windows 95 site**
```
My personal site is themed like Windows 95. It has taken noticeably longer to maintain than it has any right to, for a decision that gains me nothing measurable — nobody has ever hired me because of it, as far as I know.

I have no plans to make it sensible. Some projects are for the portfolio. That one's just for me.
```

### 3.2 · X pool (16 — pick ~11–13 for 30 days, rest held in reserve)

```
X1 · [TC] (188 chars)
Built a feature this week whose entire job is deleting something permanently. Wrote more tests for it than for anything that adds a feature. Destruction earns a different kind of paranoia.

X2 · [TC-adjacent] (137 chars)
The hardest part of building TimelyCapsule isn't the encryption. It's saying no to read receipts every single time someone suggests them.

X3 · [TC-adjacent] (196 chars)
Ten years is 3,653 days. I've been trying to make an interface feel that distance instead of just displaying the number correctly. Turns out two counters do more work than an animation ever would.

X4 · [non-TC] (182 chars)
Spent the day fixing a bug where "haven't checked yet" and "definitely false" were being treated as the same value. They were not the same value. They have never been the same value.

X6 · [non-TC] (112 chars)
Every few years I relearn that "I'll just write this part in bash, it's simple" is a trap dressed as a shortcut.

X7 · [non-TC] (108 chars)
Every codebase has one file everyone is afraid to touch. Mine has two now. I made the second one on purpose.

X8 · [non-TC] (138 chars)
My personal site is Windows-95 themed. It costs me real maintenance hours for zero measurable benefit. No regrets, mostly, on a good week.

X9 · [non-TC] (119 chars)
Two kinds of bugs: the ones you find, and the ones a user finds three weeks after you stopped thinking about that file.

X10 · [non-TC] (178 chars)
Naming things is still the hard part. Today's variable went through "flag," "pending," "unknownYet," and "null" before I remembered null already means something in this codebase.

X11 · [TC] (148 chars)
Wrote a test suite this week for a feature whose only job is destroying something on purpose. Different kind of paranoia than adding a feature does.

X12 · [non-TC] (145 chars)
Refactored something today purely because the old version annoyed me every time I opened the file. No ticket. No user impact. Good enough reason.

X13 · [TC-adjacent] (142 chars)
A letter that can't be read for ten years is a strange thing to spend a Tuesday on. Also the only thing I want to spend Tuesdays on right now.

X14 · [non-TC] (117 chars)
Today's yak-shave: wanted to fix a typo, ended up updating three dependencies and losing forty minutes to a lockfile.

X15 · [TC] (174 chars)
Replies shipped. A capsule's recipient can now write back, sealed the same way the letter was. No read receipt, no typing indicator — same restraint as everything else in it.

X16 · [non-TC] (136 chars)
The most honest status update most weeks: nothing broke, nothing shipped, I just understood the codebase slightly better than yesterday.

X17 · [non-TC] (141 chars)
Mobile client is coming along. Mostly this means re-learning which of my assumptions about "the web version already handles this" were wrong.
```

(X5 from the previous pool retired — its "started a company about it" framing overlapped too much with the dedicated reveal post in §4; not needed twice.)

---

## 4 · The "what I've been working on" post — three versions

One-time, not part of the rotation. First real mention of TimelyCapsule to
Assad's existing network. Placed once profiles are updated (§6, Week 1).

**A · Understated**
```
For a while now I've been building something on the side — a way to write a letter, seal it, and have it actually arrive later. Not a note-to-self app. Not scheduled email. Properly sealed: encrypted before it leaves your device, unreadable by me or anyone else until the date you chose.

It's called TimelyCapsule. Live at timelycapsule.com, if you want to see what most of my evenings have gone toward this year.
```

**B · Witty**
```
Confession: the side project I've been quiet about for months is an app whose entire job is making sure nothing happens for as long as possible.

TimelyCapsule seals a letter until a date you choose — a month out, or decades — encrypted before it leaves your device. I have spent an unreasonable number of hours making sure a piece of software does, on purpose, absolutely nothing. Somehow this has been the most satisfying engineering I've done in years. timelycapsule.com
```

**C · Technical**
```
Been building something I haven't talked about much: TimelyCapsule — letters sealed until a date the writer chooses, encrypted client-side before anything reaches a server.

The actual engineering problem underneath: zero-access by construction, not by policy — no admin view, no support-tool bypass, no server-side code path that can decrypt content, ever. Scheduling handles horizons from a month to fifty years; a separate confirmed-read flow (not page-load) triggers real destruction for capsules marked "one reading only," verified against a dedicated test suite before I trusted it enough to ship.

timelycapsule.com, if the architecture is the interesting part to you.
```

**Recommendation:** **LinkedIn → A.** Most universally readable, matches
the "quietly mentioning" goal exactly, doesn't require the reader to already
care about architecture to land. **X → B.** X rewards wit and brevity; B is
the version that sounds least like a company announcement and most like a
person. **C held in reserve** — strong as a *follow-up* LinkedIn post about
two weeks later, once the network already knows TimelyCapsule exists, aimed
at readers who want the engineering detail A skipped.

---

## 5 · Instagram — a real recommendation, not a default

**TimelyCapsule Instagram:** yes, active — visual, product-forward, already
has 11 approved posts in `COPY.md` plus highlight covers. Feed sequence in
§6.

**Assad's personal Instagram: keep it light, don't force a cadence.**
Instagram is the platform where a personal account most resembles a public
diary, and flooding it with product content is exactly how a personal
account starts reading as a second company account — the failure mode this
whole request is about avoiding. Recommendation: **one post in the 30-day
window** (an adapted, more visual version of the "what I've been working
on" reveal, §6 Week 4), and otherwise leave it to whatever Assad already
posts there personally. Don't build a recurring TimelyCapsule cadence for
it. If a future product moment is genuinely visual and worth sharing there,
add it opportunistically — don't pre-schedule a slot that has to be filled.

### Stories / Highlights

**TimelyCapsule:** existing 6 highlight covers (`kept`, `geometry`,
`register`, `clock`, `record`, `rules`) stay as-is — abstract, not
date-bound, still accurate. Story usage, modest: the day before each feed
post, a single story reposting that post's image with one line of context
("new post — link in bio" energy replaced with the actual line from the
caption) — not every story needs new art, and not every feed post needs a
story. Suggested cadence: story on the *day of* each Instagram feed post
(§6), nothing between. No new highlight needed yet — "replies" and "one
reading only" are strong enough concepts that a 7th highlight could be
added once there are 2–3 posts of that material to anchor it, not before.

**Assad personal:** no highlight strategy — one Instagram post in 30 days
doesn't warrant a highlights structure. Revisit once/if a real "building"
highlight makes sense.

---

## 6 · The 30-day calendar

Starts **Monday, 2026-08-31** (today, 2026-08-29, is a Saturday — the
weekend is setup time, §7). Runs through **Tuesday, 2026-09-29** (30 days).
**No launch date is implied or invented anywhere in this calendar** — every
post concerns the product's current, live state; nothing here is a launch
announcement.

Legend: **TC-LI** TimelyCapsule LinkedIn · **TC-X** TimelyCapsule X ·
**TC-IG** TimelyCapsule Instagram · **A-LI** Assad LinkedIn · **A-X** Assad X
· **A-IG** Assad Instagram.

### Week 1 · Aug 31 – Sep 6

| Date | Day | Time | Account | Post | Asset |
|---|---|---|---|---|---|
| Aug 31 | Mon | — | *(all)* | **Profile setup day — no posts.** Apply §7's bios/banners/README. | — |
| Aug 31 | Mon | 10:00 | TC-LI | Post 1 · Why this exists | `x/post-mark.png` |
| Sep 1 | Tue | 09:00 | TC-X | "The mark" | `x/post-mark.png` |
| Sep 2 | Wed | 12:00 | TC-IG | "The mark" | `instagram/01-the-mark.png` |
| Sep 2 | Wed | 15:00 | A-X | X4 — the false/unknown bug (non-TC on its face) | none |
| Sep 3 | Thu | 09:00 | A-LI | **"What I've been working on" — version A** | none |
| Sep 3 | Thu | 14:00 | TC-X | "The Dual Clock" | `x/post-dualclock.png` |
| Sep 4 | Fri | 10:00 | A-X | **"What I've been working on" — version B** | none |
| Sep 5 | Sat | 12:00 | TC-IG | "The Dual Clock" | `instagram/03-dual-clock.png` |
| Sep 6 | Sun | — | *(all)* | No post. | — |

### Week 2 · Sep 7 – 13

| Date | Day | Time | Account | Post | Asset |
|---|---|---|---|---|---|
| Sep 7 | Mon | 10:00 | TC-LI | Post 2 · What I actually care about | `screenshots/06-survival.png` |
| Sep 8 | Tue | 09:00 | TC-X | "Ten years" | `x/post-decade.png` |
| Sep 9 | Wed | 12:00 | TC-IG | "A decade" | `instagram/04-a-decade.png` |
| Sep 9 | Wed | 15:00 | A-LI | L4 — the dependency I never audited (non-TC) | none |
| Sep 10 | Thu | 09:00 | A-X | X6 — the bash trap (non-TC) | none |
| Sep 11 | Fri | 10:00 | TC-X | "The composer" | `x/post-composer.png` |
| Sep 11 | Fri | 15:00 | A-LI | L5 — building alone (non-TC) | none |
| Sep 11 | Fri | 16:00 | A-X | X1 — one-reading-only test suite (TC) | none |
| Sep 12 | Sat | 12:00 | TC-IG | "The composer" | `instagram/10-composer.png` |
| Sep 13 | Sun | 11:00 | A-X | X7 — the second untouchable file (non-TC) | none |

### Week 3 · Sep 14 – 20

| Date | Day | Time | Account | Post | Asset |
|---|---|---|---|---|---|
| Sep 14 | Mon | 10:00 | TC-LI | Post 3 · Nothing is happening | `instagram/12-waiting.png` |
| Sep 15 | Tue | 09:00 | TC-X | "Before it seals" | `x/post-sealing.png` |
| Sep 16 | Wed | 12:00 | TC-IG | "Before it seals" | `instagram/11-sealing.png` |
| Sep 16 | Wed | 15:00 | A-LI | L9 — the bug about a bug (TC) | none |
| Sep 17 | Thu | 09:00 | A-X | X8 — the Windows-95 site (non-TC) | none |
| Sep 18 | Fri | 10:00 | TC-X | "A Tuesday, mid-custody" | `x/post-waiting.png` |
| Sep 18 | Fri | 16:00 | A-X | X2 — read receipts (TC-adjacent) | none |
| Sep 19 | Sat | 12:00 | TC-IG | "A Tuesday, mid-custody" | `instagram/12-waiting.png` |
| Sep 20 | Sun | 11:00 | A-X | X9 — two kinds of bugs (non-TC) | none |

### Week 4 · Sep 21 – 27

| Date | Day | Time | Account | Post | Asset |
|---|---|---|---|---|---|
| Sep 21 | Mon | 10:00 | TC-LI | Post 4 · Refusing the growth-team playbook | `instagram/07-refusals.png` |
| Sep 22 | Tue | 09:00 | TC-X | "On the day" | `x/post-reveal.png` |
| Sep 23 | Wed | 12:00 | TC-IG | "On the day" | `instagram/13-reveal.png` |
| Sep 23 | Wed | 15:00 | A-LI | L7 — tests that lie (non-TC) | none |
| Sep 24 | Thu | 09:00 | A-X | X10 — naming things (non-TC) | none |
| Sep 25 | Fri | 10:00 | TC-X | "Not the last word" | `x/post-replies.png` |
| Sep 25 | Fri | 16:00 | A-X | X15 — replies shipped (TC) | none |
| Sep 26 | Sat | 12:00 | TC-IG | "Not the last word" | `instagram/14-replies.png` |
| Sep 26 | Sat | 14:00 | **A-IG** | The one Assad Instagram post — adapted "what I've been working on," image-led | `screenshots/03-composer.png` |
| Sep 27 | Sun | 11:00 | A-X | X12 — refactored because it annoyed me (non-TC) | none |

### Days 29–30 · Sep 28 – 29

| Date | Day | Time | Account | Post | Asset |
|---|---|---|---|---|---|
| Sep 28 | Mon | 10:00 | TC-LI | Post 5 · What belongs inside a letter | `instagram/11-sealing.png` |
| Sep 29 | Tue | 09:00 | TC-X | "One reading only" | `x/post-one-reading.png` |

**Beyond day 30 (not scheduled, in reserve):** TC-LI Posts 6–9, TC-IG/TC-X
"kept" and "refusals," A-LI L6/L8/L10, A-X X3/X11/X13/X14/X16/X17 — enough
material banked for another 3–4 weeks without writing anything new,
including L6/X3 (the decade-interface post) and X17 (the one mobile-client
mention), both deliberately not forced into the first 30 days.

**Totals:** TC-LI 5 · TC-X 9 · TC-IG 8 · A-LI 5 · A-X 11 · A-IG 1. No account
posts daily. No two TC accounts post the same content on the same day
(X→IG staggered by 1–3 days each time, LinkedIn on its own weekly beat).
Assad's post days never line up with TimelyCapsule's for the same subject —
the closest overlap is the reveal post itself (Week 1), which is the one
moment that's supposed to visibly connect the two.

---

## 7 · Profile setup (do this before Week 1's first post)

| Platform | Action | Copy source |
|---|---|---|
| LinkedIn (personal) | Update headline, add Experience entry, upload banner | `PERSONAL-PRESENCE.md` §2.1 |
| LinkedIn (company) | Create/update page: tagline, About, industry, specialties, banner, logo | `PERSONAL-PRESENCE.md` §3 |
| X (personal) | Update bio, link | `PERSONAL-PRESENCE.md` §2.2 |
| Instagram (personal) | Update bio, link | `PERSONAL-PRESENCE.md` §2.3 |
| GitHub | Update bio, add social account, replace profile README | `PERSONAL-PRESENCE.md` §2.4 (README opening line now reads "Currently building TimelyCapsule, among other things") |

---

## 8 · Cross-account mapping — how content actually moves

Not a diagram of reposting. Each numbered "moment" below is one underlying
idea; the table shows how it surfaces differently per account, on different
days, so nothing reads as synchronized.

| Moment | TC-X | TC-IG | TC-LI | A-LI | A-X |
|---|---|---|---|---|---|
| The reveal (this exists) | — | — | Post 1, Aug 31 | "What I've been working on," Sep 3 | Same, Sep 4 |
| Encryption / can't read it | — | — | Post 2, Sep 7 | — | X2, Sep 18 (different angle: read receipts, not architecture) |
| The wait / mid-custody | "A Tuesday," Sep 18 | Same, Sep 19 | Post 3, Sep 14 | — | — |
| Refusals / no engagement tricks | — | — | Post 4, Sep 21 | — | — |
| Enclosures / voice notes | — | — | Post 5, Sep 28 | — | — |
| Replies | "Not the last word," Sep 25 | Same, Sep 26 | — | — | X15, Sep 25 (same day as TC-X, different voice — first-person "shipped," not third-person "the letter doesn't have to be...") |
| One reading only | "One reading only," Sep 29 | *(beyond day 30)* | — | L3/L9 material feeds this, held in reserve | X1/X11, Sep 11 (weeks earlier — Assad's version runs *before* TC's own post, from the builder's side of it, not simultaneous) |
| The theme/hydration bug | — | — | — | L9, Sep 16 | — |

Deliberately staggered rather than synchronized: Assad's "one reading only"
angle (testing the delete button) runs in **Week 2**, TimelyCapsule's own
"one reading only" post runs at the **very end of the 30 days**. A reader
following both accounts sees the builder's side of a feature roughly two
weeks before the product account frames it as a feature — closer to how a
real engineer and a real company account would actually relate than a
same-day pairing would.

---

## 9 · Repurposing matrix

| Original content | TC-X | TC-IG | TC-LI | A-LI | A-X |
|---|---|---|---|---|---|
| "The mark" (identity) | Original | Adapted (longer caption) | — | No reuse | No reuse |
| "The Dual Clock" | Original | Adapted | — | No reuse | No reuse |
| "A decade" | Original | Adapted | — | Commentary angle (L6, held in reserve) | Commentary angle (X3) |
| "The composer" | Original | Adapted | — | No reuse | No reuse |
| "Before it seals" (enclosures) | Original | Adapted | Adapted (Post 5, different copy) | No reuse | No reuse |
| "A Tuesday, mid-custody" (waiting) | Original | Adapted | Adapted (Post 3) | No reuse | No reuse |
| "On the day" (reveal) | Original | Adapted | — | No reuse | No reuse |
| "Not the last word" (replies) | Original | Adapted | — | No reuse | Personal commentary (X15) |
| "One reading only" | Original | Adapted | — | Personal commentary (L3, held) | Personal commentary (X1/X11) |
| "What I actually care about" (encryption) | — | — | Original (Post 2) | No reuse | Personal commentary, different angle (X2) |

No identical copy is ever posted twice across accounts — every reuse is
either an **adaptation** (same underlying fact, rewritten for the
platform's length/register) or a **personal commentary** (Assad's own,
first-person angle on the same underlying feature, never the marketing copy
itself). Straight copy-paste reuse never happens anywhere in this plan.

---

## 10 · Asset map

Every asset used across the 30-day calendar. All pre-existing and already
approved except the two LinkedIn banners (built in the previous session).

| Filename | Existing? | Current? | Platform(s) | Dimensions | Communicates |
|---|---|---|---|---|---|
| `design/launch/final/x/post-mark.png` | Yes | Yes | TC-X, TC-LI | 1600×900 | The identity mark |
| `design/launch/final/instagram/01-the-mark.png` | Yes | Yes | TC-IG | 1080×1350 | Same, IG-native crop |
| `design/launch/final/x/post-dualclock.png` | Yes | Yes | TC-X | 1600×900 | The Dual Clock component |
| `design/launch/final/instagram/03-dual-clock.png` | Yes | Yes | TC-IG | 1080×1350 | Same |
| `design/launch/final/x/post-decade.png` | Yes | Yes | TC-X | 1600×900 | "3,653 days" |
| `design/launch/final/instagram/04-a-decade.png` | Yes | Yes | TC-IG | 1080×1350 | Same |
| `design/launch/final/x/post-composer.png` | Yes | Yes | TC-X | 1600×900 | Real composer UI |
| `design/launch/final/instagram/10-composer.png` | Yes | Yes | TC-IG | 1080×1350 | Same |
| `design/launch/final/x/post-sealing.png` | Yes | Yes | TC-X | 1600×900 | Real enclosures UI |
| `design/launch/final/instagram/11-sealing.png` | Yes | Yes | TC-IG, TC-LI | 1080×1350 | Same |
| `design/launch/final/x/post-waiting.png` | Yes | Yes | TC-X | 1600×900 | Real dashboard UI |
| `design/launch/final/instagram/12-waiting.png` | Yes | Yes | TC-IG, TC-LI | 1080×1350 | Same |
| `design/launch/final/x/post-reveal.png` | Yes | Yes | TC-X | 1600×900 | Real reveal UI |
| `design/launch/final/instagram/13-reveal.png` | Yes | Yes | TC-IG | 1080×1350 | Same |
| `design/launch/final/x/post-replies.png` | Yes | Yes | TC-X | 1600×900 | Real reply UI |
| `design/launch/final/instagram/14-replies.png` | Yes | Yes | TC-IG | 1080×1350 | Same |
| `design/launch/final/x/post-one-reading.png` | Yes | Yes | TC-X | 1600×900 | Typographic — real product copy |
| `design/launch/final/instagram/15-one-reading-only.png` | Yes | Yes | TC-IG | 1080×1350 | Same |
| `design/launch/final/instagram/07-refusals.png` | Yes | Yes | TC-LI | 1080×1350 | The refusals list |
| `design/launch/final/screenshots/06-survival.png` | Yes | Yes | TC-LI | 1600×900 | The trust/FAQ screenshot |
| `design/launch/final/screenshots/05-hero.png` | Yes | Yes | (reserve) | 1600×900 | The live landing page |
| `design/launch/final/screenshots/03-composer.png` | Yes | Yes | A-IG (adapted) | 1600×900 | Real composer, reused for Assad's one IG post |
| `design/launch/linkedin/personal-banner.png` | Yes (new, prior session) | Yes | LinkedIn personal | 1584×396 | Meridian, stretched |
| `design/launch/linkedin/company-banner.png` | Yes (new, prior session) | Yes | LinkedIn company | 1128×191 | The real lockup |
| `design/brand/social/avatar-paper-1024.png` | Yes | Yes | LinkedIn company logo | 1024×1024 | The mark, paper register |
| `design/brand/social/avatar-paper-400.png` | Yes | Yes | X profile (unchanged) | 400×400 | Same |

**No new graphics were created this session.** Every product-moment image
the calendar needs already existed and is still current — confirmed against
`git status` (no `design/launch/` changes since 2026-08-25) rather than
assumed. The two banners are the only genuinely new assets in the whole
personal-presence project, and they were built the session before this one.

---

## 11 · Quality control — checked before calling this finished

- Every caption checked against the verified capability table
  (`REFRESH-2026-08-25-NOTES.md` §4) — no post claims voice notes as a
  captured/shown feature (still flagged as real-but-uncaptured), no post
  implies Premium is purchasable, no post names a launch date.
- Every screenshot referenced is the current, approved set in
  `design/launch/final/` — none of the retired assets (`09-the-date.png`,
  `coming-soon.png`, `og-capsule-shared.png`) are used anywhere here.
- Character counts verified for every short-form post (§3.2, all ≤200/280;
  bios re-verified unchanged from the prior session's counts).
- No exclamation marks, no emoji, anywhere in this document.
- TimelyCapsule's own posts stay third person throughout (never "we");
  Assad's posts stay first person throughout (correctly "I" — not a
  violation of the institutional rule, which doesn't apply to him).
- No fake traction, funding, testimonials, launch date, or urgency anywhere.
- Personal/company voice distinction verified: no personal post uses
  TimelyCapsule's institutional third-person register, and no company post
  uses "I."
- Ratio check: of Assad's 16 scheduled personal posts (5 LinkedIn + 11 X),
  6 are TC-explicit or TC-adjacent and 10 are genuinely unrelated — under
  40% TC, matching "should not dominate."
- No duplicate or conflicting bios across platforms — each is related, none
  is copy-pasted (re-verified against `PERSONAL-PRESENCE.md` §2, unchanged
  except the one GitHub README line in §0).
- No asset referenced in this calendar is missing from disk — spot-checked
  against the `design/launch/final/` listing pulled this session (all 26
  files confirmed present).

---

## 12 · Final publishing dashboard

Everything above collapsed into the four views the request asked for by
name. Where a view would just be a re-sort of a table already built above,
it points there instead of repeating 40+ rows a third time.

### Profile setup
→ §7, verbatim. Five actions, one per platform, each with its copy source.

### First 7 days
→ §6, "Week 1 · Aug 31 – Sep 6" table, verbatim — 9 scheduled items (1 of
them the no-post setup day) across 4 accounts.

### Days 8–30
→ §6, "Week 2" through "Days 29–30" tables, verbatim — 27 scheduled items
across 5 accounts (Assad Instagram's single post included).

### Content inventory
→ §6 in full is the content inventory: every post, its date, account,
platform, and asset in one place. §3 holds the exact copy each row points
to. Nothing scheduled here lacks written copy — there are no "TBD" rows
anywhere in this plan.

### Asset inventory
→ §10, verbatim.

### What to upload — the short version

```
LinkedIn personal banner   → design/launch/linkedin/personal-banner.png
LinkedIn company banner    → design/launch/linkedin/company-banner.png
LinkedIn company logo      → design/brand/social/avatar-paper-1024.png
GitHub README replacement  → PERSONAL-PRESENCE.md §2.4 (paste into
                              nottherealalanturing/nottherealalanturing)
All 26 post images         → §10 table — already sit in design/launch/final/
                              and design/launch/linkedin/, nothing to build
```

### Still needs a human decision (unchanged from the prior session, not
resolved by this pass either — none of these are this pass's call to make)

1. LinkedIn Experience entry's real start date.
2. Whether `@assadisah` (or an alternative) is actually available on X.
3. Whether the `timelycapsule` GitHub repo stays private, goes public, or a
   subset gets extracted.
4. The exact posting times in §6 are reasonable defaults (mid-morning for
   LinkedIn, staggered for X/IG) — adjust to whatever Assad's actual
   audience's active hours are, which this repo has no way to know.

### Cannot be verified from the repository or the current product

- Real engagement/audience data for any platform (no accounts are
  instrumented from here).
- X handle availability (requires checking X directly).
- Whether LinkedIn's company-page creation flow requires anything beyond
  what's listed in `PERSONAL-PRESENCE.md` §3 (LinkedIn's own onboarding
  UI isn't something this repo has visibility into).
