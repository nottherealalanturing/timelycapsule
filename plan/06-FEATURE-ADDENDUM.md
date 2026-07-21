# TimelyCapsule — Addendum: Zero-Access Encryption, Conditional Capsules & Product Voice

**Status: binding and integrated.** The structural changes here have been merged into 02-UX-DESIGN (screens/states), 03-ARCHITECTURE (encryption, schema, state machine), and 05-BUILD-PLAYBOOK (tickets). This document holds the rationale, the full conditional-capsule spec, and the copy/voice guide. If any residual conflict is found, this document wins.

---

## A. Zero-access encryption by default (rationale + model)

Founder direction: the team must be unable to read capsule contents — ever. This is now the **default and only** content model (the old "standard + optional Vault Lock" split is dead). It becomes the brand's sharpest claim: *"Sealed means sealed. Not even we can open it."*

**Model (implemented in `packages/crypto`, ticket T-07b):**
- Client generates a random 256-bit capsule key; content doc + every file are AES-GCM encrypted client-side before upload. Server stores ciphertext only.
- **Envelope vs. contents:** title, cover, teaser, unlock date, sizes stay plaintext — they are the *outside* of the envelope, required for timelines, notification emails, and OG images. UX copy makes this explicit ("The outside of your capsule is visible; everything inside is sealed.").
- Key wraps: (1) owner master key — generated at signup, encrypted under Argon2id(password), re-wrapped on password change; (2) per-recipient wrap carried in the link's URL **fragment** (`#k=…`, never sent to servers); (3) optional passphrase wrap (§B2); (4) **recovery kit** — printable code re-deriving the master key, nagged until saved, with the honest warning: lose password + kit = unrecoverable by anyone, including us.
- Legacy capsules: keys wrapped to designated *recipients* at seal; trustees can trigger release but never read.
- **Accepted consequences** (engineering must not quietly regress these): thumbnails/posters/waveforms/blurhash generated client-side pre-encryption (uploaded as encrypted sidecars); EXIF stripped client-side; no server content search — client-side index over locally decrypted *opened* content; server FTS covers titles/tags only; no server AV scan of contents (compensating controls per 04 §media stay: size caps, attachment-disposition, isolated media origin, sandboxed rendering); exports/zips assembled client-side; admin moderation is **metadata-only** — reports are adjudicated on recipient-submitted evidence, remedies are withdraw/suspend/ban, never "view."

## B. Conditional capsules — the "Seals" system

Reframed from a list of lock types into one composable mechanic: a capsule carries one or more **Seals**, and every Seal must break before the contents open. This is the better product: one mental model, one UI (stacked seal chips in composer and on the locked page), arbitrary combinations, and a natural place for future conditions.

Seal types at launch:
1. **Time Seal** (always present) — the core unlock date/time. Everything from 03 §10 applies.
2. **Place Seal** — opens only within a radius of a chosen location. Composer: map pin, radius slider (100 m–50 km, default 500 m), place nickname ("Where we first met"). Locked page shows distance + bearing ("2,314 km from where this opens") and a blurred map teaser. Enforcement: client geolocation gates key-unwrap AND server gates ciphertext download by reported location — documented honestly as spoofable-by-experts; it's ceremony and intent, not a cryptographic boundary. Denied location permission → graceful copy, no dead end (link to help).
3. **Passphrase Seal** — key additionally wrapped under Argon2id(passphrase); hint required (shown to recipient). Wrong attempts fail client-side (no server oracle); soft client-side throttle with warm copy. A passphrase-only wrap makes the bare link safe to share publicly.
4. **Identity Seal** — OTP verification to the recipient's address (existed already; now presented as a Seal).

Rules: Seals stack (proposal capsule = Time + Place + Passphrase); the locked page shows each seal as a wax stamp that visibly cracks as satisfied; max 3 seals beyond Time (complexity guard); Legacy capsules allow Identity Seal only (grief contexts must not gate on games).

**Derived features** (Phase 2+, cheap on top of Seals): **Dead-drop capsules** (Place Seal, no named recipient — anyone at the spot with the QR can open; printable waterproof QR stickers as a micro-purchase); **Quest chains** (sequence of sealed capsules, each revealing the next location); **World capsule** (public capsule whose Time Seal resolves per-viewer at local midnight — the New Year moment).

## C. Capsule expiry — "Completed journeys"

