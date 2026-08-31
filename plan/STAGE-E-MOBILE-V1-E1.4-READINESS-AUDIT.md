# Stage E, Mobile V1 — E1.4 (Capsule Creation / Sealing) Readiness Audit

**Status:** Read-only audit. No application code, backend code, crypto implementation, or mobile UI was
modified to produce this document. No commits, no branches, no PRs. The only artifacts this session
produces are this file and a surgical addition to `plan/PROGRESS.md`.

**Evidence labels used throughout:** `[IMPLEMENTED]` — read directly from real code, this session ·
`[VERIFIED]` — implemented AND proven working (test, on-device evidence, or direct empirical check) ·
`[INFERENCE]` — reasoned from verified evidence, not itself directly observed · `[RECOMMENDATION]` —
proposed, not decided · `[BLOCKER]` — prevents starting or finishing E1.4 · `[PREREQUISITE]` — must
happen before or alongside a specific E1.4 sub-ticket, not before E1.4 as a whole · `[FOLLOW-UP]` — real,
but explicitly out of E1.4's scope · `[FOUNDER DECISION]` — genuinely the founder's call, not resolved here.

---

## 1. Executive summary

**E1.4 is ready to implement. There is no remaining crypto blocker.** The one hard blocker the master
Stage E blueprint identified (`deriveKeyFromPassword`/Argon2id on Hermes) was resolved during E1.2 and is
`[VERIFIED]` in production code (`packages/crypto/src/kdf.native.ts`, real Android/iOS device evidence).
E1.3.12 closed a second gap the master blueprint didn't know it had: React Native has **no**
`crypto.getRandomValues` either, and every capsule-key/IV/salt generator E1.4 needs is now `[VERIFIED]`
working on a real Hermes/JSI runtime with a real AES-GCM round trip (`packages/crypto/src/random.native.ts`).

E1.4's real work is not cryptographic — it is **UI, state management, and new backend-facing client
code that does not exist yet.** `apps/mobile/src/lib/api-client.ts` is, by its own header comment, deliberately
100% read-only for the capsule domain today, explicitly deferring create/patch/seal to "the creation
ticket" — this is E1.4, already anticipated in the existing code. `apps/mobile/src/lib/capsule-crypto.ts`
is 100% decrypt-direction. No FAB, no compose route, no media/date-picker/SQLite dependency exists in
`apps/mobile` at all. None of this is a defect — E1.3's tickets were explicitly scoped to browsing/reading,
and this is the boundary working as intended.

**A significant, previously-undocumented finding this audit surfaces:** two numbering schemes for
Stage E mobile tickets exist in the plan documents and do not agree (§3.1). This is recorded, not
silently reconciled, per this session's explicit instruction.

**A second real finding:** the master Stage E blueprint (`STAGE-E-MOBILE-V1-IMPLEMENTATION-BLUEPRINT.md`)
made two specific technical predictions about React Native's crypto capabilities that turned out to be
wrong once mobile work actually started (§6.9) — its overall *reasoning* (per-primitive `.native.ts` swap
points) was sound and is exactly what got built; its specific guesses about which primitives would need
help were not. This is recorded as a documentation-vs-reality contradiction, not fixed in place.

