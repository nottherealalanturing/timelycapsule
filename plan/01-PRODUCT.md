# TimelyCapsule — Product Specification (PRD)

> Part 1 of 4. See `00-INDEX.md` for how these documents fit together.

---

## 1. Product Vision

### Why this product exists
Communication today is instant and disposable. But the most meaningful messages in life are not instant — they are *timed*. A letter to your daughter on her 18th birthday. A video from a grandparent who may not be there to press play. A note from your past self on the morning of your wedding. A team's promise to itself, sealed at kickoff and opened at launch.

TimelyCapsule exists to give time back its role in communication: **the right message, at exactly the right moment, guaranteed.**

### The problem it solves
- There is no trusted, durable, cross-platform way to send content into the future.
- Existing tools are fragile (FutureMe = email-only text, no media, no trust guarantees), generic (Google Drive folders labeled "open in 2030" have no lock, no ceremony, no delivery), or ephemeral (social platforms optimize for *now*).
- People who want to leave legacy messages (illness, aging, deployment) have no dignified product for it.
- Businesses have no tool for time-released engagement (anniversary messages to customers, "one year at the company" capsules for employees).

### Core philosophy
1. **Time is the feature.** The lock is not an inconvenience; it is the product. The wait creates meaning.
2. **Trust above all.** Users hand us their most emotionally valuable content. We must never lose it, leak it, or open it early. Every technical decision defers to this.
3. **Ceremony over feed.** Opening a capsule is an event, not a scroll. The UX treats unlock moments with theatrical care (countdowns, reveal animations, keepsake artifacts).
4. **Longevity by design.** A capsule scheduled for 2050 must survive company pivots, format changes, and device churn. Export guarantees, open formats, and a dead-simple data model.

### Emotional value
- **Anticipation** — countdowns, sealed capsules on a timeline, "something is waiting for you."
- **Connection across time** — past self ↔ future self; the living ↔ those who come after.
- **Permanence** — a vault feeling, not a feed feeling.
- **Ceremony** — sealing and unsealing are ritualized moments with sound, motion, and artifact.

### Competitive advantage
| Competitor | Gap we exploit |
|---|---|
| FutureMe | Text/email only, no media, no recipients-other-than-self, dated UX |
| Google Photos "Memories" | Passive resurfacing, no intentional authorship, no lock |
| Day One | Journaling for now, not delivery to the future or to others |
| Dropbox/Drive | Storage, zero ceremony, zero delivery semantics |
| Legacy services (SafeBeyond etc.) | Death-focused, morbid branding, no everyday use case |

Our wedge: **the only product where everyday moments (birthday in 3 weeks) and life-defining moments (legacy message) live in one trusted, beautiful system.** Everyday use funds and normalizes legacy use; legacy use creates unbreakable retention.

### North Star metric
**Capsules successfully delivered per month** (a delivery = capsule unlocked AND opened by at least one recipient within 30 days of unlock). This captures creation, scheduling integrity, notification quality, and recipient experience in one number. Supporting inputs: capsules sealed/week, recipient open rate, creator D30 retention.

### Product principles
1. Never open early, never lose content, never surprise on privacy.
2. Sealing must take < 90 seconds for a simple capsule.
3. Recipients need zero friction — a capsule must be openable without installing an app or creating an account (account optional, encouraged post-open).
4. Every state (sealed, counting down, unlocked, opened) is visually distinct and emotionally tuned.
5. Free tier must be genuinely useful forever; premium sells capacity, media richness, and legacy features — never basic trust or delivery reliability.
6. Ship boring infrastructure, delightful surfaces.

---

## 2. User Personas

### P1 — Maya, 24, Graduate Student ("Future Self")
- **Goals:** Write letters to herself at milestones (graduation, 30th birthday); capture who she is now.
- **Behaviors:** Mobile-first, journals sporadically, screenshot-hoarder, night-time writer.
- **Pain points:** Journals get abandoned; notes apps feel disposable; wants accountability with her goals.
- **Primary use cases:** Self capsules 1–5 years out; New Year capsules; "open when you're sad" capsules to herself.
- **Plan:** Free → Premium when she hits media limits.

### P2 — David & Priya, 34/32, New Parents ("The Archivists")
- **Goals:** Build a capsule series for their newborn: first birthday video each year, opened at 18.
- **Behaviors:** Heavy photo/video capture, shared iCloud album users, weekend organizers.
- **Pain points:** 40k photos and no narrative; fear of losing digital memories; want the child to *receive*, not just inherit a folder.
- **Primary use cases:** Long-horizon (10–18 yr) media capsules; recurring birthday capsules; shared authorship between both parents.
- **Plan:** Family plan anchor persona.

### P3 — Elena, 67, Grandmother ("Legacy")
- **Goals:** Leave video messages for grandchildren's weddings, graduations; ethical will.
- **Behaviors:** Uses iPad, needs large type and simple flows, records rather than types.
- **Pain points:** Death-planning products feel morbid; worried tech will "eat" her videos; wants a trusted executor mechanism.
- **Primary use cases:** Legacy capsules with trustee-verified release; voice/video content; printed keepsake QR cards.
- **Plan:** Premium, often gifted by adult children.

### P4 — Marcus, 29, Deployed / Long-distance Partner ("The Couple")
- **Goals:** Pre-schedule messages for his partner while unreachable (deployment, travel); anniversary chains.
- **Behaviors:** Batch-creates content before leaving; unreliable connectivity; heavy voice notes.
- **Pain points:** Timezone confusion; needs offline drafting and background upload.
- **Primary use cases:** Scheduled daily/weekly capsules to one recipient; anniversary capsules; countdown shared with partner.
- **Plan:** Premium.

