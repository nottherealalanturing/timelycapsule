# Stage E Mobile V1 — Phase 5 Readiness Audit (Reveal, Media Viewer, One Reading Only)

Status:
- Audit/design only
- No implementation performed
- No files outside this document created or modified

**Naming note.** This document is named `PHASE-5`, not `E1.5`, deliberately. `E1.x` is this
codebase's own ad-hoc numbering, invented during `STAGE-E-MOBILE-V1-E1.3-*`'s own audits and
carried forward through `E1.4.1`–`E1.4.11`; it is not a pre-existing scheme in any planning
document, and nothing here establishes "E1.5" as decided. "Phase 5" is the
`STAGE-E-MOBILE-V1-IMPLEMENTATION-BLUEPRINT.md`'s own name for this work (§21). Whoever picks this
up should choose the ticket-number convention deliberately, not inherit one from this document's
filename.

**Evidence markers, matching the E1.4 audit's own convention:** `[VERIFIED]` confirmed by directly
reading real code in this session · `[DOCUMENTED]` stated in a planning document, not independently
re-verified against code this session · `[INFERENCE]` a conclusion reasoned from verified facts, not
itself stated anywhere · `[OPEN DECISION]` genuinely unresolved · `[RECOMMENDATION]` a proposed
approach.

---

## 1. Executive Summary

E1.4.1–E1.4.11 (Capsule Creation) are complete, merged to `origin/main` (`04b4cf6`), CI green. No
Phase 5 code exists on mobile at all `[VERIFIED — confirmed by direct search, zero matches for
reveal/EnclosureViewer/MediaViewer anywhere in apps/mobile]`. This document traces the real web
reveal implementation, the real backend contract, and the real crypto boundary line by line — not
from the blueprint's own `[RECOMMENDATION]`-level description alone — and produces a concrete,
bounded ticket breakdown.

**Three findings change the picture from what the blueprint's own §11 implied at
`[RECOMMENDATION]` level:**

