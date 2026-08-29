# Stage E, Mobile V1 — E1.3 Final Readiness Audit

**Status:** Final pre-implementation audit. Read-only — no application code, contracts, or crypto files were modified. No branches, commits, or PRs were created. This is the last broad audit pass before returning to normal ticket-by-ticket execution.

**Relationship to prior documents:** `plan/STAGE-E-MOBILE-V1-E1.3-AUDIT-AND-IMPLEMENTATION-BLUEPRINT.md` (written the previous day, same repository state plus one isolated backend addition since) remains **fully accurate** on architecture, crypto boundary, mobile IA, and the core ticket list — this document does not re-derive it. This document's job is narrower: independently re-verify the current repository state with fresh, skeptical eyes (not trusting the prior audit's own conclusions), confirm the push-token addition landed safely, and surface everything genuinely new — several concrete backend "gotchas" not previously documented, and a fresh documentation-contradiction pass against three documents the prior audit didn't cover (`01-PRODUCT.md`, `03-ARCHITECTURE.md`, `design/11-IMPLEMENTATION-ALIGNMENT.md`).

**Evidence labels:** `[VERIFIED]` read directly from current code/git this session · `[INFERENCE]` reasoned from verified evidence · `[RECOMMENDATION]` proposed, not decided · `[OPEN DECISION]` genuinely unresolved · `[BLOCKER]` prevents the next step.

---

## 1. Executive verdict

# READY WITH CHANGES

E1.3 (read-only capsule browsing) can start immediately. Nothing found in this session blocks it. "With changes" reflects six concrete, previously-undocumented backend behaviors the mobile client must design around from day one (not fix, not wait for — just build correctly against), all detailed in §5/§14. None require a backend change to unblock E1.3; two are worth a backend follow-up ticket later (parking lot, §13).

---

## 2. Current repository state

`[VERIFIED]`, this session, via direct `git` commands and file reads — not assumed from any prior document.