### P5 — Sofia, 41, HR Director ("Business")
- **Goals:** "Letter to your future self" onboarding exercise for new hires, opened at 1-year anniversary; customer anniversary campaigns.
- **Behaviors:** Buys tools, needs admin controls, SSO, CSV import, reporting.
- **Pain points:** No tooling for time-released internal comms; engagement programs are manual.
- **Primary use cases:** Org workspace, bulk capsule campaigns, branded capsule pages, analytics on open rates.
- **Plan:** Business/Enterprise.

### P6 — Ken, 35, Creator/Coach ("The Broadcaster")
- **Goals:** Sell/send time-locked content to an audience: "open this on day 30 of the program"; public capsules for hype ("our announcement unlocks Friday 9am").
- **Behaviors:** Cross-posts everywhere, cares about links, embeds, and analytics.
- **Pain points:** Drip tools are email-only and ugly; wants ceremony for reveals.
- **Primary use cases:** Public countdown capsules; capsule links in bio; cohort-based scheduled releases.
- **Plan:** Premium/Business; drives viral top-of-funnel.

### P7 — Aisha, 52, Family Historian ("The Keeper")
- **Goals:** Digitize and time-release family history; interviews with elders released on reunion dates.
- **Behaviors:** Desktop power user, bulk uploads, organizes with tags/collections.
- **Pain points:** Scattered archives; wants collaborative family vault with roles.
- **Primary use cases:** Family vault, collaborative capsules, collections, large file support.
- **Plan:** Family plan admin.

### P8 — Recipient Rex (any age) — **the non-user persona**
- Receives a capsule link/notification without having the app.
- **Needs:** Open in browser with zero signup, understand what this is in 3 seconds, feel the ceremony, easily save/download, low-pressure conversion to creating their own capsule.
- Every recipient flow must be designed for Rex first.

---

## 3. User Stories

Organized by actor. (IDs are stable; reference them in tickets as `US-xxx`.)