1. **Web's reveal screen is not "reveal + optionally replies" — it is one monolithic component**
   (`RevealCeremony.tsx`'s `RecordAtRest`) that renders the ceremony, the letter, every enclosure,
   location, **and** a live reply composer (`Correspondence`, `sealReply`) in a single tree. The
   blueprint's own phase split (reveal = Phase 5, replies = Phase 6) is a mobile-side scoping
   decision this audit recommends, not a boundary that already exists in the code it is porting.
   See §4 and §14.
2. **Mobile has no Universal/App Link configuration at all** `[VERIFIED — apps/mobile/app.json has
   a custom scheme (`timelycapsule://`) only; no `associatedDomains`, no Android `intentFilters`]`.
   A reveal screen can be built and tested via manual/dev-menu navigation, but the real product
   entry point (an email link, `https://timelycapsule.com/c/:token`) cannot reach it until Open
   Decision #2 from the master blueprint (does the fragment survive a Universal Link open?) is
   resolved. This is a real, load-bearing dependency this audit did not invent.
3. **The recovery-code gap is real, confirmed, and unrelated to Phase 5** `[VERIFIED —
   `restoreMasterKeyFromRecoveryCode`/`parseRecoveryCode` appear only in `packages/crypto`'s own
   tests and its `index.ts` export; zero references anywhere in `apps/web/src` or `apps/mobile/src`]`.
   It does not block reveal (a recipient's key comes from a link fragment or passphrase, never from
   the master key), and it does not block the *owner* side of Phase 5 either, since nothing in Phase
   5 as scoped here touches password-reset. See §12.

**Verdict, in full at §17: READY, in two parts — 5.1–5.4 are buildable now; 5.5 (Universal Links)
is a scoped prerequisite spike, not a blocker to starting 5.1–5.3's UI/crypto work in parallel.**

---

## 2. Current Baseline

| | |
|---|---|
| `origin/main` | `04b4cf6` — Merge PR #71 (E1.4.11). `[VERIFIED]` |
| Working tree | Clean except the known, pre-existing, untouched `apps/api/src/db/migrate.ts` modification. `[VERIFIED]` |
| Mobile capsule creation | Complete: Address, Compose, media enclosure, Review, Seal, error states, accessibility pass — all E1.4.1–E1.4.11. |
| Mobile read surface | E1.3.5/6/8/9: Home, Received, owner-side capsule detail (read-only), read-only reply display. No reveal, no media viewer, no write-side replies. `[VERIFIED]` |
| Mobile deps relevant here | `expo-audio` (E1.4.6), `expo-file-system` (E1.4.7), `expo-linking` (scaffold). No `expo-video`, no PDF library, no Universal Link config. `[VERIFIED]` |

---

## 3. Source-of-Truth Documents

Read directly this session: `plan/00-INDEX.md`, `plan/01-PRODUCT.md` (roadmap + §4), `plan/02-UX-DESIGN.md` (§5.7, §15), `plan/03-ARCHITECTURE.md` (reveal API list, capsule lifecycle), `plan/05-BUILD-PLAYBOOK.md` (STAGE E, T-23–T-29 in full), `plan/06-FEATURE-ADDENDUM.md` (Seals, expiry/"Completed journeys"), `design/07-EXPERIENCE-BIBLE.md` (Parts VI, VII, XIII, XVI), `plan/PROGRESS.md`, `plan/STAGE-E-MOBILE-V1-IMPLEMENTATION-BLUEPRINT.md` (§1, §2, §11, §12, §13, §21, §24, §25, §26), `plan/STAGE-E-MOBILE-V1-E1.4-READINESS-AUDIT.md` (for methodology precedent). Also read directly: the real `apps/api/src/modules/reveal/{routes,service}.ts`, `apps/api/src/modules/capsules/lifecycle.ts`'s `expireCapsule`/`scheduleCapsuleExpiry`, and the real `apps/web` reveal stack (`(reveal)/c/[token]/page.tsx`, `RevealCeremony.tsx`, `use-transit.ts`, `EnclosureViewer.tsx`, `enclosure-media.ts`, `PassphraseGate.tsx`), plus `apps/mobile`'s existing `capsule-crypto.ts` and `capsule/[id].tsx`.

No file referenced by those documents was inaccessible. Nothing needed to be requested from the user.

---

## 4. Phase 5 Scope

**IN SCOPE**, per the blueprint's own §11 and confirmed against real web code:
- The reveal entry screen: locked/countdown state, Seal gates (Place/Passphrase/Identity), the transit ceremony, the record-at-rest letter display.
- Media enclosure viewing (open-in-place, per-kind rendering, lazy decrypt-on-demand).
- One Reading Only (`expiry_strict` + `confirm-read`).
- The accessibility/reduced-motion requirements specific to the ceremony.
- Just-in-time permissions for whatever the media viewer needs (see §9 — likely none for *viewing*; possibly one for *saving a copy*).
- The `confirm-read` backend interaction.

**NOT AUTOMATICALLY IN SCOPE**, per the requester's own instruction, even though the real web code entangles some of these into the same component:
- **Recipient reply-composition** (`Correspondence`/`sealReply`) — present in web's `RecordAtRest` but cleanly separable (it is its own subtree with its own props). Recommended as an explicit, disclosed exclusion for the first ticket slice — see §14's Open Decision.
- Push notifications, biometrics, Apple Sign-In, share extension/widget — Phase 6/7/T-26–T-29 per the blueprint, untouched here.
- Universal/App Links' *general* infrastructure is a dependency of Phase 5 (§13) but its own spike is scoped as its own ticket, not absorbed into the reveal UI work.

---

## 5. Web Reveal Trace

Traced directly from `apps/web/src/app/(reveal)/c/[token]/page.tsx`, `RevealCeremony.tsx`, `use-transit.ts`, `EnclosureViewer.tsx`, `enclosure-media.ts`, `PassphraseGate.tsx` — every numbered item the requester asked for:

1. **Reveal initiated** by navigating to `/c/:token` (web) — a plain client component, `useParams()` reads `token`, fetch deferred via `setTimeout(...,0)` on mount.
2. **Token load**: `revealApi.get(token, {placeGate, identityGate})` → `GET /r/:token`. One call, no separate "check openable" step.
3. **Data fetched before reveal**: everything the locked page needs (`cover`, `teaser`, `unlockAt`/`unlockLocal`, `seals[]`, `sealedAt`, `senderName`) — plaintext envelope metadata only, per hard rule 3.
4. **Data fetched after "unlocked"**: the *same* response already carries `contentDocEnc` (base64), `media[]` (each with a short-TTL signed `viewUrl`), `location`, `replyPrompt`, `passphraseSeal`, `alreadyOpened`. No second content fetch exists.
5. **Exact decryption entry point**: `decryptContentDoc()` — `fromBase64Url(contentDocEnc)` → `iv = bytes.slice(0,12)`, `ciphertext = bytes.slice(12)` → `decryptBytes(key, iv, ciphertext)` → `JSON.parse`.
6. **Exact crypto inputs**: the capsule key, from one of two sources (see 7) — never a password, never the master key.
7. **Where the "password" comes from**: there is no password on this path. The key is either (a) the URL fragment (`#k=...`, `decodeCapsuleKeyFromLink`) for a plain recipient link, or (b) a user-typed **passphrase** (Passphrase Seal only) unwrapped via `unwrapCapsuleKeyWithPassphrase(wrappedKeyB64, passphrase)` — entirely client-side, no server oracle, client-side throttle (`0/1s/2s/4s/8s` on repeated wrong attempts).
8. **Plaintext in memory**: yes, by necessity — `decryptedDoc` (React state) holds the real decrypted JSON; per-enclosure plaintext lives only as long as its own `Blob`/object URL (see 12). This is the reveal's whole purpose, not a leak.
9. **Content rendering**: `envelopeText(contentDoc)` → paragraphs, staggered opacity-only reveal (`letterProgress`), no slide/transform.
10. **Media decrypt**: lazy, per-item, only on an explicit "Open" tap (`EnclosureViewer`'s `load()` prop) — `decryptEnclosure(viewUrl, capsuleKey)` fetches the ciphertext then decrypts (see §7's crypto trace).
11. **Per-kind handling**: `image`→`<img src=blobUrl>`; `video`→`<video controls>`; `audio`/`voice`→`<audio controls>`; PDF (`mime === 'application/pdf'`)→`<object data=blobUrl type="application/pdf">` with a stated fallback ("This document cannot be shown here. Keep a copy to read it."); everything else → plain stated text ("kept as it was enclosed. Take a copy to open it.") — **no broken-icon state exists**, every unhandled kind already has a designed, calm fallback.
12. **Object URL lifecycle**: `URL.createObjectURL(blob)` on open; the previous URL for *that same item* is revoked before assigning a new one; all held URLs are revoked on the whole viewer's **unmount** (not per-close) — a real, small, already-accepted resource-lifetime characteristic on web, not something to "fix" on mobile (mobile has no `URL.revokeObjectURL` concept at all — see §8).
13. **Permissions requested**: none, anywhere in this trace. Web needs none because it's all in-browser blob rendering; mobile's own permission needs (if it wants to let a recipient save media to the OS gallery) are new, not a port of anything web does.
14. **Decryption failure**: `EnclosureViewer` → `stage: 'failed'`, a stated `role="alert"` message, "Try again" replaces "Open" — never a silent dead end. Top-level content decrypt failure → distinct "Key mismatch" `SystemPage`.
15. **Reveal (fetch) failure**: any non-2xx other than 429 → masked as `'404'` (matches the server's own masked-404 pattern for a suppressed/nonexistent token — a real security property, not an oversight).
16. **Not yet openable**: `LockedWait` — full countdown UI (`MeridianApproach`, `DualClock`), Seal-stamps row, "tell me when it opens" opt-in, add-to-calendar. A live `setTimeout` at `unlockAt` flips the page into reveal at T-0 with no manual refresh.
17. **Already read**: `data.alreadyOpened` (server-computed, from `capsuleRecipients.status === 'opened'`) → `useTransit(!alreadyOpened)` — the ceremony **never replays**; a return visit renders `RecordAtRest` directly at `letterProgress: 1`, frame (public ID + state hallmark) restored around it.
18. **One Reading Only — what "consumed" means**: see §7/§10; not the same signal as `alreadyOpened`.
19. **Exact confirm-read timing**: fired inside the `onDecrypted` callback, i.e. the literal instant `decryptContentDoc(...)` resolves successfully — never on page load, never gated on the transit ceremony's animation completing.
20. **Idempotency**: server-side, via a DB unique idempotency key on the resulting scheduled action (see §6) — not a client-side guarantee.
21. **Error behavior around confirm-read**: **none, on web, today.** `void revealApi.confirmRead(token)` — fire-and-forget, no `.catch`, no retry, no user-facing error if the call fails. `[VERIFIED, real, disclosed characteristic of the current web implementation — not to be silently "improved" on mobile without a deliberate decision, since a client-side retry loop could itself introduce new idempotency surface the server doesn't need]`.
22. **Content visible after confirm-read**: yes, indefinitely, for that session — nothing in the client hides or clears `decryptedDoc`. Actual destruction is asynchronous and server-driven (§6); the client does nothing further.
23. **Navigation away/back/reload**: no special handling needed or present — `capsuleKey`/`decryptedDoc` are plain component state, not persisted; a reload simply re-fetches and re-derives the key from the still-present URL fragment. If the capsule was already destroyed server-side by the time of a reload, `getReveal` returns `{status:'expired'}` before any decrypt is attempted.
24. **Security-sensitive logging**: `EnclosureViewer`'s only log is `console.error('Could not open enclosure:', err)` on decrypt failure — `err` is a `DOMException`/crypto error object, not plaintext or key material. No other logging found in this trace.

---

## 6. Backend/API Contract Trace

All from `apps/api/src/modules/reveal/{routes,service}.ts` and `capsules/lifecycle.ts`, read directly — **not** from `03-ARCHITECTURE.md`'s own endpoint list, which is stale (it does not even mention `/confirm-read`).

| Endpoint | Method | Auth | Purpose | Notes |
|---|---|---|---|---|
| `/r/:token` | GET | None (raw token) | Full state: locked/unlocked/withdrawn/expired | Sets `recipient.status → 'opened'` **inside this call**, the instant `unlocked` content is handed back — independent of and earlier than actual decrypt success (§9). |
| `/r/:token/verify/request`, `/r/:token/verify` | POST | None | Identity Seal OTP | Rate-limited (5/15min request, 10/15min verify), 5 wrong attempts locks the code. Returns a signed `gateToken`, not a session. |
| `/r/:token/place-check` | POST | None | Place Seal | Haversine distance/bearing server-side; returns a `gateToken` only if within radius. Explicitly documented as "ceremony and intent, not a cryptographic boundary" (spoofable). |
| `/r/:token/confirm-read` | POST | None | One Reading Only trigger | 204, body-less. **Only** endpoint touching destruction. |
| `/r/:token/remind`, `/report`, `/tz-infer` | POST | None | Secondary/opt-in features | Not required for a minimal reveal. |
| `/r/:token/save` | POST | Required (`requireAuth`) | Claim into an account | Out of Phase 5's minimal scope; needed for "Keep this"/T-05 ghost-claim parity. |

**`confirm-read`'s exact contract**:
- Request: none (token in the path only).
- Response: `204 No Content`.
- **Destructive?** Only for `expiry_strict` capsules in `state: 'unlocked'` — a no-op (still 204) for every other capsule, confirmed by `scheduleCapsuleExpiry`'s own early-return guard.
- **Atomic/server-enforced?** Yes for the *scheduling* step (a single `INSERT ... ON CONFLICT DO NOTHING` keyed on `capsule_expire:{capsuleId}`), but the actual destructive work (`expireCapsule`) runs **asynchronously**, via the ordinary scheduled-action promoter/worker — `runAt: new Date()` means "as soon as the worker next polls," not "before this HTTP response returns."
- **Replay/duplicate requests**: safe — the idempotency key collision means a second `confirm-read` call schedules nothing further; `expireCapsule` itself is idempotent (`if (row.state !== 'unlocked') return`).
- **Client disconnects after calling, before response arrives**: the insert either committed or didn't — no partial state; a retry is safe either way (idempotent).
- **Confirm-read succeeds but the client fails to render afterward**: irrelevant to the server — the schedule is already durably recorded the instant the 204 is (or would have been) returned; the client's own rendering has no bearing on destruction.
- **Marked before or after content delivery?** The `opened` status flip (§5 item 17/§9) happens *before* — inside `GET /r/:token` itself, before any client-side decrypt is even attempted. `confirm-read` (the actual One-Reading-Only trigger) happens *after* — only once the client has decrypted successfully. These are two different signals for two different purposes; see §10.
- **Race conditions**: none identified in the destructive path — the scheduled-action + idempotency-key pattern is the same mechanism already relied on throughout the seal/media pipeline (E1.4.7–E1.4.8's own audits already proved this pattern out).

---

## 7. Cryptographic Boundary Audit

Traced against the real `@tc/crypto` package and both apps' real usage — no cryptography is redesigned here.

- **Content decrypt**: `decryptBytes(capsuleKey, iv, ciphertext)` where `iv = bytes.slice(0,12)`, `ciphertext = bytes.slice(12)`, `bytes = fromBase64Url(contentDocEnc)`. **Identical primitive and wire format mobile's own `capsule-crypto.ts` already uses** for the owner-side read path (`decryptField`) — no new decrypt function needed, only a new *key-acquisition* path (see next point).
- **Capsule-key acquisition, recipient path** — genuinely new for mobile, does not exist today: `decodeCapsuleKeyFromLink(fragment)` → regex-extracts `k=...` → `fromBase64Url`. Pure, already-shared `@tc/crypto` code; the only non-portable piece is *getting the fragment string* from a deep link on RN, not the decode function itself (see §13, Open Decision #2).
- **Capsule-key acquisition, Passphrase Seal path**: `unwrapCapsuleKeyWithPassphrase(wrappedKeyB64, passphrase)` — same package, same portability as everything else in `@tc/crypto` (already used by both platforms elsewhere).
- **Media decrypt**: `decryptBytes(capsuleKey, bytes.slice(0,12), bytes.slice(12))` on raw fetched bytes — **byte-for-byte the same wire format mobile's own `media-upload.ts` already writes** (confirmed directly in E1.4.7's own audit and re-confirmed here by reading web's `enclosure-media.ts`). This is not a new contract to design; it is already proven compatible.
- **What is sent to the server**: only the raw request token (path param) and, for Place Seal, the recipient's own lat/lng (documented as non-cryptographic, ceremony-only). Never a key, never plaintext, never a passphrase.
- **What is never sent to the server**: the capsule key (in any form), the decrypted content, decrypted media, the passphrase itself (only used locally to unwrap).
- **Plaintext/ciphertext persistence**: none identified — no `AsyncStorage`/`SecureStore`/file write of plaintext anywhere in the web trace; state is all in-memory, cleared on navigation away (nothing to explicitly "clean up" beyond React's own unmount).
- **Ambiguity flagged, not resolved**: web's own `console.error` on `EnclosureViewer` open-failure (§5.24) is almost certainly safe (a `DOMException`/AES-GCM auth-tag failure carries no plaintext), but this was not independently proven by inspecting every possible `err` shape crypto.subtle can throw. `[OPEN DECISION, low severity]` — worth a specific "never logs raw error objects, only a stated message" test on mobile's own port, matching the discipline every prior mobile ticket has already established for its own error paths.

---

## 8. Existing Mobile Capability Audit

| Existing Mobile Capability | Location | Reusable? | Required Change | Reason |
|---|---|---|---|---|
| `decryptBytes`/`fromBase64Url`/`decodeCapsuleKeyFromLink`/`unwrapCapsuleKeyWithPassphrase` | `@tc/crypto` (shared) | **Yes, as-is** | None | Already portable; already used by mobile elsewhere. |
| `decryptField`/content-decrypt wire format | `apps/mobile/src/lib/capsule-crypto.ts` | **Yes, as-is** for the *decrypt* half | None | Same `iv(12)‖ciphertext` format, same primitive. |
| `resolveCapsuleKey`/`decryptCapsuleContent` | Same file | **No — wrong key source** | New sibling function taking a bare capsule key (from a link/passphrase), not `ownerKeyWrap`+`masterKey` | These are owner-authenticated-path functions; reveal is unauthenticated. |
| Media-decrypt wire format | `apps/mobile/src/lib/media-upload.ts` (write side only today) | **Yes, format-compatible** | New *read*-side function (fetch + decrypt), not present at all | Confirmed byte-identical to what web's `decryptEnclosure` reads. |
| `LoadingState`/`ErrorState`/`EmptyState` | `apps/mobile/src/components/` | **Yes, as-is** | None | Established, reusable primitives every prior ticket already uses. |
| Grouped-accessible-block pattern, live regions | `capsule-detail.tsx`, `review.tsx` (E1.3.11/E1.4.11) | **Yes, as pattern** | Apply to new reveal-specific elements | Same conventions, new screens. |
| Static-source-scan security tests (`never imports SecureStore/AsyncStorage/@tc/crypto by name` etc.) | Every screen test file this arc | **Yes, as pattern** | Write new instances for the new screen | Established convention, not new invention. |
| Deep-link routing | `expo-router` (file-based) + `expo-linking` (installed, unconfigured) | **Partially** | Universal/App Link (`associatedDomains`/`intentFilters`) config + the fragment-survival spike | See §13. |
| `expo-audio` | `apps/mobile/package.json` | **Yes** | None for playback (already used for voice recording; playback API already proven in `voice-recorder.tsx`) | |
| Any media-viewer/image/video component | — | **No** | New | Doesn't exist. |
| Reply *composition* | — | **No** | New (`sealReply`-equivalent, `Correspondence`-equivalent) | Read-only only exists today (E1.3.9). Deliberately excluded from this document's core scope — §4, §14. |

---

## 9. Media Viewer Feasibility

Installed today, confirmed via `package.json`: `expo-audio` (playback already proven working in `voice-recorder.tsx`), `expo-file-system` (byte I/O, already used for reading picked files). **Not installed**: any image-viewer-beyond-`<Image>`, `expo-video`, any PDF renderer.

| Kind | Web behavior | Realistic V1 mobile approach | New dependency needed |
|---|---|---|---|
| Image | `<img src=blobUrl>` | RN's built-in `Image` component, given a `data:`/local-file URI built from the decrypted bytes (or a temp file via `expo-file-system`) | None |
| Audio/voice | `<audio controls>` | `expo-audio`'s player (already proven, E1.4.6) | None |
| Video | `<video controls>` | Needs an RN video-playback component | **Yes** — `expo-video` (Expo-maintained, same vendor as every other native module already in this app; the natural, lowest-risk choice, not a speculative third-party pick) |
| PDF | `<object data=blobUrl>`, with a designed, already-shipping fallback ("cannot be shown here, keep a copy") for browsers that refuse to embed | **The existing fallback is already a first-class, designed case in the same component — not a degraded one.** V1 mobile can reuse it verbatim: state the document plainly, offer "keep a copy," and skip embedding entirely. | **None required for V1.** A native PDF renderer is a real option for a *later* pass, never a blocker. |
| Everything else (document/archive) | Stated plainly, "kept as it was enclosed" | Same copy, same principle | None |

**Direct answer to the blueprint's own open PDF question**: no RN PDF renderer is installed, none is required for V1, and the repository already has an approved, shipped, non-degraded fallback pattern to reuse rather than invent. This is not a compromise — web itself uses the identical fallback for any browser that won't embed a PDF either.

---

## 10. One Reading Only Deep Audit

| Question | Answer | Label |
|---|---|---|
| Exactly when is a read "consumed"? | Only for `expiry_strict` capsules: when `POST /r/:token/confirm-read` is called and its scheduled action is inserted (durable the instant the DB commits, not on eventual worker execution) | SUPPORTED BY CODE |
| Is this the same as `alreadyOpened`? | **No.** `alreadyOpened`/`recipient.status='opened'` is a *separate*, earlier, notification-purpose signal set inside `GET /r/:token` itself, before any decrypt attempt — a corrupted/keyless link can trigger it. It only affects whether the *ceremony animation* replays, never content availability or destruction. | SUPPORTED BY CODE |
| Confirmation before or after successful decrypt? | **After** — fired only inside the `onDecrypted` success callback | SUPPORTED BY CODE |
| What does the user see before confirming? | The full ceremony and letter — confirmation is invisible/automatic, not a user-facing button or prompt | SUPPORTED BY CODE |
| Can media be previewed before "consumption"? | Yes — media decrypt is fully independent of `confirm-read`; a recipient can open every enclosure before or after the letter triggers the confirm call, since only the *letter's own* successful decrypt fires it | SUPPORTED BY CODE |
| Screenshots/backgrounding addressed? | **No** — not found anywhere in the web trace, not mentioned in any planning document for this specific concern | OPEN DESIGN QUESTION (§25 item 7 of the master blueprint already flags "app-switcher screenshot redaction" as unresolved, generally, not reveal-specific) |
| App killed after confirm-read fires but before response arrives? | Server-side, irrelevant — the insert already committed or didn't; a resumed app can safely call it again (idempotent) with no data loss either way | SUPPORTED BY CODE |
| Loses connectivity right after decrypt succeeds? | The `confirm-read` call would fail; **nothing retries it, on web, today** (§5.21) — the capsule would simply never schedule its own expiry from that particular reading. Not destructive, not a security hole — a missed self-destruct, not a wrongful one. | DOCUMENTED BUT NOT IMPLEMENTED (retry) — this is an accurate description of web's *current* behavior, not an invented mobile guarantee |
| Retry-able? | Yes, safely (idempotent) — mobile *could* add a retry without any new backend risk, a genuine, disclosed opportunity to do *better* than web here, not merely match it | OPEN DECISION for whoever implements — see ticket 5.3 |
| Server or client authoritative? | **Server**, entirely — the client's only job is to call the endpoint once, honestly, at the right moment; it has no ability to mark or unmark anything itself | SUPPORTED BY CODE |
| Can mobile accidentally consume twice? | No meaningful "twice" exists — a second call is a safe no-op | SUPPORTED BY CODE |
| Android/iOS lifecycle race? | None identified specific to this call — it is a single, short, fire-and-forget POST; the only genuine risk (app killed mid-flight) is already covered by idempotency above | SUPPORTED BY CODE, no new guarantee needed |

**No additional security guarantee is invented here beyond what the architecture already provides.**

---

## 11. Accessibility / Reduced Motion Audit

- **Haptics on reveal**: **permanently banned**, per `design/07-EXPERIENCE-BIBLE.md` Part VII ("Never on the reveal. Never audio.") — this is the **latest, authoritative** resolution of the contradiction `05-BUILD-PLAYBOOK.md`'s T-24 text still carries ("reveal ceremony with haptics"); the blueprint's own §24 already flags this exact conflict and its own §11.1 already states Decision 3 makes it final. Confirmed by direct code read: zero haptics anywhere in `RevealCeremony.tsx`/`use-transit.ts`.
- **Screen-reader announcement**: `aria-live="polite"` region announcing `"Capsule opened. {senderName} wrote to you."` once `transit.opened` flips — RN equivalent: `AccessibilityInfo.announceForAccessibility()` fired at the equivalent state transition, not a passive live-region prop (RN has no direct `aria-live` analogue for a transient announcement; this needs deliberate code, not a prop port).
- **Focus management**: web moves DOM focus to the letter's own `<h1>` once `letterProgress >= 1`. RN equivalent needs explicit `AccessibilityInfo`/ref-based focus (e.g. `UIManager.sendAccessibilityEvent` on Android, `AccessibilityInfo.setAccessibilityFocus` cross-platform via a ref) — **not automatic**, must be built deliberately, exactly as the blueprint's own §11.1 already warned.
- **Skip control**: web offers both tap-anywhere *and* a keyboard-focusable "Show the letter now" button (a real, disclosed prior bug-fix — the surface-only skip was invisible to keyboard users). Mobile's TalkBack/VoiceOver equivalent of "keyboard user" is a screen-reader user swiping through elements with no way to "tap anywhere" meaningfully — the reveal screen **must** expose an explicit, labeled, focusable "Skip" control, not rely on a full-surface `Pressable` alone, or a screen-reader user is left with no way to advance past the ceremony at all. This is a **new** requirement for mobile, not a straight port, since RN's touch model doesn't have a keyboard-vs-pointer distinction the web fix was solving for — the *equivalent* gap (a screen-reader user with no way to skip) is real regardless.
- **Reduced motion**: `AccessibilityInfo.isReduceMotionEnabled()` (+ its own `reduceMotionChanged` event) must be read explicitly and threaded into the timeline scalar (mirroring web's `useSyncExternalStore` on the media query) — **all held beats preserved**, only the moving segments shortened, per `07 §VI.4`'s explicit rule ("silence is timing, not motion") and the already-defined `TRANSIT_REDUCED` constants, which are pure data and port directly.
- **Media controls**: `expo-audio`'s player already has accessible controls proven in E1.4.6; any new `expo-video` component needs the same labeling discipline (Play/Pause states stated as text, matching `voice-recorder.tsx`'s own established pattern from E1.4.11).
- **The E1.4.11 lesson, applied**: TalkBack/VoiceOver announcing this screen's states (via captured speech-queue log or live accessibility-tree inspection, the methodology E1.4.11 established) is **intentional, verifiable behavior**, not a logging leak — but the *content* of any accessibility label must still be checked for accidental exposure: e.g., an enclosure's accessible label should say "Photograph, sunset.jpg" (already-authorized metadata, matching the creation-side pattern from E1.4.11), never anything that would require decrypting first just to build the label.
- **Modal terminology tension, flagged not resolved**: `02-UX-DESIGN.md` §15's own line ("composer/reveal are full-screen modals") appears to describe RN **navigation-presentation style** ("modal" as in "slides up, covers the tab bar"), whereas `07-EXPERIENCE-BIBLE.md` Part XVI bans "modals on the wait or reveal path" in the **overlay-dialog** sense (a lightbox/dialog interrupting content). These are almost certainly not in conflict — the reveal screen should be a full-screen *route*, never a floating overlay *within* another screen — but the two documents use the same word for different things, and this document does not silently resolve that; whoever builds 5.1 should read the reveal screen as "its own full-screen destination," never as a dialog stacked over Home.

---

## 12. Recovery-Code Decision

**Traced directly, not assumed**: `restoreMasterKeyFromRecoveryCode`/`parseRecoveryCode` exist and are tested in `packages/crypto/src/recovery-kit.ts` (+ its own test file, + `master-key.test.ts`), and exported from the package's `index.ts`. A repository-wide grep of `apps/web/src` and `apps/mobile/src` for either name returns **zero results** — confirmed identically to the master blueprint's own §24/§1 finding, independently re-verified this session rather than trusted on citation alone.

**Conclusion: (B) a parallel concern that can be explicitly deferred — not a Phase 5 prerequisite, not a blocker.**

Evidence:
- Phase 5's entire reveal path (recipient side) **never touches the master key or a password at all** — the capsule key comes from a link fragment or a passphrase, both independent of the account/password system. A recipient with a forgotten-password *account* is irrelevant to opening a link sent to them.
- The *owner* side of the product (viewing your own sent capsules, sending a reply as the owner) does use the master key — but that already works today via the existing password-login path; the gap is specifically about **password reset**, a scenario Phase 5 does not exercise or depend on.
- The gap is real, high-severity, and **product-wide** (confirmed present on web, which has shipped this feature area already) — it is not something Phase 5 would "inherit" by building reveal; it already exists independently of any mobile work.
- Founder Decision #8 (mobile-first vs. web-first vs. both) remains genuinely open in the master blueprint and is **not re-litigated by this document** — this audit only establishes that Phase 5 does not need it resolved to proceed.

---

## 13. Dependencies

- **`expo-video`** — new, for video enclosure playback (§9). No PDF library needed for V1 (§9). No other new npm dependency identified.
- **Universal/App Links** (`associatedDomains` on iOS, Android App Links `intentFilters`, plus the `apple-app-site-association`/`assetlinks.json` hosting `05-BUILD-PLAYBOOK.md` T-23 already calls out as a 🧑 HUMAN SETUP item) — **not configured at all today** `[VERIFIED]`. Open Decision #2 from the master blueprint ("does the fragment survive a Universal Link open? — needs a spike") is a real, unresolved technical question, not a desk decision.
- **Backend**: no new endpoints needed — `GET /r/:token`, `/verify*`, `/place-check`, `/confirm-read` all already exist and are already used correctly by web. Zero backend work required for 5.1–5.4.
- **Shared packages**: `@tc/crypto`'s reveal-relevant functions are all already exported and already portable (used elsewhere in this exact codebase's own mobile code). No package changes needed.

---

## 14. Proposed Phase 5 Ticket Map

**PHASE-5.1 — Reveal entry, locked state, Seal gates**
- **Objective**: the countdown/locked page and every pre-unlock Seal gate, reachable via manual/deep-link navigation.
- **Scope**: new unauthenticated route (`app/(reveal)/c/[token].tsx`-equivalent under Expo Router's own convention); `GET /r/:token` wiring; `LockedWait`-equivalent (countdown, Seal-stamps row, remind-me, add-to-calendar); Place/Passphrase/Identity gate components (native inputs, same client-side throttle for Passphrase, same OTP flow for Identity).
- **Dependencies**: none beyond existing `@tc/contracts`/`api-client.ts` patterns.
- **Backend dependency**: none — endpoints already exist.
- **Shared-package dependency**: `@tc/crypto`'s `unwrapCapsuleKeyWithPassphrase` (Passphrase Seal only; the base reveal path needs no crypto yet).
- **Acceptance criteria**: a real token opens to the correct state (locked/withdrawn/expired/unlocked) exactly matching web's own `getReveal` branches; a Place/Passphrase/Identity gate satisfies and advances correctly against the real backend.
- **Security requirements**: no capsule key exists yet at this stage — nothing to protect beyond the existing token-transport discipline already proven by every other `capsulesApi`/`recipientsApi` call.
- **Accessibility requirements**: countdown/duration read as text (matching `DualClock`/`horizonPhrase` conventions already established), gates carry standard label/hint/error-announcement per the E1.4.10/E1.4.11 conventions.
- **Android verification**: real token, real backend, all four top-level states + at least one of each gate type.
- **iOS verification**: build/render only, per this tooling's own established, disclosed limitation.
- **Automated tests**: one per `getReveal` branch (locked/unlocked/withdrawn/expired), one per gate satisfied/failed.
- **Explicit non-goals**: no ceremony animation yet (5.2), no content decrypt yet, no media.

**PHASE-5.2 — Transit ceremony, letter decrypt and display**
- **Objective**: the held-beat ceremony and the decrypted letter, "record at rest."
- **Scope**: port `use-transit.ts`'s scalar architecture to Reanimated (`useSharedValue`+`withTiming`, or a manual frame driver matching the exact `TRANSIT`/`TRANSIT_REDUCED` constants verbatim); the new recipient-path key-resolution function (§8: link-fragment + passphrase-key, distinct from `resolveCapsuleKey`); letter decrypt + paragraph display; the `alreadyOpened` no-replay branch.
- **Dependencies**: 5.1 (needs a real unlocked response to decrypt).
- **Backend dependency**: none new.
- **Shared-package dependency**: `@tc/crypto`'s `decodeCapsuleKeyFromLink`, `decryptBytes`, `fromBase64Url` — all already portable.
- **Acceptance criteria**: a real sealed capsule (from E1.4's own creation flow) decrypts and displays correctly on mobile, matching web's own decrypted text exactly (the actual cross-platform proof, per the master blueprint's §26 DoD: "sealed on web opens correctly on mobile and vice versa").
- **Security requirements**: capsule key never logged, never persisted; the new key-resolution function never confuses this path with the owner's `ownerKeyWrap` path (a static-source-scan test, matching every prior ticket's own convention, should assert this file never imports `master-key-context`).
- **Accessibility requirements**: `AccessibilityInfo.announceForAccessibility` on ceremony completion; explicit focus move to the letter heading; a real, labeled, focusable Skip control (§11 — genuinely new, not a straight port); `AccessibilityInfo.isReduceMotionEnabled()` threaded through, all held beats preserved.
- **Android verification**: real seal → real reveal → decrypted text matches exactly; TalkBack pass confirming the announcement, focus move, and Skip control all work, mirroring E1.4.11's own captured-speech-log methodology.
- **iOS verification**: build/render only.
- **Automated tests**: transit timeline unit tests (bucket/segment math, mirroring `elapsedAnnouncement`'s own precedent from E1.4.11); a real decrypt-and-render screen test; a reduced-motion path test; `alreadyOpened` no-replay test.
- **Explicit non-goals**: no media viewer yet, no reply composer, no haptics (never, per §11).

**PHASE-5.3 — Media viewer + One Reading Only**
- **Objective**: per-kind enclosure viewing and the `confirm-read` call.
- **Scope**: new `EnclosureViewer`-equivalent (open-in-place, lazy decrypt, per-kind render per §9's table); the read-side media-decrypt function (fetch signed `viewUrl` + `decryptBytes`, new but format-proven); `confirm-read` fired at the exact post-decrypt moment (§10); `expo-video` added for video playback.
- **Dependencies**: 5.2 (needs `capsuleKey` and a rendered record to attach enclosures to).
- **Backend dependency**: `POST /r/:token/confirm-read` — already exists, zero backend changes.
- **Shared-package dependency**: `decryptBytes` only; no new crypto.
- **Acceptance criteria**: every media kind created via E1.4's own composer (image/video/voice/document) opens and decrypts correctly; a real `expiry_strict` test capsule's `confirm-read` call is observed (via direct Postgres inspection of `scheduled_actions`) to schedule `capsule_expire` exactly once, even across a deliberate double-tap/retry.
- **Security requirements**: object-URL-equivalent (temp file via `expo-file-system`, or a data URI) lifecycle is bounded and cleaned up; no console logging of decrypt errors beyond a stated, non-technical message (closing the Open Decision flagged in §7).
- **Accessibility requirements**: each enclosure's accessible label states its kind in words (reusing/expanding E1.4.11's own `enclosureKindWord` pattern to match web's full noun set — Photograph/Video/Voice recording/Document/Archive/Enclosure, not the narrower three-way split Review uses); Play/Pause and Open/Retry states stated as text.
- **Android verification**: real media of at least image + voice + one "kept as it was enclosed" fallback kind, opened for real; real `confirm-read` traced end-to-end against Postgres for a real `expiry_strict` capsule, confirming the capsule is genuinely destroyed by the scheduler afterward (not just that the row was inserted).
- **iOS verification**: build/render only.
- **Automated tests**: one per media kind's render branch; the fallback-kind test; a `confirm-read`-fires-once-on-success, never-on-decrypt-failure test; an idempotency test (two rapid calls schedule one action).
- **Explicit non-goals**: PDF native rendering (use the fallback, §9); reply composition; download-a-copy/zip (a real web feature, not required for Phase 5's minimum — flag as deferred, don't silently drop).

**PHASE-5.4 — Error/validation + accessibility hardening pass**
- **Objective**: mirror E1.4.10/E1.4.11's own end-of-phase discipline for the reveal surface specifically.
- **Scope**: every reveal-specific error state gets specific, non-generic copy (rate-limited, key-missing, key-mismatch, withdrawn, expired — matching web's own `SystemPage` copy exactly, since it already exists and is already in the product's real voice); a dedicated TalkBack/VoiceOver pass on the whole 5.1–5.3 surface, following E1.4.11's exact real-device methodology (not unit tests alone).
- **Dependencies**: 5.1–5.3 complete.
- **Backend/shared-package dependency**: none new.
- **Acceptance criteria**: no generic error message reachable anywhere on the reveal path (matching E1.4.10's own DoD language); a real TalkBack walkthrough confirms every state announces correctly.
- **Security requirements**: a full logcat grep across the entire verification session, matching every prior ticket's own established discipline.
- **Accessibility requirements**: this ticket's entire content.
- **Android verification**: the real TalkBack pass itself.
- **iOS verification**: build/render only.
- **Automated tests**: one per error-state copy, matching each real backend error code traced in §6.
- **Explicit non-goals**: none — this is intentionally a narrow, cross-cutting pass, not a place to add new features.

**PHASE-5.5 — Universal/App Links spike** *(can run in parallel with 5.1–5.4; gates only the real end-to-end "tap an email link" path, not the screen's own construction or testing)*
- **Objective**: resolve Open Decision #2 — does the chosen router/linking config deliver the `#k=...` fragment intact on a real Universal/App Link open, on both platforms?
- **Scope**: `associatedDomains` (iOS) / `intentFilters` (Android) configuration; `apple-app-site-association`/`assetlinks.json` hosting (🧑 HUMAN SETUP, per T-23); a real device test tapping a real `https://timelycapsule.com/c/:token#k=...` link from a real email client, both platforms.
- **Dependencies**: none technical; needs the 🧑 HUMAN SETUP (domain hosting access) the original T-23 ticket already named.
- **Acceptance criteria**: the fragment survives, confirmed on real hardware, not assumed.
- **Security requirements**: none beyond what already exists.
- **Accessibility requirements**: none.
- **Android verification**: the spike's own real-link test.
- **iOS verification**: the spike's own real-link test — this one **can and should** be genuinely attempted on iOS even given this tooling's general automation limitation, since a Universal Link can be tested by a human tapping a real email on a real or simulated device without needing interactive Fabric automation.
- **Automated tests**: none meaningful — this is fundamentally a device/infra spike, not unit-testable.
- **Explicit non-goals**: does not block starting 5.1–5.4, which are fully testable via manual/dev-menu deep-link navigation in the meantime.

**Deliberately not split further**: reveal-entry (5.1), ceremony+letter (5.2), and media+OneReadingOnly (5.3) are separated because they are genuinely, cleanly decoupled by data dependency (each needs strictly more of the `RevealResponse` than the last) — matching exactly how `E1.4.1`→`E1.4.3`→`E1.4.7` were staged for capsule creation. Recipient reply-composition and "download a copy" are **explicitly excluded** from all five tickets above (§4) — the master blueprint's own Phase 6 is the natural home for reply-composition; "download a copy" is a real web feature with no stated urgency in any source document and is flagged here as a genuine, disclosed gap rather than silently added to 5.3's scope.

---

## 15. Acceptance/Verification Strategy

Mirrors E1.4's own established rigor exactly: real Android emulator, real backend/Postgres, disposable test accounts/capsules, direct DB inspection for anything destructive (`confirm-read`'s effect on `scheduled_actions`/`capsules.state`), real TalkBack walkthroughs using the captured-speech-log methodology E1.4.11 established, cross-platform proof via a real capsule sealed on mobile (already possible today, per E1.4.9) opened on the real reveal page once 5.2 exists — and, symmetrically, a real capsule sealed on **web** opened on mobile's own reveal screen, which has never been exercised before and is the actual missing half of the master blueprint's own §26 DoD line ("a capsule sealed on web opens correctly on mobile and vice versa").

---

## 16. Open Decisions (carried forward, not resolved here)

1. Recipient reply-composition: bundle into Phase 5 or keep in Phase 6, given web's own code doesn't separate them as cleanly as the blueprint's phase numbering implies (§4, §14) — **for whoever scopes the first real ticket to decide**, not this audit.
2. Does the fragment survive a Universal Link open? (§13, master blueprint's own Open Decision #2) — needs PHASE-5.5's own spike.
3. Should mobile add a `confirm-read` retry, a genuine improvement over web's current silent-failure behavior (§10)? — a real, low-risk opportunity, not a requirement.
4. App-switcher screenshot redaction on the reveal/letter screen — already an open, unresolved, non-reveal-specific question in the master blueprint's own §25 item 7; not newly raised here, but directly relevant.
5. "Download a copy" (zip export) — real on web, unaddressed by any source document for mobile Phase 5; flagged, not decided.
6. Founder Decision #8 (recovery-code restore: mobile-first/web-first/both) — explicitly **not** re-litigated here; confirmed not to block Phase 5 (§12).

---

## 17. Final Readiness Verdict

| Ticket | Verdict |
|---|---|
| PHASE-5.1 | **READY** |
| PHASE-5.2 | **READY** |
| PHASE-5.3 | **READY** |
| PHASE-5.4 | **READY AFTER SPECIFIC DECISION** — needs Open Decision #1 (§16) settled first (whether reply-composition copy/space is reserved) so the error/a11y pass isn't redone once 5.x's own scope is later revisited |
| PHASE-5.5 | **NEEDS DESIGN DECISION** (human infra access) rather than blocked — parallelizable with everything else |

**Overall Phase 5 verdict: READY.** No hard technical blocker exists — no crypto gap, no missing backend endpoint, no unresolved architecture question. Every dependency identified (`expo-video`, Universal Links, the recipient-path key-resolution function) is a bounded, well-understood piece of work, not a re-design. The only genuinely open items (§16) are scoping/product decisions, not readiness blockers — matching this arc's own established bar: "not deciding this at all and simply assuming it works is the actual risk, not the fix itself" (quoting the E1.4 readiness audit's own §6.8, a standard this document has tried to meet rather than merely cite).

---

*This document creates no ticket, assigns no ticket number beyond the placeholder `PHASE-5.N` labels above, and authorizes no implementation. It is a planning artifact only.*
