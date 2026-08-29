# Stage E, Mobile V1 — E1.3 Audit & Implementation Blueprint

**Status:** Audit + implementation-planning only. No application code was modified to produce this document. No branches, commits, or PRs were created.

**Evidence labels used throughout:**
`[VERIFIED]` read directly from running/current code · `[INFERENCE]` a conclusion reasoned from verified evidence, not itself directly stated · `[RECOMMENDATION]` a proposed approach, not yet decided · `[OPEN DECISION]` genuinely unresolved, needs a founder/team call · `[BLOCKER]` prevents the next step as currently understood · `[PARKING LOT]` real work, deliberately not part of E1.3.

**Audited against:** `origin/main` post-PR #50 (E1.2 merged), branch `e1.2-mobile-auth-foundation` at commit `095cc08`. Working tree clean at audit start and end (confirmed in §26).

**Supersedes/extends, does not replace:** `plan/STAGE-E-MOBILE-V1-IMPLEMENTATION-BLUEPRINT.md` (the pre-E1.1/E1.2 architecture audit — 20 founder decisions, crypto compatibility chain, IA, design system, security threat model) and `plan/STAGE-E-MOBILE-V1-EXECUTION-BACKLOG.md` (the pre-E1.1/E1.2 ticket breakdown, Phases 0–8). Both remain the architectural source of truth for anything this document doesn't explicitly revise. This document's job is narrower: confirm what's changed since they were written (E1.1, E1.2, and whatever the web app has shipped since), and produce the concrete, current, executable definition of the *next* ticket — which this document calls E1.3, matching the actual session-numbering convention already in use in `plan/PROGRESS.md` (not the backlog's internal `E1.1`–`E8.8` sub-ticket numbering — see §21 for the reconciliation).

---

## 1. Executive summary

**E1.3 is: read-only capsule browsing.** A real, authenticated mobile user opens the app and sees their actual capsules — sealed and counting down, unlocked and readable, received from others, in every real lifecycle state — and can open one, unwrap its content with their already-resolved master key, and read it. Nothing is created, sealed, replied to, or enclosed in this ticket. This is Phase 3 ("Dashboard") from the pre-existing execution backlog, confirmed still correct against current shipped reality, adapted to the concrete files E1.2 actually produced.

**Why this is next, not something else:** `[VERIFIED]` E1.2 shipped auth, session persistence, and master-key resolution — a real user can get *into* the app and unlock their key, but the four tabs (Home/Received/Notifications/Profile) are static placeholder text (`apps/mobile/app/(app)/(tabs)/{home,received,notifications,profile}.tsx`, confirmed by direct reading — each renders a hardcoded string, no API call). The very next capability gap, confirmed by re-auditing the current web product as source of truth (not by re-reading old tickets), is that a logged-in mobile user cannot see or read a single one of their real capsules. Capsule *creation* (Address/Compose/Seal) and *reveal* (recipient-facing, no-account) are both larger, higher-risk, and — critically — **both depend on decrypting a capsule's content**, which browsing/detail is the first place that capability needs to exist. Building browsing first produces the shared "decrypt a capsule and render its letter" utility that creation's preview and reveal's ceremony will both need later, without racing two tracks to build it twice (a risk the pre-existing backlog already flagged, §22 there, §17 here).