### Future Self (US-001 – US-020)
- US-001: As a user, I can write a letter to myself and schedule it for any future date so my future self receives it.
- US-002: As a user, I can attach photos/video/voice to a self-capsule so the memory is richer than text.
- US-003: As a user, I get guided prompts ("What are you worried about right now?") so I don't face a blank page.
- US-004: As a user, I can see a timeline of my sealed capsules with countdowns so I feel anticipation.
- US-005: As a user, I cannot open my own sealed capsule early (by default), so the commitment is real.
- US-006: As a user, I can enable "break glass" early-open on a self-capsule (with a 48-hour cooling-off delay and a guilt-trip confirmation), because life happens.
- US-007: As a user, I can create recurring self-capsules (every New Year's Day) in one flow.
- US-008: As a user, I receive a "seal anniversary" memory ("1 year ago you sealed this — 2 years to go").
- US-009: As a user, I can add to an unsealed draft over multiple sessions before sealing.
- US-010: As a user, when my capsule unlocks I get a ceremonial reveal experience, not a plain file list.
- US-011: As a user, I can reply to my past self after opening, and thread that into a new future capsule ("time-travel chat").
- US-012: As a user, I can export any opened capsule as a PDF/ZIP keepsake.
- US-013: As a user, I can set my capsule to unlock at a *time* meaningful to me (e.g., 07:00 my local time on my birthday).
- US-014: As a user, I can attach my current location and see it on a map when it opens.
- US-015: As a user, I can record a voice note directly in the composer.
- US-016: As a user, I can see "on this day" resurfacing of previously opened capsules.
- US-017: As a user, I can favorite opened capsules to find them quickly.
- US-018: As a user, I can archive opened capsules to declutter my timeline without deleting.
- US-019: As a user, I can duplicate a capsule as a template for the next year's letter.
- US-020: As a user, I can write a capsule offline on mobile and it syncs/seals when I reconnect.

### Sender to Others (US-021 – US-050)
- US-021: As a sender, I can address a capsule to one or more recipients by email or phone number.
- US-022: As a sender, I can send to a recipient who has no account, and they can open it in a browser.
- US-023: As a sender, I can see delivery status per recipient (invited → notified → opened).
- US-024: As a sender, I can choose whether recipients see each other (BCC-style vs shared).
- US-025: As a sender, I can allow or forbid recipients to download original files.
- US-026: As a sender, I can add a cover (title, cover image/color, sealed-note teaser) shown before unlock.
- US-027: As a sender, I can let the recipient know a capsule exists now ("something is waiting for you, opens June 1") or keep it a total surprise until unlock.
- US-028: As a sender, I can edit a capsule any time before its seal deadline; after sealing, content is immutable (I may still cancel or extend recipients).
- US-029: As a sender, I can cancel an unsealed or sealed-but-not-unlocked capsule; recipients who knew of it are notified it was withdrawn (content never shown).
- US-030: As a sender, I can set a seal deadline separate from unlock ("I'll keep adding until Dec 24, unlocks Dec 25").
- US-031: As a sender, I can invite a co-author to contribute to a capsule before sealing (group birthday capsule).
- US-032: As a sender, I get notified the moment a recipient opens my capsule.
- US-033: As a sender, I can attach a "reply requested" prompt so the recipient is invited to respond with their own capsule.
- US-034: As a sender, I can preview exactly what the recipient will see at every stage.
- US-035: As a sender, I can correct a recipient's mistyped email before unlock.
- US-036: As a sender, I can transfer a recipient to a different email if they lost access to the old one.
- US-037: As a sender, I can send a "gift" premium capsule (extra storage/video length) as a one-time purchase without a subscription.
- US-038: As a sender, I can schedule delivery in the *recipient's* timezone ("9am wherever they are").
- US-039: As a sender, I can require the recipient to verify identity (email OTP) before opening a sensitive capsule.
- US-040: As a sender, I can add a passphrase hint known only to the recipient for extra-sensitive capsules.
- US-041: As a sender, I can see if my capsule bounced (bad email) well before unlock so I can fix it.
- US-042: As a sender, I can create up to N capsules in a batch from a CSV (business tier).
- US-043: As a sender, I can send a physical-world artifact: a printable sealed card with QR that opens the capsule (premium).
- US-044: As a sender, I can chain capsules ("after she opens #1, unlock #2 seven days later").
- US-045: As a sender, I can set a fallback recipient if the primary never opens within X days.
- US-046: As a sender, I can record video up to my plan's limit directly in the app.
- US-047: As a sender, I can @mention capsule content with captions per media item.
- US-048: As a sender, I can reorder media in the capsule like arranging a scrapbook.
- US-049: As a sender, I can see storage used per capsule and overall.
- US-050: As a sender, I can report/receive confirmation that delivery notifications went out (audit trail).

### Recipient (US-051 – US-070)
- US-051: As a recipient, I can open a capsule from a link with no account, on any device.
- US-052: As a recipient, I see a beautiful locked page with countdown if I arrive before unlock.
- US-053: As a recipient, I can opt into a reminder ("notify me when it opens") with just my email/push.
- US-054: As a recipient, the open experience is a guided reveal (cover → note → media, paced), not a file dump.
- US-055: As a recipient, I can react (❤️ 😭 🎉 etc.) and write a thank-you note back to the sender.
- US-056: As a recipient, I can download everything as a ZIP if the sender allowed it.
- US-057: As a recipient, I can save the capsule into my own account ("keep this forever") — the conversion moment.
- US-058: As a recipient, I can report an abusive capsule pre- or post-open.
- US-059: As a recipient, I can decline/block a sender so their future capsules to me are suppressed.
- US-060: As a recipient, I can view the capsule again anytime after opening (link stays valid; account save recommended).
- US-061: As a recipient, my access link is unguessable and I can request a fresh one if leaked.
- US-062: As a recipient with an account, capsules addressed to my verified email automatically appear in my Inbox.
- US-063: As a recipient, I can add the unlock date to my calendar (ICS).
- US-064: As a recipient, if identity verification is required, I verify via OTP to my address.
- US-065: As a recipient, I can view media in a full-screen gallery with swipe.
- US-066: As a recipient, I can start my own reply capsule pre-addressed to the sender in one tap.
- US-067: As a recipient of a legacy capsule, I experience a respectful, quiet variant of the reveal (no confetti).
- US-068: As a recipient, I can see who else received the capsule if the sender made it shared.
- US-069: As a recipient, I can comment in a shared capsule's discussion thread post-unlock.
- US-070: As a recipient, if my email changed, I can prove control of the old address OR the sender can re-address me.

### Legacy & Emergency (US-071 – US-085)
- US-071: As a user, I can designate 1–3 trustees who can trigger release of my legacy capsules after my death.
- US-072: As a user, I can require multiple trustees to confirm (2-of-3) before legacy release.
- US-073: As a user, I set an inactivity check ("if I don't respond to check-ins for 90 days, begin trustee flow").
- US-074: As a trustee, I receive a solemn, clear flow to attest a death, upload optional documentation, and trigger the waiting period.
- US-075: As a user, I am aggressively notified during the trustee-triggered waiting period (14 days, all channels) so a false/malicious trigger is always catchable; any login cancels it.
- US-076: As a user, I can maintain an "emergency capsule" (passwords locations, documents, instructions) released to a specific person under trustee flow.
- US-077: As a user, I can preview exactly what each trustee/recipient would receive.
- US-078: As a user, I can revoke or replace trustees anytime.
- US-079: As a recipient of an emergency capsule, I must verify identity with OTP before access.
- US-080: As a user, legacy capsules never auto-delete and are excluded from storage cleanup prompts.
- US-081: As a user, I can write an "ethical will" from a guided legacy template.
- US-082: As an admin (support), I can process a death certificate escalation when trustees are unavailable, under a strict internal protocol with dual review.
- US-083: As a user, I can schedule a legacy capsule for a date OR trustee-trigger, whichever comes first/last (configurable).
- US-084: As a family plan owner, I can see (existence only, never content) that family members have legacy capsules configured.
- US-085: As a user, my legacy capsules survive subscription lapse (they enter preserved read-only state; delivery is guaranteed).

### Teams & Business (US-086 – US-100)
- US-086: As an org admin, I can create a workspace, invite members by email/domain, and assign roles (admin, manager, member).
- US-087: As an org admin, I can run a campaign: template capsule + CSV of recipients + scheduled unlock (e.g., all 1-year work anniversaries).
- US-088: As an org member, I can create a self-capsule during onboarding that HR cannot read (content-private, existence-visible).
- US-089: As an org admin, I can brand capsule pages (logo, colors) on Business tier.
- US-090: As an org admin, I can view aggregate analytics (sent, delivered, opened, reactions) but never private content.
- US-091: As an org admin, I can enforce SSO (Google Workspace / Microsoft) on Enterprise.
- US-092: As an org admin, I can export campaign reports as CSV.
- US-093: As an org owner, I can manage seats and billing, with proration.
- US-094: As an org admin, I can set retention policy for org-owned capsules.
- US-095: As a member leaving an org, my personal capsules leave with me; org-campaign capsules stay with the org.
- US-096: As an org admin, I can schedule a "team time capsule" that any member contributes to before a seal date.
- US-097: As a business, I can use the API (Enterprise) to create capsules programmatically.
- US-098: As an org admin, I can restrict recipient domains for compliance.
- US-099: As an org admin, I get delivery-failure reports before unlock dates so campaigns don't silently fail.
- US-100: As an org billing contact, I receive invoices and can pay by card or invoice (Enterprise).

### Premium & Billing (US-101 – US-112)
- US-101: As a free user, I can create up to 5 active sealed capsules with 100 MB total storage and 1-minute video, forever free.
- US-102: As a premium user, I get 100 GB, unlimited capsules, 4K video up to 30 min, and legacy features.
- US-103: As a user, I can upgrade mid-flow when I hit a limit, without losing composer state.
- US-104: As a premium user who cancels, my existing sealed capsules are always delivered as scheduled (delivery is sacred); I just can't create beyond free limits.
- US-105: As a user, I can buy a one-time "Gift Capsule Pass" for a single premium-sized capsule without subscribing.
- US-106: As a family owner, I can share premium with up to 6 members with individual private spaces and a shared Family Vault.
- US-107: As a user, I see clear storage meters and what happens at each limit.
- US-108: As a user, I can pay via Stripe (web) and IAP (mobile), and my entitlement syncs across platforms.
- US-109: As a user, I get a 7-day grace period on failed payment with email + in-app warnings before downgrade.
- US-110: As a user, I can request a refund within 14 days via self-serve (region-dependent).
- US-111: As a user, I can view invoices and change payment method in Settings → Billing.
- US-112: As a student, I can get 50% off with verified .edu (Phase 3).

### Cross-cutting (US-113 – US-130)
- US-113: As any user, I can search my capsules by title, recipient, tag, date, and content of *opened* capsules (sealed content is never indexed).
- US-114: As any user, I can tag capsules and filter by tag.
- US-115: As any user, I can organize capsules into collections ("Letters to Mom", "New Year series").
- US-116: As any user, I can trash a draft/opened capsule and restore within 30 days.
- US-117: As any user, I receive a monthly digest ("2 capsules unlock next month").
- US-118: As any user, I can enable 2FA (TOTP + recovery codes).
- US-119: As any user, I can export ALL my data (capsules, media, metadata) as a ZIP (GDPR).
- US-120: As any user, I can delete my account with clear consequences shown (undelivered capsules to others: choose deliver-anyway or withdraw, per capsule).
- US-121: As any user, I can use the product in my language (i18n from day 1: en, es, fr, de, pt, ja; RTL-ready).
- US-122: As any user, I can set quiet hours for notifications.
- US-123: As a user, I earn achievements (First Seal, Year-Long Wait, Decade Club) that make waiting fun.
- US-124: As a user, I can refer friends; we both earn +1 GB permanent storage per successful referral (cap 10).
- US-125: As a user, I get an annual "Year in Capsules" recap (sealed count, longest wait ongoing, opens received).
- US-126: As a user, I can view an activity log of everything that happened to my capsules.
- US-127: As a user, I can access help center + contact support in-app.
- US-128: As a user, I can submit feedback / feature requests from Settings.
- US-129: As a public visitor, I can view a public capsule countdown page and subscribe to its unlock.
- US-130: As a user, I can use widgets (iOS/Android) showing my next unlock countdown.

---

## 4. Complete Feature Breakdown (Modules)

Each module: **Purpose · Features · States · Validation/Business rules · Permissions · Dependencies · Roadmap notes**

### 4.1 Authentication & Identity
- **Purpose:** Own the identity layer for creators and (lightweight) recipients.
- **Features:** Email+password signup, Sign in with Apple (required for iOS), Google OAuth, email verification, password reset, 2FA (TOTP + 10 recovery codes), session management (list/revoke devices), magic-link login for recipients, phone verification (Phase 2, for SMS delivery), account deletion.
- **States (account):** `unverified → active → suspended → pending_deletion(30d) → deleted`. Recipient-only "ghost" identities: `ghost → claimed` (when they sign up with the same verified email, their received capsules attach automatically). Anonymous **guest sessions** (no account, see §4.1b): `guest → claimed` on signup with the guest token present.
- **Validation:** Email RFC + MX check; password ≥ 10 chars, zxcvbn score ≥ 3; verification required before sealing any capsule to others (self-capsules allowed pre-verification to reduce activation friction, but delivery holds until verified).
- **Permissions:** n/a (this module gates everything else).
- **Dependencies:** Notification module (verification emails), Redis (rate limits, token store).
- **Business rules:** OAuth accounts can add a password later; account merge flow when OAuth email == existing email (verified-email match auto-links). Sessions: JWT access (15 min) + rotating refresh (30 d, revocable, stored hashed).

### 4.1b Guest Mode (web + mobile — "try before you sign up")
- **Purpose:** let a visitor experience the core loop (write → seal → deliver) with zero signup friction, then convert. Guests are the bottom rung of the ability ladder: **Guest → Free (signup) → Premium/Family/Business (subscription)** — every step up unlocks more, nothing sealed is ever lost on the way up.
- **What a guest CAN do:** open/receive capsules via link (unchanged — recipients never needed accounts); create **one** guest capsule: a Time-locked note (≤ 5,000 chars) with **basic media (M5): a photograph, video, file or voice recording, up to a 5 MB total storage allowance**, unlock between +5 min and **+1 year**, delivered **by shareable link only** (guest copies the `/c/:token#k=…` link and sends it themselves — could be to their own future self); see a minimal status page for that one capsule (countdown, its enclosures, and link recovery from the same device).
- **What requires signup (Free):** email/SMS delivery + announce/reminder notifications (we have no verified sender identity for a guest), more than 1 capsule and 100 MB of storage, **Place Memory entirely** (M5 — not partially: no *where this was written* control at all for Guest, not even a coordinates-only version, since the reverse-geocoding lookup that makes the feature legible has no anonymous equivalent and none is planned), dashboard/timeline, recipients management, withdraw/extend, recovery kit, everything else.
- **Identity:** server issues an anonymous **guest session** (opaque token, stored hashed; persisted device-locally). Zero-access E2E applies identically — capsule key is generated client-side and travels only in the link fragment; the server holds ciphertext + envelope. No password → no recovery: lose the link, lose the capsule (stated plainly at seal time).
- **Conversion & claim:** signup (any method) with the guest token present **claims** the guest capsule into the new account (same spirit as recipient ghost-claim). Conversion prompts are contextual, never blocking: after the seal ceremony ("Create a free account to keep track of this capsule + get email delivery"), on the status page, and on any limit hit — **including the 5 MB guest storage limit** — where the message is always framed as capability gained ("Create a free account to increase storage to 100 MB"), never as a wall (guest paywall = signup sheet, not payment sheet). **Claim transfers ownership only** (M5): a capsule already sealed under the 5 MB guest allowance keeps exactly that entitlement afterward — it is never upgraded to the claiming account's Free terms just because an account now exists behind it. The account's own Free entitlement governs its own future capsules, never one already sealed. Matches the same rule M4 already enforces for a plan downgrade after sealing.
- **Abuse guardrails:** 1 active sealed + 1 draft per guest session; **5 MB storage allowance per guest session (M5)**; per-IP velocity limits on guest session + seal creation; guest capsules excluded from any public surface; standard report/withdraw handling applies.
- **Delivery promise unchanged:** once sealed, a guest capsule delivers on schedule regardless of whether the guest ever signs up (hard rule 5 applies to guests too).

**Capability matrix (M5), stated explicitly rather than left to infer from prose:**

| Capability | Guest | Free | Premium+ |
|---|---|---|---|
| Capsules | 1 | 5 active sealed | Unlimited |
| Storage | 5 MB | 100 MB | Storage packs (sizes TBD) |
| Basic media (photo/video/file/voice) | ✓ | ✓ | ✓ |
| Media retention after unlock | 1 yr | 1 yr | Forever |
| Place Memory (attach where written) | — | ✓ | ✓ |
| Reverse-geocoding / place-name lookup | — | ✓ | ✓ |
| Named recipients / email delivery | — | ✓ | ✓ |
| Conditions (Place/Passphrase/Identity seals, expiry) | — | ✓ | ✓ |
| Dashboard / history / collections | — | ✓ | ✓ |
| Export | — | ✓ | ✓ |
| Recovery kit | — | ✓ | ✓ |
| Max horizon | 1 yr | 50 yr | 50 yr |

Every "—" is a capability gained by signing up, never a control shown disabled in the guest composer — `02 §16`/`07`'s standing rule that an unavailable capability is *omitted*, not advertised as locked.

### 4.2 Profiles
- **Purpose:** Light identity presentation (this is not a social network).
- **Features:** Display name, avatar, birthday (powers birthday capsule suggestions), timezone (auto-detected, editable), locale, pronouns (optional), public handle only for creators who enable public capsules.
- **Validation:** Handle 3–24 chars `[a-z0-9_]`, uniqueness, reserved-word blocklist. Avatar ≤ 5 MB, cropped to square, resized server-side.
- **States:** default private; `public_profile` flag opt-in.
- **Roadmap:** Verified badges for creators (Phase 3).

### 4.3 Capsules (core)
Fully specified in `03-ARCHITECTURE.md §Capsule System`. Summary of features: create, draft autosave, co-authoring, seal, cover customization, scheduling, recipient management, cancel/withdraw, early-open (self only, opt-in, cooled), duplicate, archive, trash/restore, transfer ownership, export, version history (drafts only), audit log, chained capsules (Phase 2), conditional/legacy release.
- **Capsule lifecycle states:** `draft → sealed → unlocked → opened` (+ `withdrawn`, `trashed`, `archived` side-states). Sealed content is immutable — this is the trust cornerstone.
- **Key rule (per 06 §A):** *Sealed means sealed — not even we can open it.* ALL capsule contents are zero-access E2E encrypted client-side by default; servers hold ciphertext plus the plaintext "envelope" (title, cover, dates). Tradeoffs owned openly: recovery kit is mandatory-nagged (lose password + kit = unrecoverable by anyone), previews/search/exports are client-side. One uncompromising promise beats two tiers.

### 4.4 Capsule Types (product-level presets, one engine underneath)
All types are the same entity with a `type` preset that pre-configures scheduling, visuals, and rules:
- **Self** — default recipient = self; break-glass optional.
- **Personal (to others)** — 1+ recipients.
- **Shared/Group** — co-authors contribute before seal deadline; all become recipients or a defined recipient list.
- **Birthday / Anniversary** — recurrence-aware; date helper pulls from recipient birthday if known; themed covers.
- **Public** — has a public countdown page, open-to-all at unlock; creator handle shown; discoverable only via link (no feed in Phase 1 — discovery is a Phase 3 decision, deliberately deferred to keep trust positioning).
- **Legacy** — trustee-triggered or date-triggered; quiet reveal theme; survives subscription lapse; excluded from trash sweeps.
- **Emergency** — trustee-triggered, identity-verified recipient, downloadable documents emphasized; no celebration UI.
- **Business/Campaign** — org-owned, template + audience, branded page, aggregate analytics.
- **Time-locked note (micro)** — text-only quick capsule, < 30 s creation, the "gateway drug" (great for activation + widgets).

### 4.5 Recipients
- **Purpose:** Model people who receive capsules, including non-users.
- **Features:** Add by email/phone/existing contact; per-recipient status tracking (`added → invited → notified → viewed_locked → opened → reacted`); saved contacts book with birthdays; recipient groups ("The Kids"); re-address before unlock; identity-verification requirement flag; visibility mode (private vs shared list); download permission; fallback recipient.
- **Validation:** Dedup within capsule by normalized email/phone; max recipients: Free 3, Premium 20, Business 1000/campaign; blocklist check (a recipient who blocked this sender silently suppresses delivery — sender sees generic "delivered" to avoid harassment-probing; abuse team can see truth).
- **Dependencies:** Notifications, Auth (ghost identities), Moderation.

### 4.6 Media & Files
- **Purpose:** Ingest, store, process, and serve rich content durably for decades.
- **Features:** Images (JPEG/PNG/HEIC/WebP), video (MP4/MOV → H.264/HEVC ladder), audio/voice (AAC/M4A/MP3, in-app recorder with waveform), documents (PDF, docx/xlsx/pptx with preview render, ZIP as opaque attachment), links (unfurled preview card), location pin (lat/lng + name, rendered map snapshot), text/markdown blocks. Per-item captions. Ordering. Client-side compression choices, background/resumable uploads (tus-style via S3 multipart), thumbnail + preview generation, EXIF stripping (privacy default; capture-date preserved into metadata field).
- **Limits:** Guest: 5 MB/session (M5). Free: 100 MB/account, 25 MB/file, 1 min video. Premium: 100 GB/account, 5 GB/file, 30 min 4K video. Business: 1 TB pooled.
- **Media retention (M4):** enclosed files are kept for **1 year after the capsule opens** on Free, and **forever** on paid tiers. When the term ends the encrypted media is *released* — the bytes are reclaimed from storage while the capsule, letter, metadata, history, replies and the enclosure record (name, size, caption) are kept permanently. Releasing is never silent: the record says what was enclosed and when it went. The term is captured in the capsule's **sealed entitlement snapshot** at seal time and is a property of that capsule thereafter — changing, downgrading or cancelling a plan later cannot shorten it, and a capsule sealed before this system existed is kept forever. Distinct from **Archive**, which is the owner's reversible shelf and touches no storage. **Guest media retention is 1 year after the capsule opens (M5)** — the same term as Free, and an explicit `sealedEntitlementSnapshot` written at guest-seal time specifically so a guest capsule is never accidentally treated as *forever* (M4's rule for a genuinely absent snapshot), which would have made Guest the most generous tier rather than the most constrained.
- **Validation (E2E-adjusted, 06 §A):** size/duration caps enforced at presign by plan; content-level checks (type validation, decompression-bomb guard, EXIF strip) run client-side pre-encryption; server serves user files attachment-only from an isolated origin in lieu of server-side AV.
- **States (media item):** `uploading → processing → ready | failed`, and `ready → released` once the retention term ends (M4). A capsule cannot seal until all media `ready`. A released item keeps its row and its metadata; only the stored bytes are gone.

### 4.7 Scheduling
Full engine design in `03-ARCHITECTURE.md §Scheduling Engine`. Product surface: date+time picker with timezone selector (creator's tz, recipient's tz, or fixed UTC), natural-language shortcuts ("in 1 year", "on her 18th birthday"), min 5 minutes ahead, max 50 years, DST-safe wall-clock semantics, recurrence for series (yearly), seal deadline separate from unlock, edit schedule allowed until seal (after seal: unlock date is immutable except *extending* is allowed once by ≤ 30 days — prevents "surprise ruined" but allows life adjustments; shortening is never allowed).

### 4.8 Notifications
Full design in `03-ARCHITECTURE.md §Notification System`. Product surface: per-category toggles (unlocks, reminders, social, product, digest), quiet hours, channel preferences (push/email/SMS), recipient-facing notifications that work without accounts (email/SMS), in-app notification center with read state.

### 4.9 Sharing & Public Pages
- Unguessable capsule links (`timelycapsule.com/c/<26-char base32 token>`), OG images auto-generated (cover + countdown; never content), "notify me" subscription on locked public pages, embeds (iframe countdown widget, Phase 2), link revocation/rotation.

### 4.10 Organizations & Teams
- Workspaces with roles: `owner` (billing + all), `admin` (campaigns, members), `member` (create org capsules, contribute). Campaigns (template + CSV audience + schedule), branding, aggregate analytics, SSO (Enterprise), API keys (Enterprise), retention policies, domain restrictions.
- **Hard rule:** org admins can never read member-private capsule content; org owns only capsules created *as campaigns* or explicitly in org space.

### 4.11 Search
- Scope: server-side Postgres FTS over titles, tags, recipients, dates only (content never reaches servers in plaintext — 06 §A); full-text of *opened/draft* content via a **client-side index** built from locally decrypted capsules, merged into results in the UI. Sealed content is never searchable anywhere. Filters: state, type, tag, collection, date range, recipient. Recent searches stored locally.

### 4.12 Activity & Audit
- Per-capsule activity feed (created, edited, sealed, recipient added, notified, viewed, opened, reacted, exported) and account-level security log (logins, sessions, password changes). Immutable `audit_events` table; user-visible subset.

### 4.13 Organization of content: Tags, Collections, Favorites, Archive, Trash
- Tags: flat, per-user, ≤ 30 chars, autocomplete. Collections: manual ordered sets, one capsule in many collections. Favorites: boolean. Archive: hides from main timeline, keeps everything intact. Trash: drafts/opened capsules only (sealed capsules with third-party recipients cannot be trashed — must be *withdrawn* explicitly so recipient notification semantics are honest); 30-day retention then hard delete (media purged async).

### 4.14 Settings
- Sections: Account (email, password, 2FA, sessions, connected accounts), Profile, Notifications, Privacy (blocklist, discoverability, read receipts toggle), Legacy & Trustees, Storage (meter, largest capsules, cleanup suggestions — never suggests deleting sealed/legacy), Billing, Appearance (theme, app icon premium), Language & Region, Data (export, delete account), About/Legal.

### 4.15 Billing & Premium
- Stripe (web) + StoreKit 2 / Play Billing (mobile) with server-side entitlement service reconciling all sources; single `entitlements` record per user. Plans in §20. Grace periods, proration, dunning emails, upgrade paywall components contextual to the limit hit.

### 4.16 Security & Privacy module
- 2FA, session device list, login alerts (new device email), data export, deletion, blocklist, capsule-link rotation, zero-access E2E encryption on all content (06 §A) + recovery-kit management, privacy-first defaults (EXIF strip, no read receipts for recipients unless sender+recipient both allow — default on for sender visibility of "opened" since it's core value; recipient can disable sending reactions).

### 4.17 Administration & Moderation (internal)
- Full spec in `03-ARCHITECTURE.md §Admin Platform`. Admin roles, user lookup, capsule *metadata* inspection (content viewable only via break-glass dual-approval flow for legal/abuse cases, fully audit-logged), report queue, CSAM hash-matching (PhotoDNA-class at upload), spam heuristics, feature flags, refunds, legacy-release escalations.

### 4.18 Support, Help Center & Feedback
- Help center: hosted docs (searchable, in-app webview + web). In-app contact form with auto-attached diagnostics (app version, platform; user-consented). Feedback board (canny-style, Phase 2 can be an external tool). Status page (status.timelycapsule.com, external uptime provider).

### 4.19 Referrals & Achievements
- Referral: unique link/code; reward on referee's first *sealed* capsule (not signup — prevents fraud): +1 GB permanent each side, cap 10 GB. Fraud checks: device fingerprint, disposable-email blocklist, same-payment-method detection.
- Achievements: First Seal, Sealed ×10, Year-Long Wait (open a 1yr+ capsule), Decade Club (sealed ≥10 yrs), Time Traveler (self-capsule opened), Messenger (first capsule to another person), Butterfly Effect (a recipient you invited seals their own first capsule), Streak-free by design (no daily-streak mechanics — waiting is the point). Achievements grant cosmetic cover themes, never storage (keeps economy clean).

### 4.20 Templates
- System templates per occasion (New Year letter, New baby, Graduation, Wedding day, Ethical will, Team kickoff) = pre-filled structure + prompts + themed cover. User templates: "save as template" from any draft. Org templates for campaigns.

---

## 20. Monetization

### Plans

> Below Free sits **Guest** (no account, §4.1b): 1 capsule, **5 MB storage/media (M5)**, link-only delivery, +1 yr max horizon, no dashboard. Signup is the first "upgrade"; subscription is the second. The ladder is Guest → Free → Premium/Family/Business, and moving up never loses or re-locks anything already sealed. Guest storage is a real capability, not a monetization tier of its own — no payment collection exists at this rung; **storage and media retention are the intended primary paid lever** from Free upward, detailed in §20 and M4's sealed-entitlement model.

| | **Free** | **Premium** $7.99/mo · $59.99/yr | **Family** $12.99/mo · $99.99/yr (6 seats) | **Business** $10/seat/mo (min 5) | **Enterprise** custom |
|---|---|---|---|---|---|
| Active sealed capsules | 5 | Unlimited | Unlimited | Unlimited | Unlimited |
| Storage | 100 MB | 100 GB | 200 GB pooled + per-member privacy | 1 TB pooled | Custom |
| Media retention | 1 yr after opening | Forever | Forever | Forever | Forever |
| Video | 1 min / 720p | 30 min / 4K | 30 min / 4K | 30 min | Custom |
| Recipients/capsule | 3 | 20 | 20 | 1000/campaign | Custom |
| Legacy & trustees | — | ✓ | ✓ | — | — |
| Zero-access E2E encryption | ✓ (all plans — trust is never paywalled) | ✓ | ✓ | ✓ | ✓ |
| Seals: Place / Passphrase | 1 per capsule | Unlimited stacking | Unlimited | ✓ | ✓ |
| Expiry / ephemeral capsules | — | ✓ | ✓ | ✓ | ✓ |
| Family Vault | — | — | ✓ | — | — |
| Recurring series | 1 | Unlimited | Unlimited | ✓ | ✓ |
| Themes/covers | Basic | All + seasonal | All | Branded | Branded |
| Campaigns/CSV/analytics | — | — | — | ✓ | ✓ |
| SSO / API / SLA | — | — | — | — | ✓ |
| PDF/ZIP keepsake export | ✓ (watermarked PDF) | ✓ | ✓ | ✓ | ✓ |

### One-time purchases (no subscription required)
- **Gift Capsule Pass** ($4.99): one premium-sized capsule (2 GB, 30-min video). Perfect for the wedding-guest use case; major top-of-funnel.
- **Printed Keepsake Card** ($9.99 + shipping, Phase 3): sealed physical card with QR.
- **Memory Book** (Phase 3): printed book of an opened capsule/collection (print-on-demand partner, ~40% margin).

### Pricing strategy rationale
- Anchor against Day One ($34.99/yr) and iCloud/Google One storage pricing: we price above pure storage because we sell *delivery + ceremony + legacy*, not gigabytes.
- Annual pushed hard (37% discount) because the product's value is inherently long-horizon; annual subs match the mental model and slash involuntary churn.
- Free tier limits chosen so the *aha* (seal → wait → open) is fully experienceable, but any archivist/parent persona hits media limits within weeks.
- Legacy features are premium-only: highest willingness-to-pay, near-zero churn once configured (deep switching cost — this is the retention moat).
- **Never monetize trust:** delivery reliability, security, and already-sealed capsules are identical across tiers. Lapsed premium users' oversized sealed capsules still deliver (US-104). This costs little and is the brand.

### Revenue projection logic (for planning, not promises)
Free→paid target 4–6% (emotional products convert well), Family attach 15% of premium, Business as Phase 3 expansion. LTV driven by annual plans + legacy lock-in → target blended LTV:CAC > 4 via organic/viral loop (every capsule sent is an acquisition event for the recipient).

---

## 21. Growth Features

1. **The recipient loop (primary):** every delivered capsule lands on a branded, beautiful open page → "Reply with a capsule" pre-addressed CTA → recipient's first seal re-triggers the loop. Instrument: K-factor = invites/creator × recipient-signup rate × recipient-seal rate.
2. **Public countdown pages:** creators share locked capsules socially ("unlocks Friday"); OG images auto-generated; "notify me" captures emails pre-signup.
3. **Referral program:** §4.19 (+1 GB each, on referee's first seal).
4. **Occasion marketing engine:** birthdays/anniversaries from contacts (with consent) drive "You have 3 birthdays next month — send a capsule" emails/pushes; New Year is the tentpole campaign (FutureMe's entire business proves this spike).
5. **Milestones & achievements:** shareable cards (never content — only stats: "I just sealed a message for 10 years").
6. **Year in Capsules recap** (December): personal, shareable, Spotify-Wrapped-style.
7. **Widgets** as ambient re-engagement (next unlock countdown on the home screen).
8. **Seal-anniversary memories** ("1 year ago you sealed…") — re-engagement with zero content exposure.
9. **Group capsules** inherently multi-invite (weddings, retirements, farewells — one organizer invites 5–30 contributors).
10. **SEO content:** occasion-page library ("letter to daughter on 18th birthday — ideas & template") each with template deep-link into composer.
11. **Email lifecycle:** D0 welcome→first seal nudge; D3 prompt pack; pre-unlock hype ("3 days until your capsule opens"); post-open "reply" nudge; win-back at 60d dormant with their own sealed-capsule countdowns (we uniquely always have a reason to bring users back: *their future is scheduled with us*).

---

## 22. Accessibility & Internationalization

- **WCAG 2.2 AA** as the bar. All flows keyboard-completable; visible focus rings; skip-links on web.
- Screen readers: full VoiceOver/TalkBack audit per release; countdowns announced politely (aria-live="polite", updates ≤ 1/min); reveal ceremony has an SR-friendly linear alternative; all media require alt/caption prompts (nudged, not forced).
- Reduced motion: `prefers-reduced-motion` swaps all ceremony animations for gentle cross-fades; confetti off.
- Contrast ≥ 4.5:1 body, 3:1 large text/UI; both themes tested.
- Touch targets ≥ 44×44 pt; dynamic type/font scaling to 200% without loss.
- i18n: ICU MessageFormat, no concatenated strings; dates/times via Intl with explicit timezone display everywhere ("Opens Jun 1, 2027, 9:00 AM — Lagos time (WAT)"); RTL-ready layouts (logical CSS properties, start/end not left/right); launch locales en, es, fr, de, pt-BR, ja; strings in a TMS pipeline from day 1 (adding locales later is cheap; retrofitting i18n is not).
- Recipient pages localize by recipient's browser locale, not sender's.

---

## 23. Roadmap

### Phase 1 — Trust MVP (months 0–4): "Seal, wait, open — flawlessly"
Auth (email, Apple, Google), profiles, capsule CRUD + draft autosave, media (image/video/voice/PDF within free limits + premium), scheduling engine, seal ceremony, recipient delivery (email + link, no-account open), reveal experience, reactions + thank-you note, notifications (email + push), timeline/dashboard, search (basic), tags, trash/restore, settings, billing (Stripe + IAP), free/premium plans, referral v1, web + iOS + Android at parity, admin v1 (user lookup, reports, refunds), GDPR export/delete.
*Why:* the entire brand is delivery integrity; everything else is decoration until this loop is perfect.

### Phase 2 — Emotional depth (months 4–9)
Legacy capsules + trustees + inactivity check-ins, Seals expansion (dead-drop, quest chains, world capsule), group/co-authored capsules, recurring series, collections, templates gallery, public countdown pages, achievements, Year in Capsules, widgets, share extension, calendar ICS, chained capsules, digest emails, SMS channel, Family plan + Family Vault.
*Why:* legacy is the retention moat but demands the trust reputation Phase 1 earns; group capsules are the strongest viral surface.

### Phase 3 — Expansion (months 9–18)
Business tier (workspaces, campaigns, CSV, branding, aggregate analytics), Gift Capsule Pass + printed keepsakes + memory books, creator public profiles, embeds, student pricing, AI features (letter-writing assistant, voice transcription/search of *opened* content, memory summaries — all opt-in), marketplace of premium templates, discovery decision (curated public capsules — only if brand trust supports it).

### Phase 4 — Institution (18 mo+)
Enterprise (SSO, API, SLA, DPA), digital-inheritance partnerships (estate lawyers, funeral homes as channels), museum/school programs (class of 2030 capsules), long-term preservation guarantees (format-migration commitments, third-party escrow of decryption material for 25-year+ capsules), potential physical vault product.

---

## 26. Nice-to-Have / Delight Features (backlog, roughly ordered by emotional ROI ÷ effort)

1. **Time-travel chat** — a thread where each message unlocks on its own date; conversations across years.
2. **AI letter assistant** — turns rough bullet notes into a polished letter *in the user's voice* (opt-in, on-device draft privacy where possible).
3. **Voice transcription & "listen later" chapters** for long voice memos (opened content only).
4. **Interactive countdown scenes** — the sealed capsule as a living object (seasonal weather, aging patina the longer it waits).
5. **Capsule map** — globe of your sent/received capsules and where they were sealed.
6. **Family Vault timeline** — multi-generation river of opened capsules.
7. **"Open when…" packets** — a set of capsules unlocked by recipient choice, one at a time, with sender-set minimum spacing ("open when you're sad", "open when you miss me").
8. **Duet capsules** — both people write without seeing each other's side; both unlock simultaneously (weddings, anniversaries).
9. **Prediction capsules** — structured predictions with auto-scored reveal ("What I think 2030 looks like").
10. **Handwriting mode** — write on paper, photograph, we OCR + preserve the handwriting as the artifact.
11. **Memory soundtrack** — attach a song (Apple Music/Spotify deep link) that plays on reveal.
12. **Anniversary auto-suggest** — detects meaningful dates from opened capsule history.
13. **Grief mode** — recipient-controlled pacing of a deceased sender's remaining capsules ("not today" defers gently, never expires).
14. **Classroom kits** — teacher seeds a class capsule; unlocks at graduation.
15. **Capsule weather** — on reveal, show what the weather/news headlines were the day it was sealed (sealed-day snapshot stored at seal time).
16. **Voice cloning for legacy (explicit consent + liveness verification, Phase 4+, ethics review)** — grandparent records 30 min; descendants can hear new words in their voice. High sensitivity: consent artifacts stored, revocable, watermarked audio.

---

*End of Part 1. UX in `02-UX-DESIGN.md`, systems in `03-ARCHITECTURE.md`.*
