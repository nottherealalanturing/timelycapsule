# Stage E — Mobile V1 Implementation Blueprint

Status:
- Audit only
- No implementation performed
- Founder decisions locked: 20/20

This document supersedes `plan/02-UX-DESIGN.md §15` and the original `plan/05-BUILD-PLAYBOOK.md` T-23–T-29 ticket text as the authoritative reference for mobile work. Those documents are not edited by this audit — see §24 for the specific contradictions between them and current reality.

**Evidence markers used throughout:**
`[IMPLEMENTED]` verified directly in the running code · `[INFERENCE]` a conclusion reasoned from existing architecture, not itself stated anywhere · `[RECOMMENDATION]` a proposed approach, not yet decided · `[FOUNDER DECISION]` one of the 20 decisions locked by this brief · `[OPEN DECISION]` something genuinely still unresolved · `[BLOCKER]` prevents implementation as currently understood.

Audited against `origin/main` at `ad3b3e5` (PR #46), working tree otherwise clean except an uncommitted, in-progress theme/hydration fix pre-dating this audit (see §24) — no file was modified in the course of producing this document.

---

## 1. Executive summary

TimelyCapsule's web product has shipped a full generation past what the original Stage E tickets were written against: Meridian V2, Dashboard V2, Capsule Creation V2, and the six-milestone Enclosures/Media/Replies initiative (M0–M5: seal-expiry correctness, unified enclosure lifecycle, unified media viewer, encrypted replies, storage lifecycle with media release, guest media) are all `[IMPLEMENTED]` and merged. `apps/mobile` itself is still the untouched scaffold from T-01 — a single placeholder screen proving `@tc/core` resolves through the workspace, nothing else.

**The crypto compatibility question has a precise, good answer, not a vague one.** `[IMPLEMENTED]` Every AES-256-GCM operation in `@tc/crypto` — capsule content, every enclosure, every reply, the master-key wrap format itself — runs on `crypto.subtle`, which `react-native-quick-crypto` implements as a drop-in polyfill. The wire format (`salt(16) || iv(12) || ciphertext`, base64url) has zero WebAssembly dependency anywhere in it. **The single non-portable primitive is `deriveKeyFromPassword` (Argon2id, via `hash-wasm`/WASM)** — used at exactly two call sites: unwrapping the master key from a password, and unwrapping a Passphrase Seal. Hermes has no WASM runtime; this is a hard platform absence, not a missing polyfill. Critically: **once the master key is resolved in memory by any means, every other operation — unwrapping a capsule key, decrypting content, media, or replies — never touches Argon2id again**, because `wrapCapsuleKeyForOwner` uses the raw master key directly as an AES-GCM key with no KDF step. This narrows the blocker to exactly one function, with a swap point the package's own README already anticipated. Existing ciphertext is fully, provably decryptable on mobile once that one function is resolved — see §7 for the full compatibility chain.

**A second, more serious finding, unrelated to mobile and pre-existing on web today:** `[BLOCKER, product-wide]` there is no recovery-code restore flow anywhere in the product. `restoreMasterKeyFromRecoveryCode` and `parseRecoveryCode` are exported from `@tc/crypto`, tested, and never imported by a single file in `apps/web/src`. A user who resets their password today (`/reset`, forgot-password path) keeps their new login password but the master key stays wrapped under the *old* one — `MasterKeyGate` correctly avoids the catastrophic failure mode (generating a fresh master key and silently orphaning every sealed capsule), but the actual UI dead-ends at "Wrong password. Try again." with no path out, even though the user's recovery code would fix it. This is not something mobile inherits cleanly — it's something mobile would need to build the *first working version of*, or explicitly accept as a shared, pre-existing gap. See §8.

Twenty founder decisions are locked and threaded through this entire document rather than collected in one place — each section states which decisions govern it.

**Final verdict: READY AFTER CRYPTO SPIKE.** See §26.

---

## 2. Current state

### 2.1 Repository

| | |
|---|---|
| `HEAD` | `ad3b3e5`, `origin/main`, `[IMPLEMENTED]` |
| Working tree | Clean except one pre-existing, uncommitted theme/hydration fix (12 files, predates this audit — see §24) |
| API tests | 291, green |
| API modules | 16, 89 HTTP endpoints |
| Mobile scaffold | `apps/mobile` — Expo 57, RN 0.86, React 19.2; one placeholder screen; deps limited to `@tc/contracts` + `@tc/core` |

### 2.2 What each layer actually is today

**Web (`apps/web`)** `[IMPLEMENTED]` — Next.js App Router, Meridian V2 design system (dark instrument register + paper record register, Source Serif 4 + IBM Plex Sans + IBM Plex Mono), TanStack Query for server state, plain React Context for session/master-key/draft state, `localStorage` for auth tokens (flagged in its own code comment as a stopgap). Route groups: `(marketing)`, `(auth)`, `(app)` (Dashboard V2), `(reveal)`, plus `/try` (guest).

**API (`apps/api`)** `[IMPLEMENTED]` — Express 5, Zod-validated routes, Drizzle/Postgres, 16 modules (`auth`, `capsules`, `media`, `recipients`, `reveal`, `replies`, `guest`, `notifications`, `settings`, `contacts`, `collections`, `tags`, `favorites`, `received`, `search`, `places`), a pg-boss-backed scheduler for every time-triggered action (unlock, reminders, capsule expiry, media release). Zero-access is enforced mechanically, not just by convention: an ESLint `no-restricted-imports` rule forbids the delivery handlers (`capsule-unlock.ts`, `recipient-unlock.ts`) from importing any entitlement symbol, proven by a test that deliberately adds the forbidden import and asserts lint fails.

**Shared packages:**
- `@tc/contracts` `[IMPLEMENTED]` — pure Zod schemas + inferred types, zero DOM/React dependency. Directly importable into React Native unchanged.
- `@tc/core` `[IMPLEMENTED]` — `countdown.ts`, pure date math, already proven to load inside the RN scaffold today.
- `@tc/crypto` `[IMPLEMENTED]` — see §7, the deep audit.
- `@tc/ui-web` `[IMPLEMENTED]` — React DOM + Radix + Tailwind. Zero direct portability; only `tokens.css`'s 167 custom-property *values* are reusable, as numbers.

**Capsule lifecycle** `[IMPLEMENTED]` — `draft → sealing → sealed → unlocked → (expired | withdrawn)`, plus independent side-flags `archivedAt`/`trashedAt`. State transitions are server-enforced (`assertCanPatch`, `assertCanSeal`) with a full invariant test suite. `expired` is a real, now-wired terminal state (post-M5 fix, §2.4).

**Media lifecycle** `[IMPLEMENTED]` — `uploading → processing → ready → (failed | infected | released)`. `processing` is a dead enum member (schema-reserved, never set by any code path — worth knowing, not worth building around). Client-side AES-GCM encryption before any byte leaves the browser; server only ever handles ciphertext, verifying object existence/size via presigned multipart upload. `released` (M4) means the encrypted blob was deleted from R2 while the DB row, filename, size, and caption survive permanently.

**Replies** `[IMPLEMENTED]` — `capsule_replies` table, bodies encrypted with the *capsule key* (no new key exchange needed — recipient already has it in the link fragment, sender already has it via master-key unwrap). One shared `Correspondence.tsx` component renders both sides. Notifications and emails carry zero reply content by design (verified: `social`-category notification title says "X replied," body is `null`).

**One Reading Only / capsule expiry** `[IMPLEMENTED]` — a real, destructive, irreversible feature as of the post-M5 correctness milestone: `expireCapsule()` deletes every media row's R2 object, deletes every `media_items`/`capsule_replies` row, nulls `contentDocEnc`, sets `state: 'expired'`. Triggered by a client-confirmed `POST /r/:token/confirm-read` call, fired only at the exact moment the client has genuinely decrypted the letter — not on a bare `GET`, and not gated on any animation finishing.

**Notifications** `[IMPLEMENTED, email only]` — `notifications`/`notification_prefs` tables, category enum (`unlock`, `reminder`, `delivery`, `social`, `security`, `billing`, `product`, `digest`), quiet-hours support, an email adapter (Resend, console-in-test). `push_tokens` table exists in schema with `platform`/`lastSeenAt`/`invalidAt` columns — **no push adapter, no registration endpoint, nothing consumes this table today.**

**Dashboard V2 (`(app)/home`)** `[IMPLEMENTED]` — the shared authenticated frame, capsule-as-object representation, one canonical `CapsuleRow` used everywhere (home, received, search results, collections), received capsules unified into the same list model as owned ones, ⌘K search.

**Settings/security** `[IMPLEMENTED, web scope]` — Account (password/email change, sessions list + revoke), Storage (M4's "reading, not a meter" — quota, release date, snapshot-vs-live distinction stated in text), Notifications (category × channel matrix), Data (export, deletion). **No biometric/PIN/app-lock concept exists anywhere in the product today** — this is genuinely new territory for mobile, not a port.

**Guest architecture** `[IMPLEMENTED, web+API, explicitly out of Mobile V1 scope — Decision 2]` — `guest_sessions` table, `capsules.owner_id` nullable, a full parallel media/seal pipeline scoped to session token instead of user ID, 5 MB allowance (M5). Confirmed structurally sound and reusable *later*; not touched by this blueprint's implementation phases.

### 2.3 What is genuinely mobile-ready vs. what is not

| Ready as-is | Needs adaptation | Needs building fresh |
|---|---|---|
| `@tc/contracts` | `@tc/crypto` (AES/HKDF ready, Argon2id blocked) | Navigation, secure storage, native design tokens |
| Every API endpoint mobile needs except push | Auth protocol (port the protocol, not the `localStorage` storage) | Push adapter + registration endpoint |
| `@tc/core` countdown logic | Design token *values* (not the CSS) | Biometric key-gating architecture |
| Brand SVG source (`design/brand/app-icon*.svg`) | Reveal ceremony timing model (port the model, not the DOM/CSS implementation) | Offline encrypted-draft store |
| `07-EXPERIENCE-BIBLE.md` (platform-agnostic by design) | — | A working recovery-code UI (doesn't exist on web either — §8) |

### 2.4 Since the prior Stage E Blueprint audit

Nothing has changed in the repository — same `HEAD`, same working-tree diff. This document supersedes that one specifically because the founder decisions below reshape several of its open questions (guest-mode timing, haptics, IA) into settled answers, and because this pass goes materially deeper on the crypto chain and the recovery-flow gap, which the prior pass flagged only at the primitive level.

---

## 3. Founder decisions — as architecture constraints

All 20 are `[FOUNDER DECISION]` and locked. Restated here strictly as the constraints they impose on design, not repeated verbatim — the full text is in the original brief.

| # | Decision | Binding constraint on this blueprint |
|---|---|---|
| 1 | IA derived from current product, not old T-23 nav | §9 designed from Dashboard V2 forward, not backward from `02 §15` |
| 2 | Authenticated-first; guest deferred | No guest code path anywhere in Phases 0–8 (§21) |
| 3 | No reveal haptics | §10 explicitly excludes haptics from the reveal; seal-only haptic remains a future, separate decision |
| 4 | Offline drafts, encrypted at rest | §6/§14 — full key architecture required, not optional |
| 5 | "Protect my capsules" gates the master key, not the UI | §5/§8 — biometric unlock must produce the actual key, not just pass/fail a screen |
| 6 | Content-blind push, real lifecycle events | §12 — payload discipline inherited from the existing email-notification pattern, not invented fresh |
| 7 | Offline sealing unsupported | §6 — no sync-conflict engine, no `pending_sync` state machine required |
| 8 | Balanced home, not inbox-first | §9 — derived from Dashboard V2's existing balance, not from a generic "inbox" or "file manager" default |
| 9 | Inline-first media, deliberate expand | §11 — `EnclosureViewer`'s three rules ported, not the component |
| 10 | Address → Compose → Seal, mobile-native interaction | §10 — no generic wizard, no "responsive desktop composer" |
| 11 | Biometric gates the key, restated | Same as 5 |
| 12 | Password is the biometric fallback | §5 — biometric failure must never be a dead end; password re-entry always available |
| 13 | User-controlled notification privacy tiers, all content-blind | §12 — three tiers, floor is content-blind at every tier |
| 14 | Recovery must not silently weaken encryption | §8 — the recovery-flow gap finding governs this section entirely |
| 15 | One Reading Only is in scope for V1 | §10/§11 — creation and reveal both respect it |
| 16 | Offline media unsupported | §6/§11 — media requires connectivity, full stop, in V1 |
| 17 | Universal/App Links, web fallback preserved | §13 |
| 18 | Just-in-time permissions only | §11 |
| 19 | Minimal operational telemetry only, no behavioral analytics | §17/§25 |
| 20 | V1 scope is core experience + polish, not every old ticket | §21 defines the actual phase boundary |

---

## 4. Hard blockers

`[BLOCKER]` — exactly one, precisely scoped:

**`deriveKeyFromPassword` (Argon2id via `hash-wasm`/WebAssembly) has no execution path on Hermes.** Two call sites depend on it: master-key unwrap (every login) and Passphrase Seal unwrap (a recipient-side feature, lower priority for V1). This blocks the login screen — Phase 0 in §21 — and nothing downstream of a resolved master key is blocked at all (§7).

No other hard blocker was found. Everything else in this document is `[OPEN DECISION]` or `[RECOMMENDATION]`, not `[BLOCKER]`.

---

## 5. Biometric architecture ("Protect my capsules")

Per Decisions 5, 11, 12 — the key is gated, not the screen; password is always the fallback.

### 5.1 Where the master key lives, precisely

`[IMPLEMENTED, web]` The master key exists only in memory, in a React Context (`useMasterKey`), for the lifetime of the tab. It is never persisted anywhere — this is the zero-access guarantee's foundation and must hold identically on mobile.

`[RECOMMENDATION]` On mobile, the master key must **also** never be written to `AsyncStorage`, MMKV, or any general-purpose store, encrypted or not — general-purpose storage is the wrong trust boundary for it regardless of encryption, because the encryption key for a general store is itself just another secret to protect. It lives in JS memory only, exactly as it does on web, for the lifetime of the app session.

### 5.2 What "Protect my capsules" actually stores

`[RECOMMENDATION]` Not the master key itself, and not a copy of the password. The correct primitive: **wrap the master key a second time, under a device-bound key that only the platform's biometric-gated Keychain/Keystore can release**, stored via `expo-secure-store`'s `requireAuthentication: true` option (which uses the platform's own hardware-backed biometric gate — Secure Enclave on iOS, StrongBox/TEE on Android where available).

Concretely: at enrollment, with the master key already resolved in memory (the user just logged in with their password), generate a fresh random AES key, wrap the master key under it (same `wrapKey`/`unwrapKey` format already in `@tc/crypto` — this reuses existing code, not new crypto), store the wrapping key in `expo-secure-store` with `requireAuthentication: true`, and store the wrapped-master-key blob in ordinary (non-biometric-gated) secure storage, since it's ciphertext and gains nothing from the extra gate. This produces a **second, independent, parallel key path alongside password-derived unwrap** — not a replacement, not a weaker one, and not a "second cryptographic authority" in the sense the founder's brief was cautioning against, because the thing being gated is a wrap of the *same* master key, not an independently-generated key with its own scope.

### 5.3 The sequence, state by state

| State | Behavior |
|---|---|
| Master key lives | In-memory only, for the app session's lifetime |
| Biometric unlock | User opens app → `expo-secure-store` read with `requireAuthentication: true` prompts Face ID/Touch ID/BiometricPrompt → releases the wrapping key → unwraps the master key → same in-memory state as a password unlock produced |
| After logout | Both the wrapped-master-key blob and its biometric-gated wrapping key are deleted. Re-enrollment is required after any future login — this is not optional, since the master key that was wrapped belonged to a session that no longer exists |
| After password change | `[IMPLEMENTED, web precedent]` password change re-wraps the master key client-side under the *same* master key (unwrap-old, re-wrap-new) — the master key itself is unchanged. The biometric wrap is therefore **not invalidated** by a password change; it keeps working, because it wraps the master key directly, not a password-derived intermediate |
| After a password *reset* (forgot-password) | The master key wrap under the old password becomes unusable (§8) — but if biometric protection was already enrolled *before* the reset, the biometric path still holds the *old* master key, which is now the only way back into historical capsules other than the recovery code. `[OPEN DECISION]` whether biometric unlock should therefore be offered as a recovery path during the reset flow itself — a real, interesting option this architecture makes possible, not required for V1 |
| Biometric enrollment changes (new fingerprint added, Face ID reset) | Both platforms invalidate `requireAuthentication`-gated Keychain/Keystore entries automatically when enrolled biometrics change — this is platform behavior, not something to build. The wrapping key becomes unreadable; fall through to §5.4 |
| Biometric auth fails (wrong face, too many attempts) | Standard OS retry UI, then fall through to password re-entry — **never a dead end** (Decision 12) |
| Biometrics disabled at the OS level | `expo-secure-store` read fails; app falls back to the password-unlock form identically to today's `MasterKeyGate` |
| Device compromised (root/jailbreak) | Out of this architecture's threat model to prevent — see §16. The biometric gate is a convenience layer over the same key a compromised OS could extract via other means; it does not claim to defend against OS-level compromise |
| Can biometric-protected key material be invalidated remotely? | Not directly — there is no server-side kill switch for a Keychain/Keystore entry on a specific device. `[OPEN DECISION]` a "sign out this device" action (the sessions-list revoke already exists server-side) should be documented as *not* reaching into that device's local Keychain; the practical mitigation is that a revoked session can no longer refresh a token, so the app re-prompts for password on next real API call regardless of what's cached locally |

### 5.4 Password remains the universal fallback

Every failure mode above resolves to the same place: the existing password-unlock form, unchanged. Biometric protection is additive, never a second point of failure that can itself lock someone out — consistent with Decision 12 stated plainly.

---

## 6. Offline encrypted draft architecture

Per Decisions 4, 7, 16: text drafts only, encrypted at rest, no offline sealing, no offline media.

### 6.1 What already exists to build on

`[IMPLEMENTED, web]` `useCapsuleDraft` autosaves to the server on a 3-second idle timer; there is no local persistence layer on web at all today for drafts — a closed tab loses anything not yet autosaved. Mobile's offline requirement is therefore genuinely new capability, not a port.

### 6.2 Storage engine

`[RECOMMENDATION]` `expo-sqlite`. Reasoning: it's the Expo-native option requiring no third-party native module beyond what Expo already ships, it's what the original T-25 ticket text already named, and nothing in this audit found a reason to prefer WatermelonDB (never a real dependency, per §24) or another engine. A key-value store (MMKV) is the wrong shape for structured draft data with multiple fields and query needs (list all drafts, find one by capsule ID).

### 6.3 Draft key architecture — this is the section that matters

`[RECOMMENDATION]` Do **not** encrypt drafts under the master key directly, and do not encrypt them under a per-draft randomly generated key with no relationship to the account. Instead:

1. Derive a **device-local draft-encryption key** at first use, held in `expo-secure-store` (non-biometric-gated — this key protects against "someone reads the SQLite file off a stolen/backed-up device," not against the app's own runtime, which already has it).
2. Encrypt each draft's plaintext fields (letter body, recipient notes — anything containing user-authored content) with this key via `@tc/crypto`'s existing `encryptBytes`/`decryptBytes` — same AES-256-GCM, same wire format, no new primitive.
3. **This key is intentionally independent of the master key.** Rationale: the master key only exists in memory after unlock (password or biometric); a draft written while offline and before the day's first unlock (app cold-start, no network to validate a stored session against yet) still needs to encrypt something. A device-local key that exists from first app install, gated by the OS's own device encryption plus secure-storage access control, is available in that window; the master key is not.
4. On successful server sync (once the capsule is created/patched server-side and connectivity is confirmed), the local draft row is deleted — it never accumulates as a second permanent copy of anything the server already has encrypted properly under the account's real master key.

### 6.4 Lifecycle

| Event | Behavior |
|---|---|
| Draft created offline | Row inserted, encrypted under the device draft key, no server call yet |
| Reconnect | Standard sync: `POST/PATCH /capsules` with the decrypted-then-properly-master-key-encrypted content, matching exactly what the online composer already sends |
| Migration (schema changes) | `expo-sqlite` migrations, versioned — same discipline as the API's own Drizzle migrations, just a second, independent migration ledger |
| Cleanup | On successful sync, delete the local row. On logout, delete **all** local draft rows for that account, unconditionally — a lingering plaintext-adjacent draft belonging to a logged-out account is exactly the kind of residue Decision 4 exists to prevent |
| Logout | Full local draft wipe (above), and the device draft-encryption key is **not** deleted (it's device-scoped, not account-scoped — deleting it would strand any not-yet-synced draft from *any* account that ever used this device, an unnecessary loss for what should already be zero rows if cleanup ran correctly) |
| Account switching | `[OPEN DECISION]` whether the draft key should become per-account rather than per-device once multi-account-per-device is a real scenario — not needed for V1 (single account per device is the only supported case), flagged so it isn't silently assumed away later |
| Crash recovery | SQLite's own durability handles this — a draft written before a crash is still on disk after relaunch, same guarantee any SQLite-backed app gets for free |
| Device loss | The draft key lives in `expo-secure-store`, which is itself protected by the device's own lock-screen credential and OS-level encryption — losing the device does not hand a thief plaintext drafts without also having the device unlocked, matching the product's general posture that a locked device is the trust boundary |

---

## 7. Crypto architecture — the deep audit

### 7.1 Every primitive, traced exactly

`[IMPLEMENTED]` — read directly from `packages/crypto/src/*.ts`, not inferred.

| Primitive | Algorithm | Library/API | WASM? | RN path |
|---|---|---|---|---|
| Content encryption (capsule doc, media, replies) | AES-256-GCM, 96-bit IV, 128-bit tag | `crypto.subtle` | No | `react-native-quick-crypto` polyfills `crypto.subtle` directly — **shareable, unmodified** |
| Streaming encryption (large media) | AES-256-GCM, chunked (4 MiB), per-chunk derived IV (base IV XOR'd with a big-endian chunk counter in its last 4 bytes), AAD binds chunk index + `isFinal` bit | `crypto.subtle`, called repeatedly | No | Same as above — it's a generator wrapping repeated single-shot calls, no genuine streaming API dependency |
| Password/passphrase KDF | Argon2id (parallelism 1, iterations 3, 64 MiB memory, 32-byte output) | `hash-wasm` | **Yes** | **Blocked** — see §7.3 |
| Recovery-code KDF | HKDF-SHA256 | `crypto.subtle` | No | Shareable |
| Key wrap format | `salt(16) \|\| iv(12) \|\| ciphertext`, base64url | Pure byte concatenation + the above | No | Fully portable — this is just data, not an API call |
| Capsule key → owner wrap | AES-GCM directly with the raw master key (no KDF — `ZERO_SALT` is a format placeholder only) | `crypto.subtle` | No | Shareable, and notably **not blocked by Argon2id at all** |
| Capsule key → recipient link | Raw key placed in URL fragment, base64url-encoded, never wrapped | `crypto.subtle` not even needed for extraction | No | Shareable — the only crypto operation is base64url decode + AES-GCM decrypt of content |
| Capsule key → passphrase seal wrap | Argon2id-derived wrapping key | `hash-wasm` | **Yes** | Blocked, same as password KDF — lower-priority call site for V1 |
| Master key generation | `crypto.getRandomValues`, 256-bit | Native `crypto` | No | Shareable, RN provides `crypto.getRandomValues` natively |
| Recovery code generation | `crypto.getRandomValues`, 128-bit, Crockford base32-encoded | Native `crypto` | No | Shareable |
| Base64url encode/decode | `btoa`/`atob`-based, deliberately avoiding `Buffer` | Web-standard globals | No | **`[OPEN DECISION]`** — RN/Hermes does not provide `btoa`/`atob` natively in all configurations; recent RN versions (0.86, matching this project's scaffold) do polyfill them, but this must be verified directly against the exact RN/Hermes version in use, not assumed |

### 7.2 The compatibility chain, proven step by step

**Can a capsule encrypted on web today be decrypted on mobile tomorrow? Yes**, and here is the exact chain:

1. The ciphertext stored server-side (`contentDocEnc`, every `media_items` row's encrypted object, every `capsule_replies.bodyEnc`) is AES-256-GCM output with a documented, fixed wire layout. This is platform-independent by construction — AES-GCM is a standard, and `crypto.subtle`'s implementation of it is spec-conformant on both web and (via `react-native-quick-crypto`) RN.
2. The `salt||iv||ciphertext` wrap format is plain bytes — no platform-specific encoding beyond base64url, which is trivially reimplementable (and RN's `atob`/`btoa` availability is the only thing to verify, not reimplement — see 7.1's open item).
3. **Getting from "I have a password" to "I have the master key" is the one step that currently differs.** On web: Argon2id via `hash-wasm`. On mobile, until resolved: blocked.
4. **Once the master key exists in memory — by any means — every subsequent operation is identical AES-GCM, byte-for-byte, on both platforms.** Unwrapping a capsule key, decrypting a letter, decrypting media, decrypting a reply: none of these touch Argon2id. This is why the blocker's blast radius is narrow: it gates *arrival* at the master key, not anything downstream of having it.
5. `@tc/crypto`'s own README (§ "Argon2id via `hash-wasm` is the current choice for portability... If RN mobile crypto work later finds this too slow on real devices, the fix is swapping the *implementation* behind `kdf.ts`'s exported function signatures") **already anticipated exactly this problem and designed the swap point for it.** This was not discovered by this audit; it was already documented and simply never acted on because mobile work hadn't started.

### 7.3 Resolving the blocker — what NOT to do, and what to do instead

`[RECOMMENDATION]`

**Do not** ship a WASM polyfill for Hermes as the fix (the brief explicitly ruled this out, correctly — Hermes has no WASM execution path at all in its standard configuration; there is no polyfill for a missing VM feature, only alternative implementations).

**Do not** weaken the KDF (e.g., swap Argon2id for PBKDF2 because it's more commonly available) — this would be a real, permanent security regression disguised as a platform accommodation, and it would also break format compatibility with every existing wrapped master key on web, which was derived with Argon2id-specific parameters.

**The correct fix:** a **native Argon2id module** for React Native, called from `kdf.ts` behind the exact same function signature (`deriveKeyFromPassword(password, salt): Promise<Uint8Array>`) already used everywhere else in the package. Concrete candidates to evaluate (not selected — this needs a hands-on spike, not a desk decision):
- A community RN Argon2 binding (native module wrapping a C/Rust Argon2id implementation).
- `libsodium`'s Argon2id (`crypto_pwhash`) via a maintained RN libsodium binding — libsodium's Argon2id is a standard, audited implementation, and several RN wrappers exist.
- A custom, minimal native module (Swift/Kotlin) wrapping a vetted Argon2id C library directly, if no existing binding proves reliable — more work, but fully controlled.

**The acceptance test, not optional:** whichever implementation is chosen must produce **byte-identical output** to `hash-wasm`'s Argon2id for the same `(password, salt, ARGON2ID_PARAMS)` triple. `@tc/crypto`'s existing `test-vectors/v1.json` only covers AES-GCM (3 vectors, confirmed by direct inspection) — it has **no Argon2id or HKDF vectors today**. `[RECOMMENDATION]` extend `test-vectors/v1.json` (or add a `v2.json`) with fixed `(password, salt) → expected 32-byte key` Argon2id vectors and `(recoveryCode, salt) → expected key` HKDF vectors *before* the native module work starts, so the module has a concrete, checked-in target to be verified against — not "it seems to work," a byte-exact proof, exactly matching the rigor `test-vectors.test.ts` already applies to AES-GCM.

### 7.4 What must never change, regardless of implementation

`[RECOMMENDATION]` The KDF parameters (`ARGON2ID_PARAMS`: parallelism 1, iterations 3, 64 MiB memory, 32-byte output) must be identical, or every existing wrapped master key becomes silently undecryptable — this is the single highest-consequence detail in this entire section, since it would look like "wrong password" to every existing user rather than surfacing as an obvious migration event.

---

## 8. Authentication + recovery

Per Decision 14: recovery must not silently weaken encryption; the existing recovery implementation must be audited and mobile's use of it specified precisely.

### 8.1 The full flow, mapped

| Step | Web implementation | Shareable with mobile? |
|---|---|---|
| Signup | Password → Argon2id-wrapped master key generated client-side, `masterKeyWrap`/`recoveryKeyWrap` sent to `POST /auth/signup` alongside the password hash's own server-side Argon2id (separate, independently-tuned, unrelated code path — `[IMPLEMENTED]` confirmed distinct from `@tc/crypto`'s client-side KDF) | Protocol yes, client crypto call blocked on §7.3 |
| Login | `POST /auth/login` → 15-min access + rotating refresh token; separately, client unwraps master key from `masterKeyWrap` via password | Protocol yes; master-key unwrap blocked on §7.3 |
| Google OAuth | `POST /auth/oauth/google`, `jose`'s remote JWKS verification, web-audience-only currently | Needs iOS/Android client ID validation added server-side (small, identified change) |
| Password change (logged in) | Client unwraps old, re-wraps new, sends `masterKeyWrap` alongside new password hash — **master key itself never changes** | Fully shareable protocol |
| Password reset (forgot) | `[IMPLEMENTED]` `resetPassword()` updates **only** `passwordHash`. `masterKeyWrap` is untouched — still wrapped under the old password | See 8.2 — this is the gap |
| Recovery code | `[IMPLEMENTED, crypto only]` `restoreMasterKeyFromRecoveryCode` exists, tested, **never called from any UI** | Mobile must build this from scratch — nothing to port |
| Session/refresh | 15-min access token, rotating refresh with reuse-detection (verified: `sessions.ts` logs `refresh_token_reuse_detected` and revokes the whole session family on reuse) | Protocol fully shareable |
| Logout | Revokes the current session's refresh token | Shareable |
| Device state | `GET/DELETE /auth/sessions[/:id]` already exists, no mobile-specific concept needed beyond a "this device" label | Shareable |

### 8.2 The recovery gap, precisely — this is the section's core finding

`[IMPLEMENTED — confirmed by direct inspection]` `apps/web/src/app/(auth)/reset/page.tsx`'s "Set a new password" form calls `authApi.resetPassword({token, newPassword})` and redirects straight to `/login`. It never mentions the master key, never offers a recovery-code path, never warns the user that historical capsule content is about to become unreachable with their new password alone.

**What happens next, traced exactly:** the user logs in with the new password. `MasterKeyGate` checks `if (!user.masterKeyWrap)` — this is `false` here (the wrap still exists, just under the old password), so the gate correctly does **not** fall into the "generate a brand-new master key" branch (which would silently orphan every sealed capsule — confirmed this catastrophic path does *not* trigger). Instead it falls into the ordinary "Unlock your capsules" password-entry form. The user enters their real, correct, new password. `unlockWithPassword` calls `unwrapMasterKeyWithPassword`, which Argon2id-derives from the *new* password against a wrap salted for the *old* one — the AES-GCM authentication tag fails, and the UI shows **"Wrong password. Try again."** — technically accurate about the unwrap failing, but actively misleading about *why*, and offering the user no way forward. `restoreMasterKeyFromRecoveryCode`/`parseRecoveryCode` are confirmed, by direct grep, to be imported by zero files anywhere in `apps/web/src`.

**This is a pre-existing product gap, not a mobile defect to inherit or a web defect this audit is asked to fix.** It is reported here in full because Decision 14 explicitly requires auditing "the existing recovery implementation" and explaining "exactly how mobile should use it" — and the accurate, honest answer is: **there is currently nothing working to reuse.** The crypto primitives exist and are correct; the product flow around them does not exist anywhere yet.

### 8.3 What mobile should do about it

`[RECOMMENDATION]`
1. Mobile V1 needs its own recovery-code-entry screen — this cannot be deferred as "same as web" because there is no "same as web" to point to.
2. The correct flow, buildable entirely from existing crypto primitives with zero new cryptography: on the password-reset (forgot) screen, alongside "enter your new password," offer "Have your recovery code? Restore access to your existing capsules" → `parseRecoveryCode` → `restoreMasterKeyFromRecoveryCode(existingWrap, code)` → master key recovered → immediately re-wrap under the new password (`wrapMasterKeyWithPassword`) → send both the new password and the fresh `masterKeyWrap` to the server in one step, so the reset never has to produce an unreachable state at all.
3. `[OPEN DECISION]` whether to also retrofit this onto web in the same pass, or ship it mobile-first and backport — a real product/scheduling call, not a technical one; flagging because shipping it mobile-only first would leave web's gap open indefinitely if nobody circles back.
4. Session/refresh/logout/device-state all port as pure protocol — no design work needed beyond wiring `expo-secure-store` as the token store (§14).

---

## 9. Mobile information architecture

Per Decisions 1 and 8 — derived from Dashboard V2 and the current product, not the old T-23 nav, and balanced rather than inbox-first.

### 9.1 What Dashboard V2 actually established, worth carrying forward as principle

`[IMPLEMENTED]` One canonical `CapsuleRow` representation used everywhere regardless of context (owned, received, search result, collection member) — never a second, divergent "card" component for a different screen. The home surface already balances "waiting" (sealed, counting down), "received," and organizational access (search, collections) rather than being purely one of those. This balance is exactly what Decision 8 asks mobile's home to also be — the decision isn't asking for something new, it's asking mobile not to regress from what web already got right.

### 9.2 Root navigation

`[RECOMMENDATION]` Four destinations, not five — the old plan's fifth tab (a bare "Create" tab) is folded into a FAB instead, since capsule creation is a full-screen flow, not a browsable destination one returns to and lingers in the way Home/Received/Profile are:

| Tab | Contains | Maps to |
|---|---|---|
| **Home** | Balanced dashboard: upcoming (sealed, counting down), recently received, drafts-in-progress, a restrained create affordance (FAB, not a tab) | Dashboard V2's `(app)/home` |
| **Received** | Everything addressed to this person — waiting, opened, replies | `(app)/received` |
| **Notifications** | In-app notification list | New (`GET /notifications` already exists) |
| **Profile** | Settings root — Account, Security (incl. biometric toggle), Storage, Notifications, Data | `(app)/settings/*` |

FAB (persistent, Home tab primarily): opens the Address movement directly.

### 9.3 Nested, not tabbed

`[RECOMMENDATION]` Capsule detail, Reveal, Correspondence, individual Settings sub-pages, and the full composer are all pushed screens, not tabs — matching how they already behave conceptually on web (a capsule detail page is a destination you arrive at and leave, not a persistent workspace). Drafts get a filter/section within Home rather than their own tab — there is no evidence in the current product that drafts need top-level, always-visible real estate distinct from "capsules I'm working on," and a fifth persistent tab for a transitional state (a draft is not a "kind" of capsule the way received/sent are) would read as clutter against Meridian's own restraint principle.

---

## 10. Capsule creation mobile UX

Per Decision 10 — preserve Address → Compose → Seal conceptually, redesign the interaction for touch, never a generic wizard.

`[IMPLEMENTED, web reference]` `composer/v2/*` — `AddressMovement`, `ComposeMovement`, `SealMovement`, `Enclosures.tsx`, `VoiceRecorder.tsx`, and critically `capabilities.ts`, whose *architecture* (capability resolved once at the container, components ask "is this available" rather than "am I in guest mode") is exactly the pattern mobile should replicate even though Decision 2 means the guest half of that resolver is dormant for V1.

| Movement | Mobile-specific redesign | Validation/autosave | Offline | Keyboard |
|---|---|---|---|---|
| **Address** | Horizon's moment-cards become a scrollable, comfortably-tappable list (not web's dense row layout) — real touch-target sizing, not a shrunk desktop grid | Same server-side rules (unlock ≥ now+5min, ≤ max horizon) | Fully available offline (pure local state until Compose creates a draft) | N/A (mostly selection, minimal typing) |
| **Compose** | Native `KeyboardAvoidingView`/inset handling around the letter field — the one screen with no web equivalent to reference at all; source sheet (camera/library/voice/video/files) replaces drag-and-drop entirely | Autosaves to the **local encrypted draft** (§6) while offline, syncs to the server's existing autosave endpoint on reconnect | Text: yes (Decision 4). Media: **connectivity required** (Decision 16) — the enclose affordance is present but a failed/no-network attempt states plainly that media needs a connection, never a silent queue |
| **Voice recording** | Idle→Recording→Preparing→Ready→Enclosed, matching web's lifecycle exactly (nothing kept without deliberate acceptance) | N/A until Enclose | Recording itself works offline; the resulting file still needs connectivity to enclose (media rule applies) | N/A |
| **Review/Seal** | The record itself as the review surface (not a summary card), per web's existing, explicitly-approved design | **Sealing requires connectivity, full stop (Decision 7)** — if offline, the Seal action is present but states "Connect to seal this capsule," never a fake-optimistic "sealed" state | N/A — this is the one movement offline explicitly does not reach | N/A |

**Back/close behavior:** `[RECOMMENDATION]` closing mid-compose keeps the local draft (encrypted, per §6) rather than discarding — matching the spirit of web's autosave (nothing typed is casually lost) without inventing a new confirmation-dialog pattern the web composer doesn't have either.

**Error behavior:** `[RECOMMENDATION]` every failure (validation, network, seal rejection) is stated in text at the point of failure, never a toast that's gone before it's read and never a generic "Something went wrong" — this was a real, recently-fixed regression on web itself (§24, PR #46-era) worth naming explicitly so mobile doesn't reintroduce it independently.

**Recipient management:** `[IMPLEMENTED via API]` fully reusable — no redesign needed beyond native chip/list input patterns for adding recipients.

---

## 11. Reveal / media / One Reading Only

Per Decisions 3, 9, 15, 18.

### 11.1 What can be reused vs. rewritten

`[IMPLEMENTED, web]` `RevealCeremony.tsx` + `use-transit.ts` drive the entire ceremony from a single timeline scalar (0→1) in plain CSS — no framework animation library dependency on web. `[RECOMMENDATION]` the **timing model** (approach at constant velocity → 200–400ms full stop, zero movement → instant state change — the Held Beat) ports directly to Reanimated's `withTiming`, explicitly avoiding `withSpring`/`withDecay` anywhere in this sequence. The CSS implementation itself does not port; the scalar-driven architecture does.

**No haptics anywhere in this flow (Decision 3)** — this was already a documented contradiction between the old T-24 ticket text and `07-EXPERIENCE-BIBLE.md` Part VII before this brief; Decision 3 makes it unambiguous and final.

**Skip behavior:** `[IMPLEMENTED, web]` tap-anywhere-to-skip, with a real, recently-fixed bug worth carrying the lesson from: web's `skip()` used to only set a ref and wait for the next `requestAnimationFrame` to act on it — inert whenever rAF is suspended (backgrounded tab, low-power throttling), which is exactly when someone reaches for skip. The fix sets the timeline scalar directly and immediately. `[RECOMMENDATION]` native must not reintroduce this class of bug — a skip action should mutate the driving state synchronously, not wait on the next animation frame to notice.

**Accessibility:** `[IMPLEMENTED, web]` `aria-live` announcement + focus moves to the letter heading on arrival. `[RECOMMENDATION]` RN equivalent: `AccessibilityInfo.announceForAccessibility` + explicit focus management on the heading element — must be built deliberately, since RN has no automatic analogue to CSS's `prefers-reduced-motion` media query; `AccessibilityInfo.isReduceMotionEnabled()` must be read explicitly and threaded through, or the reduced-motion path silently regresses to nothing (worse than web's graceful degradation).

**Deep-link entry:** the reveal screen must be reachable directly from a Universal/App Link without forcing login first — reveal is and remains account-free by design (§13).

### 11.2 Media viewer — `EnclosureViewer`'s three rules, not the component

`[IMPLEMENTED, web]` Three explicit rules govern `EnclosureViewer.tsx`: (1) opens in place, never a modal; (2) chrome is a museum label, not a file browser; (3) nothing decrypts itself — the reader asks for it. Decision 9 restates rule 1 precisely: **inline inside the record by default, with a deliberate expand action for media that benefits from more space** (video, a larger photo) — not a generic gallery/lightbox, not a file browser.

| Media kind | Reveal behavior | RN implementation note |
|---|---|---|
| Image | Inline, tap-to-expand for a larger view | Standard `Image` component, no new library needed |
| Audio/voice | Inline native player | `expo-av`/`expo-audio` |
| Video | Inline (constrained), expand for full-screen | `expo-av`/`expo-video` |
| PDF | `[IMPLEMENTED, web]` `<object>` embed with a stated fallback for browsers that refuse to embed | RN has no native PDF embed — needs a dedicated PDF-render library or falls straight to the "kept as it was enclosed, take a copy" stated fallback web already uses for unsupported cases |
| Unsupported document | Stated plainly ("kept as it was enclosed"), never a broken-icon | Same copy, same principle |
| Released (M4) | `[IMPLEMENTED, web]` museum label persists, Open control removed, release date stated | Direct port of state, not UI |

### 11.3 One Reading Only

`[IMPLEMENTED, web]` `POST /r/:token/confirm-read` fires once, at the exact moment content is genuinely decrypted client-side — not on load, not gated on the ceremony's animation finishing. `[RECOMMENDATION]` mobile must call this at the equivalent precise moment (post-decrypt, pre- or during-ceremony-display, never earlier) — calling it too early would destroy a capsule nobody actually read, and this is Decision 15's explicit requirement that creation *and* reading respect identical semantics to web, not a mobile-simplified version.

### 11.4 Just-in-time permissions (Decision 18)

`[RECOMMENDATION]` No permission is requested during onboarding or app launch. Camera requested only when the camera action is invoked from the composer's source sheet; microphone only when "record a voice note" is tapped; photo library only when "choose from library" is tapped. This is a straightforward Expo pattern (`expo-camera`/`expo-av`/`expo-image-picker` all support request-on-use) — no architectural risk, just a discipline to hold to.

---

## 12. Push notifications

Per Decision 6 — content-blind, real lifecycle events, never engagement spam.

### 12.1 What exists today

`[IMPLEMENTED]` `notifications`/`notification_prefs` tables, an 8-value category enum (`unlock`, `reminder`, `delivery`, `social`, `security`, `billing`, `product`, `digest`) already covers every event this section needs, quiet-hours support already exists, and the email adapter pattern (`modules/email`) is the direct architectural precedent for a push adapter — same shape, second channel. `push_tokens` schema already anticipates lifecycle (`platform`, `lastSeenAt`, `invalidAt`) but **no adapter and no registration endpoint exist.**

### 12.2 What must be built

`[RECOMMENDATION]`
- `PUT /push-tokens` (register/update), token pruning on `invalidAt`.
- A push adapter (Expo's unified push service, wrapping FCM + APNs) mirroring the email adapter's interface shape.
- Dispatch alongside existing email sends in the relevant scheduler handlers (unlock, reply notification, retention warnings — the M4 30-day/7-day media-release warnings already exist as scheduled actions and are a natural second push category, not a new concept).

### 12.3 Content-blindness, exactly

`[IMPLEMENTED, email precedent to mirror exactly]` M3's reply notification already proves the pattern: title says "X replied," body is `null` — never the reply text. `[RECOMMENDATION]` push payloads follow the identical rule for every category:

| Event | Push title (example) | Push body |
|---|---|---|
| Capsule unlocked | "Your capsule is open." | Never the letter text |
| Reply received | "[Name] replied." | Never the reply text |
| Media/storage warning | "Some media will be released in 7 days." | Capsule reference only, never contents |
| Retention/expiry events | Stated plainly, capsule reference only | — |

### 12.4 Notification privacy tiers (Decision 13)

`[RECOMMENDATION]` Three tiers, all content-blind at the floor:
1. **Highly private/generic** — "You have a new notification." No sender name, no event type.
2. **Useful but content-blind** — event type + sender/recipient name, no content ("Amara replied to your capsule").
3. **Normal content-blind** — same as tier 2 with slightly richer framing (e.g. capsule title if one exists) — still zero letter/reply text at any tier, matching Decision 13's explicit floor.

### 12.5 Other lifecycle concerns

`[RECOMMENDATION]` Token rotation: re-register on every app foreground if the stored token differs from what Expo currently reports (standard practice). Logout: delete the device's push token registration server-side. Multiple devices: `push_tokens` is already a one-to-many table keyed on `userId` — no schema change needed, a user with two devices simply has two rows. Deep links from a push tap: route into the relevant capsule detail/reveal screen via the same Universal Link handling as §13, not a separate mechanism.

---

## 13. Universal Links / App Links

Per Decision 17 — installed → native app, not installed → web, capsule links never app-only.

### 13.1 What exists today

`[IMPLEMENTED, web]` The reveal link (`/c/:token#k=...`) is deliberately designed so the capsule key never reaches any server — URL fragments are never sent in HTTP requests, by browser design, and this fact *is* the security boundary, not an added layer on top of one (per `@tc/crypto`'s own README threat notes).

### 13.2 The open technical question — needs a spike, not an assumption

`[OPEN DECISION, needs verification before shipping]` Whether the fragment survives a Universal Link / App Link open into a native app is not guaranteed by any framework's default — some deep-link handling normalizes or strips URL fragments before the app ever sees the full URL. This must be tested directly (e.g. `xcrun simctl openurl` / `adb shell am start` against the chosen router's actual link-handling code) before trusting the deep-link config in production. A silently-stripped fragment would mean every mobile-opened reveal link fails to decrypt with no obvious cause.

### 13.3 The fallback behavior

`[RECOMMENDATION]` Standard, well-precedented platform behavior: `apple-app-site-association` (iOS) and `assetlinks.json` (Android), hosted at the web domain, declare which paths open the native app when installed. When not installed, the same URL falls through to the existing web reveal page unchanged — **no code path unique to "app not installed" needs building**, since the web experience already works standalone and was built account-free specifically for this reason.

### 13.4 Security implications

`[RECOMMENDATION]` The capsule key fragment must never appear in: analytics events, crash-report breadcrumbs, server access logs (it already doesn't reach the server, by construction), or any native deep-link logging RN/Expo's own linking libraries might enable by default — this needs explicit verification that the chosen router doesn't log full URLs including fragments anywhere in a debug or crash-reporting path.

---

## 14. Local data / state management

`[RECOMMENDATION]` — audited against what already exists, not against what's popular.

**Confirmed by direct inspection: no state-management library (Zustand or otherwise) exists anywhere in this monorepo today.** Web solved server state with TanStack Query and everything else (session, master key, drafts) with plain React Context. This is the pattern to mirror, not diverge from.

| State category | Ownership | Mechanism | Rationale |
|---|---|---|---|
| Server state | Capsules, media, replies, notifications — anything the API is authoritative for | **TanStack Query** | Same library web already uses; direct transfer of institutional knowledge, zero new dependency |
| Session state | Access/refresh tokens, current user | React Context, mirroring `auth-context.tsx`'s pattern (with the three-state `unknown/authenticated/unauthenticated` restoration fix — §24 — applied natively from day one) | No new library needed |
| Crypto state | The resolved master key | React Context, mirroring `useMasterKey`, **in-memory only, never persisted** | Must not regress the zero-access guarantee |
| Draft state | Offline encrypted drafts | `expo-sqlite` (§6) + a thin React Query-style cache layer over it, or plain Context if the surface stays small | New, but the *pattern* (local-first, sync-on-reconnect) has no existing precedent to diverge from since web has none |
| UI state | Navigation, transient form state | Local component state / whatever the chosen router provides | Standard |
| Secure key state | Auth tokens, biometric wrapping key, draft-encryption key | `expo-secure-store` | The correct, minimal primitive — no case in this blueprint needs anything stronger |

**Explicitly not recommended:** adding Zustand, Redux, MMKV, or WatermelonDB. None solve a problem the above doesn't already cover, and none have any existing footprint in this codebase to justify the new dependency.

---

## 15. Design system — Meridian on native

`[IMPLEMENTED, web reference]` `packages/ui-web/src/tokens.css` holds 167 custom properties spanning both registers (dark instrument, paper record) and both themes. `[RECOMMENDATION]` these are **values to port as data**, not CSS to reuse — a native token file (plain TS constants) generated from the same source values, so the two platforms cannot silently drift apart.

| Element | Web | Native treatment |
|---|---|---|
| Typography | Source Serif 4 (record), IBM Plex Sans (instrument), IBM Plex Mono (data/tabular) | Same three families, bundled as native font assets (all SIL OFL — no licensing blocker) |
| Color | 167 tokens, light+dark, brass reserved exclusively for "waiting" (violated once on web, already fixed — worth stating as a rule up front so mobile doesn't repeat it independently) | Same values, native token file |
| Marks (Hallmark, etc.) | `[IMPLEMENTED]` `Hallmark.tsx` — mono, uppercase, tracked labels | Direct value port; trivial to rebuild as a native `Text` component with the same type scale |
| Record / Instrument surfaces | Paper-bordered object vs. dark chrome, never crossfading | Ports directly as a layout principle — the record is always bordered on all sides, an object never a background (Gate 1's first rule) |
| Buttons/fields | Radix-based on web | Native equivalents needed; the *hierarchy* (quiet action vs. grave/destructive action, weight on confirmation not the trigger) ports as a principle, the components do not |
| Motion | `07 Part VI`'s three tiers, enforced on web by a Tailwind-string-matching ESLint rule | **Does not transfer as tooling** — `packages/eslint-config/motion.js` pattern-matches class strings RN has no equivalent of. A native-specific lint rule or review checklist banning `Easing.bounce`/`Easing.elastic`/`withSpring` in Held-tier contexts and `ActivityIndicator`-as-loading-state is needed fresh |
| Reduced motion | CSS media query, automatic | `AccessibilityInfo.isReduceMotionEnabled()`, must be read and threaded explicitly — no automatic degradation on RN |
| Dark/light | `[IMPLEMENTED, web]` explicit stored preference, defaulting to light (with a real, currently-uncommitted hydration bug in the OS-fallback logic — §24) | Same default-light-unless-chosen policy; native has its own `Appearance` API for the OS-preference read, same "explicit choice always wins" rule |

**What should become a shared primitive vs. RN-native:** `[RECOMMENDATION]` the *token values* and the *principles* (two registers, quiet-vs-grave action weight, museum-label chrome, state-in-text-never-color-alone) should be written down once, referenced by both platforms. The *components* should not be shared — React DOM and React Native have no meaningful component-level portability, and attempting it (e.g. via react-native-web in reverse) would fight both platforms' native idioms for no real benefit at this product's scale.

---

## 16. Security threat model

`[RECOMMENDATION]` — mobile-specific, building on the zero-access architecture's existing guarantees rather than replacing them.

| Threat | Impact | Existing protection | Mobile mitigation | Residual risk |
|---|---|---|---|---|
| Rooted/jailbroken device | Local storage/memory more inspectable | Zero-access: server never has plaintext regardless | **Recommend no detection built** — easily bypassed, false confidence, doesn't match this product's actual threat model (the server-side guarantee holds regardless of device integrity) | Accepted, matches product's own security philosophy |
| Stolen unlocked phone | Full app access, master key may be in memory | None specific to this scenario | OS-level device lock is the primary boundary; biometric re-prompt after backgrounding-timeout (if "Protect my capsules" enabled) narrows the window | If biometric protection is off, residual risk equals "anyone with the unlocked phone" — same as any app |
| Stolen locked phone | No app access without device unlock | OS lock screen | Nothing additional needed — the device's own lock is the boundary | Low |
| Malicious app (same device) | Could attempt to read shared storage/clipboard | Master key never leaves JS memory, never written to shared storage | Secure-store entries are per-app-sandboxed by the OS; no shared storage used anywhere in this architecture | Low, standard OS sandboxing applies |
| Screenshots / app-switcher previews | A backgrounded app showing decrypted content in the OS app switcher | None | `[OPEN DECISION]` — blur/redact the app-switcher snapshot for reveal/composer screens specifically; real UX cost (a jarring blur on every backgrounding) vs. real privacy gain, a founder call not resolved by this audit | Real leak surface if left unaddressed — flagged, not decided |
| Clipboard | Copying letter text leaves plaintext in system clipboard history (iOS 16+/Android both surface this to some degree) | None specific | Low priority unless a "copy text" affordance is added to the reveal/composer — flag if that feature is ever built | Low, narrow surface |
| Notification previews | Lock-screen notification showing sensitive content | Content-blind by design (§12) | Enforced at the push adapter's construction, same discipline as email | Low, by construction |
| Logs | Tokens/keys/content in debug or crash logs | `[IMPLEMENTED, web]` a real log-redaction fix already shipped (PR #45) for sensitive request headers | Same discipline must apply to native logging and Sentry breadcrumbs — verify the RN Sentry SDK's default breadcrumb capture doesn't include request bodies/headers with tokens | Needs explicit verification, not assumed safe by default |
| Analytics | Behavioral tracking of private content | Web's PostHog config is deliberately content-blind (manual pageviews, no autocapture, no user-authored text as event properties) | Decision 19 makes this simpler for mobile V1 — minimal operational telemetry only, no behavioral analytics at all, so this threat is largely moot for V1 | Low, by scope decision |
| Deep links | Guessable/interceptable reveal tokens | 26-char base32, SHA-256-hashed at rest server-side — not guessable | Fragment-delivery spike (§13) is the only open question, unrelated to guessability | Low |
| Local database (drafts) | Plaintext drafts readable if device compromised | None today (no offline mode exists yet) | Encrypted at rest under a device-local key (§6) — the whole point of that section | Residual: device-local key itself lives in secure-store, same trust boundary as everything else |
| Secure storage | Keychain/Keystore extraction | Platform-provided hardware backing where available | Standard `expo-secure-store` usage | Matches platform-standard risk, not product-specific |
| Memory | Master key readable via memory inspection while the app is running and unlocked | Same as web — memory is never a zero-access guarantee's boundary, only "at rest" is | No mobile-specific change needed; this is an accepted, documented tradeoff already true of web | Unchanged from web's existing posture |
| Biometric bypass | Spoofed biometric unlocks the wrapping key | Platform biometric APIs' own anti-spoofing (Face ID/Touch ID/BiometricPrompt liveness checks) | No product-level mitigation beyond using the OS APIs correctly — this is squarely the platform's responsibility, not this app's | Matches platform-standard risk |
| Backup/restore | A device backup could include secure-store contents on some backup configurations | `expo-secure-store` on iOS is Keychain-backed, which by default is **not** included in unencrypted iCloud backups; Android Keystore-backed entries similarly resist most backup paths | Verify the exact `expo-secure-store` backup-exclusion behavior for both platforms before shipping — don't assume, confirm | `[OPEN DECISION]` — needs explicit verification, not assumed |
| App reinstall | Secure-store entries typically do not survive an uninstall/reinstall cycle (both platforms) | Platform-standard | Re-login/re-enrollment required after reinstall — correct, expected behavior, no special handling needed | None, expected |
| Account takeover | Credential theft leading to a real login | Existing refresh-token reuse-detection (§8) | No mobile-specific gap beyond ensuring tokens are secure-store-held, not `localStorage`-equivalent | Matches web's existing, already-reasonable posture |
| Recovery-code theft | Someone with a stolen recovery code can restore master-key access | `[IMPLEMENTED]` recovery code is high-entropy (128 bits), and the crypto is sound | No mobile-specific mitigation beyond the same physical-custody expectation the product already places on the printed recovery code | Inherent to the "no server-side escape hatch" design, already an accepted product tradeoff |

---

## 17. Performance, offline & error model

`[RECOMMENDATION]`

| Scenario | Expected behavior |
|---|---|
| No network | Text drafting continues (Decision 4); every other action (seal, media, reveal-confirm) states plainly that it needs connectivity, never a fake success |
| Slow network | Enclosure lifecycle's existing "Encrypting/Uploading" text-stated readings apply identically — never a percentage progress bar (`07 §XVI`) |
| Upload interruption | Media requires connectivity in V1 (Decision 16) — a dropped upload simply fails and states so; no resumable-background-upload complexity is in scope for V1 (that was T-25's original, much larger ambition — explicitly descoped here, see §22) |
| App backgrounding | No special handling needed for text drafts (already persisted locally per §6); an in-progress seal attempt should not be started in a state where backgrounding could leave it ambiguous — the seal call is a single synchronous request, matching web's own model |
| App termination | SQLite's durability covers drafts; nothing else in V1's scope (no offline sealing, no offline media) has a mid-flight state that termination could corrupt |
| Token expiry | Standard silent-refresh-on-401 (already the API client pattern on web) — port the pattern, not the storage |
| API failure | Stated in text, at the point of failure, matching the discipline already re-established on web after the recent "every error read as 'Something went wrong'" fix (§24) |
| Media failure | Stated plainly (failed/infected/released states already modeled server-side) |
| Crypto failure | Auth-tag verification failure (wrong password, corrupted data) always throws rather than silently returning wrong plaintext — this is AES-GCM's own guarantee, already relied upon throughout `@tc/crypto`, and must not be swallowed by a generic try/catch on mobile |
| Biometric failure | Falls through to password (§5) — never a dead end |
| Push failure | Best-effort, matching the email adapter's own posture (a failed send doesn't block the underlying event from having happened) |
| Deep-link failure | Falls through to the web experience (§13) — this is the built-in fallback, not a special error state to design |

**Explicitly not built:** any offline capability the product cannot safely complete — no offline sealing (Decision 7), no offline media (Decision 16), no fake "queued, will sync" UI for either.

---

## 18. Testing strategy

`[RECOMMENDATION]`

| Layer | Tooling | Proves |
|---|---|---|
| Unit | Vitest (matches every other package) | Draft-key logic, countdown math, pure crypto wrappers |
| Crypto compatibility | `@tc/crypto`'s existing + extended test vectors (§7.3) | Byte-identical AES-GCM, Argon2id, HKDF output vs. web, for the same inputs |
| RN component | React Native Testing Library | Render/state logic in isolation |
| API integration | Existing Supertest suite (291 tests) — no new backend test burden except the new push module and any recovery-flow endpoints | Every contract mobile depends on is already proven correct |
| E2E | Detox or Maestro — neither in the repo yet, a real tooling decision, not made by this audit | Full flows against a real/simulated device |
| Real device — iOS | Manual | Keychain, Face ID, real push (no APNs in simulator), real Universal Link opens |
| Real device — Android | Manual, including a mid-tier device | Keystore, real FCM, real App Link opens |
| Offline | Simulator network conditioning + real airplane-mode pass for the draft-persistence flow specifically | Draft survives, sync resumes correctly on reconnect |
| Background/foreground | Simulator for basic cases, physical device for anything claiming true backgrounding survival | — |
| Deep links | `xcrun simctl openurl` / `adb shell am start`, specifically testing whether the `#k=` fragment survives (§13's open question) | The single most important pre-ship verification in this whole plan |
| Biometrics | Physical device only (simulators don't reliably exercise real biometric hardware paths) | Full enrollment/unlock/fallback cycle from §5.3 |
| Media | Real files of every supported kind, matching the rigor already established during M2's own web verification (genuinely decodable media, not placeholder bytes) | — |
| Accessibility | VoiceOver/TalkBack manual pass on the reveal ceremony specifically — `07 §XIII` names this the product's highest-stakes accessibility surface | Automated tools miss whether the focus-and-announce sequence reads coherently aloud |

**What can be reused conceptually, not literally:** the API test suite's real scenarios (real capsule states, real M4/M5 edge cases, real One-Reading-Only destruction proofs) are the correct source of truth for what mobile's own integration tests should exercise against a live API — a re-pointing of proven scenarios at a second client, not a rewrite.

**The critical cross-platform compatibility test, stated once more for emphasis:** a capsule sealed on web must be fully readable on mobile, and vice versa, proven by the extended test-vector file (§7.3), not by manual spot-checking.

---

## 19. Infrastructure / release

`[RECOMMENDATION]`, cross-checked against `plan/PROGRESS.md`'s own human-setup checklist (confirmed, not re-derived from scratch).

| Need | Status |
|---|---|
| Expo/EAS account | `[FOUNDER DECISION territory]` — needed, ownership model (TC-specific vs. XYZ-shared) is a separate decision, not resolved here |
| iOS build (EAS) | Needs Apple Developer Program ($99/yr) — required regardless for TestFlight/App Store |
| Android build (EAS) | Needs Google Play Console ($25 one-time) |
| Environment variables | Mirror web's existing `NEXT_PUBLIC_*`/`.env.example` public-vs-secret discipline via Expo's `app.config.ts` + EAS build profile env vars — no new pattern to invent |
| API URLs | Same multi-tier config web already has (local/dev/prod) |
| Deep links | `apple-app-site-association` + `assetlinks.json` hosting at the existing web domain — no new domain/infra needed |
| Push notifications | Firebase project for FCM (ownership: TC-specific recommended, per the earlier Stage E audit's reasoning — push infra blast-radius isolation) |
| Certificates | Standard EAS-managed credentials for both platforms |
| App identifiers | Already set: `com.timelycapsule.app` (both platforms, in `app.json` today) |
| Store builds | EAS build profiles: development, preview/staging, production |
| Staging | `[OPEN DECISION]` whether a distinct staging API environment is needed for mobile, or dev-client-pointed-at-local suffices for V1 — not resolved by this audit, a real infra-cost/complexity tradeoff |
| Production | Same production API mobile will consume already exists and is live |
| OTA updates | Expo's own OTA update mechanism is available and standard for an Expo-managed app — no additional service needed |

**Do not assume additional paid services are needed beyond what's listed** — this audit found no case requiring a new third-party vendor beyond Apple/Google/Firebase, all already anticipated in the original human-setup checklist.

---

## 20. Reuse matrix

| Feature | Web implementation | Shared package? | Mobile reusable? | As-is? | Needs adapter? | Needs RN build? | Redesign? | Notes |
|---|---|---|---|---|---|---|---|---|
| Authentication | Full | `@tc/contracts` | Yes | Protocol yes | Storage (secure-store not localStorage) | Native login UI | No | §8 |
| Recovery | Crypto only, no UI | `@tc/crypto` | Partial | No | N/A | **Full UI, doesn't exist anywhere yet** | Yes | §8.2 — the key finding |
| Master-key handling | Full | `@tc/crypto` | Mostly | AES/HKDF yes | Argon2id blocked | Native KDF module | No | §7 |
| Capsule encryption | Full | `@tc/crypto` | Yes | Yes | No | No | No | Zero WASM dependency |
| Capsule decryption | Full | `@tc/crypto` | Yes | Yes | No | No | No | Once master key resolved |
| API client | Full | `@tc/contracts` | Pattern only | No | Yes (secure-store based) | Thin wrapper | No | §14 |
| Contracts | Full | `@tc/contracts` | Yes | Yes | No | No | No | Zero DOM dependency |
| Dashboard data | Full | Contracts | Yes | Yes | No | UI only | Adapt IA (§9) | Data layer untouched |
| Capsule creation | Full | — | Architecture only | No | No | Full native UI | Yes, interaction (§10) | Concept preserved |
| Address | Full | — | Architecture only | No | No | Full native UI | Yes | §10 |
| Scheduling | Full | Contracts | Data yes | Data yes | No | Native picker UI | No | Data model, not widget |
| Sealing | Full | Contracts | Yes | Yes | No | No | No | Requires connectivity (Decision 7) |
| Media upload | Full | Contracts + media API | Yes | Yes | No | Native picker/camera | No | Transport-agnostic by design |
| Media encryption | Full | `@tc/crypto` | Yes | Yes | No | No | No | AES-GCM only, no Argon2id involvement |
| Media viewer | Full | — | Principles only | No | No | Full native UI | No (3 rules preserved) | §11.2 |
| Replies | Full | Contracts | Yes | Data yes | No | UI only | No | One shared thread pattern to preserve |
| One Reading Only | Full | Contracts | Yes | Yes | No | UI wiring | No | Same `confirm-read` call, same timing discipline |
| Storage/release | Full | Contracts | Yes | Yes | No | UI only | No | "Reading, not a meter" copy pattern to preserve |
| Notifications (in-app) | Full | Contracts | Yes | Yes | No | UI only | No | — |
| Settings | Full | Contracts | Yes | Yes | No | UI only | No | — |
| Biometrics | n/a | — | No | No | No | Full native build | New | §5 |
| Local persistence | n/a (none exists on web) | — | No | No | No | Full native build | New | §6, §14 |

---

## 21. Implementation phases

`[RECOMMENDATION]` — dependency-derived, not numerically ordered.

### Phase 0 — Crypto compatibility spike
**Objective:** resolve the Argon2id/RN blocker with a proven, byte-identical implementation.
**Dependencies:** none.
**Files/packages affected:** `packages/crypto/src/kdf.ts`, `packages/crypto/test-vectors/`.
**Blocker:** §4/§7.3.
**Parallelizable:** yes, alongside Phase 1's non-crypto foundation work.
**Verification:** extended test vectors (§7.3) pass byte-identical against the chosen native implementation.
**DoD:** `deriveKeyFromPassword` produces provably identical output to `hash-wasm`'s Argon2id for the same inputs, on a real device, for both platforms.

### Phase 1 — Mobile foundation
**Objective:** navigable shell, no auth yet.
**Dependencies:** Phase 0 in progress (doesn't need to be *complete*, just not blocking non-crypto work).
**Files/packages affected:** `apps/mobile/*` (full build-out), navigation library integration.
**Blocker:** none once Phase 0's direction is set.
**Parallelizable:** design-token extraction (§15) alongside this.
**Verification:** app boots, navigates between the four tabs (§9) with placeholder content.
**DoD:** a navigable, themed, unauthenticated shell on a physical device.

### Phase 2 — Authentication + secure storage
**Objective:** real login, real session restoration, real master-key resolution.
**Dependencies:** Phase 0 complete (needs a working password → master key path), Phase 1's shell.
**Files/packages affected:** new auth context, `expo-secure-store` integration, `@tc/contracts` auth schemas consumed.
**Blocker:** Phase 0.
**Parallelizable:** recovery-flow UI (§8.3) can be built in parallel once the auth screens exist.
**Verification:** real login on a physical device, session survives app restart correctly (three-state restoration, §14), master key resolves.
**DoD:** matches the original T-23 DoD language almost exactly — "login + home timeline render on your physical phone via dev client" — plus a working password-reset-with-recovery-code path (§8.3), which the original DoD never anticipated needing.

### Phase 3 — Dashboard / navigation, real data
**Objective:** Home, Received, capsule detail — read-only surfaces, real API data.
**Dependencies:** Phase 2 (authenticated session).
**Files/packages affected:** new screens per §9, TanStack Query wiring.
**Blocker:** none.
**Parallelizable:** alongside Phase 4's early design work.
**Verification:** real capsules render correctly across every state (draft/sealed/unlocked/expired/withdrawn).
**DoD:** a real, authenticated user sees their real dashboard, matching Dashboard V2's balance (Decision 8).

### Phase 4 — Capsule creation
**Objective:** full Address → Compose → Seal, online-only initially.
**Dependencies:** Phase 2 (master key), Phase 3 (navigation to return to).
**Files/packages affected:** new composer screens per §10.
**Blocker:** none technical; highest product-risk phase.
**Parallelizable:** offline-draft encryption (§6) can be built alongside, integrated once both are ready.
**Verification:** a real capsule, sealed on mobile, opens correctly on web and vice versa (proves §7's compatibility chain end-to-end, not just in test vectors).
**DoD:** the full creation flow works online; text drafts persist encrypted offline and sync correctly.

### Phase 5 — Reveal, media, One Reading Only
**Objective:** the recipient-facing surfaces.
**Dependencies:** Phase 2/3's foundation; benefits from Phase 4's media-encrypt utility existing first (shared decrypt-side utility).
**Files/packages affected:** reveal ceremony, `EnclosureViewer`-equivalent, `confirm-read` wiring.
**Blocker:** the deep-link fragment spike (§13) should resolve before this phase ships, since reveal is this phase's whole purpose.
**Parallelizable:** alongside Phase 6.
**Verification:** full reveal ceremony on a physical device, real media of every supported kind, real One-Reading-Only destruction proof.
**DoD:** matches §11 in full, including accessibility.

### Phase 6 — Replies, notifications (in-app), biometrics
**Objective:** correspondence + "Protect my capsules."
**Dependencies:** Phase 5 (reveal exists, since replies live inside it), Phase 2 (auth/secure-storage foundation for biometric wrapping).
**Files/packages affected:** `Correspondence`-equivalent, biometric enrollment flow (§5).
**Blocker:** none.
**Parallelizable:** biometrics work is fully independent of replies work — genuine parallel track.
**Verification:** full §5 state table exercised on real devices (both platforms' biometric hardware).
**DoD:** replies read/write correctly; "Protect my capsules" gates the actual key per §5, never merely the UI.

### Phase 7 — Push + deep links, production-ready
**Objective:** push notifications, Universal/App Links fully wired.
**Dependencies:** Phase 1 (shell/routing), backend push adapter (can be built independently, in parallel, from Phase 0 onward).
**Files/packages affected:** new backend push module, native push registration.
**Blocker:** the deep-link fragment spike must be resolved (may already be, from Phase 5).
**Parallelizable:** the backend half is a genuinely independent track — see §22.
**Verification:** real push delivery, both platforms, real device; real Universal Link opens with and without the app installed.
**DoD:** matches §12/§13 in full.

### Phase 8 — Polish, testing, release infrastructure
**Objective:** ship-readiness.
**Dependencies:** all prior phases functionally complete.
**Files/packages affected:** EAS build profiles, store metadata, accessibility pass, error-model hardening (§17).
**Blocker:** real device availability for final sign-off testing.
**Parallelizable:** store-listing/asset prep can start earlier once the app is honestly screenshot-able (mirrors the same lesson the marketing site's own screenshot-honesty fix already taught this project, §24).
**Verification:** full §18 testing pyramid exercised; §25's Definition of Done checked line by line.
**DoD:** §25, in full.

---

## 22. Parallel workstreams

`[RECOMMENDATION]`

| Track | Content | Can start when |
|---|---|---|
| **Track A** | Crypto spike (Phase 0) | Immediately |
| **Track B** | Mobile design token extraction + native design-system audit (§15) | Immediately, independent of A |
| **Track C** | Backend push adapter + `PUT /push-tokens` (§12) | Immediately, independent of A and B — pure backend work |
| **Track D** | Navigation library evaluation + deep-link fragment spike (§13) | Immediately |
| **Track E** | EAS/infrastructure preparation (§19) — account setup, certificates, build profiles | Immediately, no code dependency at all |
| **Track F** | Recovery-flow UI design (§8.3) — can be designed and even prototyped against `@tc/crypto`'s existing, working primitives before Phase 2 needs it | Immediately |

**Do not parallelize:** Phase 4 (creation) and Phase 5 (reveal) implementation against each other if the same engineer(s) are building the shared media-decrypt utility both depend on — that specific piece should be built once, deliberately, not raced.

---

## 23. Explicit non-goals for Mobile V1

`[FOUNDER DECISION-derived]`

- Guest Mode (Decision 2) — architecture confirmed sound and reusable later, not touched.
- Offline media of any kind (Decision 16).
- Offline sealing / sync-conflict resolution (Decision 7).
- Reveal haptics (Decision 3).
- Behavioral/product analytics (Decision 19) — operational telemetry only.
- A generic chat UI for replies — correspondence stays a thread of letters, not messages (§11 principle, unchanged from web).
- Widgets, share extension — real, valuable, explicitly deferred per the brief's own scope statement (Decision 20).
- Duplicate backend functionality — every reused endpoint in §20 stays reused; nothing in this plan re-implements server-side logic client-side.
- App-only capsule links (Decision 17) — web fallback is non-negotiable.
- A second cryptographic authority for biometrics (§5) — the biometric path wraps the *same* master key, it does not mint an independent one.
- WASM polyfills for Hermes as the crypto fix (§7.3) — explicitly ruled out.
- Weakening the KDF to solve the platform gap (§7.3) — explicitly ruled out.

---

## 24. Documentation reconciliation

`[DOCUMENTED, reported not fixed]` — nothing below was edited.

| Document | Location | Current statement | Actual/current behavior | Conflict | Severity | Recommended resolution |
|---|---|---|---|---|---|---|
| `05-BUILD-PLAYBOOK.md` | T-24 | "in-app reveal ceremony with haptics (seal thud/unlock crack)" | `07-EXPERIENCE-BIBLE.md` Part VII bans haptics anywhere except the seal, on-device, creator-only | Direct | High (already resolved by Decision 3, but the source doc still says otherwise) | Amend T-24's text |
| `05-BUILD-PLAYBOOK.md` | T-28 | "screenshots via device frames" | `07 §XVI` bans device mockups outright | Direct | Medium | Amend to specify real-device screenshots |
| `05-BUILD-PLAYBOOK.md` | T-28 | "onboarding (3 steps per `02 §5.3`)" | `07 §XVI` bans onboarding tours outright | Direct | Medium | Remove or redefine as purely functional |
| `02-UX-DESIGN.md` | §15 "Mobile Apps" | References `@tc/ui-native` (a package name), WatermelonDB, Material You dynamic color | Neither package nor dependency exists anywhere in this repo; the section predates Meridian V2 entirely | Structural — the whole section is stale | High | This blueprint supersedes §15; a formal rewrite or superseding note is still owed |
| `plan/PROGRESS.md` (top block) | "Marketing package refresh"/"Theme default fix" entries | Says "not yet committed — local changes pending review" | `git status` at audit time confirms exactly those files (`auth-context.tsx`, `layout.tsx`, `ThemeToggle.tsx`, `SealMovement.tsx`, `dev/schedule/page.tsx`, plus design/launch assets) as modified/untracked in the working tree | None — the prose is accurate | Informational only | None needed; flagged here so a future mobile session doesn't assume `origin/main` already has this fix |
| `01-PRODUCT.md` | §20 | Premium listed as flat 100 GB | M4/M5 decisions specify storage packs (10/50/100/500 GB) | Pre-existing, already tracked in `PROGRESS.md`'s own M4 section | Medium, monetization-scoped | Needs a pricing decision before Premium-tier work; not a Stage E blocker |
| `01-PRODUCT.md` | §20 | No note on expiry tiering by plan | Post-M5 correctness milestone flagged Free/Premium expiry-tiering as an open question | Pre-existing, already tracked | Low for Mobile V1 | Same, monetization-scoped |
| `@tc/crypto` README | Threat note 7 | Already states Argon2id-via-WASM is a "current choice for portability," swappable behind `kdf.ts`'s signature | Confirmed accurate and exactly correct — this document's §7.3 recommendation *is* what this note already anticipated | None — this is a correct, prescient note | — | None needed; cite it, don't restate it as new |
| `apps/web` (code) | `/reset` page + `MasterKeyGate.tsx` | Implicitly assumes password-reset recovery works | `restoreMasterKeyFromRecoveryCode`/`parseRecoveryCode` are never called anywhere in `apps/web/src` — confirmed by direct grep | The product's actual recovery story does not match what the crypto package and its own documentation imply is available | **High** — this is a real, user-facing dead end today, independent of mobile | Not this audit's to fix (out of Mobile V1's direct file scope), but flagged with maximum severity per Decision 14's explicit instruction to audit this exact area |

---

## 25. Open decisions

Genuinely new items surfaced by this audit, beyond the 20 already locked. `[OPEN DECISION]` throughout.

**HARD BLOCKERS**
1. Argon2id/RN implementation choice (§7.3) — blocks Phase 2.

**TECHNICAL QUESTIONS**
2. Does the chosen router/linking config deliver the URL fragment intact on a Universal Link open? (§13) — needs a spike, not a desk answer.
3. Does `expo-secure-store` reliably exclude its contents from device backups on both platforms? (§16) — needs explicit verification.
4. Navigation library: Expo Router vs. bare React Navigation — not decided by this audit (the prior Stage E Blueprint recommended Expo Router; nothing here contradicts that, but it's not re-litigated as settled).
5. Staging environment: dedicated mobile staging API, or dev-client-against-local for V1? (§19)

**FOUNDER DECISIONS (new, not among the original 20)**
6. Should biometric unlock be offered as an explicit recovery-assist option during the password-reset flow itself, given the architecture in §5.2 makes it technically possible? (§5.3)
7. Should app-switcher screenshot redaction be built for the reveal/composer screens? (§16) — real UX cost vs. real privacy gain, unresolved.
8. Should the recovery-code restore flow (§8.3) be built mobile-first and backported to web, or built for both simultaneously? Web's gap is real and pre-existing regardless of mobile's timeline.
9. Account-switching behavior for the offline draft key, once multi-account-per-device becomes real (§6.4) — not needed for V1, flagged so it isn't silently assumed away.
10. Ownership model for Firebase/Expo-EAS/Sentry/PostHog (XYZ-shared vs. TimelyCapsule-specific) — carried forward from the prior Stage E Blueprint, still unresolved, still relevant to Phase 7/8.

**NICE-TO-HAVE QUESTIONS**
11. Whether to extend `@tc/crypto`'s test-vector file now (ahead of the Phase 0 spike, so the native module has a target from day one) or generate it alongside the spike — a sequencing preference, not a blocking decision either way.
12. Whether Track F's recovery-flow UI design should be prototyped in isolation or designed jointly with whatever Phase 8 store-listing/onboarding copy work happens, given both touch first-run trust-building language.

---

## 26. Final Mobile V1 Definition of Done

`[RECOMMENDATION]`

**Functional**
- Authenticated login, session restoration (three-state, no hydration race), and logout all work correctly on a physical device, both platforms.
- Dashboard/Home reflects Decision 8's balance — upcoming, received, drafts, restrained create — matching Dashboard V2's actual current data model.
- Address → Compose → Seal completes end-to-end online; sealed capsules are indistinguishable in correctness from web-sealed ones (same state machine, same server-side validation).
- Received capsules, reveal ceremony, and One Reading Only all work correctly, including the destructive confirm-read path firing at the correct moment.
- Encrypted replies read and write correctly on both sides of a correspondence.
- Media enclosure (photo/video/voice/document) works fully online, with the museum-label viewer discipline preserved.

**Security / crypto compatibility**
- Phase 0's byte-identical Argon2id proof passes on real devices, both platforms, against the extended test-vector file.
- A capsule sealed on web opens correctly on mobile and vice versa — proven, not assumed.
- The master key is never persisted outside memory except behind the biometric-gated wrap described in §5.2, and never behind anything weaker.
- Recovery-code restore (§8.3) exists and works — mobile does not ship with the same silent dead-end web currently has.

**Offline drafts**
- Text drafts persist locally, encrypted under a device-local key independent of the master key, survive app restart and crash, and sync correctly on reconnect.
- No offline sealing exists; no offline media exists; neither presents a fake "queued" state.

**Biometrics**
- "Protect my capsules" gates the actual master key via the wrap-of-a-wrap architecture in §5.2, never merely a screen lock.
- Every failure mode in §5.3's table falls through correctly to password, with no dead end.

**Notifications**
- Push delivers correctly on both platforms, content-blind at every privacy tier (Decision 13), covering at minimum unlock, reply, and retention-warning events.

**Deep links**
- Universal/App Links open the native app when installed and fall through correctly to web when not (Decision 17), and the `#k=` fragment is confirmed, not assumed, to survive the hand-off.

**Accessibility**
- VoiceOver/TalkBack pass on the reveal ceremony specifically confirms the focus-and-announce sequence reads coherently, not just that labels exist.
- Reduced-motion is read explicitly (`AccessibilityInfo`) and every Held Beat survives it, matching `07 §VI` rule 4's requirement that reduced motion is not a lesser experience.

**Performance**
- Cold start and timeline scroll meet the original ticket text's own stated budgets (sub-2s p90 cold start on mid-tier hardware, 60fps scroll) — not redefined down for this audit's convenience.

**Testing**
- The full pyramid in §18 has been exercised at least once on real hardware, both platforms, before any store submission.

**Privacy**
- No behavioral analytics anywhere (Decision 19) — confirmed by the same discipline as web's own content-blind PostHog config, adapted to whatever minimal operational SDK mobile actually ships with.

**Release infrastructure**
- EAS build profiles exist for development, preview, and production; both platforms build and install from a TestFlight/Play internal track successfully.

---

## Final Verdict

# READY AFTER CRYPTO SPIKE

Everything else in this document — the API, the contracts, the entitlement and lifecycle model, the design constitution, the reuse matrix — is sound, well-tested, and ready to build against today. The product's architecture does not need to change shape for mobile; nothing found in this audit is a re-architecture, only real, substantial building.

The one thing standing between "audit complete" and "Phase 1 can start in earnest" is Phase 0: proving a native Argon2id implementation produces byte-identical output to what's already protecting every real user's master key today. That is a bounded, answerable, days-not-weeks question — not a redesign, and not a reason to delay the parallel tracks (§22) that don't depend on its answer.

The second most important finding in this document is not a mobile blocker at all: the recovery-code restore flow does not exist anywhere in the product today, on any platform. Mobile V1 should not inherit that gap silently — §8.3 is the concrete, buildable fix, using crypto that already exists and is already tested.