| | |
|---|---|
| Branch | `e1.2-mobile-auth-foundation` |
| `origin/main` | `3c54319` — merge of PR #50 (E1.2). Confirmed: local `HEAD` (`095cc08`) is a strict subset of `origin/main`; `git diff HEAD origin/main` is empty. **Nothing else landed on `main` since E1.2 merged.** |
| Working tree | Exactly 6 paths: 5 modified (`apps/api/src/modules/notifications/{routes,service,notifications.test}.ts`, `packages/contracts/src/notifications.ts`, `plan/PROGRESS.md`) + 1 untracked (yesterday's E1.3 blueprint). All uncommitted. |
| What's merged | Phase 0 spike commit (`3244e8c`, E0.1), E1.1 (backend recovery, PR #49), E1.2 (mobile auth, PR #50). |
| What's uncommitted | Push-token registration (routes/service/contract/tests) + two planning documents. |

**Answering the audit questions directly:**
- **What is actually merged?** E0.1, E1.1, E1.2 — all three, confirmed via `git log origin/main`.
- **What is currently uncommitted?** Push-token registration (4 code/test files + contracts) and this session's planning documents. Nothing else.
- **Are the push-token changes present?** Yes, `git diff --stat` confirms all 4 files carry real content (not staged-but-empty).
- **Are they correctly isolated?** `[VERIFIED]` Yes — re-confirmed independently this session (not just re-trusting yesterday's own claim): the diff touches only `apps/api/src/modules/notifications/*` and `packages/contracts/src/notifications.ts`. Zero lines touch `modules/capsules`, `modules/received`, `modules/media`, any file under `apps/mobile/`, or any file under `packages/crypto/`. The new routes are mounted on `/me/push-tokens` and `/me/push-tokens/:id` — disjoint paths from `/notifications`, `/capsules`, `/received`. The new response shape (`{ pushToken: {id, platform, lastSeenAt, createdAt} }`) shares no fields of consequence with `NotificationSchema`, `CapsuleListItemSchema`, or `ReceivedCapsuleSchema`.
- **Is E1.2 actually complete in the current source?** `[VERIFIED]` Yes. `apps/mobile/app/` and `apps/mobile/src/` contain exactly the 19 files E1.2 shipped, unchanged since (confirmed via `git log -- packages/crypto/ apps/mobile/` showing `095cc08` as the last touch to both). `apps/mobile/package.json` still carries the exact E1.2 dependency set (no `@tanstack/react-query` yet — correctly still absent, that's E1.3's own first addition). `packages/crypto/src/random.ts` is still unpatched (§4, §6) — correctly untouched, since fixing it wasn't E1.2's or the push-token work's job.

---

## 3. What changed since the original E1.3 audit

Exactly one thing, and it's fully isolated (§2): **push-token registration** (`POST /me/push-tokens`, `DELETE /me/push-tokens/:id`). Nothing else in the repository changed — no web code, no mobile code, no crypto code, no other backend module. The prior audit's entire web-capability inventory, crypto boundary map, mobile-architecture audit, and design-doc contradiction findings remain evidence-current with zero re-verification risk from drift (there was no time for drift — this is the very next session).

What this document adds that the prior one didn't have: a **second, independent pass** over the exact API responses E1.3 will consume (§5), specifically hunting for problems rather than confirming correctness, which surfaced six real findings (§14) the prior "complete/production-ready" verdict didn't call out. It also covers three documents (`01-PRODUCT.md`, `03-ARCHITECTURE.md`, `design/11-IMPLEMENTATION-ALIGNMENT.md`) the prior design-doc audit didn't touch (§14).

---

## 4. E1.3 ticket-by-ticket status

Against the prior blueprint's `E1.3.1`–`E1.3.12` backlog, re-verified against current code:

| Ticket | Status | Notes |
|---|---|---|
| E1.3.1 — Capsule domain API client | **KEEP** | `@tanstack/react-query` confirmed still absent from `apps/mobile/package.json` — ticket's own premise holds exactly. |
| E1.3.2 — Mobile design tokens, extended | **KEEP** | `apps/mobile/src/lib/tokens.ts` unchanged, still the minimal E1.2 subset. |
| E1.3.3 — Loading/empty/error primitives | **KEEP** | No such components exist yet in `apps/mobile/src/components/` (confirmed: only `master-key-gate.tsx`). |
| E1.3.4 — `CapsuleRow` component | **MODIFY** | Still needed, but must now explicitly normalize `ReceivedCapsule.capsuleId` → the same `id` key `CapsuleListItem` uses (§5.3 finding) if it's meant to back a single shared list-rendering path across Home and Received. Add this to the ticket's acceptance criteria. |
| E1.3.5 — Home screen | **KEEP** | No change to `GET /capsules`'s contract or behavior since yesterday. |
| E1.3.6 — Received screen | **MODIFY** | Original ticket assumed a generically "paginated" list; `GET /received` is confirmed **unpaginated and unbounded** (§5.3). Acceptance criteria must change: no infinite-scroll/cursor logic for this screen, and add an explicit (even if currently rare) large-list rendering consideration — a flat `FlatList`/similar over the full response, not React Query's infinite-query pattern. |
| E1.3.7 — Shared capsule-decrypt utility | **KEEP** | Unaffected — pure `@tc/crypto` integration, no dependency on any endpoint's pagination shape. |
| E1.3.8 — Capsule detail screen | **MODIFY** | Add one more explicit state to the four already specified (Destroyed/Withheld/Closed/Open): a capsule that is the caller's own, unsealed **`draft`**, has `contentDocEnc: null` — confirmed this is a real, reachable value the schema allows (§5.2 finding), and the four-state model as written doesn't explicitly name it (it likely falls under "Closed" in intent, but the ticket should say so explicitly rather than leave it to be discovered mid-implementation). |
| E1.3.9 — Read-only replies + recipient list (optional) | **KEEP, still optional** | `GET /capsules/:id/replies` confirmed complete, ciphertext-only, unpaginated (fine at reply-thread scale). One new, minor note: its ownership check is a locally-duplicated `assertOwner` rather than the shared `findOwnedCapsuleOrThrow` used everywhere else (§5.7) — functionally fine for mobile to consume, not something mobile's ticket needs to fix, just don't be surprised if its error shape ever drifts independently of the other endpoints'. |
| E1.3.10 — Notifications tab | **MODIFY** | Two new, concrete findings change this ticket's actual content (§5.4, §14.6): (1) there is **no WebSocket/real-time push of new notification rows** — `03-ARCHITECTURE.md`'s "Socket.IO push to active sessions" was never built; the tab must poll (on-foreground + pull-to-refresh), not assume live updates. (2) Only **four event types** currently ever produce an in-app notification row (recipient-opened, reply-received, media-release-warning, email-bounce-alert) — capsule-unlock itself does **not** write one (email-only). Tapping a notification to navigate should read `data.capsuleId` (present by convention on all four, confirmed at each of the four call sites — not schema-enforced, `data` is `z.unknown()`, so the client must defensively check for its presence before navigating). |
| E1.3.11 — Accessibility pass | **KEEP** | No change to scope. |
| E1.3.12 — `random.native.ts` | **KEEP, still non-blocking for E1.3, still recommended in parallel** | Confirmed still unpatched, confirmed still unreachable from any E1.3 code path (re-traced §6). |

**No ticket should be removed. No new ticket needs to be added to the core list** — the six new findings are all captured as acceptance-criteria refinements to existing tickets (E1.3.6, E1.3.8, E1.3.10) or as a small addendum to E1.3.4, not as new standalone work.

---

## 5. Backend readiness matrix

`[VERIFIED]`, re-derived independently this session by reading the actual current route/service/schema files, not by re-trusting yesterday's audit.

| Endpoint | Response shape matches contract? | Paginated? | Rate-limited? | Auth | Fit for E1.3 |
|---|---|---|---|---|---|
| `GET /capsules` | Yes, field-for-field | Cursor, `limit` 1–100, default 20 — **except** `collectionId`-filtered requests, which silently return the full unpaginated result with `nextCursor: null` | **No** | Session | Ready |
| `GET /capsules/:id` | Yes | N/A (single resource) | **No** | Session, owner-only (404 on mismatch, not 403) | Ready — client must handle `contentDocEnc`/`ownerKeyWrap` both `null` for a still-`draft` capsule |
| `GET /received` | Yes | **None at all** — loads every claimed recipient row for the user, unconditionally, no `LIMIT` in the SQL | **No** | Session | Ready to consume as-is (flat list), **not** ready to treat as cursor-paginated |
| `GET /notifications` | Yes | Cursor, `limit` 1–100, default 20 | **No** | Session | Ready — no real-time push exists; must poll |
| `GET /capsules/:id/media` | Yes | None (unbounded, but naturally small per capsule) | **No** | Session, owner-only via parent capsule | Ready — must special-case `status: 'released'` items (no view URL will ever succeed for them) |
| `GET /media/:id/view` | Yes | N/A | **No** | Session, owner-only via parent capsule | Ready — 15-min TTL confirmed exact; throws a dedicated `media_released` error, distinct from upload-incomplete |
| `GET /capsules/:id/replies` (optional, E1.3.9) | Yes | None (unbounded, fine at this scale) | **No** | Session, owner-only (separately-implemented but equivalent check) | Ready |
| `POST /me/push-tokens`, `DELETE /me/push-tokens/:id` | N/A — not E1.3's concern | N/A | 60/15min | Session | Confirmed isolated, no interaction with any E1.3 endpoint |

**Is any backend change actually required before E1.3?** `[VERIFIED, no]`. Every endpoint above is callable today, returns a schema-correct response, and is sufficient for the ticket's read-only scope. The absence of rate limiting and pagination on `/received` are real characteristics to design the mobile client around, not defects blocking the client from being built.

**Does push-token registration affect any E1.3 dependency?** `[VERIFIED, no]` — confirmed independently in §2 and by a second agent's fresh trace in this session.

---

## 6. Crypto readiness matrix

`[VERIFIED]`, unchanged since the prior audit (confirmed via `git log -- packages/crypto/` showing no commits since E1.2) — re-stated here for completeness rather than re-derived, since re-deriving unchanged evidence wastes the session's compute on a foregone conclusion.

| Function | Portable? | Needed by E1.3? |
|---|---|---|
| `unwrapCapsuleKeyForOwner(wrap, masterKey)` | Yes — `aes.native.ts`, proven on real Android hardware in E1.2 | **Yes** |
| `decryptBytes(key, iv, ciphertext)` | Yes — same | **Yes** |
| `toBase64Url`/`fromBase64Url` | Yes — pure JS | **Yes** |
| `deriveKeyFromPassword` (Argon2id) | Yes — `kdf.native.ts`, proven on-device | Not reachable from E1.3's decrypt-only path |
| `generateAesKey`/`generateIv`/`generateSalt`/`generateRecoveryCodeBytes` (`random.ts`) | **No** — calls `crypto.getRandomValues` directly, no `.native.ts`, no polyfill installed | **Confirmed not needed by E1.3** — re-traced this session: the full decrypt chain (owner capsule → capsule key → content/media/reply plaintext) touches zero randomness-generating calls |

**The exact decrypt path, traced once more for this document's own completeness (§6.1 of the prior blueprint, re-confirmed unchanged):**
```
GET /capsules/:id response
  → capsule.ownerKeyWrap (base64 ciphertext, from the API)
  → unwrapCapsuleKeyForOwner(ownerKeyWrap, masterKey)   [masterKey already resolved in memory by E1.2's MasterKeyContext]
  → capsuleKey (raw 256-bit AES key, in memory only)
  → decryptBytes(capsuleKey, iv, contentDocEnc-ciphertext)
  → JSON.parse → LetterEnvelope → rendered plaintext
```
No step in this chain is browser-only; no step needs fresh randomness. `[VERIFIED]`.

**What should be shared rather than duplicated:** unchanged recommendation — one `apps/mobile/src/lib/capsule-crypto.ts` (E1.3.7), used by the detail screen now and by creation/reveal later. No new sharing candidate was found this session.

---

## 7. Mobile architecture

`[VERIFIED, unchanged, re-confirmed this session]`. `apps/mobile/app/(app)/(tabs)/_layout.tsx` and its four screen files are exactly what E1.2 shipped. `useAuth()`, `useMasterKey()`, `MasterKeyGate`, and `api-client.ts`'s `request()` pattern all exist, are tested, and need no signature change for E1.3 to build on top of them (confirmed by re-reading, not assumed).

**Navigation structure for E1.3, confirmed correct:** four tabs unchanged (Home/Received/Notifications/Profile); capsule detail is a new **stack route outside the tabs group** — `apps/mobile/app/(app)/capsule/[id].tsx`, pushed from either Home or Received, consistent with how `apps/web/src/app/(app)/capsule/[id]/page.tsx` is a pushed destination, not a tab, in the current web app (re-confirmed this session via `apps/web/src/app/(app)/` directory listing — `capsule/`, `people/`, `collections/`, `archive/`, `trash/` are all pushed destinations, none are tabs).

**Does the current auth gate need modification?** `[VERIFIED, no]`. `(app)/_layout.tsx`'s guard (redirect to login if `authState !== 'authenticated'`) and `MasterKeyGate`'s re-prompt logic both already correctly separate "is this session valid" from "can this device currently decrypt" — exactly the boundary E1.3's detail screen needs, unchanged.

**How should Home/Received/Notifications share components?** `CapsuleRow` (E1.3.4) is the shared list-item component for Home and Received specifically (both render capsule-shaped rows); Notifications renders a different shape (`Notification`, not `Capsule`) and should get its own row component — no forced sharing where the underlying data model differs.

**Has any E0.4 decision gone stale?** `[VERIFIED, no]`. Expo Router is not just "still the recommendation" — it's now proven in real production use (E1.2), a strictly stronger evidence base than E0.4's original throwaway-app spike. `expo-router: ~57.0.17` is unchanged in `package.json`. No new Expo SDK release, no new React Native release has landed in this repo since E1.2 (confirmed — dependency versions in `apps/mobile/package.json` are byte-identical to what E1.2 shipped).

---

## 8. UI component plan

`[RECOMMENDATION]`, unchanged from the prior blueprint's §16, restated compactly with this session's one addition:

- **New components needed:** `CapsuleRow` (Home + Received), `NotificationRow` (Notifications — new, not previously called out as its own component; the prior blueprint implicitly bundled it into "the Notifications tab" without naming a shared row component the way it did for `CapsuleRow` — worth naming explicitly now since Notifications' data shape genuinely differs), `EmptyState`, a static loading placeholder, `ErrorState`.
- **What to port from `packages/ui-web`:** values only (`tokens.css`'s color/spacing numbers), never components or CSS — unchanged principle, re-confirmed (`packages/ui-web` is React DOM + Radix + Tailwind, zero RN portability at the component level).
- **What NOT to port:** anything from `plan/02-UX-DESIGN.md §6`'s V1 palette (confirmed dead by the prior audit); no `plan/02-UX-DESIGN.md §15` mobile guidance either (self-flagged stale by `design/21-CAPSULE-CREATION-V2.md §XI.4`, unchanged this session).
- **Minimum token set:** the `CapsuleState`-to-color mapping (six states, brass reserved for `sealed` only), a minimal type scale, and — new finding worth adding — a **media-status** color/label set (`ready`/`released`/not-ready), since E1.3's capsule detail will render `GET /capsules/:id/media` results and must visually distinguish a released item from a viewable one (§5, §14.4).
- **Loading/empty/error states:** static, text-stated, never a spinner-as-sole-affordance — unchanged principle. Specifically: Received's empty state and Home's empty state should use different copy (matching web's own per-screen empty-state text where it exists), not one generic string reused everywhere.
- **Dark/light theme:** out of E1.3's minimum scope (E1.2 didn't build a theme toggle; `tokens.ts` only has light-register values) — E1.3 does not need to add dark mode, just needs to not hard-code anything that would make adding it later harder (i.e., still route all colors through `tokens.ts`, per E1.3.2).
- **Accessibility:** unchanged from prior blueprint — VoiceOver/TalkBack pass (E1.3.11), subject to the same iOS-interactive-automation caveat carried from E1.2.
- **Small-screen layouts:** `[RECOMMENDATION, not previously called out]` `CapsuleRow` and the detail screen's letter-rendering should be tested on at least one small-width device profile (e.g., the smallest currently-supported iPhone width in the Simulator) in addition to whatever default device the emulator/simulator defaults to, since the record-register letter content (potentially long-form text) is exactly the kind of content that reveals cramped-layout bugs only a real narrow-width pass catches.

---

## 9. Security plan

`[VERIFIED]` unless noted, re-confirmed this session against current code, not just re-asserted from the prior audit:

| Item | Status |
|---|---|
| Master key remains memory-only | Verified — `MasterKeyContext` unchanged since E1.2, no new persistence path introduced by anything in this session's scope |
| No decrypted content persisted unintentionally | Design requirement, unchanged — E1.3.7's decrypt utility must return plaintext to caller-managed component state only, never write to disk or a persistent query-cache entry |
| API errors cannot expose crypto internals | Verified for the auth path (E1.2's own audit); for E1.3's new error paths (`media_released`, `upload_incomplete`, generic 404-on-ownership-mismatch) — all are plain, descriptive HTTP error codes with no crypto-internal detail in any message string (confirmed by reading the actual `ApiError.*` factory calls in `media/service.ts`) |
| Notification previews don't leak plaintext | Verified — all four notification-writing call sites (§5.4) construct `title`/`body` server-side from plain metadata (names, counts, dates) never from decrypted capsule content; `body: undefined` is explicitly chosen for the reply-notification case specifically to avoid this |
| Navigation params carry identifiers only | Design requirement for the new `capsule/[id].tsx` route — `id` is the only param, already server-visible, never any ciphertext or key material |
| Deep-link keys not accidentally persisted | Not applicable to E1.3 — E1.3 introduces no deep-link entry point (that's E1.5); the capsule-detail route is reached only via in-app navigation from Home/Received/a notification tap, never from an external URL |
| Screenshots/logging/debug tooling | `[RECOMMENDATION, unchanged]` confirm TanStack Query devtools (if used during development) are stripped from release builds and never wired to persist/display decrypted query results; zero `console.*` calls in new code, same discipline as E1.2, grep-verifiable at review time |

**New, this-session finding relevant to security:** the `data: z.unknown().nullable()` field on `Notification` (§5.4) is untyped by the schema — a defensive client must not `eval`/blindly trust its shape, but this is a robustness concern, not a security one (the field only ever carries `capsuleId`/`recipientId`/similar plain identifiers by convention, confirmed at all four call sites, never ciphertext or key material).

---

## 10. Performance plan

`[RECOMMENDATION]`, one material update from this session's findings:

- **Decrypt cost for a normal capsule:** unchanged estimate — a single `decryptBytes` call on a typical letter-length JSON payload is negligible (sub-millisecond-to-low-millisecond range for AES-GCM on modern mobile hardware); not measured this session (no device benchmarking performed, per audit-only discipline), consistent with the prior audit's own inference-only treatment of this question.
- **Should list screens decrypt anything?** `[VERIFIED, no]` — re-confirmed: `GET /capsules` and `GET /received` both return plaintext envelope metadata only; zero decryption occurs on either list screen. Only the detail screen's explicit "open" action touches the master key.
- **When should decryption occur?** On-demand, at the moment the user opens a specific capsule's detail screen (and, within that screen, lazily per-enclosure when the user taps to view a specific media item) — never eagerly for an entire list.
- **Could large letters/media block the JS thread?** `[INFERENCE]` A very long letter's JSON parse + AES-GCM decrypt is still small relative to typical mobile JS-thread budgets; the more realistic risk is a large *media* file's full in-memory decrypt (web itself has this same characteristic — no streaming decrypt is used anywhere in the product today, confirmed by the prior audit's grep). E1.3's media handling should stay lazy (tap-to-view, matching web's `EnclosureViewer`) so this risk is deferred exactly as far as web already defers it, not introduced fresh by mobile.
- **Should media stay deferred in E1.3?** `[RECOMMENDATION, unchanged]` Yes — E1.3's job is to *list* media metadata (from `GET /capsules/:id/media`) and let the user open a specific item (via `GET /media/:id/view` + decrypt), not to build a full gallery/streaming viewer. This matches the ticket's original scope and this session found no reason to expand it.
- **Unnecessary network requests — new finding:** `[RECOMMENDATION]` because `GET /received` is unbounded and unpaginated (§5), the mobile client must not call it on every screen focus / every app foreground without a debounce — with no server-side rate limit as a backstop (§5, §14.1), a naive "refetch on every navigation" pattern could produce redundant full-table-scan-shaped requests in quick succession. Use TanStack Query's `staleTime` to make this cheap by default rather than relying on manual guards.

---

## 11. Test plan

`[RECOMMENDATION]`, extending the prior blueprint's §13 with this session's concrete findings folded in as explicit test cases:

| Test | Covers |
|---|---|
| Unit: `capsulesApi.list/get`, `receivedApi.list`, `notificationsApi.list` schema validation | Real `@tc/contracts` shapes, including the `nextCursor: null` case for `/capsules?collectionId=...` |
| Unit: `CapsuleRow` normalizes `ReceivedCapsule.capsuleId` → `id` correctly | The field-naming inconsistency found this session (§5.3) — a regression here would silently break navigation from a Received row |
| Unit: decrypt utility round-trips real web-produced ciphertext | Unchanged from prior plan |
| Unit: decrypt utility correctly throws (not silently returns garbage) on a tampered/corrupted `contentDocEnc` | Unchanged, AES-GCM's own guarantee |
| Component: capsule-detail screen renders correctly for a `draft`-state own capsule (both ciphertext fields `null`) | New — the explicitly-added fifth reachable state (§4, E1.3.8) |
| Component: capsule-detail's media section correctly shows a `released` item as unavailable, never attempts `GET /media/:id/view` for it | New (§5, §14.4) |
| Component: Notifications tab correctly extracts `data.capsuleId` when present and degrades gracefully (no crash, no dead tap) when absent/malformed | New (§5.4, §9) |
| Integration: a real capsule sealed on web is correctly listed and correctly decrypted by mobile | Unchanged, the core cross-platform proof |
| Manual, Android emulator: full walkthrough including a `draft` capsule, a `released`-media capsule, and a received capsule with no pagination edge case to worry about | Extends the prior manual-verification list with this session's specific new states |
| Manual, iOS: build + render verification; interactive tap-through subject to the same simulator-automation caveat E1.2 documented | Unchanged — if it recurs, document honestly, as before |

**Existing test-infrastructure gaps:** none new found this session. E1.2's Vitest + `react-test-renderer`/`act` + `vi.mock` pattern remains sufficient and requires no new tooling for E1.3.

---

## 12. Parallelization graph

`[RECOMMENDATION]`, unchanged shape from the prior blueprint, with the three explicitly-requested reassessments:

```
Track A: E1.3.1 (API client)         ─┐
Track B: E1.3.2 + E1.3.3 (tokens, states) ┤
Track C: E1.3.7 (decrypt utility)     ┤── all four fully independent, start immediately
Track D: E1.3.12 (random.native.ts)   ─┘

Track E: E1.3.4 (CapsuleRow, now incl. capsuleId→id normalization) — needs Track B

Sequential: E1.3.5/E1.3.6/E1.3.10 (list screens) need A+B+E
            E1.3.8 (detail) needs A+B+C
            E1.3.9 (optional replies) needs E1.3.8
            E1.3.11 (accessibility) needs everything else done
```

**Reassessment — `random.native.ts` (E1.3.12):** `[VERIFIED, unchanged conclusion]` still fully independent, still non-blocking for E1.3, still recommended in parallel so it's ready before E1.4. Nothing this session changes this.

**Reassessment — push-token mobile registration:** `[RECOMMENDATION, unchanged from parking-lot status]` the backend half is done and isolated (§2); the mobile half (a native registration call, wiring `expo-notifications` or similar) is **not** part of E1.3 and should **not** be pulled in — E1.3 has zero dependency on push, and adding it would violate the explicit "must not become a general finish-the-app ticket" constraint. Confirmed safe to leave parked.

**Reassessment — recovery UI:** `[VERIFIED, unchanged]` still doesn't exist anywhere (web or mobile); still fully independent of E1.3 (no shared file, no shared component, no shared screen); still correctly parked. Nothing this session found changes its priority or dependencies.

**What else, outside E1.3, can safely run in parallel without merge conflict:** the doc-contradiction fixes identified in §14 (all in `plan/03-ARCHITECTURE.md`, `design/11-IMPLEMENTATION-ALIGNMENT.md` — neither file is touched by any E1.3 ticket) and any future backend push-*dispatch* work (adapter + worker — touches `apps/api/src/modules/notifications/` and a new module, not anything E1.3 touches in `apps/mobile/`).

---

## 13. Out-of-scope parking lot

Unchanged from the prior audit's §20, plus this session's additions:

| Item | Priority | New this session? |
|---|---|---|
| Recovery-code UI (web/mobile) | High | No — reconfirmed unchanged |
| Mobile signup/OAuth/password-change | Medium | No |
| Push dispatch (adapter, worker, native mobile registration) | Medium | No — registration backend half now done, everything else still parked |
| Capsule creation (E1.4) | High | No |
| Reveal/recipient flow (E1.5) | High | No |
| `GET /received` pagination | **New** — low urgency today (product is young, lists are small in practice), but worth a backend ticket before this becomes a real problem | Yes |
| Rate limiting on the seven read endpoints E1.3 uses | **New** — currently zero; not urgent for a single mobile client with sane client-side caching, but worth tracking as the user base grows | Yes |
| `03-ARCHITECTURE.md`'s stale queue/notification-infra sections (§14) | **New** — a documentation fix, not a code fix | Yes |
| `design/11-IMPLEMENTATION-ALIGNMENT.md`'s stale "mobile unstarted" framing (§14) | **New** — a documentation fix | Yes |
| Replies' duplicated ownership-check helper (`assertOwner` vs. `findOwnedCapsuleOrThrow`) | **New** — low priority, currently correct, just a maintenance-consistency note | Yes |

---

## 14. Documentation contradictions

`[VERIFIED]`, fresh this session — three documents not covered by the prior audit's design-doc pass.

### `plan/01-PRODUCT.md`
No load-bearing contradiction found. §4.3's capsule-state summary is slightly imprecise (omits the real `sealing` intermediate state, implies "opened" is capsule-level when it's actually per-recipient) but the document itself defers to `03-ARCHITECTURE.md` for the authoritative model, which gets it right — a reader following the cross-reference lands correctly. Not worth a fix.

### `plan/03-ARCHITECTURE.md` — the real findings
1. **Queue technology, confirmed contradiction.** §12's topology diagram and stack table, plus §24, describe **Redis + BullMQ**. Current code (`apps/api/src/modules/scheduler/queue.ts:1-13`, `apps/api/src/worker.ts`, `apps/api/src/middleware/rate-limit.ts:17`) uses **pg-boss**, with zero Redis/BullMQ dependency anywhere in the repo — a deliberate, already-documented-in-code override citing `plan/04-ZERO-COST-PLAN.md` ("Drop Redis entirely"). The override is correct and intentional; `03-ARCHITECTURE.md` simply was never updated to reflect it. **Recommendation:** annotate §12/§24 with a pointer to `04-ZERO-COST-PLAN.md`, the same way the code comments already do. Not blocking anything.
2. **Promoter design, confirmed drift.** §10 describes leader-election via a Postgres advisory lock and a batch size of 1000. Actual code (`scheduler/promoter.ts:27,33-40`) has no leader-election at all (relies on `FOR UPDATE SKIP LOCKED` being safe with multiple instances) and a batch size of 2000 (raised from an original 500 after a load-test miss, per the code's own comment). Same recommendation as above — bundle the fix.
3. **In-app notification delivery, confirmed unbuilt.** §11 states in-app notifications use "WebSocket (Socket.IO) push to active sessions" plus "badge counts via lightweight endpoint." **Neither exists** — no `socket.io` dependency anywhere in the repo, and `GET /notifications` (polling, paginated) is the only in-app delivery mechanism; no separate badge-count endpoint exists. **This directly affects E1.3's Notifications-tab design** (§4, E1.3.10) — the mobile client must poll, not expect push, and there is no cheap "just get the unread count" call, it must derive that from the paginated list itself (or a future dedicated endpoint, parked).
4. **Push endpoint shape, confirmed drift from the doc (not from the just-shipped code, which is the newer, correct source).** §14 documented `PUT /push-tokens {token, platform}` / `DELETE /push-tokens/:token`. What actually shipped (this session's own earlier work, confirmed still correct) is `POST /me/push-tokens` / `DELETE /me/push-tokens/:id`. The *code* is authoritative and tested; the *doc* should be updated to match, not the other way around. Also: §12's "APNs + FCM directly via `apn`/`firebase-admin`" remains entirely aspirational — no such dependency exists yet; only token registration is built.
5. **Legacy/trustee tables and the module list** (§13, §12) describe schema/modules that don't exist (`trustees`, `legacy_settings`, etc.) or use stale names (`modules/scheduling` vs. actual `modules/scheduler`). Both are pre-existing, already-known Phase-2-roadmap gaps (the trustee-table gap is already separately flagged correctly by `design/11-IMPLEMENTATION-ALIGNMENT.md`), harmlessly stale, no action needed for E1.3.
6. **Everything else checked — auth/session/master-key model (§12/§17), storage (R2 via `@aws-sdk/client-s3`, §12/§24), mobile stack framing — matches current code exactly.** No contradiction.

### `design/11-IMPLEMENTATION-ALIGNMENT.md`
One finding: this document (dated 2026-08-01, a positional snapshot reconciling `PROGRESS.md` as it stood then) still frames mobile/Stage E as entirely future work ("Remaining: ... Stage E (T-23–29, mobile) ..."). `plan/PROGRESS.md` has since moved well past this (E1.1, E1.2, and this session's audits are all recorded there, dated through 2026-08-27/28). **Assessment: harmlessly stale, not a contradiction requiring a decision** — the document doesn't claim to be evergreen, and nobody building mobile work today would consult it over `PROGRESS.md` for current status. Worth a one-line update only if this document is meant to remain a durable reference; not blocking anything.

**None of these documentation contradictions block E1.3 or require a code change.** All are recorded, not silently resolved, per the audit's discipline.

---

## 15. Risks

`[RECOMMENDATION]`, carrying forward the prior audit's risk table with one addition and one downgrade:

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Cross-platform decrypt proof (E1.3.7) fails on first real attempt | Medium | High | Build and test it first, in isolation, against real web-produced ciphertext — unchanged guidance |
| iOS interactive-verification gap recurs | High | Medium | Unchanged — consider a physical device before E1.4/E1.5's harder iOS-specific surfaces |
| A naive "refresh received list on every focus" pattern produces excessive load given zero rate-limiting and zero pagination on that endpoint | **New, low-medium likelihood, low impact today (small user base), rising over time** | Set a sane `staleTime` from day one (§10) |
| Field-naming inconsistency (`capsuleId` vs `id`) causes a silent navigation bug if `CapsuleRow` isn't built defensively | **New, medium likelihood if untested, low impact (caught immediately in manual testing)** | Explicit unit test added to the plan (§11) |
| TanStack Query caches decrypted content by accident | Low if reviewed, high impact if not | Unchanged code-review checklist item |

---

## 16. Exact implementation order

1. **E1.3.1** (API client extension) and **E1.3.7** (decrypt utility) and **E1.3.12** (`random.native.ts`) in parallel — zero interdependency, all three can start on hour one.
2. **E1.3.2**/**E1.3.3** (tokens, loading/empty/error primitives) in parallel with step 1.
3. **E1.3.4** (`CapsuleRow`, with the `capsuleId`→`id` normalization built in from the start, not retrofitted) once E1.3.2 lands.
4. **E1.3.5**, **E1.3.6** (with its now-explicit non-paginated design), **E1.3.10** (with its now-explicit polling-only design) in parallel once steps 1/3 land.
5. **E1.3.8** (detail screen, five states including the newly-explicit `draft`-with-null-ciphertext case) once E1.3.1/E1.3.2/E1.3.3/E1.3.7 land.
6. **E1.3.9** (optional replies/recipients) if time allows, after E1.3.8.
7. **E1.3.11** (accessibility) last, once every screen exists.

---

## 17. Exact first task

**Start with E1.3.7 (the shared capsule-decrypt utility) and E1.3.1 (API client extension) simultaneously** — these are the two zero-dependency, highest-value, highest-uncertainty pieces (the cross-platform decrypt proof is this ticket's single biggest risk, per §15; get it de-risked first). `E1.3.12` (`random.native.ts`) can be picked up by a second engineer/track in true parallel, or deferred slightly since it has zero urgency for E1.3 itself.

---

## 18. What can be done in parallel

Restated concisely from §12: E1.3.1, E1.3.2+E1.3.3, E1.3.7, and E1.3.12 — four fully independent starting points, no shared file, no merge risk. Outside E1.3 entirely: the `03-ARCHITECTURE.md`/`design/11` documentation fixes (§14) and any future push-dispatch backend work — neither touches any file E1.3 touches.

---

## 19. What must not be touched

- `apps/mobile/src/lib/{auth-context,master-key-context,token-store,api-client}.tsx?` — extend `api-client.ts` additively (new exported functions), do not restructure its existing `request()`/refresh/auth-header logic.
- `apps/mobile/src/components/master-key-gate.tsx` — reuse as-is; the detail screen's "Read it" action routes through it unchanged, never a parallel/competing gate.
- `packages/crypto/src/{aes,aes.native,kdf,kdf.native,capsule-key,master-key,wrap}.ts` — E1.3 only *calls* these, never modifies them.
- `apps/api/src/modules/capsules/`, `apps/api/src/modules/received/`, `apps/api/src/modules/media/` — no backend change is required or in-scope for E1.3 (§5).
- `plan/03-ARCHITECTURE.md`, `design/11-IMPLEMENTATION-ALIGNMENT.md` — contradictions are recorded (§14), not silently rewritten, per this audit's own discipline; any correction is a separate, explicit task.

---

## 20. Final "start building" checklist

- [ ] `apps/mobile/package.json` gains `@tanstack/react-query` (E1.3.1).
- [ ] `apps/mobile/src/lib/api-client.ts` gains `capsulesApi`, `receivedApi`, `notificationsApi` — additive only.
- [ ] `apps/mobile/src/lib/capsule-crypto.ts` created and proven against real web-produced ciphertext before anything else depends on it.
- [ ] `apps/mobile/src/lib/tokens.ts` gains the `CapsuleState` color map and a media-status color set.
- [ ] `apps/mobile/src/components/{CapsuleRow,NotificationRow,EmptyState,ErrorState}.tsx` created, `CapsuleRow` explicitly normalizing `capsuleId`→`id`.
- [ ] Home/Received/Notifications screens rewritten with real data — Received built as a flat, non-paginated list; Notifications built as poll-on-foreground with no assumption of push.
- [ ] `apps/mobile/app/(app)/capsule/[id].tsx` created as a stack route outside the tabs group, handling five states (Destroyed/Withheld/Closed/Draft-no-content/Open).
- [ ] `packages/crypto/src/random.native.ts` created in parallel (not gating anything above).
- [ ] Full test suite (unit + the new component tests in §11) green; existing 20 mobile tests + `packages/crypto` suite unaffected.
- [ ] Manual verification on Android emulator covering the five detail-screen states plus a released-media item; iOS build+render verification with interactive gaps honestly documented if they recur.

---

## Direct answers

**Is E1.3 ready to implement right now?** **Yes.** No blocker exists. The prior blueprint's architecture, crypto boundary, and IA all hold unchanged; this session's fresh, skeptical re-verification found real but entirely design-accommodable backend characteristics (no pagination on `/received`, no rate limiting anywhere, a field-naming inconsistency, no real-time notification push, a narrower-than-assumed set of notification-producing events) — all folded into the ticket acceptance criteria in §4, none requiring a backend change or additional research pass.

**What is the first implementation ticket Claude should execute?** **E1.3.7 — the shared capsule-decrypt utility** (in parallel with E1.3.1, the API client extension) — because it carries this ticket's single largest source of uncertainty (proving mobile's native crypto stack correctly decrypts real, non-synthetic ciphertext produced by web), and every other E1.3 ticket either depends on it directly (E1.3.8) or is de-risked by having it proven early.