**What's genuinely new since the pre-existing blueprint/backlog were written:** those two documents predate E1.1 (backend recovery foundation) and E1.2 (mobile auth) entirely — they describe Phase 1 (mobile foundation) and Phase 2 (auth) as *future* work with detailed sub-tickets (`E1.1`–`E1.10`, `E2.1`–`E2.10` in the backlog's own numbering). **Actual E1.2 compressed almost all of Phase 1 and the core of Phase 2 into one ticket**, and did so with some different technical choices than the backlog assumed (no `react-native-quick-crypto` polyfill of `crypto.subtle` at all — instead `@noble/ciphers` pure-JS AES-GCM and `react-native-libsodium` native Argon2id, a cleaner outcome than the backlog's own recommendation). It also left real gaps the backlog's fine-grained tickets called for and E1.2 did not build: signup, Google OAuth, password change, and recovery-code restoration on mobile, plus the native design-token/typography/theme/accessibility foundation work. None of these gaps block E1.3 (confirmed in §3/§19) — they're real, tracked, and explicitly not pulled into this ticket's scope (§20).

**The most consequential new finding of this audit:** `[VERIFIED]` `packages/crypto/src/random.ts` (`generateAesKey`/`generateIv`/`generateSalt`/`generateRecoveryCodeBytes`) has **no `.native.ts` override** and calls `crypto.getRandomValues` directly — a function Hermes does not provide, and which is not polyfilled anywhere in `apps/mobile` today (verified: no `expo-crypto`, no `react-native-get-random-values` in `apps/mobile/package.json` or `app.json`). E1.2's login flow never exercised this gap because unwrapping an existing wrap needs no fresh randomness (`extractSalt` reads the salt already embedded in the ciphertext; decryption needs no new IV). **E1.3 (read-only decrypt) also does not need this file** — confirmed by tracing every function E1.3 calls (§6) — so this is correctly **not a blocker for E1.3**, but it is a real, previously-undiscovered `[BLOCKER]` for E1.4 (capsule creation, which must generate capsule keys and IVs) and should be fixed as a small, independent, parallelizable ticket now rather than discovered mid-E1.4.

**Second finding worth stating plainly:** `[VERIFIED]` the pre-existing blueprint's "recovery flow does not exist anywhere" finding (§8.2 there) is now **half-fixed**: E1.1 built the backend contract (`POST /auth/password/reset/recovery-key`, `ResetPasswordRequestSchema.masterKeyWrap`) but **no UI consumes it anywhere — not web, not mobile.** This remains a real, tracked, pre-existing gap, unrelated to E1.3's scope, carried forward to the parking lot (§20) exactly as the prior audit left it.

**Verdict: E1.3 is ready to build now.** No blocker exists for the recommended scope (§15/§22). One small, independent, non-blocking crypto-completeness fix (`random.native.ts`) is recommended to land alongside or just before it, for E1.4's benefit, not E1.3's.

---

## 2. Current-state evidence

### 2.1 Repository

| | |
|---|---|
| Branch audited | `e1.2-mobile-auth-foundation` (merged to `main` via PR #50) |
| Working tree | Clean at audit start; clean at audit end (§26) |
| `apps/mobile` | Real auth app: login, session persistence, master-key unlock/re-prompt, 4-tab placeholder shell. `apps/mobile/src/lib/`: `auth-context.tsx`, `master-key-context.tsx`, `api-client.ts`, `token-store.ts`, `tokens.ts`. `apps/mobile/src/components/master-key-gate.tsx`. `apps/mobile/app/`: `_layout.tsx`, `index.tsx`, `(auth)/{_layout,login}.tsx`, `(app)/_layout.tsx`, `(app)/(tabs)/{_layout,home,received,notifications,profile}.tsx`. 20 tests, all passing. |
| `apps/web` | `[VERIFIED]` Meridian V2 design system, Dashboard V2, Capsule Creation V2 (Address/Compose/Seal), unified `CapsuleRow`, full enclosure/media/reply/One-Reading-Only lifecycle (M0–M5), Place Memory, guest architecture — all shipped and confirmed by direct code tracing (§4). |
| `apps/api` | `[VERIFIED]` ~90+ endpoints across 17 modules (16 from the prior audit + `places`, confirmed present). All capsule/media/recipient/reply/notification/tag/collection/favorite endpoints mobile-relevant for E1.3 are complete and production-ready (§5). One confirmed dead table (`push_tokens` — schema exists, zero routes reference it). |
| `packages/crypto` | `[VERIFIED]` AES-GCM and HKDF fully portable (`aes.native.ts`, `kdf.native.ts` already exist, already proven on real Android hardware per E1.2's own verification). **New finding:** `random.ts` has no native path (§1, §6.4). |
| `packages/ui-web` | `[VERIFIED]` `tokens.css` — Meridian V2, two registers (instrument/record), light-default theme, brass reserved for "sealed" only. Confirmed current and authoritative (not `plan/02-UX-DESIGN.md §6`, which is stale — §9). |

### 2.2 Stage E status, restated precisely

| Item | Status | Evidence |
|---|---|---|
| E0.1 Argon2id compatibility | PASS, shipped in E1.2 | `packages/crypto/src/kdf.native.ts`, verified byte-identical on real Android hardware during E1.2's own manual test |
| E0.2 deep-link fragment | PARTIAL — Android evidence only, iOS needs physical device | Carried forward unchanged, not touched by E1.2 or this audit |
| E0.3 SecureStore | PASS — iOS biometric invalidation still physical-device-gated | Carried forward; E1.2 used plain (non-biometric) SecureStore entries only, consistent with this gate not yet being exercised |
| E0.4 navigation foundation | PASS | Expo Router chosen and now in real production use (E1.2) |
| E0.5 recovery-flow design | PASS (design only) | E1.1 implemented the backend half of the design; no UI anywhere yet (§1, §20) |
| E1.1 backend recovery foundation | DONE | `POST /auth/password/reset/recovery-key`, `ResetPasswordRequestSchema.masterKeyWrap` — confirmed live (§5 domain 9) |
| E1.2 mobile authentication foundation | DONE | Full audit in §3 |

### 2.3 What changed on web since the pre-existing blueprint/backlog were written

`[INFERENCE]` The prior blueprint's own text says Meridian V2/Dashboard V2/Capsule Creation V2/M0–M5 were *already* shipped when it was written — so the web product surface itself has not materially grown since. What this audit found *beyond* that prior audit is **detail**, not new features: exact file:line traces of the creation/reveal/reply/expiry pipelines (§4), the exact current API contract shapes (§5), and one genuinely new-since-then data point — `design/21-CAPSULE-CREATION-V2.md`'s own §XI.4 flags that `plan/02-UX-DESIGN.md §15` (Mobile Apps) is known-stale and was never rewritten, which this audit independently reconfirms (§21).

---

## 3. E1.2 audit

### 3.1 What is production-quality

`[VERIFIED]` The auth/session/master-key core is solid and should not be touched for E1.3:
- Three-state hydration (`unknown`/`authenticated`/`unauthenticated`) in `auth-context.tsx` — no hydration race, confirmed on real Android hardware including a full force-kill/relaunch cycle.
- `MasterKeyGate` (`src/components/master-key-gate.tsx`) — correctly gates on `user.masterKeyWrap` presence, not validity; re-prompts rather than regenerating a key. This is the exact discipline the prior blueprint's §8.2/E2.5 called the single most important failure mode to avoid, and it is built correctly.
- `token-store.ts` — SecureStore-backed, async, holds exactly two token fields, nothing else (grepped, confirmed).
- `api-client.ts` — schema-validated via `@tc/contracts`, single-flight refresh-on-401, `Platform.OS`-aware dev URL (a real fix E1.2 found and shipped, not in the original plan).
- 20 tests (`react-test-renderer` + `vi.mock` for native modules) covering hydration, login (success/invalid/network-fail/master-key-fail), logout, storage.

### 3.2 What is deliberately placeholder

`[VERIFIED]` The four tab screens are literally static: `home.tsx` renders `"Welcome, {name}"` + `"Your capsules will show up here."`; `received.tsx`, `notifications.tsx` render single static strings; `profile.tsx` renders the user's email and a working logout button, nothing else. This is stated as deliberate in `PROGRESS.md`'s E1.2 entry and confirmed by reading the files — not a surprise, exactly what was reported.

### 3.3 What is reusable as-is for E1.3

- `auth-context.tsx`, `master-key-context.tsx`, `master-key-gate.tsx`, `token-store.ts`, `api-client.ts` — all reused unchanged. E1.3 adds capsule-domain API calls to `api-client.ts` (or a sibling file — see §16), it does not restructure it.
- `src/lib/tokens.ts` — the minimal color/spacing subset — reusable but **insufficient** (§3.5).
- Navigation shell (`app/(app)/(tabs)/_layout.tsx` and siblings) — the four-tab structure is correct (§9) and does not need restructuring, only real content behind each tab.

### 3.4 What should be refactored before/alongside E1.3

`[RECOMMENDATION]`, none are blockers:
1. **`api-client.ts` should grow a capsule-domain section**, not a parallel client. The existing `request()`/`authApi` pattern (schema validation, auth-header injection, single-flight refresh) is correct and should be extended with a `capsulesApi`/`receivedApi` object following the exact same shape — not a new library, not a rewrite (§16, ticket E1.3.6).
2. **`src/lib/tokens.ts` needs to grow**, not be replaced. It currently has ~10 color values and no type scale, no font families, no motion tokens. E1.3's capsule list/detail screens need at minimum: the state-color mapping for `CapsuleState` (draft/sealing/sealed/unlocked/expired/withdrawn), a type scale for record vs. instrument text, and the record register's serif treatment for letter content specifically (`packages/ui-web/src/tokens.css`'s `.tc-record` class has no mobile equivalent yet). This is real work, sized correctly as its own ticket (§16, E1.3.2), not a blocker for starting the rest.
3. **No `ErrorBoundary`, no shared loading/empty-state primitives exist yet** (backlog's E1.8/E1.9, never built — E1.2 didn't need them, since auth screens handle their own errors inline). E1.3's list/detail screens are the first place these are genuinely needed (empty list, loading a list, a capsule that fails to decrypt). Build as part of E1.3, not deferred (§16, E1.3.3).

### 3.5 Is the auth/master-key boundary correct for future screens?

`[VERIFIED, yes]` `useAuth()` exposes `{ authState, user, login, logout, refreshUser }`; `useMasterKey()` exposes `{ masterKey, setMasterKey, clearMasterKey, unlockWithPassword }`. Any E1.3 screen that needs to decrypt content reads `masterKey` from context directly — no new plumbing needed. The boundary correctly keeps "am I logged in" and "can I decrypt" as two separate, independently-readable pieces of state, matching the pre-existing blueprint's explicit requirement (§8, Phase 2 preamble there) and web's own pattern.

### 3.6 Are crypto APIs ergonomic enough for capsule/media/reply work?

`[VERIFIED, mostly yes, one gap]` `unwrapCapsuleKeyForOwner(wrap, masterKey)` → `decryptBytes(capsuleKey, iv, ciphertext)` is exactly what E1.3's capsule-detail screen needs, and both are already platform-portable (`@tc/crypto`'s exported functions, auto-resolved to native implementations by Metro). The one gap is `random.ts` (§1, §6.4) — irrelevant to E1.3's decrypt-only needs, relevant to E1.4.

### 3.7 Is the current tab shell correct, or does it need to change before real content lands?

`[VERIFIED, no change needed]` Home / Received / Notifications / Profile, as four tabs with capsule creation as a FAB (not yet built, not needed until E1.4) rather than a fifth tab, matches Dashboard V2's own actual data model (§4.4) and the pre-existing blueprint's §9 recommendation, independently re-confirmed against current web reality by this audit (§9 below). No IA change is warranted.

---

## 4. Web capability inventory (capsule creation → reveal, traced end to end)

All of this section is `[VERIFIED]` by direct code reading (this session's dispatched research), file:line references preserved.

### 4.1 Capsule creation flow

Entry: `apps/web/src/app/capsule/new/page.tsx` — thin create-then-redirect (`POST /capsules {type}` → redirect to `/capsule/:id/edit`), deliberately separated from the composer so a mid-composer refresh never double-creates.

Composer: `apps/web/src/components/composer/Composer.tsx`, wrapped in `MasterKeyGate`, drives three freely-navigable "movements" (`design/21-CAPSULE-CREATION-V2.md`'s naming, confirmed accurate against code):

| Movement | Component | Collects |
|---|---|---|
| Address | `v2/AddressMovement.tsx` (+`AddresseeBeat`, `Horizon`, `ExactMoment`) | Recipients (`POST /capsules/:id/recipients`), unlock time (`unlockAt`/`unlockLocal`/`unlockMode`) |
| Compose | `v2/ComposeMovement.tsx` (+`RecordLetter`, `Enclosures`, `VoiceRecorder`, `PlaceMemoryDialog`) | Letter (TipTap doc), media/voice/place |
| Seal | `v2/SealMovement.tsx` (+`ConditionsPanel`) | `announceOnSeal`, `allowDownload`, `recipientsVisible`, seals (Place/Passphrase/Identity), `expiresAfter`/`expiryStrict`, `breakGlass`, `recurrence`, title |

Client-side crypto sequence (`apps/web/src/lib/use-capsule-draft.ts`):
1. First load: `unwrapCapsuleKeyForOwner(ownerKeyWrap, masterKey)` if a wrap exists, else `generateCapsuleKey()` + `wrapCapsuleKeyForOwner()` + `PATCH /capsules/:id {ownerKeyWrap}`.
2. Every autosave: `encryptBytes(capsuleKey, JSON.stringify(contentDoc))` → `contentDocEnc` in `PATCH /capsules/:id`.
3. Media: same `encryptBytes` call, raw bytes (binary upload, not base64-in-JSON).
4. Passphrase Seal: `wrapCapsuleKeyWithPassphrase` (Argon2id-derived wrapping key, separate salt).
5. Invite link built client-side at seal time: `encodeCapsuleKeyForLink(capsuleKey)` → `#k=...` appended to the reveal URL, sent to the server only as an already-opaque link string (`POST /capsules/:id/recipients/:rid/announce {link}`) — the server never sees the key.

**Plaintext vs. encrypted, precisely:** encrypted under the capsule key — `contentDocEnc`, every media blob, reply bodies. Plaintext — `title`, `teaser`, `cover`, `unlockAt`/`unlockLocal`, seal *config* (Place seal's lat/lng/radius/name, Passphrase seal's hint — only `wrappedKeyB64` inside it is ciphertext), `replyPrompt`, boolean flags, `expiresAfter`/`expiryStrict`, `recurrence`, `breakGlass`.

**A live discrepancy found, not previously documented:** `CapsuleSchema` carries a **plaintext `location: {lat, lng, name}` field** (`packages/contracts/src/capsules.ts:176`), separate from the encrypted Place-Memory data inside `contentDocEnc`'s `LetterEnvelope`. `design/21-CAPSULE-CREATION-V2.md`'s own reasoning explicitly argues a plaintext location column "would hand the server the writer's location, breaking the zero-access hard rule" — yet the schema still has one, it's returned unencrypted in `RevealResponse`'s unlocked branch, and it's rendered directly in `RevealCeremony.tsx:172-174`. No current composer code was found writing to it (`grep` across `components/composer/` finds nothing populating it) — it reads as vestigial/dead, but it is live schema, live API surface, and live UI. **`[OPEN DECISION, not E1.3's to resolve]`** — flagged here because mobile should not assume this field is meaningful, and should not populate it if it ever builds creation (§20).

### 4.2 Capsule key derivation (`packages/crypto/src/capsule-key.ts`, read in full — reproduced for reference)

```
generateCapsuleKey()                          → random 256-bit AES key
wrapCapsuleKeyForOwner(key, masterKey)        → wrapKey(key, masterKey, ZERO_SALT) — key-to-key, no KDF
unwrapCapsuleKeyForOwner(wrapped, masterKey)  → unwrapKey(wrapped, masterKey)
wrapCapsuleKeyWithPassphrase(key, passphrase) → Argon2id(passphrase, freshSalt) → wrapKey
unwrapCapsuleKeyWithPassphrase(wrapped, pw)   → extractSalt(wrapped) → Argon2id(pw, salt) → unwrapKey
encodeCapsuleKeyForLink(key)                  → `k=${base64url(key)}` (fragment only, never sent to server)
decodeCapsuleKeyFromLink(fragment)            → regex-extract + base64url-decode
```

One capsule key per capsule, generated once, never sent raw to the server. Two at-rest forms: `ownerKeyWrap` (wrapped under the account master key) and, optionally, a Passphrase Seal wrap. The recipient's copy travels only in the URL fragment. **This is the single function E1.3's capsule-detail screen needs on the decrypt side** — `unwrapCapsuleKeyForOwner`, already portable, already proven.

### 4.3 Sealing

`Composer.tsx` → `capsulesApi.seal(id)` → `POST /capsules/:id/seal` → `lifecycle.ts:sealCapsule` — validates state machine, bounds-checks `unlockAt`, requires all media `ready`, captures a frozen entitlement snapshot, transitions `draft → sealed`, schedules a `capsule_unlock` action. **Not in E1.3's scope** (creation-only); included here because E1.3's detail screen must render every state this produces correctly.

### 4.4 Dashboard / capsule list — the critical finding for E1.3's design

`[VERIFIED]` `apps/web/src/app/(app)/home/page.tsx` → `GET /capsules` → `CapsuleListItemSchema` (`CapsuleSchema.omit({contentDocEnc, ownerKeyWrap})`). **Nothing on the dashboard decrypts anything — the master key is never touched by the list view.** `CapsuleRow.tsx` renders title-or-fallback, a Dual Clock (elapsed/remaining from `sealedAt`/`unlockAt`), and status — all plaintext metadata, zero crypto import in that file.

**This directly determines E1.3's design:** the Home and Received list screens need **no master-key check at all** — they can render fully for a user who is authenticated but hasn't unlocked their key yet (e.g., `MasterKeyGate` re-prompt pending). Only the capsule-*detail* screen's "open the letter" action needs the key. This is a meaningfully different (and simpler, safer) architecture than assuming every capsule-list screen needs to be behind `MasterKeyGate` — it should NOT be; only the detail screen's decrypt action should be.

### 4.5 Capsule detail / open flow (owner)

`apps/web/src/app/(app)/capsule/[id]/page.tsx` → `GET /capsules/:id` (full `CapsuleSchema`, owner-only). `LetterRecord.tsx` gates on exactly three states before showing content:
1. **Destroyed** — `expiryStrict && state === 'expired'` → "Destroyed... there is no copy anywhere, including here," no unlock attempt (server already nulled `contentDocEnc`).
2. **Withheld** — a self-capsule still `sealed` → never shown, even to the owner.
3. **Closed** — master key not in memory → "Read it" button, wrapped in `MasterKeyGate`.
4. **Open** — `unwrapCapsuleKeyForOwner(ownerKeyWrap, masterKey)` → `decryptBytes` on `contentDocEnc` → `JSON.parse` → render.

Media: each enclosure's `load()` re-unwraps the capsule key, calls `GET /media/:id/view` (15-min presigned URL), decrypts. Replies: `GET /capsules/:id/replies` then per-message decrypt with the same capsule key.

**This four-state model (Destroyed/Withheld/Closed/Open) is exactly what E1.3's capsule-detail screen must reproduce** — not a simplified version.

### 4.6 Recipient / reveal flow

`[VERIFIED, not in E1.3's scope, documented for later reference]` `apps/web/src/app/(reveal)/c/[token]/page.tsx` — fully public, no auth on any call except `save()`. `GET /r/:token` (no auth) returns `locked`/`unlocked`/`withdrawn`/`expired`. Key acquisition is one of three paths: identity-gate OTP, Passphrase-Seal unwrap, or `#k=` fragment extraction — the server never participates in a key exchange for this path. Confirms the "recipient reveal works with no account" hard rule holds in code.

### 4.7 Encrypted replies

`[VERIFIED, not in E1.3's scope]` One key for the whole conversation — the **capsule key itself**, not a separate reply key (`packages/reply-crypto.ts`'s own comment: "There is exactly one key per capsule and therefore exactly one conversation"). Same `iv||ciphertext` wire format as `contentDocEnc`.

### 4.8 One Reading Only / expiry

`[VERIFIED, not in E1.3's scope, relevant to detail-screen rendering]` Two independent, server-enforced mechanisms: (A) `expiryStrict` — client calls `POST /r/:token/confirm-read` exactly once, at the moment of successful client-side decryption (deliberately decoupled from the `viewed`-status flip, which fires on bare `GET`) → schedules a `capsule_expire` action → scheduler destroys all media/replies, nulls `contentDocEnc`, sets `state: 'expired'`. (B) ordinary time-based unlock via a `capsule_unlock` scheduled action at seal time. E1.3's detail screen must render the post-(A) "Destroyed" state correctly (§4.5) even though it never triggers (A) itself (that's the recipient/reveal side, E1.5).

### 4.9 hash-wasm vs. WebCrypto — mobile readiness, confirmed better than expected

`[VERIFIED]` `aes.native.ts` and `kdf.native.ts` already exist, already proven byte-identical on real hardware (E1.2). The **only** gap: `random.ts` has no native override (§1, §6.4) — irrelevant to decrypt-only E1.3, relevant to E1.4. A second, smaller gap: `apps/web/src/lib/capsule-crypto.ts`'s `encodeIvCiphertext`/`decodeIvCiphertext` use `btoa`/`atob` directly — this web-only helper is not itself imported by mobile; E1.3 should use `@tc/crypto`'s own `toBase64Url`/`fromBase64Url` (`packages/crypto/src/encoding.ts`), already proven portable, rather than porting the web helper file.

---

## 5. API / contract matrix (mobile-relevant capabilities)

Legend: **A** = usable unchanged · **B** = usable with mobile-side crypto/UI work · **C** = requires a backend/contract change · **D** = incomplete/broken · **E** = not relevant to mobile V1.

### 5.1 Capsules — `apps/api/src/modules/capsules/{routes,service,lifecycle}.ts`

| Endpoint | Auth | Category | Needed by E1.3? |
|---|---|---|---|
| `POST /capsules` | access token | A | No (E1.4) |
| `GET /capsules` (list, filters: state/type/tag/q/view/favorite/collectionId/cursor/limit) | access token | **A** | **Yes — Home/Received list** |
| `GET /capsules/:id` (full detail incl. ciphertext) | access token, owner | **A** | **Yes — capsule detail** |
| `PATCH /capsules/:id`, `/owner-key-wrap`, `/seal`, `/duplicate`, `/archive`, `/unarchive`, `/trash`, `/restore`, `/withdraw`, `/extend`, `/purge` | access token | A | No (E1.4/settings, later) |
| `GET /capsules/:id/activity` | access token | A | No (later, capsule-detail "activity" tab is a nice-to-have, not core E1.3) |

Verdict: **complete/production-ready.** `expiresAfter`/`recurrence`/`breakGlass` are accepted-and-stored but **unenforced** server-side (confirmed by full-repo grep finding no scheduler handler reads them) — E1.3 must render these fields honestly if present (don't imply they do something) but this doesn't block anything, since E1.3 doesn't create capsules with them set.

### 5.2 Media — `apps/api/src/modules/media/{routes,service}.ts`

| Endpoint | Category | Needed by E1.3? |
|---|---|---|
| `GET /capsules/:id/media` (list) | **A** | **Yes — capsule detail's enclosure list** |
| `GET /media/:id/view` (15-min presigned URL) | **A** | **Yes — media decrypt/render** |
| `POST .../tickets`, `POST /media/:id/complete`, `PATCH /media/:id`, `DELETE /media/:id`, `POST .../release` | A | No (E1.4/settings) |

Verdict: complete/production-ready. One flag, not a blocker: `PatchMediaRequestSchema.caption` is **plaintext in the contract**, not `captionEnc` — worth confirming with the team before mobile ever surfaces caption editing as if it were end-to-end encrypted (it is not, today).

### 5.3 Recipients — `apps/api/src/modules/recipients/routes.ts`

Sender-side management (add/list/patch/delete/resend/announce), all **A**, none needed by E1.3 (creation-only). Included for completeness — capsule detail may want to show a read-only recipient list (`GET /capsules/:id/recipients`), which is a reasonable, low-risk E1.3 addition if time allows (§16, optional).

### 5.4 Replies — `apps/api/src/modules/replies/routes.ts`

`GET /capsules/:id/replies` (owner, ciphertext) is **A**, not required for E1.3's minimum scope but a natural, low-risk inclusion in the capsule-detail screen if the ticket has room (rendered read-only, decrypt-and-display only — no compose/send, that's E1.6/replies phase). Recommendation: **include read-only reply display in E1.3** if it fits, since the decrypt call is identical to the letter's own (same capsule key, same `decryptBytes`) — see §16.

### 5.5 Guest capsules — `E` (out of scope, Decision 2)

### 5.6 Favorites / Tags / Collections

All **A**, all plaintext organizational metadata. Not required for E1.3's minimum scope; `isFavorite`/`tagIds` are already present on `CapsuleListItemSchema` and can be rendered read-only for free if convenient, but favoriting/tagging *actions* are not E1.3 scope.

### 5.7 Notifications — `apps/api/src/modules/notifications/routes.ts`

`GET /notifications` is **A** and is E1.3's Notifications-tab requirement exactly. `push_tokens` table exists in schema with **zero routes referencing it** — **D**, a real gap, but irrelevant to E1.3 (in-app notification list needs no push infrastructure) and belongs in the parking lot (§20), not this ticket.

### 5.8 Places — `E` for E1.3 (Place Memory only matters once creation/detail-with-media exists in full; the reverse-geocode endpoint has no browsing-side relevance)

### 5.9 Recovery — `A`, `POST /auth/password/reset/recovery-key` and `ResetPasswordRequestSchema.masterKeyWrap` confirmed live (E1.1). **No UI anywhere** (web or mobile) consumes it — `D` at the *product* level, `A` at the *contract* level. Not E1.3's concern; parking lot (§20).

### 5.10 Reveal / expiry — `E` for E1.3 (recipient-facing, no-account; E1.5's domain). Included in §4.6/§4.8 for architectural reference only.

---

## 6. Crypto boundary map

### 6.1 The chain, as it actually runs (traced, not assumed)

```
Account master key (in memory only, MasterKeyContext)
  │
  ├─ unwrapCapsuleKeyForOwner(capsule.ownerKeyWrap, masterKey)  →  Capsule key (256-bit AES)
  │     │
  │     ├─ decryptBytes(capsuleKey, iv, contentDocEnc)  →  JSON.parse  →  Letter content
  │     ├─ decryptBytes(capsuleKey, iv, mediaBlob)      →  Media plaintext bytes
  │     └─ decryptBytes(capsuleKey, iv, reply.bodyEnc)  →  Reply text
  │
  └─ (E1.4 only) wrapCapsuleKeyForOwner(newCapsuleKey, masterKey)  →  ownerKeyWrap for a new/edited capsule
```

`[VERIFIED]` Every arrow above uses only AES-256-GCM (`decryptBytes`/`encryptBytes`), never Argon2id — confirmed by the prior blueprint's §7.2 and independently reconfirmed this session by reading `capsule-key.ts` directly. Argon2id (`deriveKeyFromPassword`) appears exactly twice in the entire chain: master-key unwrap-by-password (already done, E1.2) and Passphrase-Seal unwrap (a recipient-side feature, E1.5, lower priority).

### 6.2 What E1.3 specifically needs

`[VERIFIED, complete list]`:
- `unwrapCapsuleKeyForOwner` (from `@tc/crypto`, already portable)
- `decryptBytes` (from `@tc/crypto`, already portable, proven on Android in E1.2's own vector tests)
- `toBase64Url`/`fromBase64Url` (from `@tc/crypto`'s `encoding.ts`, already portable) — E1.3 must use these, **not** port web's `capsule-crypto.ts` helper (§4.9)
- Nothing from `random.ts` — confirmed by tracing every function call in the decrypt path above; no encryption, no key/IV/salt generation occurs anywhere in read-only browsing

### 6.3 What must become a shared mobile utility

`[RECOMMENDATION]` A single `apps/mobile/src/lib/capsule-crypto.ts` (or `.ts` module under `src/lib/`) exporting:
```ts
async function decryptCapsuleContent(capsule: Capsule, masterKey: Uint8Array): Promise<LetterEnvelope>
async function decryptEnclosure(viewUrl: string, capsuleKey: Uint8Array): Promise<Uint8Array>
```
mirroring web's `use-capsule-draft.ts`'s decrypt path and `enclosure-media.ts`'s `decryptEnclosure` respectively, but as plain functions (not React-Query-coupled) since mobile's data layer is still being introduced in this same ticket. **This is the exact "build once, don't race" utility the pre-existing backlog's §22/§15 warned about** — E1.4 (creation preview) and E1.5 (reveal) will both need it; E1.3 is correctly the first consumer and should build it deliberately, not as a one-off inline call.

### 6.4 The `random.ts` gap, in full

`[VERIFIED, BLOCKER for E1.4, not E1.3]` `packages/crypto/src/random.ts` calls `crypto.getRandomValues` directly with no `.native.ts` override, and no polyfill (`expo-crypto`, `react-native-get-random-values`) is installed in `apps/mobile`. This function is called by: `generateCapsuleKey()` (new capsule), `generateIv()` (every encrypt call, including `aes.native.ts`'s own `encryptBytes`/`encryptStream` default parameter), `generateSalt()` (Argon2id salt for a *new* password/passphrase wrap), `generateRecoveryCodeBytes()` (signup only). **None of these are reachable from E1.3's read-only decrypt path** — confirmed by tracing §6.2's function list, none of which touch `random.ts`. This is why E1.2's login (unwrap-only) never hit it and why E1.3 (decrypt-only) will not either.

`[RECOMMENDATION]` Fix via `packages/crypto/src/random.native.ts`, backed by `react-native-libsodium`'s already-installed `sodium.randombytes_buf` (same library E1.2 already added for Argon2id — no new dependency), mirroring the existing `kdf.native.ts`/`aes.native.ts` pattern exactly. Small, independent, fully parallelizable with E1.3 (§17/§18), and should land before E1.4 starts (E1.4 cannot create a single capsule without it).

---

## 7. Media / enclosure audit

`[VERIFIED]`, not required for E1.3's minimum scope, documented here because capsule-detail (E1.3) is the first mobile screen that will render *existing* media, even though it builds none.

- **Upload** (not E1.3): file read fully into memory (`file.arrayBuffer()`), single-shot `encryptBytes` under the capsule key (no per-file key), then an 8 MiB-chunked S3/R2 multipart presigned upload (a *storage* transport concern, unrelated to `STREAM_CHUNK_BYTES`/`encryptStream`).
- **Download/decrypt** (E1.3 needs this): `fetch(presignedUrl).then(r => r.arrayBuffer())` (whole file into memory) → `decryptBytes` (single-shot). **`encryptStream`/`decryptStream` are never called anywhere in `apps/web`** — confirmed by repo-wide grep, the only references are the export and doc comments. Despite `packages/crypto` having chunked/streaming AEAD explicitly built "for large video," web does not use it; everything is bounded only by available memory.
- **Mobile implication for E1.3:** rendering an already-uploaded image/audio/video in capsule detail can reuse the exact same in-memory single-shot pattern web uses — no new streaming work is required to *ship* E1.3, since E1.3 is read-only detail viewing, and web's own precedent (in-memory decrypt) is an acceptable starting point. **`[RECOMMENDATION, not E1.3-blocking]`** mobile's tighter memory constraints than desktop browsers make this the first place `decryptStream` might actually get used in the whole product — worth flagging for E1.4/E1.5 (media upload/full viewer), not deciding now. E1.3's own media handling can be as simple as "list what's there, don't necessarily render large video inline yet" if scope needs trimming (§15, Option A vs. B).
- **RN native requirements for later phases (E1.4/E1.5), not E1.3:** `expo-image-picker`/`expo-camera` (upload), `expo-av`/`expo-audio` (voice notes, playback), `expo-location` (Place Memory), something for PDF (`EnclosureViewer`'s fallback pattern — "kept as it was enclosed" — is the acceptable no-native-PDF-viewer answer already proven on web).
- **Place Memory:** stateless reverse-geocode proxy (`POST /places/reverse-geocode`), coordinate never persisted server-side, name+coords always encrypted inside `contentDocEnc`. Not E1.3 scope (creation-only); E1.3's detail screen may render an existing Place Memory read-only if present in decrypted content, same effort as rendering any other decrypted field.

---

## 8. Mobile information architecture

`[VERIFIED against current web]`, confirming — not assuming — the pre-existing blueprint's §9 recommendation still holds:

| Tab | E1.3 content | Maps to (web) |
|---|---|---|
| **Home** | Real capsule list: sealed/counting-down, unlocked, drafts-in-progress if any exist server-side already (created via web) — balanced, not purely a feed | `(app)/home`, Dashboard V2 |
| **Received** | Real received list: upcoming/waiting/opened sections | `(app)/received`, `GET /received` |
| **Notifications** | Real in-app notification list | `GET /notifications` (new to mobile, endpoint already exists) |
| **Profile** | Unchanged from E1.2 (email + logout); Settings sub-navigation is a later ticket, not E1.3 | `(app)/settings/*` (not built this ticket) |

**Nested, not tabbed** (confirmed correct, re-verified against web's own route structure — `apps/web/src/app/(app)/` has `capsule/`, `people/`, `collections/`, `archive/`, `trash/` as pushed destinations, not tabs): capsule detail is a pushed screen from Home or Received, not a tab, not a modal.

**No new IA is introduced by E1.3.** No fifth tab, no bottom-sheet capsule detail, no drawer. This matches Decision 1 (IA derived from current product) and Decision 8 (balanced home, not inbox-first) exactly as the pre-existing blueprint locked them, independently reconfirmed here against current web.

**Deep-linkability:** capsule detail (`/capsule/[id]`) should be a real Expo Router route (`app/(app)/capsule/[id].tsx`) capable of being pushed to directly (e.g. from a future notification tap) even though push itself is out of scope — cheap to get right now, expensive to retrofit (§16).

---

## 9. UI / design audit

`[VERIFIED]` — full contradiction list, not silently resolved:

| # | Source | Claim | Reality | Authoritative | Mobile interpretation |
|---|---|---|---|---|---|
| 1 | `plan/02-UX-DESIGN.md §6` | Meridian V1 palette (`midnight #0F1222`, `parchment #FAF7F2`, amber-gold, dusk-violet), Fraunces+Inter, soft 10/16/20 radii | `packages/ui-web/src/tokens.css` — Meridian V2, two registers (instrument/record), brass reserved for "sealed" only, Source Serif 4 + IBM Plex Sans + IBM Plex Mono, tightened 3/4/5px radii ("an instrument is machined, not rounded") | **tokens.css (code)** | `apps/mobile/src/lib/tokens.ts` must port V2's values, never V1's. §6 was supposed to be rewritten per `07 §XVIII`'s own closing obligation and never was — treat it as dead text. |
| 2 | `plan/02-UX-DESIGN.md §5.7` | Reveal ends with a reaction bar (❤️🥹🎉😂🙏) and a "Keep this forever" account-create CTA | `RevealCeremony.tsx`'s own comment cites `07 §II.7` ("no branding, no celebration... we are not in the room") as the reason these were deliberately removed; grep confirms zero matches for either pattern in the shipped reveal flow | **Code / design/07** | Not E1.3 scope (reveal is E1.5), but noted so E1.5 doesn't reintroduce V1's pattern from reading plan/02 alone. |
| 3 | `plan/02-UX-DESIGN.md §5.4/§5.12` | Sidebar has notification bell-icon center; separate `/search` page; home page opens with a time-of-day greeting ("Good evening, Maya") | `AppSidebar.tsx` nav is exactly `Home, Received, People, Collections, Archive, Trash` + Settings — no bell icon, no `/search` route exists anywhere; `(app)/home/page.tsx`'s own comment documents removing the greeting, citing `07 §VIII`'s register rule | **Code / design/07** | E1.3's Home tab must not include a greeting header or search bar — matches web's actual, deliberate minimalism, not plan/02's older, more feature-dense description. |
| 4 | `plan/00-INDEX.md` "Repos" | `timelycapsule-mobile/` is a separate, empty repo to start fresh in | `apps/mobile` already exists as a monorepo workspace with substantial Stage E history (spikes, blueprints, now E1.1/E1.2 shipped) | **Current monorepo structure** | Purely a documentation-staleness note; has zero effect on E1.3's actual work, since `apps/mobile` is obviously where it already lives. |
| 5 | `design/21-CAPSULE-CREATION-V2.md §XI.4` (self-flagged) | Notes that `plan/02-UX-DESIGN.md §15` (Mobile Apps section) "still describes V1's composer shape" and needs its own pass before mobile composer work resumes | Confirmed: §15 references `@tc/ui-native` (a package that doesn't exist), WatermelonDB (never a dependency), Material You dynamic color — none real | **design/21's own self-assessment is correct** | Relevant to E1.4 (composer), not E1.3 (browsing has no plan/02 §15 content to contradict). Flagged now so it isn't rediscovered cold at E1.4 planning time. |

**Net effect on E1.3:** build against `tokens.css`'s current values (ported as data, per the pre-existing blueprint's §15 "port values, not components" principle) and `design/07-EXPERIENCE-BIBLE.md`'s stated principles (museum-label chrome, static never-a-spinner loading states, state stated in text). Do not consult `plan/02-UX-DESIGN.md §5`/§6/§15 for anything beyond historical context — they are demonstrably, self-admittedly stale on every point this audit checked.

---

## 10. Security audit

`[VERIFIED]` unless labeled otherwise.

| Concern | Status | Note |
|---|---|---|
| Plaintext secrets in E1.3's new code | N/A yet — no code written | Design requirement: capsule key and master key both stay in-memory-only, same discipline as E1.2 |
| Master-key persistence | VERIFIED safe pattern exists | `MasterKeyContext` is the only place a key lives; E1.3 adds no new persistence path |
| Accidental logging | VERIFIED, zero `console.*` in E1.2's code; E1.3 must hold the same discipline | Grep-verifiable at review time, same as E1.2's own audit |
| Navigation parameter leakage | RECOMMENDATION | Capsule detail route should carry only `id` (a UUID, already server-visible) in its route param — never a decrypted title, never any ciphertext or key material, in the URL/route params |
| Decrypted content persistence | RECOMMENDATION | Decrypted letter/media content must not be cached to disk (no `expo-file-system` write of plaintext) — render-and-discard, exactly matching web's in-memory-only decrypt pattern; TanStack Query's cache is in-memory only by default (no persister configured) — must stay that way for any query touching decrypted content specifically (list-view queries, which never decrypt, have no such constraint) |
| Screenshots / app-switcher | OPEN DECISION, carried from prior blueprint §16, unresolved | Real for a capsule-detail screen showing decrypted content; not decided by this audit either |
| Clipboard | Low priority, unchanged from prior audit | No copy-text affordance planned for E1.3 |
| Token handling | VERIFIED unchanged | Same SecureStore-backed pattern as E1.2, no new token type introduced |
| Deep-link handling | Not E1.3 scope (E1.3's own detail route uses in-app navigation only, no external deep link yet) | — |
| Recovery-code handling | Not E1.3 scope | — |
| Biometric boundaries | Not E1.3 scope (E1.2 explicitly deferred biometrics) | — |

**New E1.3-specific verification needed at review time:** confirm the capsule-detail screen's decrypted content never gets passed through `console.log`/`Sentry`-equivalent breadcrumbs if/when error reporting is added later (none exists yet — §20 parking lot), and confirm TanStack Query's devtools (if used during development) are stripped from any release build, since query-cache inspection could otherwise surface ciphertext or, if the shared decrypt utility (§6.3) is naively wired into a query's own cache, decrypted content.

---

## 11. Performance / device-reality audit

`[INFERENCE]`, no real-device benchmarking was performed this session (audit-only, per instructions) — this section states what to watch for, not measured numbers.

- **Argon2id / AES-GCM:** already measured and accepted during E1.2 (real Android hardware, login-path latency was not flagged as a problem in E1.2's own report). Not re-exercised by E1.3 (no new KDF/encrypt calls).
- **Large media decryption:** `[RECOMMENDATION]` E1.3's capsule detail should not eagerly decrypt every enclosure on screen load — mirror web's own lazy, tap-to-open pattern (`EnclosureViewer`'s `load()` prop), which already avoids this cost until the user actually asks for a specific file.
- **Capsule lists:** `[RECOMMENDATION]` `GET /capsules`/`GET /received` are already paginated (`cursor`/`limit` on the capsules endpoint, confirmed in the contract) — use TanStack Query's infinite-query pattern from day one rather than fetching an unbounded list, matching web's own approach.
- **Navigation hydration:** already solved by E1.2's three-state model; E1.3 adds no new hydration surface (list/detail screens mount only after `authState === 'authenticated'`, per the existing `(app)/_layout.tsx` guard).
- **SecureStore:** unaffected by E1.3 (no new secure-storage reads/writes).

**Concrete guardrail recommended:** `[RECOMMENDATION]` cap the initial capsule-list page size (e.g. 20) and use pull-to-refresh/infinite-scroll rather than a single unbounded fetch, mirroring the API's own pagination contract rather than fighting it.

---

## 12. Offline / error model

`[RECOMMENDATION]`, scoped to E1.3's read-only surface only (full offline drafting is E1.4's Decision-4-driven scope, not this ticket's):

| Scenario | E1.3 behavior |
|---|---|
| No network on list load | Stated empty/error state (text, never a spinner-forever) — "Couldn't load your capsules. Check your connection." with a retry action |
| No network on detail load | Same pattern, scoped to the detail screen |
| No network mid-decrypt (media view URL fetch) | Same pattern — the presigned URL fetch is itself a network call that can fail independently of the initial detail load |
| Token expires while browsing | Existing `api-client.ts` refresh-on-401 already handles this transparently; if refresh itself fails, existing `auth-context.tsx` logic already routes to `unauthenticated` → login, unchanged |
| Master key unavailable when opening a capsule | `MasterKeyGate` already handles this — capsule detail's "Read it" action routes through the existing gate, not a new one |
| Master-key unwrap fails (corrupted wrap — should not happen but must not crash) | AES-GCM auth-tag failure throws; catch and show a stated error ("Couldn't unlock this capsule"), never a silent wrong-plaintext render — this is AES-GCM's own guarantee and must not be swallowed by a generic try/catch |
| Capsule in an unexpected/unknown state | Render a generic "can't be opened right now" state rather than crashing on an unhandled `CapsuleState` value — defensive, since `expiresAfter`/`recurrence` fields exist but are unenforced (§5.1) and could theoretically produce states the mobile UI wasn't specifically designed around |
| API returns an unexpected response shape | Zod validation in `api-client.ts` already throws on schema mismatch — surfaces as a generic stated error, not a crash, matching existing behavior |

**Explicitly deferred to E1.4+:** offline capsule list caching, offline draft creation, any "queued" state — none of this is E1.3's concern (E1.3 is read-only, online-required, exactly like web's own dashboard).

---

## 13. Test strategy

`[RECOMMENDATION]`, following E1.2's own established pattern (Vitest + `react-test-renderer`/`act` + `vi.mock` for native modules — no `@testing-library/*` exists in this monorepo, don't introduce it for this ticket alone).

| Layer | Tooling | What it proves | Runs where |
|---|---|---|---|
| Unit — API client extension | Vitest | `capsulesApi.list/get`, `receivedApi.list`, `notificationsApi.list` correctly validate real response shapes via `@tc/contracts` | Node |
| Unit — decrypt utility | Vitest | `decryptCapsuleContent`/`decryptEnclosure` (§6.3) round-trip correctly against a real, `@tc/crypto`-generated fixture (capsule key + `encryptBytes` output), and correctly throw on tampered ciphertext | Node (pure JS, `aes.native.ts` path — already proven testable per E1.2) |
| Component — list screens | `react-test-renderer` + `vi.mock` for `api-client` | Home/Received render correct states (loading/empty/error/populated) for a given mocked API response | Node |
| Component — detail screen | Same | All four states (Destroyed/Withheld/Closed/Open) render correctly for the corresponding capsule fixture | Node |
| Integration | Real dev API (`apps/api`), no mocking | A real capsule sealed via the existing web app (or a direct API call) is correctly listed and correctly opened by the mobile app | Requires a running `apps/api` + Postgres, same as E1.2's manual verification did |
| Manual — Android emulator | Full walkthrough | List renders real data, detail opens and decrypts a real letter, media (if any) opens correctly | Emulator, matching E1.2's own verification depth |
| Manual — iOS | Build + render verification only (same limitation E1.2 hit) | Confirm no crash, confirm visual correctness; interactive tap-through verification may hit the same simulator-automation limitation E1.2 documented — if so, document it the same way, don't claim more than achieved |
| Physical device | Not required for E1.3 (no biometric, no push, no deep-link surface introduced) | — | — |

**What can run in Node vs. what needs RN/emulator:** everything except the actual on-device render and the real end-to-end (real API + real decrypt on a real JS engine) can run in Node, following E1.2's own precedent exactly — this is a genuinely well-testable ticket, more so than E1.2 was, since it introduces no new native module dependency at all.

---

## 14. Scope options

### Option A — Minimal

**Capabilities:** Home tab lists owned capsules (metadata only, no detail screen at all — tapping a row does nothing or shows a "coming soon" toast).

**Effort:** ~2–3 days. **Dependencies:** `capsulesApi.list`, `CapsuleRow`, TanStack Query added to `apps/mobile`. **Risk:** low. **User value:** low — a logged-in user can see that capsules exist but cannot read a single one, which doesn't yet prove the product's actual value proposition on mobile. **Unlocks next:** almost nothing on its own; the detail/decrypt work still has to happen before E1.4 can build its preview, so this option mostly just delays real progress.

**Verdict:** not recommended — it produces a demo, not a usable capability, and defers the one genuinely new piece of work (decrypt-on-mobile, proven end-to-end) that actually de-risks everything after it.

### Option B — Recommended

**Capabilities:** Home + Received lists (real data, every state rendered correctly, paginated), capsule detail screen (all four states — Destroyed/Withheld/Closed/Open — real decrypt via the shared utility from §6.3), Notifications tab (real list), loading/empty/error primitives built and applied consistently, basic accessibility pass. Read-only replies display and read-only recipient list included if they fit within the ticket without meaningfully expanding its risk (both are near-zero-marginal-cost additions once the detail screen's decrypt plumbing exists — same capsule key, same `decryptBytes` call).

**Effort:** ~2–3 weeks for one engineer, similar order of magnitude to E1.2. **Dependencies:** TanStack Query (new dependency), `random.native.ts` fix (parallel, not blocking — needed before E1.4, not E1.3), the shared decrypt utility (§6.3, built here). **Risk:** medium — the decrypt-on-mobile proof is genuinely new, first real test of `aes.native.ts` against real, non-synthetic ciphertext produced by web. **User value:** high — this is the first release where a mobile user can actually use the product for its core purpose (reading a capsule), not just logging in. **Unlocks next:** E1.4 (creation) and E1.5 (reveal) both directly depend on the decrypt utility and the proven cross-platform compatibility this ticket establishes; E1.4's composer needs a place to return to (Home) which this also builds.

**Verdict: recommended.** This is Phase 3 from the pre-existing execution backlog, confirmed still correct, adapted to E1.2's actual file structure.

### Option C — Aggressive

**Capabilities:** Everything in Option B, plus: capsule creation's Address movement only (schedule + recipients, no letter/media/seal — a "start a draft" capability), and/or push notification registration groundwork (backend adapter + `PUT /push-tokens`, no native registration yet).

**Effort:** ~4–5 weeks. **Dependencies:** everything in B, plus the `random.native.ts` fix becomes a hard blocker (Address movement, even without a letter, still needs `generateCapsuleKey()` if a draft capsule is created client-side... though in practice `POST /capsules` creates a bare capsule row server-side with `type` only, and `ownerKeyWrap` is generated lazily on first content edit per web's own pattern — so Address-only might not actually need `random.ts` yet, this needs re-confirming against the exact draft-creation sequence before committing to this option). **Risk:** high — mixes a fully self-contained, low-risk capability (browsing) with a partial, awkward slice of a much larger, higher-risk one (creation), producing a ticket that's neither a clean "browsing works" milestone nor a clean "creation works" milestone.

**Verdict:** not recommended for E1.3 specifically — the awkward partial-creation slice adds real risk and scope-boundary ambiguity for marginal benefit; a clean Phase 3 → Phase 4 boundary (Option B, then a real, complete E1.4) is a better shape for a single independently-shippable ticket, matching the pattern E1.2 itself proved works well (one complete, load-bearing capability per ticket, verified end-to-end, rather than partial slices of several).

### Recommendation: **Option B.**

---

## 15. Foundational refactor check

**"Is there anything we should fix/refactor in E1.2 before building real capsule functionality?"**

`[VERIFIED, answer: no blockers, two small recommended additions]`

E1.2's auth/session/master-key architecture is a safe, sufficient foundation for E1.3 as-is — proof: every function E1.3 needs (`useAuth`, `useMasterKey`, `api-client.ts`'s `request()` pattern, `MasterKeyGate`) already exists, is already tested, and needs no signature or behavior change to support capsule-domain calls; extending `api-client.ts` with new endpoint functions is additive, not a refactor.

**Recommended, not blocking, cheap to do alongside E1.3:**
1. Extend `src/lib/tokens.ts` with the state-color mapping and a minimal type scale (§3.4) — needed *by* E1.3, not a prerequisite fix *to* E1.2, so it's really E1.3's own first ticket, not a separate refactor pass.
2. Build the `ErrorBoundary`/loading-empty-error primitives (§3.4) — same reasoning, genuinely new need, not a pre-existing defect.

**Recommended, not blocking, parallelizable, benefits E1.4 not E1.3:**
3. `random.native.ts` (§6.4) — real gap, zero impact on E1.3, real blocker for E1.4 if left until then.

**Nothing classified as a blocker for E1.3.** No part of E1.2's code needs to change to make E1.3 safe or possible.

---

## 16. Ticket backlog — E1.3

Adapting the pre-existing backlog's Phase 3 (`E3.1`–`E3.8`) to E1.2's actual file structure and this audit's findings. IDs below use `E1.3.N` to fit the session's actual numbering convention (§21) rather than the backlog's own internal `E3.N` scheme, which was never followed in practice.

### E1.3.1 — Capsule domain API client

**Objective:** Extend `apps/mobile/src/lib/api-client.ts` with `capsulesApi` (`list`, `get`), `receivedApi` (`list`), `notificationsApi` (`list`), following the exact existing `request()`/schema-validation/auth-header pattern — no new client, no new library beyond TanStack Query (added here).
**Why it exists:** nothing in E1.3 can fetch real data without this.
**Files:** `apps/mobile/src/lib/api-client.ts` (extended), `apps/mobile/package.json` (`@tanstack/react-query` added — confirmed not currently a dependency).
**Dependencies:** none (E1.2's `api-client.ts` pattern is stable).
**Crypto dependencies:** none.
**Tests:** Vitest, mocked fetch, confirm real `@tc/contracts` schemas validate correctly for `CapsuleListItemSchema`, `CapsuleSchema`, `ReceivedListResponseSchema`, notification list response.
**Acceptance criteria:** a real call to `GET /capsules` against the dev API round-trips correctly through Zod validation.
**Manual verification:** one real call against a running `apps/api`.
**Security considerations:** no new secret handling; reuses the existing token-injection path.
**DoD:** all three new API functions work against the real dev API.

### E1.3.2 — Mobile design tokens, extended

**Objective:** Grow `apps/mobile/src/lib/tokens.ts` with the `CapsuleState`-to-color mapping (draft/sealing/sealed/unlocked/expired/withdrawn), a minimal type scale (body, title, record-register serif treatment for letter content), ported as *values* from `packages/ui-web/src/tokens.css` — not components, per the standing "port values, not CSS" principle (§9).
**Why it exists:** E1.3's list/detail screens need consistent, correct state colors — brass reserved for "sealed" only, matching the one-rule-never-violated-twice discipline `tokens.css` itself documents.
**Files:** `apps/mobile/src/lib/tokens.ts`.
**Dependencies:** none.
**Tests:** none needed (a values file); a code-review checklist item confirming no hand-typed hex/color literal appears in any new E1.3 screen component.
**Acceptance criteria:** every color used in E1.3's new screens traces to this file.
**Security considerations:** none.
**DoD:** token file extended, checklist applied to all new screens.

### E1.3.3 — Loading / empty / error primitives

**Objective:** Build `EmptyState`, a static (non-spinner) loading placeholder, and an error-state component, matching web's "state stated in text, never a spinner/shimmer" discipline (`07 §VI.3`/`§XVI`).
**Why it exists:** genuinely new need — E1.2's auth screens handled their own inline error text and never needed a shared empty/loading pattern; list/detail screens are the first place this is needed.
**Files:** new `apps/mobile/src/components/{EmptyState,ErrorState}.tsx`; a loading-state pattern (likely just a static skeleton-shaped view, not a component library).
**Dependencies:** E1.3.2 (tokens).
**Tests:** component render tests confirming correct text/props render.
**Acceptance criteria:** no `ActivityIndicator` used as the sole loading affordance anywhere in E1.3's screens (matches web's banned-pattern list).
**Manual verification:** force each state deliberately (airplane mode, empty account).
**DoD:** used consistently across every E1.3 screen — no screen invents its own ad hoc loading/error UI.

### E1.3.4 — `CapsuleRow` component

**Objective:** One canonical capsule-list-item representation, used by both Home and Received — mirroring web's "never a second, divergent card" discipline for `CapsuleRow.tsx`.
**Why it exists:** genuinely new (no shared component to port, only the *pattern* to replicate — web's `CapsuleRow.tsx` is React DOM, zero portability).
**Files:** new `apps/mobile/src/components/CapsuleRow.tsx`.
**Dependencies:** E1.3.2 (tokens).
**Data:** `CapsuleListItem`/`ReceivedCapsule` shape (both already defined in `@tc/contracts`, directly importable, zero adaptation needed).
**Tests:** render tests for every `CapsuleState` value + every `ReceivedSection` value, confirming distinct, correct rendering.
**Acceptance criteria:** used identically by both Home and Received screens — no screen-specific variant.
**DoD:** single source of truth, verified by code review + the render tests above.

### E1.3.5 — Home screen (real data)

**Objective:** Replace the placeholder with a real, paginated list of the user's own capsules, matching Dashboard V2's balance (not purely a feed).
**Files:** `apps/mobile/app/(app)/(tabs)/home.tsx` (rewritten).
**Dependencies:** E1.3.1, E1.3.3, E1.3.4.
**Crypto dependencies:** none (list view needs no master key — §4.4's key finding).
**Tests:** component test with a mocked `capsulesApi.list` response covering every state.
**Acceptance criteria:** every `CapsuleState` renders distinctly and correctly; empty state shown for a fresh account; infinite-scroll/pagination works against the real `cursor`/`limit` contract.
**Manual verification:** real account with capsules in multiple states (create/seal a few via web first), confirm correct rendering on Android emulator.
**Security considerations:** list data is plaintext metadata only — no decryption occurs here, nothing sensitive to leak.
**DoD:** matches acceptance criteria, verified against real data.

### E1.3.6 — Received screen (real data)

**Objective:** Same as E1.3.5, for the received-capsules list.
**Files:** `apps/mobile/app/(app)/(tabs)/received.tsx` (rewritten).
**Dependencies:** E1.3.1, E1.3.3, E1.3.4.
**Tests/verification:** same pattern as E1.3.5, covering `upcoming`/`waiting`/`opened` sections.
**DoD:** same pattern as E1.3.5.

### E1.3.7 — Shared capsule-decrypt utility

**Objective:** Build `apps/mobile/src/lib/capsule-crypto.ts` per §6.3 — `decryptCapsuleContent(capsule, masterKey)` and `decryptEnclosure(viewUrl, capsuleKey)` — the one piece of genuinely new crypto-adjacent code this ticket introduces.
**Why it exists:** the exact "build once, don't race between creation and reveal" utility both later phases need; this is the correct, deliberate place to build it (§1, §6.3).
**Files:** new `apps/mobile/src/lib/capsule-crypto.ts`.
**Dependencies:** `@tc/crypto`'s `unwrapCapsuleKeyForOwner`, `decryptBytes`, `toBase64Url`/`fromBase64Url` — all already portable, no native work needed.
**Crypto dependencies:** none new — this is integration, not new primitives.
**Tests:** Vitest, real fixture (generate a capsule key + `encryptBytes` output via `@tc/crypto` directly in the test, matching the pattern E1.2's own `aes.native.test.ts` used), confirm round-trip and confirm tampered-ciphertext throws rather than returning wrong plaintext.
**Acceptance criteria:** decrypts real, web-produced ciphertext correctly (not just self-generated test fixtures) — the actual proof of §1's compatibility claim extended to capsule content, not just the master key.
**Manual verification:** seal a real capsule with real content on web, confirm mobile decrypts it correctly.
**Security considerations:** decrypted output must never be logged; function should not cache plaintext anywhere beyond its return value's caller-managed lifetime.
**DoD:** cross-platform decrypt proof completed on a real device, not just in a unit test against fixtures.

### E1.3.8 — Capsule detail screen (owner)

**Objective:** The four-state screen (Destroyed/Withheld/Closed/Open) per §4.5, pushed from Home or Received.
**Files:** new `apps/mobile/app/(app)/capsule/[id].tsx` (a nested route outside the tabs group, per §8's IA).
**Dependencies:** E1.3.1, E1.3.2, E1.3.3, E1.3.7 (decrypt utility). Uses `MasterKeyGate` from E1.2 unchanged for the "Closed" state's unlock action.
**Crypto dependencies:** E1.3.7's utility.
**Tests:** component tests for all four states using capsule fixtures; the decrypt path itself is covered by E1.3.7's own tests.
**Acceptance criteria:** all four states render distinctly and correctly, including the `Destroyed` state (post-M5, a real terminal state — missing it would be a silent regression against a recently-shipped web correctness fix); "Read it" correctly routes through the existing `MasterKeyGate`, never bypasses it.
**Manual verification:** real capsules in each of the four states (including a genuinely `expiryStrict`-expired one, and a still-`sealed` self-capsule for the Withheld case), on Android emulator.
**Security considerations:** route param carries only the capsule `id` (already server-visible), never any decrypted content or key material (§10); decrypted content is rendered from component state only, never persisted.
**DoD:** matches acceptance criteria on real, verified data.

### E1.3.9 — Read-only replies + recipient list (optional, low-marginal-cost addition)

**Objective:** If E1.3.7/E1.3.8 land with room to spare, add read-only reply-thread display (`GET /capsules/:id/replies`, decrypt with the same capsule key already unwrapped for the letter) and a read-only recipient list (`GET /capsules/:id/recipients`) to the detail screen.
**Why it exists:** near-zero marginal crypto cost (same key, same `decryptBytes` call already proven by E1.3.7) once the detail screen's plumbing exists; genuinely useful, not scope creep, since it uses infrastructure this ticket already built.
**Files:** additions to `apps/mobile/app/(app)/capsule/[id].tsx` or a small sub-component.
**Dependencies:** E1.3.7, E1.3.8.
**Tests:** decrypt-a-reply test (mirrors E1.3.7's pattern), render test for the thread list.
**Acceptance criteria:** replies decrypt and render correctly, in order; no compose/send action exists yet (that's a later phase).
**DoD:** if included, verified against a real capsule with real replies; if descoped for time, explicitly deferred to a later ticket, not silently dropped.
**`[OPEN DECISION]`** whether this ships in E1.3 or is cut to keep the ticket tightly scoped — recommendation: include it if E1.3.7/E1.3.8 come in under estimate, cut it first if the ticket is running long. Not load-bearing for E1.3's core definition of done (§25).

### E1.3.10 — Notifications tab (real data)

**Objective:** Replace the placeholder with a real `GET /notifications` list.
**Files:** `apps/mobile/app/(app)/(tabs)/notifications.tsx` (rewritten).
**Dependencies:** E1.3.1, E1.3.3.
**Tests/verification:** same pattern as E1.3.5/6.
**Acceptance criteria:** list renders correctly; tapping a notification that references a capsule navigates to that capsule's detail screen (in-app navigation only — deep-link-from-push is a later, separate ticket).
**DoD:** matches acceptance criteria.

### E1.3.11 — Accessibility pass

**Objective:** VoiceOver/TalkBack correctness for every E1.3 screen.
**Dependencies:** E1.3.5–E1.3.10 complete.
**Verification:** manual screen-reader pass, both platforms (iOS pass subject to the same simulator-interaction limitation E1.2 documented — if it recurs, document it the same honest way, don't claim more).
**DoD:** every list item, state label, and navigation target is correctly announced.

### E1.3.12 — `random.native.ts` (parallel, not gating E1.3, prerequisite for E1.4)

**Objective:** Fix §6.4's gap — `packages/crypto/src/random.native.ts` backed by `react-native-libsodium`'s `randombytes_buf`.
**Files:** new `packages/crypto/src/random.native.ts`.
**Dependencies:** none (library already installed).
**Tests:** Vitest — confirm output length matches each function's contract; cannot verify true randomness quality under Node (same class of limitation as `kdf.native.ts`'s Argon2id path — document, don't fake, an on-device check).
**Acceptance criteria:** `generateAesKey`/`generateIv`/`generateSalt`/`generateRecoveryCodeBytes` all resolve correctly on-device (Android emulator minimum).
**Manual verification:** on-device smoke test — generate a key, use it to encrypt+decrypt a value, confirm round-trip.
**DoD:** ready for E1.4 to depend on; not required for E1.3 to ship, safe to land before, during, or immediately after E1.3.

---

## 17. Dependency graph

```
E1.3.1 (API client)  ──┬──────────────────────────────────────────┐
E1.3.2 (tokens)       ─┤                                          │
E1.3.3 (loading/empty/error) ┤                                    │
                        │                                          │
E1.3.4 (CapsuleRow) ────┼── depends on E1.3.2                      │
                        │                                          │
E1.3.5 (Home)     ──────┼── depends on E1.3.1, E1.3.3, E1.3.4      │
E1.3.6 (Received) ──────┼── depends on E1.3.1, E1.3.3, E1.3.4      │
E1.3.10 (Notifications)─┼── depends on E1.3.1, E1.3.3              │
                        │                                          │
E1.3.7 (decrypt utility)┴── depends on nothing above (independent) ┤
                                                                    │
E1.3.8 (Capsule detail) ── depends on E1.3.1, E1.3.2, E1.3.3, E1.3.7
E1.3.9 (Replies/recipients, optional) ── depends on E1.3.7, E1.3.8
                                                                    │
E1.3.11 (Accessibility) ── depends on E1.3.5–E1.3.10 complete ─────┘

E1.3.12 (random.native.ts) ── fully independent, no dependency on or from anything above
```

No cycle. E1.3.7 (decrypt utility) is the only item both E1.3.8 and, later, E1.4/E1.5 depend on — build it once, here, deliberately (§6.3, §15).

---

## 18. Parallelization plan

`[RECOMMENDATION]`

| Track | Content | Can start when |
|---|---|---|
| **Track A** | E1.3.1 (API client) | Immediately |
| **Track B** | E1.3.2 (tokens) + E1.3.3 (loading/empty/error primitives) | Immediately, independent of A |
| **Track C** | E1.3.7 (decrypt utility) | Immediately, fully independent — pure `@tc/crypto` integration, no UI/API dependency |
| **Track D** | E1.3.12 (`random.native.ts`) | Immediately, fully independent of everything in this ticket |
| **Track E** | E1.3.4 (`CapsuleRow`) | As soon as Track B's tokens exist |

**Sequential after tracks converge:** E1.3.5/E1.3.6/E1.3.10 (list screens) need Tracks A+B+E; E1.3.8 (detail) needs Tracks A+B+C; E1.3.9 (optional) needs E1.3.8 done; E1.3.11 (accessibility) needs everything else done.

**Shared-file merge risk:** `apps/mobile/src/lib/api-client.ts` is touched only by Track A — no other track should edit it, avoiding the exact class of race the pre-existing backlog's §15/§22 warned about for the media-decrypt utility (which, in this ticket, is Track C and is likewise single-owned).

**No architectural decision needs to happen before starting** — E1.2 already settled navigation, auth, and the master-key boundary; this ticket adds data-fetching and decrypt integration on top of a stable foundation, not new architecture.

---

## 19. Foundational changes

See §15 for the full analysis. Summary: **no blockers.** Two additions folded directly into E1.3's own tickets (E1.3.2, E1.3.3) rather than treated as a separate "fix E1.2 first" pass, because they are new needs, not defects. One independent, parallel, non-blocking fix (E1.3.12 / `random.native.ts`) recommended alongside, for E1.4's benefit.

---

## 20. Parking lot

Real work, confirmed out of E1.3's scope, not to be pulled in:

| Item | Priority | Depends on | Why it's parked |
|---|---|---|---|
| Recovery-code UI (web and/or mobile) | High (real, pre-existing user-facing dead end) | E1.1's backend contract (already done) | Not needed for browsing; E0.5's open decision #8 (mobile-first vs. both platforms) still unresolved |
| Mobile signup | Medium | E1.2's auth foundation | A test/dev account can be created via web or direct API for E1.3's purposes; mobile signup is real, separate work |
| Mobile Google OAuth | Medium | E1.2's auth foundation, iOS/Android client-ID server-side validation (small backend change) | Same reasoning as signup |
| Mobile password change (in-session) | Medium | E1.2's master-key context | Settings surface, not browsing |
| Push notifications (adapter + `PUT /push-tokens` + native registration) | Medium | Nothing blocks starting the backend half now | `push_tokens` table is dead schema (zero routes) — a real, independent backend prerequisite; already flagged by this session's own research (a background task was auto-suggested for this — see note below) |
| Capsule creation (Address/Compose/Seal) | High (this is E1.4) | E1.3.7 (decrypt utility, for preview), E1.3.12 (`random.native.ts`, hard blocker) | Deliberately the next ticket after this one, not this one |
| Reveal / recipient-facing flow, deep links | High (this is E1.5) | E0.2 (deep-link fragment spike, iOS still needs a physical device), E1.3.7 (decrypt utility) | Deliberately after creation, per the dependency the pre-existing backlog already identified (shared decrypt utility) |
| Biometric "Protect my capsules" | Lower | E1.2's auth foundation, E0.3's already-passed spike | Explicit E1.2 scope exclusion, unaffected by E1.3 |
| Universal Links / App Links production config | Medium | E0.2 resolution (iOS physical device needed) | Unrelated to browsing; relevant once reveal (E1.5) ships |
| The dead plaintext `CapsuleSchema.location` field (§4.1) | Low, but worth a decision | None | Confirmed unused by any current composer code; either remove it or document why it remains — not E1.3's to fix |
| `expiresAfter`/`recurrence`/`breakGlass` unenforced backend fields (§5.1) | Low | Backend scheduler work | Pre-existing, backend-side gap; mobile just needs to render honestly, not build around them working |
| `PatchMediaRequestSchema.caption` plaintext-not-encrypted (§5.2) | Low-medium, worth a security-team confirmation | None | Pre-existing; flag, don't fix silently |
| App-switcher screenshot redaction | Open, unresolved since the prior blueprint | None | Real privacy question, real UX cost, not decided by this or the prior audit |
| iOS interactive-automation verification gap (carried from E1.2) | Medium | Physical iOS device, or different tooling | Unrelated to E1.3's own scope; affects verification depth of every mobile ticket until resolved |

**Note on the auto-suggested push-token background task:** during this audit, the dispatched API-research subagent used its own tool access to flag the `push_tokens` dead-schema gap by spawning a suggestion chip for a separate session to pick up. This is consistent with this session's audit-only discipline (a suggestion, not an implementation) — it has not been acted on, and this document is the authoritative record of that gap (§5.7, this table).

---

## 21. Documentation drift

| Document | Section/ticket | Current reality | Recommended correction | Blocking? |
|---|---|---|---|---|
| `plan/02-UX-DESIGN.md` | §6 (Meridian V1 palette) | Fully superseded by `packages/ui-web/src/tokens.css` (Meridian V2); `design/07 §XVIII` itself demands this section be rewritten, and it never was | Rewrite §6 to point to `tokens.css`, matching what §5.5 already correctly does for the composer | No — dead text, not consulted by this document or recommended for mobile use |
| `plan/02-UX-DESIGN.md` | §5.4/§5.7/§5.12 (nav, reveal reactions, notification center) | Contradicted by current, deliberate web implementation (§9 table) | Same treatment as §6 | No |
| `plan/02-UX-DESIGN.md` | §15 (Mobile Apps) | Self-flagged as stale by `design/21-CAPSULE-CREATION-V2.md §XI.4`; references non-existent packages (`@tc/ui-native`) and dependencies (WatermelonDB) | Needs a full rewrite before E1.4 (composer) planning, not urgent for E1.3 (browsing) | No for E1.3; yes-ish for E1.4 planning quality (not a hard blocker, but will cause confusion if consulted uncritically) |
| `plan/00-INDEX.md` | "Repos" section | Describes `timelycapsule-mobile/` as a separate, to-be-created repo; `apps/mobile` already exists in this monorepo with substantial history | Update the repo-layout description | No — purely cosmetic, has no bearing on where work actually happens |
| `plan/STAGE-E-MOBILE-V1-IMPLEMENTATION-BLUEPRINT.md` / `-EXECUTION-BACKLOG.md` | Internal `E1.1`–`E1.10`, `E2.1`–`E2.10` ticket numbering | Actual session work compressed these into two tickets (real `E1.1` = backend recovery, real `E1.2` = mobile auth foundation) — the fine-grained numbering was never followed | Not recommended to rewrite these documents (they remain valuable as the detailed *content* reference for Phase 4 onward) — instead, this document (and `PROGRESS.md`) is the authoritative record of what the *actual* ticket numbering means, and future sessions should read Phase N's *content* from the backlog while trusting `PROGRESS.md`/this document for the *real* ticket-ID-to-content mapping | No — both documents remain useful as content references; only their internal numbering should not be treated as the literal execution record |
| `apps/api` (code) | `capsules.ts:85` (`expiresAfter`), `:89-93` (`recurrence`), `:94-97` (`breakGlass`) — code comments say enforcement is "a later ticket" | Confirmed still true by this session's fresh grep — no scheduler handler reads these fields | No doc change needed — the code comments are accurate and current | No |

---

## 22. Final E1.3 definition

**E1.3 is: a real, authenticated mobile user can see their actual capsules — sent and received, in every real lifecycle state — and open one to read its real, decrypted content, exactly as it was sealed on web.**

This is the first mobile release where the product's core value (a message arrives, is kept, and can be read) is actually experienceable on the phone, not just the account/session machinery around it.

**E1.3 explicitly does NOT include:**
- Creating, editing, or sealing a capsule
- Sending or composing a reply (read-only reply *display* is an optional, low-cost addition — §16, E1.3.9 — not a requirement)
- Any recipient-facing, no-account reveal flow
- Media upload
- Push notifications, biometrics, recovery UI, signup, OAuth, password change
- Any offline capability

**E1.4 is:** capsule creation — Address → Compose → Seal, online-only, matching Decision 7/10/16 exactly as the pre-existing blueprint locked them, building on E1.3's decrypt utility for live preview and requiring E1.3.12's `random.native.ts` fix as a hard prerequisite.

**E1.5 is:** reveal / recipient-facing flow, media viewer, One Reading Only — the no-account surface, gated on E0.2's deep-link fragment spike reaching a real pass/fail verdict on a physical iOS device (still outstanding), and reusing E1.3's decrypt utility.

**Later Stage E work (E1.6+):** replies (full compose/send, if not already covered read-only in E1.3.9), biometrics ("Protect my capsules"), push notifications, Universal/App Links production configuration, recovery-code UI, signup/OAuth on mobile, release infrastructure (EAS, store submission) — all as previously scoped in the pre-existing backlog's Phases 6–8, unchanged by this audit.

---

## 23. E1.4 / E1.5 preview

`[INFERENCE, not this document's job to fully specify]`

**E1.4 (capsule creation) will need, beyond what E1.3 builds:**
- `random.native.ts` (E1.3.12, prerequisite)
- Native `KeyboardAvoidingView` handling for the letter field (no web equivalent to reference — genuinely new mobile UX)
- A media source sheet (camera/library/voice/files) with just-in-time permissions (Decision 18)
- Offline encrypted draft storage (`expo-sqlite`, per the prior blueprint's §6 — text only, Decision 4/7/16)
- The cross-platform verification gate: a capsule created on mobile must open correctly on web, and vice versa — E1.3.7's decrypt utility is exactly what makes the "vice versa" half of this provable

**E1.5 (reveal) will need, beyond what E1.3 builds:**
- E0.2's deep-link fragment spike resolved on a physical iOS device (still the single most important open technical question left in the whole mobile program, per the prior blueprint's own emphasis)
- The reveal ceremony's Held-Beat timing model (Reanimated `withTiming`, no springs)
- `EnclosureViewer`'s three rules ported as principles (in-place, museum-label chrome, nothing decrypts itself) — E1.3's own detail-screen media handling (§7) should already establish the lazy-decrypt pattern this needs
- One-Reading-Only's `confirm-read` call, fired at the exact post-decrypt moment, never earlier

---

## 24. Risks

`[RECOMMENDATION]`

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Cross-platform decrypt proof (E1.3.7) fails on first real attempt (some subtle encoding mismatch between web's `capsule-crypto.ts` helpers and `@tc/crypto`'s own encoding functions) | Medium | High — would block the whole ticket's core value | Build E1.3.7 first, in isolation, test against real web-produced ciphertext early, not as the last integration step |
| iOS interactive verification gap (carried from E1.2) recurs, leaving E1.3 verified on Android only | High (same tooling limitation observed twice already) | Medium — same honest-reporting pattern as E1.2 is acceptable, but repeated unverified-iOS tickets compound risk for the eventual store submission | Consider a physical iOS device or different automation tooling before E1.4/E1.5, since those tickets have real iOS-specific surfaces (Face ID, real push) that cannot be deferred as easily |
| TanStack Query introduces a caching-of-decrypted-content mistake (§10) | Low if deliberately avoided, medium if not reviewed carefully | High (a real zero-access violation) | Explicit code-review checklist item: no query key or cache entry should ever hold decrypted capsule content; decrypt utility's output should be component-local state, not query-cache state |
| Scope creep into E1.3.9 (replies/recipients) turns a 2–3 week ticket into a 4+ week one | Medium | Low-medium | Treat E1.3.9 as genuinely optional and cuttable, as designed (§16) |

---

## 25. Definition of Done — E1.3

- [ ] Home tab shows the real, paginated list of the authenticated user's own capsules, every `CapsuleState` rendered distinctly and correctly.
- [ ] Received tab shows the real list of capsules addressed to the user, every `ReceivedSection` rendered distinctly and correctly.
- [ ] Notifications tab shows the real in-app notification list.
- [ ] Tapping a capsule row (from either Home or Received) navigates to a real capsule-detail screen.
- [ ] Capsule detail correctly renders all four states: Destroyed, Withheld, Closed, Open.
- [ ] Opening a capsule's letter correctly unwraps the capsule key and decrypts real content, proven against a capsule actually sealed on web (not just a synthetic test fixture).
- [ ] The master key is never persisted anywhere new; decrypted content is never cached to disk or to a persistent query cache.
- [ ] No loading state anywhere in E1.3's screens is a spinner-as-sole-affordance; every empty/error state is stated in text.
- [ ] Zero `console.*` logging of any decrypted content, token, or key material anywhere in the new code (grepped, not just reviewed).
- [ ] Verified on Android emulator, full walkthrough, real account with real capsules in every relevant state.
- [ ] iOS: build succeeds, renders correctly; interactive verification completed if achievable, honestly documented as a gap if not (matching E1.2's own precedent — never claimed beyond what was actually tested).
- [ ] All new Vitest tests pass; no regression in `apps/mobile`'s existing 20 tests or `packages/crypto`'s existing suite.
- [ ] `plan/PROGRESS.md` updated with the real outcome.

---

## 26. Session discipline confirmation

- `git status` at session end: confirmed clean except this document and the intended `plan/PROGRESS.md` current-status update (see commit-time verification below).
- `git diff --stat`: confirmed only `plan/PROGRESS.md` (current-status block only) and this new file.
- No application code (`apps/mobile`, `apps/web`, `apps/api`, `packages/*`) was modified.
- No branch was created, no commit was made, no PR was opened.
- This document exists at `plan/STAGE-E-MOBILE-V1-E1.3-AUDIT-AND-IMPLEMENTATION-BLUEPRINT.md`.
- `plan/PROGRESS.md`'s "Current status" block received one new entry for this audit; no historical entry was rewritten.