Optional post-unlock **viewing window**: forever (default) / 1 yr / 30 d / 7 d / 24 h / **ephemeral** (single viewing session, Mission-Impossible mode — marketed as "self-destructing capsule," a genuinely viral variant).
- State machine: `unlocked → expired` via new `capsule_expire` scheduled action. Escalating recipient reminders before expiry ("3 days left before this capsule completes its journey").
- If a recipient opened before expiry: default is their access persists (expiry stops *new* opens); sender may choose strict mode (access ends for everyone — required for ephemeral). Ciphertext purged 30 d after expiry; envelope metadata retained for the expired page.
- Expiry is forbidden on Legacy capsules.

## D. Product voice — "Warm time-travel"

A single voice system, codified in `packages/ui-web/voice.md` (shared with mobile). Register: **warm, a little cosmic, never zany**. Rules:
1. One temporal metaphor per screen, maximum. The metaphor seasons the message; a plain-language line always carries the actual meaning.
2. Voice applies to: loading, errors, empty states, countdown/locked pages, celebrations. Voice never applies to: legacy/grief surfaces (quiet plain voice), security, billing, legal, moderation.
3. "Time traveler" addresses the user sparingly (first-run, loading) — not in every sentence.
4. Localizable: metaphors chosen to survive translation (no English-only puns in core strings).

**Canonical strings** (founder samples refined; these ship):
- **Loading (reveal/app fetch):**
  Headline: "Retrieving your capsule from the timestream…"
  Sub: "Hold tight, time traveler — good moments are worth the wait."
  (Orbiting-capsule spinner; reduced-motion: static capsule + soft ellipsis.)
- **404 / missing:**
  Headline: "Lost in time."
  Body: "This capsule doesn't exist in this timeline. The link may be mistyped — or the page has drifted somewhere we can't follow."
  CTA: "Return to the present" → home.
  *Withdrawn variant* (valid token, sender withdrew): body: "The sender called this capsule back before it could open. Its contents remain unwritten history." (Never leaks content or additional sender info.)
- **Countdown / locked page:** capsule name, sender line ("From Maya — sealed March 3, 2026"), short public **Capsule ID** (8-char unambiguous alphabet, e.g. `TC-84KZQM3P`; support handle + on-page identity, distinct from the secret access token), reveal date formatted in the *viewer's* locale + timezone, live countdown with adaptive granularity ("2 years, 3 months" → "0d 4h 09m 12s"), Seal stamps row showing remaining conditions, notify-me, add-to-calendar, optional sender teaser. At T-0 the page flips into the reveal ceremony live, without refresh.
- **Expired:**
  Headline: "This capsule has completed its journey."
  Body: "Its moment came and went — what was inside belongs to the past now."
  CTA: "Back to the present." (If this viewer retains access under default expiry: show their capsule instead, with a "completed journey" badge.)
- **Place Seal gate:** "You're not quite in the right place in spacetime. This capsule opens at *Where we first met* — 2,314 km from here." + map teaser + directions link.
- **Passphrase gate:** "One last seal. Hint: *our song*." Failure: "That key doesn't fit this seal — try again."
- **Rotated link:** "This link belongs to an old timeline. Ask the sender for a fresh one."
- **Rate-limited:** "Even time travel needs a breather. Try again in a moment."
- **Paradox guard** (sender attempts forbidden action on own sealed capsule): "Tampering with a sealed timeline causes paradoxes. This capsule stays sealed until {date}." (Fun skin on existing invariants; zero backend work.)

## E. Where everything landed (verification map)
- 02-UX-DESIGN: §5.7 locked/reveal updated (Seals row, Capsule ID, T-0 flip, teaser); new §5.16 System Pages (loading/404/withdrawn/expired/gates/rotated/rate-limited); §5.5 composer options block now "Seals & Expiry."
- 03-ARCHITECTURE: §8 encryption model replaced (zero-access default); state machine + invariants gain `expired`; schema gains `public_id`, `seals jsonb`, expiry fields, `capsule_expire` action kind, wrapped-key columns; §11 expiry reminders; §17/§18 metadata-only moderation; §14 API deltas listed inline.
- 05-BUILD-PLAYBOOK: T-07b added; T-08/T-10/T-11/T-15/T-17/T-34 amended in place; T-40 removed from Stage G (E2E is core now); Stage G gains dead-drop/quest/world-capsule candidates.
