# The Meridian email system

Engineering reference for `apps/api/src/modules/email/templates/`. Rebuilt onto a shared Meridian V2 layout (web polish pass, post-T-22); the design authority for any of this is `design/05-IDENTITY-DECISION.md` (register table) and `design/04-VISUAL-IDENTITY.md §10` (signature elements) — this file just says how the code implements them.

## Why email gets its own system rather than reusing `packages/ui-web`

Email clients don't reliably support external `<style>`/CSS custom properties, so `tokens.css` can't be imported directly — only its values can be copied. `Layout.tsx` copies the real record-register hex values (`--r-ground`, `--r-raised`, `--r-ink`, `--r-muted`, `--r-iron`) rather than the stale pre-Meridian palette (`#faf7f2` parchment / `#d4a24e` gold) the templates carried before this pass. One exception: `--r-rule`'s `rgba(22,24,26,.14)` is flattened to a solid hex (`#d9dad4`) because Outlook desktop's Word rendering engine drops rgba borders.

## The register

Every template renders in the **record register** — paper, Source Serif 4, permanently, in both the light and dark in-app themes — per `05-IDENTITY-DECISION.md`'s register table, which puts "emails" alongside letters/exports/print. There is no dark-mode email; a mail client has no theme toggle to make that a live choice.

- **Letterhead**: mono, uppercase, tracked — the same idiom as the in-app `Hallmark` component. The wordmark is institutional and stays static across every register (`07 §II.2`), so it's set apart from the serif body rather than absorbed into it.
- **The Meridian Line**: `04-VISUAL-IDENTITY.md §10` names it a required signature element everywhere, and gives its email form directly — *"In email it's the rule."* It's the 1px rule under the letterhead.
- **Body**: Source Serif 4 (Charter/Iowan Old Style/Georgia fallback), `--r-ink`, 1.65 line-height.
- **CTA**: a bulletproof table-button in `--r-iron` (`#2c3a4a`, the record register's own interactive colour — not brass, which is reserved for "waiting" per `tokens.css`'s comment, even within the record register).
- **Readings** (codes, durations, absolute dates): mono, via `EmailReading` — `05 §Typography`'s "hallmarks and metadata in mono" rule.

`Layout.tsx` exports `EmailLayout`, `EmailButton`, `EmailReading`, `emailColors` — every template composes from these rather than hand-rolling its own `<table>`/`<style>` structure.

## Voice and data fixes made during the rebuild

Three real defects found and fixed, not just restyled:

1. **`NewDeviceAlert` and `BounceAlert` said "we"** ("We noticed a sign-in...", "We couldn't reach a recipient..."), against `07-EXPERIENCE-BIBLE.md §VIII` rule 6 ("An institution is not a personality"). Rephrased to institutional voice; the bounce-alert subject line changed to match.
2. **`PreUnlockReminder` never received an absolute date** — only a precomputed `daysUntilUnlock` integer, so it could only ever say "in 3 days," against `07 §VIII` rule 4 ("Dates are always literal and absolute. Relative time may accompany a date; it may never replace one."). Added `unlockAtIso` to the props and threaded the real `capsule.unlockAt` through from both call sites in `scheduler/handlers/reminder.ts`. The relative phrasing stays alongside it, not replaced.
3. **`ReactionReceived`'s copy assumed its `emoji` field was a glyph** ("{name} reacted 🎉"). The reveal ceremony replaced raw emoji with named phrases ("Thank you", "I miss you", …) in an earlier accessibility pass — `07 §VIII.5` bans emoji outright — but the field name and this template's copy were never updated, so a real send now read "Jordan reacted Thank you." Copy changed to "{name} replied: \"{phrase}\"", which is correct for a phrase. The wire/DB field name (`emoji`, in `packages/contracts/src/reveal.ts` and the `reactions` table) is untouched — out of scope for a template rebuild.

## Template inventory

| Template | Status | Notes |
|---|---|---|
| `VerifyEmail` | Rebuilt | Code now rendered via `EmailReading` (mono), not the ambient sans-serif |
| `PasswordReset` | Rebuilt | |
| `NewDeviceAlert` | Rebuilt | Voice fix (#1 above) |
| `SomethingWaiting` | Rebuilt | |
| `CapsuleUnlocked` | Rebuilt | No CTA by design — the fragment-embedded key means this email can only point back at an earlier one |
| `PreUnlockReminder` | Rebuilt | Data fix (#2 above) — `unlockAtIso` is now a required prop |
| `OpenedNotice` | Rebuilt | |
| `ReactionReceived` | Rebuilt | Copy fix (#3 above) |
| `ExportReady` | Rebuilt | |
| `BounceAlert` | Rebuilt | Voice fix (#1 above) |

## Missing templates (documented, not built this pass)

Per your instruction, this pass only rebuilds what exists. These are named in `plan/05-BUILD-PLAYBOOK.md` but have no template today:

| Category | Ticket | Notes |
|---|---|---|
| Monthly digest ("2 capsules unlock next month") | T-35 | Unstarted |
| Seal-anniversary memory notice | T-35 | Unstarted |
| Lifecycle: D0 welcome/first-seal, D3 prompt, post-open reply nudge, 60d win-back | T-35 | Unstarted; needs `List-Unsubscribe` header support — none exists in the module today |
| Dunning / payment-grace emails | T-31 | Unstarted (billing not built) |
| Account-deletion warning | T-16/T-18 area | The 30-day pending-deletion flow has no accompanying email |
| Capsule-sealed confirmation (to owner) | Not explicitly ticketed | No template, no send function |
| `capsule_expire` reminder | T-15 | Named in the ticket text; no template |