**A third finding, directly load-bearing for E1.4's first crypto-writing code:** web's own
`contentDocEnc` wire format is **standard base64** (`btoa`, with `+`/`/`/`=`), not base64url — confirmed
by reading `apps/web/src/lib/capsule-crypto.ts`'s `encodeIvCiphertext` directly. Mobile's existing
`@tc/crypto` encoder (`toBase64Url`) produces base64url. The two are very likely interoperable in
practice (Node's `Buffer.from(x, 'base64')`, which the backend uses, accepts both alphabets), but this
has never been empirically proven for this exact field — it is an `[INFERENCE]`, not a `[VERIFIED]` fact,
and E1.4's cross-platform verification ticket must prove it, not assume it (§6.8).

**Verdict: READY.** No blocker prevents starting E1.4. See §20 for the exact first ticket and §25 for the
full verdict statement.

---

## 2. Current repo state

`[VERIFIED]`, this session, via direct `git` inspection — not assumed from any prior document.

| | |
|---|---|
| Branch at audit time | `main` |
| `origin/main` HEAD | `5a2e7bf` (merge of PR #59) at audit start; confirmed current via `git fetch` |
| Working tree | **Clean.** `git status` reports nothing to commit. All work from the prior session (E1.3.12, push-token registration, Stage E planning docs, the LinkedIn/personal presence pack) has been committed and merged (PRs #57, #58, #59, #60, all confirmed `MERGED` via `gh pr view`) |
| PR #57 (E1.3.12) | **Merged** (`mergedAt: 2026-08-29T10:37:13Z`) — confirmed via `gh pr view 57`, not assumed from the prompt |
| Local `main` vs `origin/main` | Fast-forwarded during this audit (local was 4 commits behind after PRs #58/#59 merged); no local unique commits existed, so this was a strict, lossless fast-forward |
| Unrelated uncommitted work | **None exists right now.** Everything the previous session flagged as "unrelated" (push-token backend, LinkedIn/personal presence pack, planning docs) is now committed and merged. This audit introduces no new uncommitted work of its own beyond this file and the `PROGRESS.md` addition, both explicitly authorized by this ticket's instructions |

**`apps/mobile/`, `packages/crypto/`, `packages/contracts/`, `apps/api/`, `apps/web/` inspection:** performed via three parallel read-only research passes (full findings folded into §5–§8 below) plus direct reads of `packages/crypto/src/{random.native,encoding}.ts`, `apps/web/src/lib/capsule-crypto.ts`, and `apps/mobile/app/(app)/capsule/[id].tsx`. No file in any of these trees was modified.

---

## 3. E1.4 ticket map

### 3.1 The numbering contradiction — recorded, not resolved

`[DOCUMENTED, not fixed]` Two different ticket-numbering schemes exist across the plan documents for
what this session calls "E1.4":

- **`plan/STAGE-E-MOBILE-V1-EXECUTION-BACKLOG.md`'s own internal scheme** numbers capsule creation as
  **`E4.1`–`E4.10`** under its "Phase 4 — Capsule creation" heading (line 687). In that same document's
  own scheme, `E1.x` is exhausted by mobile *foundation* work (`E1.1` Expo scaffold, `E1.2` design tokens,
  `E1.3` typography, `E1.4` **theme (light/dark)**, `E1.5` navigation shell, ... `E1.10` accessibility
  foundation) — none of which matches what was actually built as "E1.2" (mobile auth foundation) or
  "E1.3.1–E1.3.12" (browsing/decrypt/notifications/accessibility/native-crypto) in this repository's
  actual git history.
- **The scheme actually used in practice** — confirmed by every real branch name, every real merged PR,
  and every real `plan/PROGRESS.md` entry — is flat: `E1.1` (recovery backend foundation), `E1.2` (mobile
  auth foundation), `E1.3.1`–`E1.3.12` (the whole browsing/decrypt/notifications/accessibility/
  native-crypto arc), and now `E1.4` for capsule creation, exactly as the user's own message frames it.
  This exact identifier, "E1.4," was already in use **before** this session — the most recent prior audit
  (`plan/STAGE-E-MOBILE-V1-E1.3-FINAL-READINESS-AUDIT.md`, §13 parking lot) already wrote "Capsule
  creation (E1.4)" as the next item after E1.3.9, one full session before this one.

**No document anywhere records the decision to abandon `EXECUTION-BACKLOG.md`'s own `E1.x`/`E3.x`/`E4.x`/
`E6.x`/`E7.x`/`E8.x` scheme in favor of the flat `E1.1`/`E1.2`/`E1.3.N` scheme that was actually followed.**
This is a real documentation gap, not something this audit can resolve by inference — flagged per this
session's explicit instruction not to silently reconcile.

**Resolution used for this document:** identifier authority is the scheme actually in use (**"E1.4"**,
matching the user's framing and the prior session's own parking-lot entry); **content** authority for
E1.4's scope is `EXECUTION-BACKLOG.md`'s detailed `E4.1`–`E4.10` breakdown, since it is the only document
with ticket-level granularity for this exact body of work and its content is not itself in question, only
its label. The sub-ticket IDs below are given in both forms for traceability.

### 3.2 Ticket map

`[RECOMMENDATION]`, content sourced from `EXECUTION-BACKLOG.md` §10 (as `E4.1`–`E4.10`), re-labeled to
this repo's actual `E1.4.N` convention (mirroring how `E1.3.1`–`E1.3.12` were sub-numbered) and
cross-checked against `STAGE-E-MOBILE-V1-IMPLEMENTATION-BLUEPRINT.md` §10/§21 (Phase 4) and the real
web implementation (§4 below) for accuracy. Sub-ticket numbering below is this session's own proposal —
**not previously committed anywhere** — offered so a future session has a concrete backlog rather than
one large undifferentiated ticket.

| # (proposed) | Backlog ID | Objective | Depends on | Backend deps | Crypto deps | UI deps | Reuse | Parallel? |
|---|---|---|---|---|---|---|---|---|
| E1.4.1 | E4.1 | Address movement — who + when | E1.2 (master key), E1.3.4/.5 (CapsuleRow, Home exists to return to) | `POST /capsules` (create), `PATCH /capsules/:id` | None yet (pre-content) | New: recipient chip input, horizon/date picker | `capsulesApi` pattern, `tokens.ts` | Yes, alongside E1.4.2's scaffolding |
| E1.4.2 | E4.2 | Recipient entry | E1.4.1 | `POST/DELETE /capsules/:id/recipients` | None | Native add/remove UI | Existing recipient *read* contract shapes (`RecipientSchema` already consumed read-only in E1.3.9) | Yes |
| E1.4.3 | E4.3 | Compose movement + capsule-key generation + client-side content encryption | E1.4.1 | `PATCH /capsules/:id` (autosave) | **New:** `generateCapsuleKey`, `wrapCapsuleKeyForOwner`, `encryptBytes` wired into a new mobile write-path file | New: text editor (no TipTap-equivalent installed — see §8), keyboard handling | `@tc/crypto`'s write-direction functions (exist, unused by mobile) | **No — this ticket's core, do first** |
| E1.4.4 | — (folded into E4.3 by this session; offline drafts were E4.3's own second half in the backlog) | Local encrypted draft persistence | E1.4.3 | None (local-only until sync) | **New:** device-local draft-encryption key, independent of master key | New: `expo-sqlite` integration | Nothing to port — web's own draft cache is plaintext `localStorage` (§7), not a precedent to copy | No — same risk class as E1.4.3 |
| E1.4.5 | E4.4 | Media source sheet (camera/library/voice/video/files) | E1.4.3 | none new | none new | New: `expo-image-picker`/`expo-camera`/`expo-document-picker` UI | Nothing — web uses browser drag-and-drop, no mobile precedent | Yes, alongside E1.4.6 |
| E1.4.6 | E4.5 | Voice recorder | E1.4.5 | none new | none new | New: `expo-av`/`expo-audio`, Idle→Recording→Preparing→Ready lifecycle | Web's `VoiceRecorder.tsx` state machine is the *behavioral* reference, not portable code | Yes, alongside E1.4.5/E1.4.7 |
| E1.4.7 | E4.6 | Media encryption + upload | E1.4.5 | `POST /capsules/:id/media/tickets`, raw `PUT` to presigned URLs, `POST /media/:id/complete` | `encryptBytes` (single-shot, matching web — see §6.6) | New: upload progress/retry UI | `@tc/crypto`'s `encryptBytes` (exists); upload sequence has no mobile precedent | **No — proves cross-platform media compatibility, highest technical risk after E1.4.3** |
| E1.4.8 | E4.7 | Review/Seal movement | E1.4.1–E1.4.7 | `POST /capsules/:id/seal` (no body) | None new (reads already-resolved capsule key to render the review) | New: record-as-review surface | Web's "the record itself is the review" design principle (§4.4) | **No — phase's final integration point** |
| E1.4.9 | E4.8 | Cross-platform capsule verification (phase-closing gate) | E1.4.1–E1.4.8 | none new | Proves §6.8's base64/base64url question empirically | N/A — verification ticket | E1.3.8's existing detail screen is the read-back surface | **No — gate, not a build ticket** |
| E1.4.10 | E4.9 | Error/validation states across creation | E1.4.1–E1.4.8 | none new | none new | Cross-cutting copy/error pass | `ErrorState` (exists, reusable) | No — end-of-phase pass |
| E1.4.11 | E4.10 | Accessibility pass, Creation | E1.4.1–E1.4.10, E1.3.11 (established mobile a11y conventions) | none | none | VoiceOver/TalkBack pass | E1.3.11's own established grouping/labeling conventions | No |

**Acceptance criteria, risks — carried from `EXECUTION-BACKLOG.md` §10 verbatim where not superseded by
this session's own findings:** see that document's `E4.1`–`E4.10` entries directly; this table does not
restate every field to avoid drift between two copies of the same text. The one supersession: `E4.3`'s
own text bundles Compose UI and draft persistence into one ticket; this audit recommends splitting them
(E1.4.3/E1.4.4 above) because they carry genuinely different risk profiles (UI/keyboard risk vs.
new-persistence-layer risk) and a future session may reasonably want to parallelize an engineer on each
once E1.4.3's capsule-key/encryption core exists.

---

## 4. Current web creation flow (traced from real code, not names)

`[VERIFIED]` — full trace performed against `apps/web/src/components/composer/v2/*`,
`apps/web/src/lib/{use-capsule-draft,capsule-crypto,letter-envelope}.ts`, `apps/web/src/app/capsule/new/
page.tsx`, `apps/web/src/app/try/page.tsx`. Authoritative design spec: `design/21-CAPSULE-CREATION-V2.md`
(read in full — supersedes the composer section of `plan/02-UX-DESIGN.md §5.5`, which explicitly defers
to it).

### 4.1 The three movements

Not a wizard. `Address → Compose → Seal`, freely navigable in both directions, named in a `MovementNav`
hallmark (never a progress bar/percentage/step-count — banned outright by the product's own motion rules).
Backwards is always free; nothing is validated-and-locked.

### 4.2 Flow diagram

```
User opens "/capsule/new"
  → POST /capsules {type: 'personal'}          [creates a draft row, state='draft']
  → router.replace('/capsule/:id/edit')
  → MasterKeyGate (blocks until master key resolved in memory)
  → Composer mounts, useCapsuleDraft(id) loads the draft

ADDRESS movement
  → AddresseeBeat: "someone else" | "myself" → draft.patch({type})
  → recipient add (email/phone) → POST /capsules/:id/recipients   [immediate, NOT autosave-debounced]
  → Horizon/ExactMoment: unlock date/time → draft.patch({unlockAt | unlockLocal})
  → (validation: schedule-validity.ts, shared with Seal — 5min–50yr bounds)

COMPOSE movement
  → first load: if no ownerKeyWrap yet →
      generateCapsuleKey()  [packages/crypto/src/capsule-key.ts, → generateAesKey() → random.ts/random.native.ts]
      wrapCapsuleKeyForOwner(capsuleKey, masterKey)
      → PATCH /capsules/:id {ownerKeyWrap}                        [immediate, not debounced — happens once]
  → TipTap editor → LetterEnvelope {doc, writtenAt}
  → every patch()/setContentDoc() call:
      1. write to localStorage cache (crash recovery, plaintext, key `tc:draft:{id}`)
      2. reset 3000ms idle timer
  → on timer fire (or draft.flush()):
      encryptBytes(capsuleKey, JSON.stringify(envelope))
      → PATCH /capsules/:id {...pendingFields, contentDocEnc}
  → Enclose (file/voice/place):
      encryptBytes(capsuleKey, fileBytes)  [single-shot, not streaming]
      → POST /capsules/:id/media/tickets {name, mime, sizeBytes: encryptedLength}
      → N × PUT presigned-url {encrypted chunk}  [8MB HTTP parts, unrelated to AES chunking]
      → POST /media/:id/complete {parts: [{partNumber, eTag}]}
      → poll/refetch until status:'ready'

SEAL movement
  → renders the actual letter/enclosures/address as the review (not a summary)
  → draft.flush()                                                  [force immediate autosave first]
  → POST /capsules/:id/seal   {}                                    [NO body — reads persisted state]
  → success: SealCeremony → router.push('/home')
  → failure: seal-errors.ts maps ApiClientError.code → tailored inline copy, never a toast
```

### 4.3 Per-step platform table

| Step | WEB | MOBILE | SHARED PACKAGE | BACKEND |
|---|---|---|---|---|
| Draft create | `app/capsule/new/page.tsx` → `capsulesApi.create` | **Does not exist** | `@tc/contracts` `CreateCapsuleRequestSchema` (`{type}` only) | `POST /capsules` → `state: 'draft'` row |
| Local state | `CapsuleDraft` interface, `useCapsuleDraft`/`useGuestDraft` | **Does not exist** — no draft model in `apps/mobile` at all | — | — |
| Validation (schedule) | `schedule-validity.ts`, 5min–50yr | **Does not exist** | Same bounds enforced server-side (`state-machine.ts`) regardless of client | `assertUnlockAtWithinBounds` |
| Capsule key generation | `use-capsule-draft.ts` bootstrap effect | **Does not exist** | `generateCapsuleKey` (`packages/crypto/src/capsule-key.ts`) — portable, unused by mobile today | — (never sees the key) |
| Content serialization | `LetterEnvelope {doc, writtenAt}`, TipTap JSON | **No editor exists**; `capsule-crypto.ts` can *read* the envelope shape (decrypt-only) | `readEnvelope`/`envelopeText` conceptually shared logic (mobile has its own copy, decrypt-only) | Opaque `bytea` |
| Content encryption | `encryptBytes` (`aes.ts`) | `encryptBytes` exists (`aes.native.ts`, proven), **not called from any mobile app code yet** | `@tc/crypto` | Stores ciphertext only |
| Recipient key wrapping | **None — capsule key travels bare in the URL fragment**, never wrapped per-recipient | N/A (not applicable regardless of platform — this is a protocol fact, not a client capability gap) | `encodeCapsuleKeyForLink` (`capsule-key.ts`) | Never receives it |
| Media handling | Full pipeline (§4.2) | **Does not exist**, no picker libraries installed | `encryptBytes`, presign contracts | R2 multipart |
| API submission | `capsulesApi.patch/seal` etc. | `api-client.ts` has **zero** write methods for the capsule domain | `@tc/contracts` schemas | Express routes |
| Seal | `POST /capsules/:id/seal`, no body | **Does not exist** | — | `sealCapsule` (lifecycle.ts) |
| Success/navigation | `router.push('/home')` | N/A yet | — | — |

### 4.4 Design principles that must carry over unmodified (per this ticket's "do not redesign" instruction)

`[VERIFIED, from design/21-CAPSULE-CREATION-V2.md]`, restated as constraints, not options:

- **Address before Compose, always** — the two levers against the blank page (address the reader,
  perform the age arithmetic) require knowing who/when before the letter appears.
- **Sealing is a deliberate movement, not a side effect of finishing a sentence.**
- **The review before sealing IS the record, not a summary of it** — "confidence, not confirmation." A
  mobile Review screen must render the actual letter/enclosures/address, not a condensed card.
- **Prompts are questions beside the record, never inserted into it** — no code path may exist by which a
  prompt/template could be written into the letter.
- **Unavailable capabilities are omitted, not shown disabled with an upgrade label** — this was a
  deliberately reversed decision during the web build (a disabled/greyed row was tried and rejected).
- **Irreversibility is stated once, in plain language, beside the action** — never a checkbox, never a
  second confirmation dialog.
- **"One reading only" reads as different in kind, not magnitude** from every other retention option.

These are product/interaction principles, not literal component code — `07-EXPERIENCE-BIBLE.md` §V/§IX
and `design/21-CAPSULE-CREATION-V2.md` are the sources; nothing here is invented by this audit.

### 4.5 What is explicitly NOT part of the live web product today (do not absorb into E1.4)

`[VERIFIED]` — confirmed by direct grep of `apps/web/src`, not assumed from `01-PRODUCT.md`'s full
feature breadth:

- `recurrence`, `legacyConfig`, `seriesId`, `chainParentId`, `chainDelay` — exist as DB columns; only
  `recurrence`/`legacyConfig` are even exposed in the PATCH contract, and **neither has a live composer
  control on web today** (confirmed by grep — only dev/demo pages reference them). `seriesId`/
  `chainParentId`/`chainDelay` have **zero** contract or web-code exposure at all.
- `replyPrompt` — in the PATCH contract, but only ever *read* on the reveal side; no composer control
  sets it.
- Group/birthday/anniversary/public/legacy/emergency/business/campaign capsule types — `01-PRODUCT.md
  §4.4`'s full type breadth exists in the `CapsuleTypeSchema` enum, but the live composer's Address
  movement only ever sets `'self'` or `'personal'`. **E1.4 should match this — self/personal only —**
  not the full product-vision type list, since matching "the established current desktop/web UI and
  product behavior" (this ticket's own instruction) means matching what the composer *actually offers
  today*, not the full PRD.
- Place Seal, Passphrase Seal, Identity Seal, break-glass — these **do** have live `ConditionsPanel.tsx`
  controls on web (confirmed, §4 above) and are therefore in-scope for full web parity, but are a
  reasonable candidate for E1.4 to explicitly defer as a fast-follow given their complexity (geolocation,
  a second KDF-derived wrap) relative to the core Address→Compose→Seal path — see §19.

---

## 5. Mobile reuse map

`[VERIFIED]` — from direct code reads (this audit) plus the dedicated Explore pass. See also §8 of the
master blueprint's own reuse matrix, cross-checked and found accurate for every row this section covers.

| Component/module | Exists? | Direction it supports | Reusable as-is for E1.4? |
|---|---|---|---|
| `api-client.ts`'s `request()` helper | Yes | Any verb | **Yes** — the helper itself is verb-agnostic (`GET\|POST\|PATCH\|PUT\|DELETE` already in its type); E1.4 adds new exported methods on `capsulesApi`/new `recipientsApi`/new `mediaApi` objects using the *same* helper, not a new one |
| `capsulesApi`, `receivedApi`, `notificationsApi`, `mediaApi` (existing) | Yes | Read-only | Reuse the pattern; every method is currently GET-only by explicit, stated design (own header comment) |
| `useAuth()`/`useMasterKey()` | Yes | N/A | **Yes, unchanged** — E1.4 needs the master key already resolved, which E1.2's architecture already guarantees by the time any authenticated screen mounts |
| `capsule-crypto.ts` | Yes | **Decrypt only** | Cannot be reused for encryption; needs a new sibling (e.g. `capsule-crypto-write.ts`) wired to `@tc/crypto`'s existing `generateCapsuleKey`/`wrapCapsuleKeyForOwner`/`encryptBytes` — these functions exist and are portable, just uncalled by any mobile app file today |
| `random.native.ts` | Yes | N/A | **Yes, already proven** (E1.3.12) — `generateAesKey`/`generateIv`/`generateSalt` are exactly what capsule-key generation and content/media encryption need |
| `tokens.ts` | Yes | N/A | Reuse directly; will likely need new tokens (form-field colors, additional spacing steps) as creation UI needs emerge — not a blocker, an incremental addition matching E1.3.2's own precedent |
| `LoadingState`/`EmptyState`/`ErrorState` | Yes | N/A | **Yes, directly reusable**, zero changes needed |
| `CapsuleRow` | Yes | N/A | Reusable for a "drafts" section on Home if E1.4 adds one (see §10) |
| Screen/test conventions (`capsule-detail.test.tsx`'s pattern) | Yes | N/A | **Directly reusable** — same `vi.mock('react-native', ...)`, same real-crypto-fixture-building pattern, same `flush()` macrotask-delay convention for async decrypt/encrypt chains |
| Navigation shell, tab layout | Yes | N/A | The tabs layout's own comment already names the gap: *"The 'New capsule' FAB is a modal action, not a tab route... these are placeholder screens establishing the shell a later ticket fills in"* — E1.4 **is** that later ticket |

**Nothing in this audit found a reason to build a second/competing crypto abstraction, a second API-client
pattern, or a second draft model.** Every new thing E1.4 needs is either a genuinely new file (write-side
crypto, drafts store, media picker UI) or an additive extension of an existing one (`api-client.ts` gains
methods; `tokens.ts` gains tokens) — never a fork of something that already exists.

---

## 6. Crypto boundary — traced primitive by primitive

`[VERIFIED]` unless noted. This is the highest-risk area per this ticket's own instruction; every claim
below is grounded in a specific file read this session or in a prior session's on-device evidence already
recorded in `plan/PROGRESS.md`.

### 6.1 `randomBytes` (capsule key, IV, salt generation)

- **Where it executes:** on-device, synchronously, in JS (no network, no server involvement).
- **Which key exists at that point:** none yet — this generates the *material* for a new capsule key or IV.
- **Where it comes from:** `packages/crypto/src/random.native.ts` (Metro-resolved automatically over
  `random.ts` for iOS/Android), backed by `react-native-libsodium`'s `sodium.randombytes_buf` — a real
  JSI-synchronous CSPRNG call into libsodium's own `randombytes_buf`.
- **Does it leave memory?** No.
- **Does the backend ever see it?** No — it's pure client-side generation.
- **Does RN have this primitive?** **Yes, as of E1.3.12** — `[VERIFIED]` via a real on-device test on a
  Pixel 7 emulator during E1.3.12: correct byte lengths, two independently-generated keys/IVs both
  differ, generated key is not all-zero, and — critically — a full `encryptBytes`/`decryptBytes`
  round-trip using the natively-generated key and IV succeeded on the real Hermes/JSI runtime
  (`plan/PROGRESS.md`'s E1.3.12 entry).
- **Tested?** Yes — 16 tests in `packages/crypto/src/random.native.test.ts`, genuinely exercising real
  CSPRNG output (not mocked) via the package's own WASM fallback build under Node.

### 6.2 `generateCapsuleKey`

- **Where it executes:** client-side, at first Compose-movement load (web's pattern) — a fresh capsule
  gets exactly one capsule key, generated once.
- **Which key exists:** the new capsule key itself (256-bit AES key), nothing else yet.
- **Source:** `packages/crypto/src/capsule-key.ts`'s `generateCapsuleKey()` → `generateAesKey()` → the
  primitive in §6.1.
- **Leaves memory?** No.
- **Backend sees plaintext or the key?** No — the *wrapped* key (see §6.3) is what eventually reaches the
  server, never the raw key.
- **RN support?** Yes, transitively via §6.1 — this function itself has zero platform-specific code (pure
  composition of already-proven primitives), confirmed by reading `capsule-key.ts`.
- **Tested/verified on-device?** The underlying `generateAesKey` is verified (§6.1). `generateCapsuleKey`
  itself has no dedicated mobile-app-level test yet because no mobile code calls it — this is exactly
  E1.4.3's job to add.

### 6.3 Owner-key wrap (`wrapCapsuleKeyForOwner`)

- **Where it executes:** client-side, immediately after §6.2, before any content exists.
- **Which key exists:** the capsule key (plaintext, in memory) AND the master key (already resolved by
  E1.2's architecture, in memory).
- **Source of the master key:** `useMasterKey()` — resolved at login or via `MasterKeyGate`'s password
  re-prompt, exactly as E1.2 built it; E1.4 does not need to touch this.
- **Leaves memory?** The *wrapped* result (`ownerKeyWrap`, ciphertext) is sent to the server via
  `PATCH /capsules/:id`; the raw capsule key and raw master key never leave the device.
- **Backend sees plaintext or a key?** No — only `ownerKeyWrap` (AES-GCM ciphertext of the capsule key,
  under the master key, no KDF involved — confirmed in the master blueprint's §7.1 table and unchanged
  since).
- **RN support?** Yes — this is a `crypto.subtle`-free operation on the AES-GCM path already proven by
  `aes.native.ts` (E1.2, `@noble/ciphers`, pure JS, zero WASM dependency).
- **Tested?** The AES-GCM primitive itself is tested extensively (`aes.native.test.ts`, cross-platform
  test vectors). The *mobile app calling it for this specific purpose* is untested because no mobile app
  code calls it yet.

### 6.4 Content encryption (`encryptBytes` on the `LetterEnvelope`)

- **Where it executes:** client-side, on every autosave (debounced ~3s on web) or on explicit flush.
- **Which key exists:** the capsule key, already resolved in memory (§6.2/6.3 already happened this
  session for this draft).
- **Leaves memory?** Only the ciphertext (`contentDocEnc`) is sent; the plaintext envelope and the capsule
  key stay client-side.
- **Backend sees plaintext?** No.
- **RN support?** Yes — same `aes.native.ts` path, already proven.
- **A genuinely new question for mobile, not answered by any existing test:** what *is* the letter
  content on mobile? Web serializes a TipTap `doc` JSON. **No RN rich-text editor is installed**
  (confirmed, §8) — E1.4.3 must decide whether to ship a plain-text `Text` field wrapped in a minimal
  TipTap-compatible doc shape (`{type:'doc', content:[{type:'paragraph', content:[{type:'text', text}]}]}`,
  matching exactly what `envelopeText()`'s existing paragraph-extraction logic already expects — this is
  the **lowest-risk** choice, since mobile's own `capsule-crypto.ts` decrypt path already parses this
  exact shape) or a real RN rich-text package (higher risk, new dependency, not required by the "match
  the existing product" instruction since web's own letter is not meaningfully "rich" beyond
  paragraphs today).

### 6.5 Recipient key handling

- **Where it executes:** nowhere, cryptographically — this is the one step in the entire chain that
  involves **no wrapping operation at all**.
- **Which key exists:** the capsule key, placed **bare** (base64url-encoded, unwrapped) into a URL
  fragment (`#k=...`) that is only ever constructed client-side and never sent to any server (browsers
  and native HTTP clients alike never transmit URL fragments in requests — this is the actual security
  boundary, not an added layer per `@tc/crypto`'s own README threat notes and `00-INDEX.md` rule 3b).
- **RN implication:** E1.4 must replicate `encodeCapsuleKeyForLink` (`capsule-key.ts`, already portable,
  zero platform dependency) to construct the same link format when the "announce" action fires — this is
  a trivial reuse, not new cryptography.
- **Do NOT wrap a key per recipient** — this would be inventing a different (and unnecessary) security
  model than the one the product actually ships.

### 6.6 Media encryption

- **Where it executes:** client-side, per file, **single-shot** (`encryptBytes`, not `encryptStream`) —
  confirmed directly: web's own `encryptForCapsule` reads the *entire* file into memory
  (`file.arrayBuffer()`) before calling `encryptBytes` once. The 8 MiB chunking that exists in this
  pipeline is an **HTTP transport concern** (multipart PUT parts), unrelated to and using a different
  constant (`PART_SIZE_BYTES`) from AES's own `STREAM_CHUNK_BYTES`/`encryptStream` machinery, which **web's
  composer does not use at all**.
- **Which key exists:** the same capsule key from §6.2, already resolved.
- **Backend sees plaintext?** No — bytes are encrypted before the first network call.
- **RN support?** Yes for the crypto call itself (`aes.native.ts`, proven). **Not yet built:** reading a
  picked file's bytes into memory on RN (`expo-file-system` or the picker's own URI→bytes API — no
  dependency for this exists yet, see §8) and the presigned-multipart-upload client logic itself (new
  code regardless of platform, since web's version is browser-`fetch`-specific but the *pattern* — PUT
  each part, collect ETags, POST complete — is directly portable).
- **A real, size-relevant question for E1.4.7:** large media fully in memory before encryption is
  `[INFERENCE]` fine at this product's typical file sizes (photos, short videos, voice notes — the
  product's own limits table in `01-PRODUCT.md §4.6` caps Free-tier files at 25 MB, Premium at 5 GB) but
  a very large Premium-tier video read entirely into RN JS-thread memory before encryption is a real
  performance/OOM risk on lower-end Android hardware that this audit did not benchmark — worth a
  deliberate size-based decision (stream in chunks via `encryptStream`, diverging from web's own
  single-shot approach) rather than a silent assumption that web's approach scales identically on mobile
  hardware. Flagged, not resolved.

### 6.7 Password-derived key behavior / recovery interaction

- **Not directly invoked by E1.4** — E1.4 only needs an *already-resolved* master key (§6.3), which login
  (E1.2) already guarantees. The Argon2id path (`kdf.native.ts`) is `[VERIFIED]` working but is not
  something E1.4's own code calls directly.
- **Recovery-code UI does not exist on any platform** (`[VERIFIED]`, confirmed by the E0.5 design spike's
  own executive verdict and re-confirmed by this session's own read of it) — this is a genuine,
  pre-existing gap, but it is orthogonal to E1.4: a user who can already see the compose screen has
  already produced a resolved master key one way or another. **Not a blocker for E1.4.** See §19 for its
  correct placement as a separate, parallel item.

### 6.8 Envelope serialization / wire-format encoding — a genuine open question

`[VERIFIED finding, INFERENCE on its resolution]` Read directly, this session:

- `packages/contracts/src/capsules.ts`'s own doc comment states `contentDocEnc`/`ownerKeyWrap` are
  **base64** (not base64url) on the wire; the backend's `patchCapsule`/`setOwnerKeyWrap` services decode
  via `Buffer.from(x, 'base64')`.
- `apps/web/src/lib/capsule-crypto.ts`'s `encodeIvCiphertext` confirms this exactly:
  `btoa(String.fromCharCode(...combined))` — standard base64, with `+`/`/` and `=` padding, **not**
  base64url.
- Mobile's `capsule-crypto.ts` (decrypt-only, today) calls `@tc/crypto`'s `fromBase64Url`
  (`packages/crypto/src/encoding.ts`), which is written to decode base64url but is *also*
  forward-compatible with standard base64 input (it only rewrites `-`/`_` if present, and only adds
  padding if the input isn't already a multiple of 4 characters — a well-formed, already-padded standard
  base64 string passes through unmodified into `atob`). This is why mobile has been able to decrypt real
  web-sealed capsule content in every prior on-device test this Stage E arc has performed.
- **The open question is the other direction.** When E1.4 mobile code *produces* a new `contentDocEnc`
  (or media ciphertext, or `ownerKeyWrap`) for the first time, it will naturally reach for `@tc/crypto`'s
  own `toBase64Url` (the only encoder that package exports) — which emits base64url (`-`/`_`, no
  padding), not standard base64. Node's `Buffer.from(x, 'base64')` (used server-side) is empirically known
  to accept base64url-alphabet input interchangeably with standard base64 — so this is very likely fine
  — but **this has never been tested for this exact field in this exact codebase.** No existing test
  proves `Buffer.from('<base64url-string>', 'base64')` round-trips correctly against this schema's own
  validation and the `bytea` column write path.
- **`[PREREQUISITE]` for E1.4.9 (cross-platform verification gate), not a blocker for starting E1.4:**
  either (a) write a small, explicit unit/integration test proving `Buffer.from(toBase64Url(...), 'base64')`
  round-trips correctly through the real API, before relying on it in the compose/media-write path, or
  (b) write a byte-for-byte-matching encoder (`btoa`-equivalent, standard alphabet) specifically for the
  fields that travel to this backend, matching web's own `encodeIvCiphertext` precisely rather than
  reusing `toBase64Url`. Either is a small amount of work; **not deciding this at all and simply assuming
  it works is the actual risk**, not the fix itself.

### 6.9 Documentation-vs-reality contradiction — the master blueprint's own crypto predictions

`[DOCUMENTED, not fixed]` `STAGE-E-MOBILE-V1-IMPLEMENTATION-BLUEPRINT.md §7.1`'s primitive table made two
specific technical claims that this repository's actual, shipped implementation contradicts:

1. It stated AES-256-GCM's RN path would be **`react-native-quick-crypto` polyfilling `crypto.subtle`
   directly.** What was actually built and shipped (E1.2) is `aes.native.ts`, using `@noble/ciphers` (a
   pure-JS library) — explicitly chosen *instead of* `react-native-quick-crypto` specifically to avoid
   that heavier native-module dependency (confirmed in `plan/PROGRESS.md`'s E1.2 entry and `aes.native.ts`'s
   own header comment). The blueprint's own §7.3 recommendation section, discussing the *Argon2id*
   blocker specifically, actually anticipated something like this ("a native module... behind the exact
   same function signature") — but its §7.1 table, discussing AES-GCM specifically, did not, and named
   the wrong mechanism.
2. It stated `crypto.getRandomValues` **"RN provides natively"** — flatly wrong, confirmed empirically
   during E1.3.12 (Hermes has no `crypto.getRandomValues` at all; this is precisely the gap
   `random.native.ts` closes). The blueprint's own hard-blocker section (§4) only named Argon2id as a
   blocker — it did not know randomness generation was also unavailable, because this fact was
   apparently never checked directly at the time that document was written.

**Neither of these was a design decision this audit should silently overwrite in the source document.**
Both are recorded here, and the resolution actually shipped (per-file `.native.ts` swaps, `@noble/ciphers`
+ `react-native-libsodium`, zero new heavyweight native dependency) is **better** than the blueprint's own
specific guess, not worse — the blueprint's *overall architecture* (swap points behind stable function
signatures, proven byte-for-byte against test vectors) was exactly followed; only its two specific
technology picks for AES-GCM and randomness were inaccurate predictions, later corrected by actually
building and testing the real thing.

### 6.10 `btoa`/`atob` availability — a previously-open item, now closed

`[VERIFIED]` The master blueprint flagged RN/Hermes's `btoa`/`atob` availability as an
`[OPEN DECISION]` needing direct verification, not assumption. This is now closed: mobile's real decrypt
path (`capsule-crypto.ts`'s `fromBase64Url`, itself `atob`-based) has been exercised successfully on a
real Android emulator across every E1.3.7–E1.3.11 on-device verification pass this Stage E arc has
performed, decrypting real ciphertext. `btoa`/`atob` are confirmed available and correct on this
project's exact RN 0.86/Hermes configuration.

---

## 7. Backend contract

`[VERIFIED]` — full trace performed against `packages/contracts/src/{capsules,media,recipients}.ts`,
`apps/api/src/modules/{capsules,media,recipients}/{routes,service}.ts`, `apps/api/src/modules/capsules/
{lifecycle,state-machine,versions}.ts`, `apps/api/src/db/schema/capsules.ts`, `apps/api/src/middleware/
idempotency.ts`.

### 7.1 What the mobile client must submit

| Step | Endpoint | Body | Notes |
|---|---|---|---|
| Create | `POST /capsules` | `{type: CapsuleTypeSchema}` | Only field settable at creation; row starts `state: 'draft'`, every other column at its DB default |
| Patch/autosave | `PATCH /capsules/:id` | `PatchCapsuleRequestSchema.partial()` — **any subset** of ~18 fields | True partial merge — omitted keys are untouched; an explicit `null` clears a field. **No dedicated autosave endpoint** — it's the same PATCH, called repeatedly, debounced client-side |
| Seal | `POST /capsules/:id/seal` | **No body at all** | All validation reads the already-persisted draft row |
| Add recipient | `POST /capsules/:id/recipients` | `{email? \| phone?, displayName?, isFallback?, fallbackAfter?}` | At least one of email/phone required |
| Media ticket | `POST /capsules/:id/media/tickets` | `{name, mime, sizeBytes, position?}` | `sizeBytes` is the **encrypted** length, client-declared (server re-verifies at complete, §7.4) |
| Media complete | `POST /media/:id/complete` | `{parts: [{partNumber, eTag}], encMeta?, durationMs?, width?, height?, blurhash?}` | |

### 7.2 Exact ciphertext formats

- `contentDocEnc`, `ownerKeyWrap`: **base64** (standard, not base64url) on the wire; `bytea` in Postgres;
  service layer does `Buffer.from(x, 'base64')` inbound, `.toString('base64')` outbound. See §6.8 for the
  open question this creates for mobile's *own* encoder.
- Media ciphertext: raw encrypted bytes, uploaded directly as HTTP PUT bodies to presigned URLs — not
  JSON-embedded, no base64 layer at all for the file bytes themselves.

### 7.3 Seal semantics — exact bounds, not assumed

```
MIN_UNLOCK_LEAD_MS = 5 * 60 * 1000            // 5 minutes
MAX_UNLOCK_HORIZON_MS = 50 * 365.25 * 24 * 60 * 60 * 1000   // 50 years
```
Both `PATCH` (if `unlockAt` present) and `seal` re-validate these bounds server-side — the client's own
validation is a UX convenience, never the actual enforcement. `sealCapsule` also requires:
`unlockAt` set, `seals` valid (max 3 beyond Time, no duplicates, legacy-type restricted to identity-only),
**every** media row for the capsule `status === 'ready'` (any other status → `upload_incomplete`, 409),
the owner's active-sealed-capsule plan limit not exceeded, and a computed media-retention date that
doesn't precede `unlockAt`. On success: a single `UPDATE` moves `draft → sealed` directly — **the
`sealing` enum value exists in the schema but is never actually written by this code path.**

### 7.4 Draft vs. sealed behavior

`assertCanPatch` throws `capsule_sealed` (409) for any `PATCH`/media-ticket/media-complete/media-patch/
media-delete call once `state !== 'draft'` — sealed content truly is immutable at the service layer, not
just hidden in the UI, satisfying `00-INDEX.md` rule 1. Recipients are the one exception: they remain
editable in **any** state except `unlocked`/`expired`/`withdrawn` (i.e., recipients can still be added
even after sealing, up until unlock) — a real, specific nuance mobile must not flatten into "recipients
lock at seal."

### 7.5 Idempotency — the real state, not the aspirational one

`00-INDEX.md` rule 6 states "every POST with side effects honors `Idempotency-Key`." **This is true in the
narrow sense that the middleware exists and is wired to most side-effecting POSTs** (`seal`, `duplicate`,
`trash`, `restore`, `withdraw`, `extend`, `purge`, `media/tickets`, `media/release`, `media/:id/complete`,
recipient create/resend/announce) — but:

- `[VERIFIED — a real gap]` **`POST /capsules` (create) and every `PATCH /capsules/:id` (including
  autosave) have zero idempotency protection.** A retried capsule-create from a flaky mobile network
  would create a genuine duplicate draft.
- `[VERIFIED]` **No existing client (web) ever actually sends the `Idempotency-Key` header on any
  request.** The middleware is dormant server capability today, not an active behavior anywhere in the
  product. A mobile client wanting idempotent retries must generate and send this header itself — new
  client-side work, nothing to port.
- `[VERIFIED]` Seal specifically is **naturally idempotent by rejection, not by no-op**: a second seal
  call on an already-sealed capsule reliably 409s (`capsule_sealed`) before any side effect re-runs. The
  header, where sent, only helps the narrower case where the *first* request's response was lost to the
  client before a 200 arrived (avoiding a spurious 409 on retry).

`[PREREQUISITE for E1.4.1 and E1.4.8]`: mobile's own create and seal call sites should generate and send a
real `Idempotency-Key` (a client-generated UUID, one per logical attempt, not regenerated on retry) —
this is genuinely new client behavior, not a port, and directly protects against the create-duplication
failure mode `00-INDEX.md` itself already requires be prevented.

### 7.6 Error responses (the ones E1.4 will actually hit)

`capsule_sealed` (409, patch/seal on non-draft) · `unlock_in_past` (422, schedule bounds) ·
`validation_failed` (400, generic + missing-unlockAt-at-seal + seal/retention edge cases) ·
`upload_incomplete` (409, non-ready media at seal, or object missing from storage at complete) ·
`quota_exceeded` (403, active-capsule limit, storage quota, recipient limit, seal-stacking limit) ·
`file_too_large` (413) · `unsupported_media_type` (415) · `recipient_locked` (409, post-unlock recipient
edit attempt) · `recipient_already_added` (409) · `velocity_limit_exceeded` (429, new-account recipient
throttle) · `not_found` (404, ownership mismatch — masked, never 403) · `idempotency_conflict` (409).
Every one of these needs specific, non-generic mobile copy per this ticket's own "no generic error
message reachable anywhere" discipline (already the pattern `ErrorState`'s design assumes).

---

## 8. Media / enclosure status

**Media is in scope for E1.4** — `EXECUTION-BACKLOG.md`'s own Phase 4 breakdown includes it explicitly
(`E4.4`–`E4.6`), and the master blueprint's Decision 16 ("offline media unsupported") presupposes online
media *is* being built, just not offline media.

`[VERIFIED]` Full existing pipeline (§7 above, §4.2's flow diagram) — **not invented by this audit**,
traced from real code:
`file selection → client-side single-shot AES-GCM encryption → presigned S3/R2 multipart ticket →
direct PUT per 8MB part → complete-with-ETags (server re-verifies real object size, can roll back a
declared-size lie) → media row status 'ready' → capsule association is implicit (rows are already
capsule-scoped) → release/open lifecycle is unchanged, existing, and out of E1.4's scope (that's
reveal-side, E1.5-equivalent)`.

**What React Native genuinely needs that does not exist today** (`[VERIFIED]`, confirmed absent from
`apps/mobile/package.json` and `app.json`):
- `expo-image-picker`, `expo-camera`, `expo-document-picker` — file/photo/camera selection.
- `expo-av` or `expo-audio` — voice recording and playback.
- Corresponding `app.json` plugin entries **and** `ios.infoPlist` usage-description strings
  (`NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSPhotoLibraryUsageDescription`) **and**
  `android.permissions` entries (`CAMERA`, `RECORD_AUDIO`, `READ_MEDIA_IMAGES`) — **none of this exists in
  the current `app.json` at all**, confirmed by reading it in full.
- A way to read a picked asset's URI into raw bytes for encryption (`expo-file-system` or the picker's own
  base64/URI output) — no such dependency exists yet either.

**Do not invent a new media architecture** — the presigned-multipart-to-R2 pattern is real, live, and
correct; mobile's job is a new *client* for an unchanged *protocol*.

---

## 9. Draft persistence

`[VERIFIED]` This needed real investigation, not assumption, and produced a genuine correction to the
master blueprint's own claim.

**The master blueprint (§6.1) stated:** *"there is no local persistence layer on web at all today for
drafts — a closed tab loses anything not yet autosaved."* **This is contradicted by direct code reading:**
`apps/web/src/lib/use-capsule-draft.ts` maintains a real `localStorage` cache (`tc:draft:${capsuleId}`,
holding `{contentDoc, patch, savedAt}`), written synchronously on every `patch()`/`setContentDoc()` call,
read back on mount, and only cleared after a successful autosave PATCH. A second key
(`tc:draft:${capsuleId}:recipient-tokens`) separately persists one-time recipient access tokens. The
guest flow (`use-guest-draft.ts`) goes further — the **entire** draft lives in `sessionStorage` with no
server round-trip until seal.

**This matters for E1.4 because it changes the framing of what mobile is building:** it is not
introducing local drafts as a wholly new concept web has none of — it is introducing an **encrypted**
local draft cache where web's own equivalent is **plaintext**. This is a real, pre-existing,
web-side security-adjacent characteristic (unrelated to mobile, not something this audit is asked to fix,
flagged per this session's "record contradictions" instruction and left alone).

**What E1.4 mobile must build (per Decisions 4/7/16, `STAGE-E-MOBILE-V1-IMPLEMENTATION-BLUEPRINT.md §6`):**

- **Exact data persisted:** text draft fields only (letter body, any recipient-facing notes) — **never**
  media (Decision 16: media requires connectivity, full stop) and **never** a sealed/sealing state
  (Decision 7: no offline sealing, no "queued" pseudo-state).
- **Plaintext allowed?** No — encrypted at rest under a **device-local draft-encryption key**, held in
  `expo-secure-store` (non-biometric-gated), **deliberately independent of the master key** — a draft
  written offline before the day's first unlock (cold app start, no network to validate a session against
  yet) still needs to encrypt something, and the master key may not exist in memory at that moment.
- **Storage mechanism:** `expo-sqlite` (`[RECOMMENDATION]`, per the master blueprint's own reasoning — the
  Expo-native option, no new third-party native module, structured-data shape fits better than a
  key-value store). **Not installed yet** — confirmed absent from `apps/mobile/package.json`.
- **Lifecycle:** insert on offline edit → sync via the same `PATCH /capsules/:id` mobile will already have
  for E1.4.3, re-encrypted under the real master-key-wrapped capsule key at that point → delete the local
  row on confirmed sync. **Logout: unconditional wipe of every local draft row for that account** (never a
  lingering plaintext-adjacent residue from a logged-out account). **The device draft-encryption key
  itself is not deleted on logout** — it's device-scoped, not account-scoped; deleting it would strand any
  other account's not-yet-synced draft on a shared device.
- **After authentication expiry:** the local draft row itself doesn't care (it's encrypted under a
  device key, not a session-dependent one) — only the *sync* step needs a valid session, and a session
  refresh/re-login can resume it without touching the local row.

---

## 10. Navigation architecture

`[VERIFIED existing state]` / `[RECOMMENDATION new]`

- **Entry point:** confirmed absent today. The tabs layout's own comment already names the intended shape:
  a persistent FAB (not a 5th tab), opening the Address movement directly — matching both the master
  blueprint's §9.2 recommendation and the live web product's `/capsule/new` entry semantics (create-then-
  redirect-to-edit).
- **Route shape (`[RECOMMENDATION]`, following the existing `app/(app)/capsule/[id].tsx` precedent of a
  stack route outside the tabs group):** a new `app/(app)/compose/` (or similar) route group, pushed from
  the FAB, containing Address/Compose/Seal as either three separate pushed screens or three
  internally-managed "movements" within one route (mirroring web's own single-container, three-movement
  pattern rather than three separate stack entries — this avoids fighting Expo Router's own back-stack
  semantics for what is conceptually one freely-navigable object, not three destinations).
- **Draft persistence across app restarts:** per §9 — a killed app resumes into whichever movement the
  local encrypted draft was last in, matching SQLite's own durability guarantee.
- **Back/cancel behavior:** per web's own precedent — closing mid-compose keeps the local draft (never
  discards), no confirmation dialog invented that web itself doesn't have.
- **Unsaved-change behavior:** the encrypted local draft **is** the unsaved-change protection — there is no
  separate "are you sure" needed if closing never actually discards anything.

---

## 11. Error/retry/idempotency

Covered in depth in §7.5/§7.6. Summary of the mobile-specific behavior this audit recommends, since the
backend is not naturally idempotent for create/patch:

| Failure | Mobile behavior |
|---|---|
| Network failure during create | Retry is **not automatically safe** (§7.5) — mobile must send its own `Idempotency-Key` on the create call, or accept the small risk of a duplicate draft (recoverable — draft is not the sealed artifact, and a stray extra draft is a data-hygiene issue, not a security or correctness one) |
| Network failure during autosave PATCH | Safe to retry unconditionally — PATCH is a partial merge, not additive; a retried identical PATCH produces the same end state |
| Network failure during seal | Retry is safe **by rejection** — a successful-but-response-lost seal followed by a naive retry gets a `capsule_sealed` 409, not a duplicate seal; mobile's error handling for this specific 409 on a *user-initiated* seal retry should say "this may already be sealed — check your capsules" rather than a generic seal-failure message, since the two situations (never sealed vs. sealed-but-response-lost) look identical from the client's perspective |
| Duplicate submission (double-tap) | Client-side: disable the Seal button on first tap (matches web's own `disabled={enclosuresInFlight>0 \|\| ...}` pattern) — cheap, sufficient, already how web prevents this |
| App termination during submission | Seal is a single synchronous request (matches web); nothing mid-flight to corrupt beyond the already-covered retry case above. Media upload mid-flight: the ticket/part/complete sequence has no resume-after-kill logic anywhere in this codebase today (web doesn't have it either) — an interrupted upload simply needs to be re-attempted from the ticket step |
| API timeout after a successful server mutation | Same as "response lost" above — this is exactly what `Idempotency-Key` protects against where wired, and exactly the gap where it isn't (create, patch) |
| Invalid recipient/date | Server-side validation is authoritative (§7.3/§7.6); mobile's own client-side check is a UX nicety mirroring `schedule-validity.ts`'s bounds, not the real gate |
| Encryption failure | AES-GCM's own auth-tag guarantee means a wrong-key/corrupted decrypt always throws rather than silently returning wrong plaintext — this is an existing, proven guarantee (§6), not new work; mobile must not swallow this into a generic catch |
| Master key unavailable | Cannot happen inside the compose flow under the current architecture — `MasterKeyGate` blocks the entire authenticated shell until a key exists in memory, so compose screens structurally never mount without one |
| Insufficient device storage (for local drafts) | Not addressed by any existing document; `[FOLLOW-UP]` — a real but low-probability edge case (a device out of storage has bigger problems than a failed SQLite write) |
| Expired session mid-compose | The existing `api-client.ts` refresh-on-401 pattern (already built, E1.2) already handles this transparently for any authenticated call E1.4 makes — no new work needed here |

---

## 12. Security audit

`[RECOMMENDATION]`, threat-model pass specific to creation (browsing's own threat model was already
covered by E1.3.11's security review; this section is additive, not a re-audit of browsing).

| Threat | Assessment | Severity |
|---|---|---|
| Plaintext leaving the device | Structurally prevented by the existing `encryptBytes`-before-any-network-call pattern, if E1.4 follows it exactly as traced in §4.2/§6 | N/A if followed |
| Master-key transmission | Never happens anywhere in this flow (§6.3) — only the *wrapped* capsule key travels | N/A |
| Capsule-key transmission | Never in the clear — wrapped for owner (§6.3), bare only inside a URL fragment that never reaches a server (§6.5) | N/A |
| Keys written to logs | No logging dependency exists in `@tc/crypto` by design (its own README states this); mobile app code must maintain the same zero-`console.*`-with-key-material discipline E1.2/E1.3.x already established and tested for | **HIGH** if violated — must be grepped at review time, same as every prior ticket |
| Plaintext written to logs | Same discipline — the letter content itself must never appear in a `console.*` call, error message, or crash-report breadcrumb | **HIGH** if violated |
| Plaintext in AsyncStorage/SecureStore unnecessarily | The draft architecture (§9) is explicitly encrypted-at-rest; anything that bypasses this (e.g. a debugging `AsyncStorage.setItem('draft', plaintext)`) would be a direct regression | **BLOCKER** if found in review |
| Ciphertext incorrectly encoded | §6.8's base64/base64url question — a mismatch wouldn't be a security leak per se (the ciphertext is still ciphertext either way) but would silently corrupt real user capsules if the round-trip is wrong | **HIGH** — must be proven, not assumed, before shipping any mobile-authored capsule |
| Recipient key confusion (wrong recipient gets a link meant for another) | Not a new risk E1.4 introduces — the link-construction logic (§6.5) is a straight port of an existing, working pattern; the only new mobile-specific risk is a UI bug that associates the wrong recipient's token with the wrong announce action, which is a logic-testing concern, not a crypto one | MEDIUM, test-coverage question |
| Wrong-user capsule creation | Prevented server-side by `findOwnedCapsuleOrThrow`'s ownership check on every capsule-scoped route (masked as 404, not 403) — mobile inherits this for free | N/A |
| Replay/duplicate sealing | Covered in §7.5/§11 — real gap on create, safely rejected (not replayed) on seal | MEDIUM (create), LOW (seal) |
| Partial upload state | No resumability exists anywhere in this codebase (web included) — an interrupted upload is simply retried from the ticket step; this is an existing, accepted product characteristic, not a new mobile gap | LOW, pre-existing |
| Leaked media | The server-side actual-size re-verification (`commitActualStorageUsage`) already prevents a client from lying about size to bypass quota; nothing E1.4-specific changes this | N/A |
| Insecure random fallback | Explicitly ruled out by `random.native.ts`'s own design (§6.1) — throws rather than degrading | N/A |
| Accidental global `crypto` mutation | No file in this audit's scope touches `globalThis.crypto` — `random.native.ts`/`aes.native.ts`/`kdf.native.ts` are all Metro-resolved file swaps, never a runtime polyfill installation | N/A |

**Classification note:** no `BLOCKER`-severity finding exists *today*, because no E1.4 code exists yet to
contain one — the `BLOCKER` row above describes what a future review must catch, not something already
present.

---

## 13. Accessibility considerations

`[RECOMMENDATION]`, extending E1.3.11's already-established mobile conventions (grouped accessible
blocks, `accessibilityRole="header"` for section headings, state communicated as text never color alone,
safe-area-aware interactive elements) rather than inventing new ones:

- **Address movement:** recipient chips and horizon/date candidates need clear accessible names
  (recipient name + how to remove; each horizon candidate's full reading, e.g. "Amara will be 10," not
  just a bare date) — directly analogous to `CapsuleRow`'s existing composed-label pattern.
- **Compose movement:** the letter editor itself needs standard text-input accessibility (label, hint);
  the voice recorder's elapsed-time readout must be **periodically announced**, not just visually updated
  — the master blueprint's own §21 Phase 4 DoD calls this out explicitly as "a genuinely mobile-only
  accessibility case."
- **Seal/Review movement:** since this screen *is* the letter re-rendered, it should inherit the exact
  same paragraph-by-paragraph reading order already proven correct on the read-side detail screen
  (E1.3.8/E1.3.11) — this is a real opportunity to reuse a rendering pattern, not just a principle.
  Irreversibility copy ("Once sealed... you can withdraw it any time before it opens") must be read as
  part of the same accessible flow as the Seal button, not a separate, missable element.
- **Conditions detour (if built in E1.4 — see §19):** must not read as a modal trap; standard sheet/
  dialog accessibility (focus trap, dismiss announced).
- **Full VoiceOver/TalkBack pass is its own ticket** (E1.4.11/E4.10 in §3.2), matching E1.3.11's own
  precedent of accessibility as a dedicated end-of-phase pass, not a per-ticket afterthought — though
  per E1.3.11's own lesson, obvious defects (unlabeled interactive elements) should still be caught inline
  during E1.4.1–E1.4.10, not deferred wholesale.

---

## 14. Responsive/mobile considerations

`[RECOMMENDATION]` — this ticket does not ask for a small-screen check the way E1.3.11 did for read-only
screens, but the same principle applies: the letter/review surface (§6.4, §4.4) is exactly the kind of
content that reveals cramped-layout bugs only at a genuinely narrow width. `[RECOMMENDATION]` verify the
Compose and Seal/Review screens on at least one small-width profile (e.g., the smallest currently-relevant
device width) in addition to whatever default emulator profile is used, consistent with the master
blueprint's own §8 recommendation (never fully executed for the read side, worth actually doing here since
Compose is the one screen "with no web equivalent to reference at all," per `design/21-CAPSULE-CREATION-
V2.md §IV`).

---

## 15. Test strategy

`[RECOMMENDATION]`, following the exact conventions already established in `capsule-detail.test.tsx`
(real crypto fixtures via `@tc/crypto`, `vi.mock('react-native', ...)`, macrotask-based `flush()`).

**UNIT**
- New write-side crypto file (`capsule-crypto-write.ts` or similar): capsule-key generation produces
  correct byte length and independence across calls (mirroring `random.native.test.ts`'s own pattern);
  `encryptBytes` round-trips through `decryptBytes` for a real `LetterEnvelope`; owner-key-wrap round-trips
  through `unwrapCapsuleKeyForOwner` (already-tested primitive, new call-site test).
- Draft store (`drafts.ts`): insert/read/delete lifecycle against a real (or in-memory) SQLite instance;
  encryption/decryption round-trip under the device draft key; cleanup-on-logout wipes all rows.
- Validation: schedule bounds (mirror `schedule-validity.ts`'s exact 5min/50yr logic, or better, share it
  if it can be lifted into a portable module — currently web-only).
- Recipient input parsing/validation (email vs. phone heuristic, matching web's own regex).
- State transitions: Address → Compose → Seal movement navigation logic, completeness gating
  (`firstCompletenessBlocker`-equivalent).

**INTEGRATION**
- New `capsulesApi.create/patch/seal` methods against real contract schemas (`@tc/contracts`), confirming
  request/response shapes match exactly what the backend agent's trace in §7 documents.
- A full encrypt→PATCH→(mocked or real) fetch→seal chain, proving the exact sequence in §4.2's flow
  diagram, mirroring `capsule-detail.test.tsx`'s "genuine integration test of fetch → classify → decrypt →
  render" philosophy but for the write direction.
- Error-response handling for every code in §7.6 — one test per code, confirming specific (not generic)
  copy is shown.

**SCREEN**
- Compose: renders/edits the letter, autosave debounce fires correctly, draft persists across a simulated
  remount.
- Address: recipient add/remove, schedule picker producing correct `unlockAt`/`unlockLocal`.
- Settings/Conditions (if built, §19): each toggle patches the correct field.
- Review/Seal: renders the real letter/enclosures/address (not a summary), Seal button disabled during
  in-flight enclosures or an unresolved schedule problem, success navigates correctly, each error code
  shows its specific copy.
- Success: correct post-seal navigation target.

**SECURITY**
- Static source-scan tests (matching the existing `capsule-detail.test.tsx` convention exactly): the new
  compose/address/seal screen files never import `expo-secure-store`/`AsyncStorage`/`token-store` directly
  (master key must flow only through `useMasterKey()`); no `console.*` call anywhere in the diff; no test
  or rendered string ever contains raw ciphertext or key material (mirroring the existing "never renders
  raw ciphertext... in any user-facing string" test pattern from `capsule-detail.test.tsx`).
- A dedicated test proving the draft store never persists plaintext outside the encrypted path — e.g.
  reading the raw SQLite row bytes in a test and asserting the letter text does not appear verbatim.
- A dedicated test for §6.8: `Buffer.from(toBase64Url(bytes), 'base64')` (or whatever encoder E1.4
  actually chooses) round-trips byte-for-byte, run as an actual Node-side assertion against the real
  encode/decode functions, not assumed.

**DEVICE**
Per this ticket's own explicit call-out — **the single most valuable acceptance test for the whole
ticket:**

```
MOBILE, on a real Android emulator/device, real backend:
  compose a real letter
  → generate a real capsule key (random.native.ts, JSI, no mock)
  → encrypt the real content (aes.native.ts)
  → PATCH it to the real backend
  → seal it for real (POST /capsules/:id/seal)
  → navigate to (or deep-link into) the existing E1.3.8 capsule-detail screen
  → decrypt it back through the existing, already-proven read path
  → confirm the exact original text comes back
```
This proves the entire write/read cryptographic contract end-to-end, on real hardware, using **only code
this ticket and E1.3.7/E1.3.8 already own** — no new verification infrastructure needed, just wiring the
new write path into the already-proven read path. `[RECOMMENDATION]` this exact test should be treated as
E1.4's own phase-closing gate criterion (mirrors `E4.8`'s own stated objective in §3.2), and additionally,
per this ticket's own instruction to prove real cross-platform compatibility: **a capsule sealed on mobile
should also be opened correctly on the real web app**, not only read back through mobile's own detail
screen — this is the test that actually proves §6.8's open question is resolved, not merely that mobile
is self-consistent.

---

## 16. Manual/device verification plan

`[RECOMMENDATION]`, matching the rigor already established for E1.2/E1.3.x:

1. Android emulator, real backend, disposable seed account (matching every prior ticket's own pattern).
2. Full Address → Compose → Seal walkthrough with real user input (not fixture data) — real recipient
   email, real schedule pick, real typed letter text.
3. At least one real media attachment (a real image file) through the full encrypt→ticket→upload→complete
   sequence, confirmed `ready` before seal is attempted.
4. A deliberate schedule-bounds violation (too soon, too far) confirming the exact client-side copy
   matches §7.3's bounds and the server's own rejection.
5. A deliberate network interruption mid-autosave and mid-upload, confirming the retry/error behavior
   matches §11's table, not a crash or silent data loss.
6. App-kill mid-compose (matching E1.2's own `am force-stop` technique), relaunch, confirm the local
   encrypted draft survived and is not visible as plaintext anywhere on disk.
7. The full cross-platform proof from §15's DEVICE section — mobile-sealed capsule opens correctly on
   mobile's own detail screen AND on the real web app.
8. iOS: build/render verification only, consistent with every prior ticket's own honestly-reported
   limitation around interactive Fabric `TextInput` automation on this specific tooling — **do not claim
   interactive iOS verification unless a different approach or a physical device actually achieves it.**
9. Disposable test data cleanup afterward, matching every prior ticket's own established scratch-script
   convention.

---

## 17. Dependency graph

```
E1.2 (auth/master-key, DONE) ─┬─────────────────────────────────────────┐
E1.3.7 (decrypt utility, DONE) ┤                                        │
E1.3.12 (native randomness, DONE) ┘                                     │
                                                                          │
E1.4.1 (Address) ── needs E1.2                                          │
E1.4.2 (Recipients) ── needs E1.4.1                                     │
E1.4.3 (Compose + capsule-key + encrypt) ── needs E1.4.1, E1.2, E1.3.12  │
E1.4.4 (Local encrypted drafts) ── needs E1.4.3, new expo-sqlite dep     │
E1.4.5 (Media source sheet) ── needs E1.4.3, new picker deps            │
E1.4.6 (Voice recorder) ── needs E1.4.5                                 │
E1.4.7 (Media encrypt+upload) ── needs E1.4.5, E1.3.12                  │
E1.4.8 (Review/Seal) ── needs E1.4.1–E1.4.7                             │
E1.4.9 (Cross-platform verification gate) ── needs E1.4.8, E1.3.8 ──────┘
E1.4.10 (Error/validation pass) ── needs E1.4.1–E1.4.8
E1.4.11 (Accessibility pass) ── needs E1.4.1–E1.4.10, E1.3.11's conventions
```

No cycle. E1.4.3 is the one ticket every media-related ticket and the Seal ticket transitively depend on —
it is correctly the highest-priority, first-built item, matching `EXECUTION-BACKLOG.md`'s own explicit
"Parallelizable: No — this is Phase 4's core and highest-risk ticket" framing for its `E4.3`.

---

## 18. Parallelization plan

`[RECOMMENDATION]`

| Track | Content | Can start when | Must NOT run concurrently with |
|---|---|---|---|
| A | E1.4.1 (Address) | Immediately | — |
| B | E1.4.2 (Recipients) | Alongside A's early scaffolding | Shares `capsulesApi`/new `recipientsApi` additions with A — coordinate the API-client file, do not both add methods to it unreviewed |
| C | E1.4.3 (Compose + capsule-key + encryption) | After A exists enough to hand off `capsuleId` | **Nothing** — per `EXECUTION-BACKLOG.md`'s own explicit instruction, this is the one ticket that should not be raced or split across two people, since it's both the highest-risk item and the one every later media/seal ticket depends on |
| D | E1.4.4 (local encrypted drafts) | Alongside C, integrated once both exist | Do not have two people independently designing the draft-key architecture — one person/session owns §9's design once, matching this project's own established "one crypto abstraction, not two" discipline |
| E | E1.4.5 (Media source sheet) | After C | Alongside E1.4.6 |
| F | E1.4.6 (Voice recorder) | After E1.4.5's permission flow | Alongside E1.4.5 |
| G | E1.4.7 (Media encrypt+upload) | After E1.4.5 | **Do not parallelize against E1.4.3** if the same engineer(s) are building both — the shared capsule-key-resolution code path should be built once |
| H | E1.4.8 (Review/Seal) | After A–G | Nothing — phase's final integration point, same as web's own `SealMovement` being the last thing to receive every other movement's output |
| I | E1.4.9 (cross-platform gate) | After H | Nothing — this is a verification gate, not parallel build work |
| J | E1.4.10 (errors), E1.4.11 (accessibility) | After H | Each other — genuinely independent cross-cutting passes |

**Shared files that must not be implemented simultaneously by two different tracks without coordination:**
`apps/mobile/src/lib/api-client.ts` (every new `capsulesApi`/`recipientsApi`/`mediaApi` write method lands
here — exactly the class of race the E1.3-era audits already warned about for the read-side equivalent),
the new capsule-key/write-crypto file (one canonical implementation, not two competing ones), and the
draft-key architecture (§9) — same reasoning.

---

## 19. Blockers / prerequisites

**`[BLOCKER]`: none.** No technical blocker prevents starting E1.4. This is a genuine, evidence-based
conclusion, not an assumption — every crypto primitive E1.4 needs is `[VERIFIED]` working (§6), the
backend contract already exists and needs no changes to unblock the client (§7), and every piece of
existing mobile infrastructure E1.4 needs to build on top of is stable and unchanged (§5).

**`[PREREQUISITE]`s** (must happen before or alongside specific sub-tickets, not before E1.4 as a whole):

1. §6.8's base64/base64url round-trip must be explicitly proven before E1.4.9 (the cross-platform gate)
   is considered complete — a small, cheap check, not a redesign.
2. New Expo dependencies (`expo-image-picker`, `expo-camera`, `expo-av`/`expo-audio`,
   `expo-document-picker`, `expo-sqlite`) and their corresponding `app.json` plugin entries and iOS/Android
   permission strings must be added before E1.4.5/E1.4.6/E1.4.4 respectively can start — none is a
   `[BLOCKER]` (all are standard, well-precedented Expo modules with zero architectural risk), but none
   exists today and each is a small, explicit prerequisite step for its own ticket.
3. A decision on the letter's actual content shape for mobile (§6.4) — recommended: the minimal
   TipTap-compatible paragraph-doc shape mobile's own decrypt path already parses, not a new rich-text
   editor dependency — should be made explicitly before E1.4.3 starts, not discovered mid-implementation.
4. Mobile's own `Idempotency-Key` generation for create/seal (§7.5) should be designed alongside E1.4.1/
   E1.4.8, not retrofitted afterward.

**`[FOLLOW-UP]`s** (real, but explicitly out of E1.4's scope — do not absorb):

- Recovery-code UI (still doesn't exist on any platform) — orthogonal to E1.4, which only needs an
  already-resolved master key.
- Place Seal / Passphrase Seal / Identity Seal / break-glass conditions — these exist on web today
  (§4.5) and are therefore legitimately in-scope for full parity, but are a reasonable, explicit
  descope candidate for E1.4's first pass given their added complexity (geolocation permission flow, a
  second Argon2id-derived wrap) relative to the core Address→Compose→Seal path. `[FOUNDER DECISION]`
  whether E1.4 ships without them (fast-follow) or includes them from the start.
- Biometric "Protect my capsules" — unrelated to creation, already correctly scoped to a later phase.
- Offline media, offline sealing — explicitly, permanently out of scope per Decisions 7/16, not a
  "not yet," a "never" for this architecture.
- Guest/`/try`-equivalent composer on mobile — Decision 2 (authenticated-first, guest deferred) already
  rules this out for all of Mobile V1, not just E1.4.

---

## 20. Recommended implementation order

`[RECOMMENDATION]`, restating §17/§18 as a single ordered sequence for a session that must proceed
linearly rather than in parallel tracks:

1. **Prerequisites** (§19): add the four new Expo dependencies + `app.json` permission/plugin entries;
   decide the letter content shape; decide the `Idempotency-Key` approach.
2. **E1.4.1 — Address** (create + patch wiring, recipient-free schedule/type selection).
3. **E1.4.2 — Recipients** (alongside or immediately after).
4. **E1.4.3 — Compose + capsule-key generation + content encryption** (the core, highest-risk ticket —
   do not split across sessions/engineers without one person owning the crypto call sites end to end).
5. **E1.4.4 — Local encrypted drafts** (can begin once E1.4.3's capsule-key resolution exists).
6. **E1.4.5/E1.4.6 — Media source sheet + voice recorder** (UI-only, genuinely parallel to each other).
7. **E1.4.7 — Media encryption + upload** (the second highest-risk ticket — proves cross-platform media
   compatibility).
8. **E1.4.8 — Review/Seal** (final integration point).
9. **E1.4.9 — Cross-platform verification gate** (the phase-closing proof, §15's DEVICE test).
10. **E1.4.10 — Error/validation pass**, **E1.4.11 — Accessibility pass** (parallel to each other).

**Exact first implementation ticket for the next session: E1.4.1 (Address movement), with the
prerequisite dependency additions (step 1 above) done as part of the same ticket's setup, not a separate
ticket of their own** — this mirrors how E1.3.1 (API client extension) absorbed its own small setup cost
rather than spawning a standalone "add a dependency" ticket.

---

## 21. Files likely to change

`[RECOMMENDATION]`, new files unless noted:

- `apps/mobile/app.json` (modify — plugins, iOS/Android permissions)
- `apps/mobile/package.json` (modify — new Expo dependencies)
- `apps/mobile/src/lib/api-client.ts` (modify — new `capsulesApi.create/patch/seal`, new
  `recipientsApi.create/delete`, new `mediaApi.createTicket/complete/patch/delete`)
- `apps/mobile/src/lib/capsule-crypto-write.ts` (new, or an extension of `capsule-crypto.ts` — the
  write-direction crypto: capsule-key generation, owner-wrap, content/media encryption)
- `apps/mobile/src/lib/drafts.ts` + a `expo-sqlite`-backed migration file (new — local encrypted draft
  store)
- `apps/mobile/app/(app)/compose/` (new route group — Address/Compose/Seal screens, exact file names TBD
  by whichever session builds E1.4.1)
- `apps/mobile/src/components/` — new: recipient input, horizon/date picker, media source sheet, voice
  recorder, review surface — likely 5–8 new component files
- `apps/mobile/src/lib/tokens.ts` (modify — additive new tokens as needed, matching E1.3.2's own precedent)
- `apps/mobile/app/(app)/(tabs)/_layout.tsx` or `home.tsx` (modify — the FAB entry point)
- Corresponding `*.test.ts(x)` for every new file above, following established conventions

## 22. Files that must NOT change

`[RECOMMENDATION]`, carrying forward the master blueprint's own §19 list plus this audit's own findings:

- `apps/mobile/src/lib/{auth-context,master-key-context,token-store}.tsx?` — E1.4 only *consumes*
  `useAuth()`/`useMasterKey()`, never restructures them.
- `apps/mobile/src/components/master-key-gate.tsx` — reused as-is; compose screens sit inside the same
  gate every other authenticated screen already does.
- `apps/mobile/src/lib/capsule-crypto.ts` (the existing decrypt-only file) — extend via a new sibling
  file, not a rewrite; its read-side behavior is tested and proven, do not risk it.
- `packages/crypto/src/*` — E1.4 only *calls* existing exported functions (`generateCapsuleKey`,
  `wrapCapsuleKeyForOwner`, `encryptBytes`, `encodeCapsuleKeyForLink`), never modifies them.
- `apps/api/src/modules/{capsules,media,recipients}/*` — no backend change is required or in-scope; every
  contract E1.4 needs already exists and works (§7).
- `apps/web/src/**` — E1.4 is a mobile-only ticket; nothing here should change.
- `packages/contracts/src/{capsules,media,recipients}.ts` — no new contract fields are needed; E1.4 is a
  new *consumer* of existing schemas, not a schema author.

---

## 23. Deferred work

Restated from §19's `[FOLLOW-UP]` list for a single, scannable summary: recovery-code UI, Place/
Passphrase/Identity Seal conditions (pending a founder call, §19), biometric protection, offline media,
offline sealing, guest/`/try` composer parity on mobile, push notification wiring for creation-adjacent
events (e.g. "your capsule sealed successfully" — not identified as needed by any source document, not
invented here), full type breadth beyond self/personal (group/birthday/legacy/business/etc.).

---

## 24. Open founder decisions

`[FOUNDER DECISION]`, carried forward from the master blueprint's §25 where still unresolved, plus one new
item from this audit:

1. Should E1.4's first pass include Conditions (Place/Passphrase/Identity Seal, break-glass) or
   explicitly fast-follow them? (§19 — new framing of an old question, now concretely scoped to E1.4
   specifically rather than "mobile creation" abstractly.)
2. Should biometric unlock be offered as a recovery-assist option during password reset? (Carried,
   unresolved, unrelated to E1.4's own critical path.)
3. Should app-switcher screenshot redaction be built for the compose/review screens specifically, given
   they now hold live decrypted plaintext the same way the reveal screen does? (Carried from the master
   blueprint's §16, previously scoped only to reveal — this audit notes it applies equally to Compose/
   Review once E1.4 exists.)
4. Ownership model for any new third-party service E1.4 might eventually need (none identified as
   required by this audit — flagged only if a future session finds one).
5. Whether mobile's own `contentDocEnc` encoder should reuse `@tc/crypto`'s `toBase64Url` (pending the
   §6.8 verification) or introduce a byte-for-byte match of web's standard-base64 `encodeIvCiphertext` —
   this is a small technical call, not really founder-level, but flagged here since it's a real fork in
   approach worth a deliberate five-minute decision rather than a silent default.

---

## 25. Final readiness verdict

# READY

No blocker exists. The single hard blocker the master Stage E blueprint identified for the *entire*
mobile effort (Argon2id/RN) is resolved and proven. The second, undocumented blocker this specific audit
uncovered evidence of — no `crypto.getRandomValues` on RN — is also resolved and proven (E1.3.12). Every
other crypto primitive E1.4 needs (AES-GCM encrypt, owner-key wrap, capsule-key generation) is already
portable, tested, and — for randomness and AES-GCM specifically — verified on a real device.

What E1.4 actually requires is substantial, real, new **application** work — a write-direction crypto
call site, a new local encrypted draft store, new UI across three movements, new media-picker
dependencies, and new backend-facing client code — none of which is blocked, all of which has a clear,
evidence-based reuse map (§5) and an exact backend contract to build against (§7) that requires zero
backend changes to start. The one genuinely open technical question (§6.8's base64/base64url
interoperability) is small, cheap to resolve, and does not gate the start of implementation — only its
own specific verification ticket (E1.4.9).

This document, plus `design/21-CAPSULE-CREATION-V2.md` (the authoritative web design spec) and
`EXECUTION-BACKLOG.md §10` (the detailed sub-ticket breakdown, under its own `E4.x` labels), together
constitute a complete, evidence-based implementation blueprint. A future session can begin E1.4.1
directly from this document without re-deriving any of the architecture above.
