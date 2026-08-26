# Stage E — Mobile V1 Execution Backlog

## 1. Purpose

`plan/STAGE-E-MOBILE-V1-IMPLEMENTATION-BLUEPRINT.md` established *what* Mobile V1 is and *why* — the audit, the crypto compatibility chain, the 20 locked founder decisions, the information architecture, the security and threat model. This document converts that blueprint into *executable work*: numbered tickets, dependencies, acceptance criteria, and an order of operations, so a future implementation session can pick up a single ticket and act on it without re-deriving the architecture first.

This document adds no new architecture and reopens no decision the blueprint already settled. Where a ticket needs a judgment call the blueprint didn't make, it's marked `[OPEN DECISION]` and left open here too, exactly as the blueprint left it.

## 2. Source of truth

- **The Stage E blueprint is the architectural and product source.** Every ticket below traces back to a specific blueprint section, cited inline.
- **This document converts it into executable work.** It does not add scope, and it does not remove any of the 20 locked decisions.
- **Repository inspection verifies current state**, not the blueprint's own prose — re-confirmed directly for this document (see §3) rather than assumed carried-forward.

## 3. Current state

**Repository:** `HEAD` = `origin/main` = `ad3b3e5` (PR #46). Working tree carries one pre-existing, uncommitted 12-file diff (a theme/hydration fix + marketing-asset pass, predating both this document and the blueprint) — unchanged since the blueprint was authored. No contradiction found between the blueprint and current repository state; nothing drifted.

| Area | State |
|---|---|
| **Mobile scaffold** | `apps/mobile` — Expo ~57.0.7, React Native 0.86, React 19.2.3. Dependencies: `@tc/contracts`, `@tc/core`, `expo-dev-client`, `expo-status-bar`. `App.tsx` is a single placeholder screen. No navigation library, no auth, no design tokens, no crypto integration, no secure storage. |
| **Reusable backend/API surface** | 89 endpoints across 16 modules, all platform-agnostic. Mobile-specific gaps: no push adapter, no `PUT /push-tokens` endpoint, no recovery-code-restore endpoint flow, iOS/Android Google OAuth client IDs not yet validated server-side (web-audience-only today). |
| **Crypto** | `@tc/crypto` — AES-256-GCM (`crypto.subtle`) and HKDF-SHA256 (`crypto.subtle`) are fully RN-portable via `react-native-quick-crypto`. **One blocked primitive:** `deriveKeyFromPassword` (Argon2id via `hash-wasm`/WASM) — used only for master-key unwrap-by-password and Passphrase Seal unwrap. Everything downstream of a resolved master key (capsule-key unwrap, content/media/reply decryption) uses only AES-GCM and is unaffected. |
| **Recovery** | `restoreMasterKeyFromRecoveryCode`/`parseRecoveryCode` exist in `@tc/crypto`, tested, **never called from any UI anywhere in `apps/web/src`**. The `/reset` (forgot-password) flow only updates `passwordHash`; `masterKeyWrap` is left wrapped under the old password, and `MasterKeyGate` has no path out beyond "Wrong password. Try again." This is a pre-existing, product-wide gap, not mobile-specific. |
| **Deep links** | Reveal capsule key travels only in the URL fragment (`#k=...`), never sent to any server — by design. Whether this fragment survives a native Universal/App Link hand-off is unverified — no RN linking code exists yet to test against. |
| **Notifications** | `notifications`/`notification_prefs`/`push_tokens` tables exist; `push_tokens` has `platform`/`lastSeenAt`/`invalidAt` columns already but nothing writes to it. No push adapter exists. |
| **Design system** | `packages/ui-web` — React DOM only, zero direct RN portability. `tokens.css` holds 167 custom-property values, portable as data. `packages/eslint-config/motion.js` enforces the motion constitution via Tailwind-class-string matching — does not transfer to RN's `Animated`/Reanimated API surface. |
| **Infrastructure** | No EAS project configured. No Firebase project confirmed wired. `app.json` has placeholder icons (real SVG brand source exists at `design/brand/app-icon*.svg`, unexported). Bundle ID/package name already set: `com.timelycapsule.app`. |
| **Known blockers** | Exactly one hard blocker: Argon2id on Hermes (§5, E0.1). Everything else is an open technical question or founder decision, not a blocker. |

## 4. Dependency graph

```
Phase 0 (parallel tracks, no cross-dependencies among them)
  ├── E0.1 Crypto spike (Argon2id)
  ├── E0.2 Deep-link fragment spike
  ├── E0.3 SecureStore behavior spike
  ├── E0.4 Navigation foundation spike
  ├── E0.5 Recovery-flow design decision
  └── (parallel, backend-only, no mobile dependency) Push adapter backend work

Foundation (Phase 1)
  ↓  — needs E0.4's navigation decision; does not need E0.1–E0.3 resolved, only in progress
Auth / Crypto (Phase 2)
  ↓  — needs E0.1 resolved (master-key unwrap), E0.5's decision (recovery UI), E0.3's findings (storage design)
Dashboard (Phase 3)
  ↓  — needs Phase 2's authenticated session
Creation (Phase 4)  ──────────────┐
  ↓  — needs Phase 2 (master key), Phase 3 (nav to return to)   │ media-decrypt utility
Reveal (Phase 5)  ←────────────────────────────────────────────┘ shared, build once
  ↓  — needs E0.2 resolved before shipping; Phase 2/3 foundation
Replies / Biometrics (Phase 6)
  ↓  — Replies needs Phase 5 (reveal); Biometrics needs only Phase 2 — genuinely independent sub-tracks
Push / Deep Links (Phase 7)
  ↓  — push backend can start in Phase 0; native registration needs Phase 1; full deep-link needs E0.2 resolved
Release Infrastructure (Phase 8)
  ↓  — needs a functionally complete app to screenshot/submit honestly
```

**Explicit parallelizable pairs:** E0.1–E0.5 run concurrently (independent tracks). Push backend work (adapter + `PUT /push-tokens`) can start in Phase 0, fully decoupled from native progress. E1's design-token extraction can run alongside E1's navigation/API-client work. Phase 6's Biometrics sub-track does not depend on Replies and vice versa.

**Explicit non-parallelizable pair:** the media-decrypt utility used by both Phase 4 (composer preview) and Phase 5 (reveal) must be built once, by one track, not raced by two — see §15.

## 5. Phase 0 — Technical spikes

### E0.1 — Native Argon2id compatibility spike

**Objective:** Prove a React Native-compatible Argon2id implementation produces byte-identical output to `hash-wasm`'s, for the exact parameters `@tc/crypto` already uses in production.

**Why it blocks authentication:** `deriveKeyFromPassword` (`packages/crypto/src/kdf.ts:12`) is called on every login to unwrap the master key. Hermes has no WebAssembly runtime — this is a platform absence, not a missing polyfill. No composer, auth, or reveal work that requires a resolved master key can proceed without this.

**Existing web implementation:** `hash-wasm`'s `argon2id`, params fixed in `packages/crypto/src/constants.ts`: `parallelism: 1, iterations: 3, memorySize: 65536 (64 MiB), hashLength: 32`. Called at exactly two sites: `master-key.ts` (password unwrap) and `capsule-key.ts` (Passphrase Seal unwrap).

**Candidate native implementations to evaluate** (not selected — this spike selects one):
- A maintained community RN Argon2 native module (wraps a C/Rust Argon2id implementation).
- `libsodium`'s `crypto_pwhash` (Argon2id) via a maintained RN libsodium binding.
- A custom, minimal native module (Swift/Kotlin) wrapping a vetted Argon2id C library directly, if no existing binding proves reliable.

**Exact compatibility requirement:** for the same `(password, salt)` input and the exact `ARGON2ID_PARAMS` above, the native implementation's 32-byte output must be bit-for-bit identical to `hash-wasm`'s output. Any deviation — different `iterations`, different `memorySize`, a different Argon2 variant (`Argon2i`/`Argon2d` instead of `Argon2id`) — makes every existing user's wrapped master key silently undecryptable. This is not a case where "close enough" exists.

**Test vectors:** `packages/crypto/test-vectors/v1.json` currently holds 3 AES-GCM-only vectors and has **no Argon2id or HKDF vectors**. This spike must first generate a fixed `(password, salt) → expected 32-byte key` vector set from the existing `hash-wasm` implementation (extend `v1.json` or add `v2.json`, following `test-vectors.test.ts`'s existing pattern), *before* evaluating any candidate — so there's a concrete, checked-in target rather than "it seems to produce a key."

**iOS verification:** run the candidate on a physical iOS device (not simulator-only — native crypto modules can behave differently on simulator, particularly around hardware-accelerated paths), derive against every vector, assert byte-identical output.

**Android verification:** same, on a physical Android device, ideally a mid-tier one (not only a high-end test device) since Argon2id's 64 MiB / 3-iteration cost is exactly the kind of parameter that can reveal performance problems on weaker hardware.

**Failure criteria:** any vector mismatch; unacceptable latency on real mid-tier hardware (no numeric budget set by the blueprint — capture the actual measured time and flag it as an `[OPEN DECISION]` for the founder if it exceeds roughly the ~0.5–1s web already targets, per `constants.ts`'s own comment); a candidate that requires bundling a variant/param set different from `ARGON2ID_PARAMS`.

**Acceptance criteria:** a chosen implementation, wired behind `kdf.ts`'s exact existing `deriveKeyFromPassword(password, salt): Promise<Uint8Array>` signature, passes 100% of the extended test vector set on both platforms, on physical devices.

**Dependencies:** none.

**Files/packages expected to change:** `packages/crypto/src/kdf.ts` (implementation swap only — signature unchanged), `packages/crypto/test-vectors/` (new vectors), a new native dependency in `apps/mobile/package.json`.

**Estimated complexity/risk:** High risk if no existing binding proves both correct and fast enough — may require custom native-module authoring. Low-to-medium if a maintained binding (e.g. a libsodium wrapper) already covers Argon2id with matching parameter flexibility.

---

### E0.2 — Capsule deep-link fragment spike

**Objective:** Determine whether the `#k=...` URL fragment survives a Universal Link (iOS) / App Link (Android) open into the native app, across every real entry path — not assumed from documentation.

**Why it matters:** the recipient link's key fragment is the *entire* security boundary for shared capsules (per `@tc/crypto`'s own README) — it is never sent to any server by design. If a router or the OS's own link-handling normalizes or strips the fragment before the app sees it, every mobile-opened reveal link silently fails to decrypt, with no obvious cause.

**Exact experiment:**
1. Build a minimal throwaway Expo Router (or chosen framework, pending E0.4) project with `apple-app-site-association`/`assetlinks.json` configured against a real or test domain.
2. Construct a real reveal-shaped URL: `https://<domain>/c/TESTTOKEN#k=<base64url-key>`.
3. Open it via every real entry path below and log the exact URL/params the app's routing layer receives.

| Entry path | Method |
|---|---|
| Cold start (app not running) | Tap the link from Messages/Mail/Notes on a physical device |
| Warm start (app backgrounded) | Same, with the app already in memory |
| App already open, foregrounded | Trigger via `Linking` event while the app is active |
| App not installed | Confirm fallback to web (no app-side test needed — verifies §13's fallback claim) |
| Malformed fragment | A URL with a truncated/corrupted `#k=` value — confirm the app's existing "key mismatch" error state is reachable, not a crash |
| Missing key fragment | A URL with no `#k=` at all — confirm the existing "key missing" state (already present in `(reveal)/c/[token]/page.tsx` on web) is reachable natively |

**Expected evidence:** a logged, captured value of the full URL (including fragment) as received by the app's routing/linking layer, for each row above, on both platforms.

**Pass criteria:** the fragment arrives intact, unmodified, for cold start, warm start, and already-open, on both iOS and Android, on physical devices.

**Fail criteria:** the fragment is stripped, truncated, or altered on any path, on either platform.

**What happens if it fails:** `[OPEN DECISION, contingency]` the blueprint did not pre-specify a fallback architecture for this case since it wasn't known to be needed. Two directions worth having ready, not yet chosen: (a) route the deep link to a native in-app WebView pointed at the existing, already-correct web reveal page for the specific reveal path only, or (b) pass a query parameter carrying an encoded form of the fragment through server-side redirect middleware **without ever letting that value touch a real server log or datastore** — riskier, and only pursued if (a) is rejected. Do not choose between these without the failure actually occurring.

**Who/what it blocks:** Phase 5 (Reveal) cannot ship deep-link entry until this passes; Phase 7 (push-triggered deep links into reveal) is downstream of this too.

**Dependencies:** E0.4 (navigation foundation) — needs a router in place to route into.

**Files/packages expected to change:** none in the main app yet — this is a throwaway spike project. Findings feed into Phase 1's real navigation config.

---

### E0.3 — SecureStore behavior spike

**Objective:** Verify `expo-secure-store`'s actual behavior on both platforms — not assumed from documentation — for every property this architecture's master-key and session design depends on.

**Why it matters:** §5 and §8 of the blueprint depend on specific claims about Keychain/Keystore behavior (backup exclusion, reinstall wipe, biometric-gate interaction) that were flagged `[OPEN DECISION, needs verification]` rather than confirmed.

**Verify, on both iOS and Android, on physical devices:**

| Property | Question |
|---|---|
| Basic storage | Round-trips a value correctly; survives app backgrounding/foregrounding |
| Device backup behavior | Does a `requireAuthentication: false` entry survive an iCloud/Google backup+restore cycle onto a *new* device? Does a `requireAuthentication: true` entry? |
| Reinstall behavior | Does an entry survive uninstall → reinstall on the *same* device, for both `requireAuthentication` states? |
| Device migration | iOS device-to-device migration (Quick Start) and Android's equivalent — does either carry secure-store entries across? |
| Biometric-gate interaction | Does `requireAuthentication: true` actually prompt Face ID/Touch ID/BiometricPrompt on read, on both platforms, reliably? |
| Biometric enrollment change | Does adding/removing a fingerprint or resetting Face ID invalidate an existing `requireAuthentication: true` entry, as the blueprint's §5.3 assumes platform behavior handles automatically? |
| Accessibility/security settings | Any OS-level setting (e.g. iOS's accessibility level options, Android's screen-lock-none state) that changes secure-store's actual guarantee — confirm the library's default `accessible` level matches what a master-key-adjacent secret needs |

**Expected evidence:** a written table, per platform, of pass/fail/observed-behavior for every row above, captured from real device tests, not from `expo-secure-store`'s own documentation alone (the point of the spike is to confirm docs match reality on the exact Expo/RN versions this project uses).

**Pass criteria:** biometric-gated entries are confirmed to require the enrolled biometric on every read; non-biometric entries are confirmed to survive backgrounding and (ideally) not silently leak into unencrypted backups; reinstall behavior is understood precisely enough to design re-enrollment UX around it correctly (§5.3 already assumes re-login is required post-reinstall — confirm this assumption is forced by the platform, not merely convenient).

**Fail criteria:** any behavior that contradicts §5's architecture assumptions in a way that would silently weaken the master-key or biometric-wrap guarantee (e.g., a biometric-gated entry surviving an unencrypted backup and being restorable without the original biometric).

**Who/what it blocks:** Phase 2 (session token storage), Phase 6's Biometrics sub-track (the entire "Protect my capsules" design).

**Dependencies:** none.

**Files/packages expected to change:** none — findings document only, feeding Phase 2/6 implementation.

---

### E0.4 — Navigation foundation spike

**Objective:** Confirm the navigation library recommendation from the prior Stage E audit (Expo Router) against real repository evidence, or identify a concrete reason to deviate — not re-litigate the choice from a blank slate.

**Blueprint position:** the Stage E blueprint carried forward the earlier audit's recommendation (Expo Router, for its file-based routing parity with the web app's own Next.js route-group convention and first-class EAS/universal-link support) without re-opening it as a fresh question. This spike confirms that recommendation holds under real construction, or surfaces a reason it doesn't.

**Evaluate, concretely, by building a minimal prototype (not by reading documentation alone):**

| Concern | What to prove |
|---|---|
| Routing structure | File-based routes map cleanly onto the four-tab IA (§9 of the blueprint) plus nested capsule-detail/reveal/composer stacks |
| Nested navigation | A tab can push a full-screen stack (capsule detail → reveal) without fighting the tab bar's own state |
| Auth gates | A route group can require an authenticated session (mirroring `(app)/layout.tsx`'s web route guard) without the same hydration-race class of bug found in the web implementation (blueprint §14/§24) |
| Deep links | The chosen router's own linking config is exactly what E0.2 tests against — confirm the two spikes use the same routing layer, not two different throwaway setups |
| Modal/full-screen flows | The composer and reveal can be presented as genuine full-screen pushes, never a `Modal` presentation — required by `07 §XVI`'s ban on modals on the wait/reveal path |
| Capsule links | A `/c/[token]` route resolves correctly, including the `#k=` fragment access needed by E0.2 |
| Return-to-composer behavior | Backgrounding mid-compose and returning restores the correct screen/state, not a reset to Home |

**Expected evidence:** a working minimal prototype exercising every row above, plus written confirmation (or a specific, cited failure) for each.

**Pass criteria:** Expo Router handles every row above without a structural workaround; proceed with it.

**Fail criteria:** a specific, demonstrated limitation (not a theoretical one) that Expo Router cannot handle for one of the rows above without an unreasonable workaround.

**What happens if it fails:** fall back to bare React Navigation, accepting the loss of the file-based-routing/web-convention-parity benefit, and rebuild E0.2's spike against it.

**Who/what it blocks:** Phase 1 (the entire navigation shell) and, transitively, every phase after it.

**Dependencies:** none — should run first or concurrently with E0.1/E0.3.

**Files/packages expected to change:** none yet (spike project); the outcome determines what `apps/mobile/package.json` gains in Phase 1.

## 6. Phase 0 — Recovery work

### E0.5 — Recovery-flow design decision

**Current web failure mode, exact:** `apps/web/src/app/(auth)/reset/page.tsx`'s "Set a new password" form calls `resetPassword({token, newPassword})` and redirects to `/login`. Server-side, `resetPassword()` (`apps/api/src/modules/auth/service.ts:244`) updates **only** `passwordHash` — `masterKeyWrap` is untouched. On next login, `MasterKeyGate` correctly avoids generating a fresh master key (it checks wrap-presence, not wrap-validity), but falls into the ordinary "Unlock your capsules" password form — which then fails (Argon2id-derives from the *new* password against a wrap salted for the *old* one) and shows "Wrong password. Try again." with **no path forward**. `restoreMasterKeyFromRecoveryCode`/`parseRecoveryCode` are confirmed, by direct grep, to be imported by zero files in `apps/web/src`.

**Mobile requirement (blueprint §8.3):** Mobile V1 must not inherit this dead end silently. A recovery-code-entry screen is required, built entirely from existing, tested crypto primitives.

**Recommended flow (from the blueprint, restated as the design to implement):** on the password-reset screen, alongside "enter your new password," offer "Have your recovery code? Restore access to your existing capsules" → `parseRecoveryCode(input)` → `restoreMasterKeyFromRecoveryCode(existingWrap, code)` → master key recovered in memory → immediately `wrapMasterKeyWithPassword(masterKey, newPassword)` → send the new password **and** the freshly re-wrapped `masterKeyWrap` to the server in one step, so the reset never produces an unreachable state at all.

**API implications:** the existing `resetPassword` endpoint's contract (`ResetPasswordRequestSchema`: `{token, newPassword}`) would need to optionally accept a `masterKeyWrap` field, mirroring `ChangePasswordRequestSchema`'s existing shape — `[OPEN DECISION]` whether this is a new endpoint or an extension of the existing one; either is a small, well-precedented backend change, not a redesign.

**Whether web should be fixed alongside mobile:** `[OPEN DECISION — not resolved by the blueprint, not resolved here]` the blueprint's §25 (open decision #8) states this plainly: "Should the recovery-code restore flow be built mobile-first and backported to web, or built for both simultaneously? Web's gap is real and pre-existing regardless of mobile's timeline." This document does not decide it. Flagging for founder input before Phase 2 implementation begins, since the API-contract decision above is shared infrastructure either way.

**Dependencies:** none technical — this is a design/decision task, buildable entirely against already-existing, already-tested crypto.

**Parallelizable:** yes, fully independent of E0.1–E0.4.

**Definition of Done for this task:** a written, founder-approved recovery flow (exact screens, exact API contract change) ready for Phase 2 implementation — not the implementation itself.

## 7. Phase 1 — Mobile foundation

*(Ticket format defined formally in §16; used consistently from here forward.)*

### E1.1 — Expo/mobile project foundation

**Objective:** Establish the real navigation/build foundation on top of the existing T-01 scaffold, incorporating E0.4's confirmed choice.

**Why it exists:** `apps/mobile` today is the untouched placeholder — nothing to build on beyond proof that `@tc/core` resolves through the workspace.

**Dependencies:** E0.4 (navigation choice confirmed).

**Parallelizable:** No — this is the base every other Phase 1 ticket sits on.

**Expected files/packages:** `apps/mobile/app.json`, `apps/mobile/package.json` (navigation library added), new `app/` directory structure (if Expo Router) or equivalent.

**Acceptance criteria:** app boots to a real (even if empty) root layout matching the four-tab IA structure from blueprint §9.

**Verification:** boots on iOS simulator, Android emulator, and at least one physical device of each platform.

**Risks:** low — mechanical setup once E0.4 is resolved.

### E1.2 — Meridian native design tokens

**Objective:** Port `tokens.css`'s 167 values into a native token file (plain TS constants), generated from the same source so the platforms cannot silently drift.

**Dependencies:** none technical (can start immediately, fully parallel to E1.1).

**Parallelizable:** Yes.

**Expected files/packages:** new `apps/mobile/src/theme/tokens.ts` (or a promoted shared location if a second consumer justifies it — see blueprint §15's "don't share components, do share values" guidance).

**Acceptance criteria:** every color/spacing value used anywhere in Phase 1–8 traces back to this file, never a hand-typed hex/number in a screen component.

**Verification:** a lint rule or code-review checklist item (not yet automatable the way `motion.js` is on web — RN has no equivalent string-matching surface) confirming no raw color/spacing literal appears outside this file.

**Risks:** low. Do not port `@tc/ui-web` components — only values (blueprint §15 is explicit on this).

### E1.3 — Typography

**Objective:** Bundle Source Serif 4 (record register), IBM Plex Sans (instrument register), IBM Plex Mono (data/tabular) as native font assets.

**Dependencies:** E1.2 (token scale needs to exist to apply fonts against).

**Parallelizable:** Yes, alongside E1.4.

**Expected files/packages:** `apps/mobile/assets/fonts/`, font-loading via `expo-font`.

**Acceptance criteria:** both registers render in their correct typeface on a real screen; `tabular-nums`-equivalent figure alignment confirmed for any timestamp/countdown display (verify per-OS support — flagged as a real open question in the blueprint §5, typography row).

**Verification:** visual check on both platforms; confirm no fallback-font flash on cold start beyond what `expo-font`'s standard loading gate already prevents.

**Risks:** low, licensing already clear (SIL OFL, per blueprint).

### E1.4 — Theme (light/dark)

**Objective:** Explicit stored theme preference, defaulting to light unless chosen — matching web's *intended* policy, not its currently-buggy uncommitted state (blueprint §24 flags a live hydration bug in web's theme-default logic; do not port that bug's logic, port the intended policy).

**Dependencies:** E1.2.

**Parallelizable:** Yes, alongside E1.3.

**Expected files/packages:** theme context/provider in `apps/mobile/src/theme/`.

**Acceptance criteria:** fresh install defaults to light; an explicit user choice always wins over the OS `Appearance` API's current value; switching theme updates every mounted surface immediately (matching the multi-toggle sync bug web had to fix once already — build it correctly the first time here).

**Verification:** manual pass on both platforms, both OS-appearance settings, both explicit stored choices.

**Risks:** low.

### E1.5 — Navigation shell

**Objective:** The real four-tab + FAB structure from blueprint §9.2, wired to E0.4's confirmed router.

**Dependencies:** E1.1.

**Parallelizable:** No — most subsequent Phase 1 tickets assume this exists.

**Expected files/packages:** route/screen scaffolding for Home, Received, Notifications, Profile tabs, plus the FAB entry point (no destination content yet — placeholder screens).

**Acceptance criteria:** all four tabs navigable; FAB present on Home; nested-push capability confirmed (a placeholder "detail" screen pushes correctly from a tab).

**Verification:** manual navigation walkthrough, both platforms.

**Risks:** low, mechanical once E0.4 is resolved.

### E1.6 — API client

**Objective:** A thin `request()` wrapper (mirroring web's `api-client.ts` *pattern*, not its file) doing schema validation via `@tc/contracts`, auth-header injection, and one-shot refresh-on-401.

**Dependencies:** E0.3's findings (informs where the token lives — see E1.7).

**Parallelizable:** Yes, alongside E1.2–E1.5.

**Expected files/packages:** `apps/mobile/src/lib/api-client.ts`, importing `@tc/contracts` directly (zero adaptation needed there).

**Acceptance criteria:** a real, successful call to a public endpoint (e.g. `GET /system/time` if it exists, or an equivalent unauthenticated health check) round-trips correctly through Zod validation.

**Verification:** integration test against the real dev API; manual confirmation of 401 → refresh → retry behavior once E1.7/Phase 2 auth exists (this ticket's own scope stops at the client shape, not a fully exercised auth loop).

**Risks:** low — `@tc/contracts` is already proven portable.

### E1.7 — Secure session persistence (foundation only, not full auth)

**Objective:** Wire `expo-secure-store` as the token store, per E0.3's confirmed behavior — explicitly **not** porting web's `localStorage` pattern.

**Dependencies:** E0.3 complete.

**Parallelizable:** Yes, alongside E1.2–E1.6.

**Expected files/packages:** `apps/mobile/src/lib/token-store.ts` (secure-store-backed, not the web file).

**Acceptance criteria:** a token round-trips through secure storage correctly; the three-state (`unknown`/`authenticated`/`unauthenticated`) session-restoration model from blueprint §14 is scaffolded here, even before real login exists in Phase 2 — this is the piece web got wrong once (§24's hydration-race bug) and must not get wrong natively.

**Verification:** unit test on the three-state transition logic; manual cold-start/warm-start check once Phase 2 wires a real token into it.

**Risks:** medium — this is exactly the class of bug (wrong default state before an async check resolves) that caused a real, recently-discovered production bug on web. Build the three-state model deliberately, not as an afterthought.

### E1.8 — Error boundary

**Objective:** A top-level error boundary matching the "stated in text, never a generic message" discipline (blueprint §10, citing the recently-fixed web regression where every API error read as "Something went wrong").

**Dependencies:** E1.1.

**Parallelizable:** Yes.

**Expected files/packages:** `apps/mobile/src/components/ErrorBoundary.tsx` or equivalent.

**Acceptance criteria:** an unhandled error in any screen shows a real, non-generic message where the underlying error carries one, and a stated (not silent) fallback otherwise.

**Verification:** deliberately throw in a test screen, confirm the boundary catches it without a full app crash.

**Risks:** low.

### E1.9 — Loading/empty/error primitives

**Objective:** Native equivalents of web's static, layout-stable placeholders — explicitly never a spinner/shimmer/progress bar (`07 §VI.3`/`§XVI`).

**Dependencies:** E1.2 (tokens), E1.3 (typography).

**Parallelizable:** Yes, alongside other Phase 1 tickets once tokens exist.

**Expected files/packages:** `apps/mobile/src/components/` — `EmptyState`, static `Skeleton`-equivalent, error-state components.

**Acceptance criteria:** no `ActivityIndicator` used as a "loading" affordance anywhere (matches web's own banned-pattern list); every loading state is a static, layout-stable placeholder with state carried in text where relevant.

**Verification:** code-review checklist item (the automated `motion.js` enforcement does not transfer — see blueprint §15 — so this needs manual discipline until/unless a native-specific lint rule is built).

**Risks:** medium — no automated enforcement exists yet; relies on review discipline.

### E1.10 — Accessibility foundation

**Objective:** Establish the `AccessibilityInfo` reduced-motion read and basic screen-reader labeling conventions before any screen with real content exists — not retrofitted later.

**Dependencies:** E1.1.

**Parallelizable:** Yes.

**Expected files/packages:** a shared reduced-motion hook/context, labeling conventions documented for the team.

**Acceptance criteria:** `AccessibilityInfo.isReduceMotionEnabled()` is read once, centrally, and available to every component that will later need it (Phase 5's reveal ceremony is the highest-stakes consumer, per blueprint §11.1/§18).

**Verification:** manual VoiceOver/TalkBack pass on the placeholder screens that exist at this phase — confirms the foundation works before real content raises the stakes.

**Risks:** low if built now; high cost to retrofit later if skipped (per blueprint §7 explicit warning).

## 8. Phase 2 — Authentication + master key

**Governing distinction, restated because it is easy to blur in implementation:** `AUTHENTICATION` (does this session belong to a real user — tokens, `GET /me`) is a completely separate concern from `MASTER-KEY ACCESS` (can this device currently decrypt this user's content). A user can be fully authenticated and have zero master-key access (wrong/reset password, biometrics unavailable) — the implementation must never conflate "I have a valid session" with "I can decrypt," and must never generate a *new* master key merely because the current one is temporarily inaccessible (this is precisely the failure mode `MasterKeyGate`'s existing `if (!user.masterKeyWrap)` check — checking wrap *presence*, not wrap *validity* — was built to avoid, and mobile must replicate that exact discipline, not a naive "no key in memory → set one up" branch).

### E2.1 — Login (password)

**Objective:** Real password login, native UI.

**Dependencies:** E1.6, E1.7, E0.1 in progress (doesn't need to be *complete* for the screen to exist, but does for a real unlock to succeed).

**Parallelizable:** No — most of Phase 2 depends on this existing first.

**Expected files/packages:** `apps/mobile/app/(auth)/login.tsx` (or equivalent), auth context.

**Acceptance criteria:** `POST /auth/login` succeeds, tokens land in secure storage (E1.7), session state transitions to `authenticated`.

**Verification:** real login against the dev API, physical device.

**Failure conditions:** wrong credentials show a stated error, never a silent failure; the three-state session model never briefly shows `unauthenticated` for a user who is actually authenticated (the exact bug class from §24).

**DoD:** login works end-to-end on a physical device, both platforms.

### E2.2 — Signup

**Objective:** Port the signup flow, including master-key **generation** (distinct from login's unwrap).

**Dependencies:** E2.1's auth context, E0.1 (master key generation itself doesn't need Argon2id — `generateMasterKey()` is pure `crypto.getRandomValues` — but `wrapMasterKeyWithPassword` does).

**Parallelizable:** Yes, alongside E2.3.

**Expected files/packages:** `apps/mobile/app/(auth)/signup.tsx`.

**Acceptance criteria:** `POST /auth/signup` succeeds with a real client-generated `masterKeyWrap`/`recoveryKeyWrap`; the mandatory recovery-kit display screen (matching web's non-skippable pattern — including the exact ordering bug web once had, where checking `masterKey` before `recoveryKit` let the nag be silently skipped, per PROGRESS.md's decisions log) is built correctly the first time, not retrofitted.

**Verification:** real signup on dev API; confirm the recovery code screen cannot be bypassed by any state ordering.

**Failure conditions:** a signup that produces a session without ever showing the recovery code is a hard failure of this ticket, not an edge case.

**DoD:** signup works end-to-end, recovery-kit display is unskippable.

### E2.3 — Google OAuth

**Objective:** Native Google Sign-In, consistent with the existing web ghost-claim/account-linking logic.

**Dependencies:** E2.1.

**Parallelizable:** Yes, alongside E2.2.

**Expected files/packages:** native Google Sign-In integration; **backend change required** — iOS/Android OAuth client ID audience validation (`google.ts` currently checks web-audience only).

**Acceptance criteria:** real Google account signs in; if the account has no master key yet (Google-only signup, matching web's known pattern), the correct "set an initial password" flow triggers — not a dead end.

**Verification:** real Google account, physical device, both platforms' client IDs.

**Failure conditions:** a Google-only account reaching a state with no path to set a master key is a hard failure (this exact class of bug was found and fixed once on web already — do not reintroduce it natively).

**DoD:** Google auth round-trips on both platforms with correctly validated client IDs.

### E2.4 — Session restoration

**Objective:** The three-state (`unknown`/`authenticated`/`unauthenticated`) model from E1.7, now exercised against a real stored session.

**Dependencies:** E2.1.

**Parallelizable:** No — this gates every other Phase 2+ screen's auth-guard behavior.

**Expected files/packages:** the auth context's mount-time restoration logic.

**Acceptance criteria:** a hard app kill-and-relaunch with a valid stored session lands on the authenticated Home screen, never bouncing through a login screen first; an invalid/expired session correctly resolves to `unauthenticated` and routes to login.

**Verification:** physical device, force-kill the app, relaunch, confirm no login-screen flash for a genuinely valid session — this is the exact bug web hit once (§24) and the primary reason this ticket exists as its own item rather than folded into E2.1.

**Failure conditions:** any flash of the wrong state before the real answer resolves.

**DoD:** matches the acceptance criteria above, verified on both platforms.

### E2.5 — Master-key retrieval (post-login unlock)

**Objective:** The password-entry "Unlock your capsules" flow — distinct from login — matching `MasterKeyGate`'s exact branching logic.

**Dependencies:** E2.1, E0.1 resolved (this is the ticket that actually calls `deriveKeyFromPassword` in anger).

**Parallelizable:** No.

**Expected files/packages:** `apps/mobile/src/components/MasterKeyGate.tsx`-equivalent, gating any screen needing decrypted content.

**Acceptance criteria:** replicates web's exact three-branch logic: (1) `recoveryKit` pending → show it, unskippable; (2) `masterKey` resolved → render children; (3) `!user.masterKeyWrap` → the "set initial password" branch (OAuth-only accounts); (4) otherwise → password-unlock form. **Order matters** — `recoveryKit` must be checked before `masterKey`, replicating the exact fix web needed once already.

**Verification:** exercise all four branches deliberately, including the OAuth-only-account path (E2.3's account).

**Failure conditions:** a user with an existing wrap ever reaching the "set initial password" (fresh master key generation) branch — this would silently orphan their sealed capsules, exactly the catastrophic failure mode this whole phase exists to prevent.

**DoD:** all four branches correct, order-dependent skip bug not present.

### E2.6 — Master-key wrap/unwrap (crypto integration)

**Objective:** Wire `@tc/crypto`'s wrap/unwrap functions into the mobile auth context, using whatever E0.1 resolved to.

**Dependencies:** E0.1 complete, E2.5.

**Parallelizable:** No — this is the crypto core of the phase.

**Expected files/packages:** master-key context in `apps/mobile/src/lib/`.

**Acceptance criteria:** a capsule sealed on web opens correctly after mobile unwraps the master key with the native Argon2id path — the actual end-to-end proof of E0.1's compatibility claim, not just the isolated vector test.

**Verification:** real cross-platform test — seal on web, open on mobile, and the reverse.

**Failure conditions:** any mismatch here means E0.1's vectors were insufficient or the wiring is wrong — treat as a blocking regression, not a mobile-only bug.

**DoD:** proven bidirectional compatibility, real devices, real capsules.

### E2.7 — Password change (in-session)

**Objective:** Port the "already logged in, know current password" re-wrap flow.

**Dependencies:** E2.6.

**Parallelizable:** Yes, alongside E2.8/E2.9.

**Expected files/packages:** Settings → Security screen (part of Phase 3's Profile tab content, but the crypto logic belongs here).

**Acceptance criteria:** unwrap-old/re-wrap-new happens client-side exactly as web does; master key itself is unchanged; other sessions are revoked server-side (matching existing API behavior).

**Verification:** real password change, confirm old sessions are dead, confirm capsule access still works post-change.

**DoD:** matches web's existing, correct behavior exactly.

### E2.8 — Password reset + recovery-code restoration

**Objective:** Implement E0.5's approved design — the flow web does not have.

**Dependencies:** E0.5's founder-approved design, E2.6, any backend contract extension E0.5 identified.

**Parallelizable:** Yes, alongside E2.7/E2.9.

**Expected files/packages:** reset screen with the recovery-code-entry option; possible backend contract change per E0.5.

**Acceptance criteria:** a user who resets their password *and* enters a valid recovery code regains full access to historical capsules in one flow, with a correctly re-wrapped `masterKeyWrap` sent to the server — never the current web dead end.

**Verification:** real end-to-end test: seal a capsule, reset password, restore via recovery code, confirm the previously-sealed capsule still opens.

**Failure conditions:** any path that leaves the user in web's current "Wrong password, try again, forever" state is a failure of this ticket's entire purpose.

**DoD:** the specific failure mode documented in E0.5/blueprint §8.2 no longer reproduces on mobile.

### E2.9 — Logout

**Objective:** Clean session + master-key + local-draft teardown.

**Dependencies:** E2.1, E1.7.

**Parallelizable:** Yes.

**Expected files/packages:** logout action clearing secure-store tokens, in-memory master key, and (per blueprint §6.4) every local draft row for the account.

**Acceptance criteria:** post-logout, no token, no master key in memory, no local draft data for that account remains; the device-local draft-encryption key itself is **not** deleted (per blueprint §6.4's reasoning — it's device-scoped, not account-scoped).

**Verification:** inspect secure-store and local SQLite state directly post-logout.

**DoD:** matches the exact teardown scope above — no more, no less.

### E2.10 — Error states across auth

**Objective:** Consistent, stated (never generic) error handling across every screen in this phase.

**Dependencies:** all of E2.1–E2.9.

**Parallelizable:** No — this is a cross-cutting pass at the end of the phase.

**Acceptance criteria:** every failure mode named in this phase's tickets above has a real, specific, user-legible message — no "Something went wrong" left standing anywhere in auth.

**Verification:** deliberately trigger every documented failure condition in E2.1–E2.9, confirm the message shown.

**DoD:** full pass complete, no generic fallback message reachable in normal use.

## 9. Phase 3 — Dashboard

**IA, restated from blueprint §9 as the binding structure — not the old T-23 nav:** Home / Received / Notifications / Profile as the four tabs; Create is a FAB, never a fifth tab.

### E3.1 — Home screen (balanced dashboard)

**Objective:** The balanced surface Decision 8 requires — upcoming, received, drafts, restrained create — derived from Dashboard V2's actual data model, not invented fresh.

**Dependencies:** Phase 2 (authenticated session, master key for any content needing decryption at a glance — though the list view itself needs only envelope metadata, not decrypted content).

**Parallelizable:** Yes, alongside E3.2.

**Expected files/packages:** `apps/mobile/app/(tabs)/home.tsx`, consuming `GET /capsules` via TanStack Query.

**Acceptance criteria:** matches Dashboard V2's balance — not purely a list of owned capsules, not purely an inbox. Every state (sealed/counting-down, unlocked, expired, withdrawn, draft) renders distinctly, in text, matching `CapsuleRow`'s existing state-representation discipline.

**Verification:** real account with capsules in every state, confirm correct rendering.

**Risks:** low — data layer is proven; this is UI-only work.

### E3.2 — `CapsuleRow` reuse/adaptation

**Objective:** One canonical capsule representation across every mobile list (Home, Received, later Search/Collections if built), mirroring web's own "never a second, divergent card" discipline.

**Dependencies:** E1.2/E1.3 (tokens, typography).

**Parallelizable:** Yes.

**Expected files/packages:** `apps/mobile/src/components/CapsuleRow.tsx`.

**Acceptance criteria:** used identically by every list screen in this phase — no screen invents its own capsule-summary presentation.

**Verification:** code review confirms single source of truth; visual check across all consuming screens.

**Risks:** low.

### E3.3 — Received list

**Objective:** Port `(app)/received`'s content, unified into the same `CapsuleRow` model per E3.2.

**Dependencies:** E3.2.

**Parallelizable:** Yes, alongside E3.1.

**Expected files/packages:** `apps/mobile/app/(tabs)/received.tsx`, `GET /received`.

**Acceptance criteria:** waiting/upcoming/opened states all render correctly.

**Verification:** real account with received capsules in each state.

**Risks:** low.

### E3.4 — Capsule detail (owner)

**Objective:** Port the capsule-as-record detail screen — closed/withheld/destroyed/open states.

**Dependencies:** E3.1/E3.3 (navigated to from either), Phase 2 (master key needed to open content).

**Parallelizable:** No — most content-viewing tickets in later phases build on this screen existing.

**Expected files/packages:** detail screen pushed from Home/Received.

**Acceptance criteria:** all four states (Closed/Withheld/Destroyed/Open) render distinctly, matching web's exact state model (including the post-M5 "Destroyed" state — a real, recently-added terminal state that must not be missed).

**Verification:** real capsules in each state, including a genuinely `expired` (One-Reading-Only-destroyed) one.

**Risks:** medium — missing the `Destroyed` state specifically would be a real, silent regression against a recently-shipped web correctness fix.

### E3.5 — Notifications tab

**Objective:** In-app notification list, `GET /notifications`.

**Dependencies:** Phase 2.

**Parallelizable:** Yes, alongside E3.1–E3.4.

**Expected files/packages:** `apps/mobile/app/(tabs)/notifications.tsx`.

**Acceptance criteria:** list renders correctly; tapping a notification deep-links to the relevant capsule (full deep-link wiring completes in Phase 7, but in-app navigation should work now).

**Verification:** real notifications from real account activity.

**Risks:** low.

### E3.6 — Profile/Settings navigation

**Objective:** The Profile tab as a settings root — Account, Security, Storage, Notifications, Data — navigating into Phase 2/6/8's actual screens as they're built.

**Dependencies:** Phase 2 (Account/Security needs auth context).

**Parallelizable:** Yes.

**Expected files/packages:** `apps/mobile/app/(tabs)/profile.tsx` + nested settings screens.

**Acceptance criteria:** navigation structure exists even before every sub-screen has real content (Security's biometric toggle, for instance, completes in Phase 6) — this ticket is the shell, not every leaf.

**Verification:** navigation walkthrough.

**Risks:** low.

### E3.7 — Loading/empty/error states, Dashboard-wide

**Objective:** Apply E1.9's primitives consistently across every Phase 3 screen.

**Dependencies:** E1.9, E3.1–E3.6.

**Parallelizable:** No — cross-cutting pass at phase end.

**Acceptance criteria:** no spinner/shimmer anywhere in the dashboard; every empty state is stated in text, matching web's exact copy patterns where they exist (e.g. "nothing sealed yet").

**Verification:** force each screen's empty/error state deliberately.

**DoD:** full pass, no banned pattern present.

### E3.8 — Accessibility pass, Dashboard

**Objective:** VoiceOver/TalkBack correctness for every Phase 3 screen.

**Dependencies:** E1.10, E3.1–E3.7.

**Parallelizable:** No.

**Verification:** manual screen-reader pass, both platforms.

**DoD:** every list item, state label, and navigation target is correctly announced.

## 10. Phase 4 — Capsule creation

**Governing constraint, restated:** Address → Compose → Seal is preserved conceptually; the mobile interaction is redesigned for touch, never a generic multi-step form. Media is online-only (Decision 16); sealing is online-only (Decision 7); text drafts are the only thing persisted offline (Decision 4).

### E4.1 — Address movement

**Objective:** Who + when, touch-native (Horizon's moment-cards as a comfortably-tappable list, not a shrunk desktop grid).

**Dependencies:** Phase 2 (master key not yet needed here — Address is pre-content), Phase 3 (FAB entry point exists).

**Parallelizable:** Yes, alongside E4.2's early scaffolding.

**Expected files/packages:** `apps/mobile/app/composer/address.tsx`.

**Acceptance criteria:** same server-side validation rules apply (unlock ≥ now+5min, ≤ max horizon); recipient entry works via native chip/list input.

**Verification:** real capsule creation attempt, both valid and invalid schedule inputs.

**Risks:** low — data model is proven, this is UI-only.

### E4.2 — Recipient entry

**Objective:** Native recipient add/remove, reusing existing API contracts unchanged.

**Dependencies:** E4.1.

**Parallelizable:** Yes.

**Acceptance criteria:** matches web's existing recipient-limit/plan-limit enforcement (server-side, no client reimplementation needed).

**Verification:** real recipient add against a real capsule.

**Risks:** low.

### E4.3 — Compose movement + local encrypted draft wiring

**Objective:** The letter field with real native `KeyboardAvoidingView` handling, wired to the offline encrypted draft store from blueprint §6.

**Dependencies:** E4.1, the draft-key architecture (built here or slightly ahead as its own spike-adjacent task — see note).

**Parallelizable:** No — this is Phase 4's core and highest-risk ticket.

**Expected files/packages:** `apps/mobile/app/composer/compose.tsx`, `apps/mobile/src/lib/drafts.ts` (SQLite + device draft key, per blueprint §6.3).

**Implementation notes:** the device-local draft-encryption key is independent of the master key (per blueprint §6.3's explicit reasoning — a draft may need encrypting before the day's first unlock). Autosaves locally while offline; syncs to the server's existing autosave endpoint on reconnect, matching web's behavior exactly once online.

**Acceptance criteria:** typing works correctly with the keyboard never obscuring the active field; offline typing persists encrypted locally; reconnect syncs correctly to the server without data loss or duplication.

**Verification:** real airplane-mode test — type offline, reconnect, confirm sync; kill the app mid-offline-draft, relaunch, confirm the draft survived (SQLite durability).

**Failure conditions:** any plaintext draft content found on disk outside the encrypted store; any data loss on reconnect.

**DoD:** matches blueprint §6.4's full lifecycle table.

### E4.4 — Media source sheet

**Objective:** Camera/library/voice/video/files entry, replacing web's drag-and-drop entirely.

**Dependencies:** E4.3.

**Parallelizable:** Yes, alongside E4.5.

**Implementation notes:** just-in-time permissions only (Decision 18) — camera requested only when camera is tapped, microphone only when voice-record is tapped, library only when library-pick is tapped. **No permission requested during onboarding or at composer entry.**

**Acceptance criteria:** each media kind's permission prompt fires only at the point of use, never earlier.

**Verification:** fresh install, walk the composer without ever triggering a permission prompt until the corresponding action is actually invoked.

**Risks:** low, standard Expo module usage (`expo-image-picker`, `expo-camera`, `expo-document-picker`).

### E4.5 — Voice recorder

**Objective:** Port the Idle→Recording→Preparing→Ready→Enclosed lifecycle exactly.

**Dependencies:** E4.4 (microphone permission flow).

**Parallelizable:** Yes, alongside E4.4/E4.6.

**Expected files/packages:** `apps/mobile/src/components/VoiceRecorder.tsx`, using `expo-av`/`expo-audio`.

**Acceptance criteria:** nothing is kept without deliberate acceptance (matching web's exact discipline — no auto-send-on-stop).

**Verification:** real recording, real playback-before-accept, real discard path.

**Risks:** low, well-precedented pattern already proven on web to port conceptually.

### E4.6 — Media encryption + upload

**Objective:** Client-side AES-GCM encryption before any byte leaves the device, then the existing multipart presigned-upload flow, unchanged.

**Dependencies:** E4.4, `@tc/crypto`'s streaming encryption (already portable, no Argon2id involvement — confirmed in blueprint §7.1).

**Parallelizable:** No — this is the ticket most directly proving §7's compatibility claim for media specifically.

**Acceptance criteria:** a photo/video/voice file enclosed on mobile decrypts correctly when viewed on web, and vice versa; existing quota enforcement (server-side, actual-uploaded-size-based per the post-M5 storage-integrity fix) applies unchanged.

**Verification:** real cross-platform media round-trip test.

**Failure conditions:** any corruption or cross-platform decrypt failure is a hard blocker for this ticket, treated with the same severity as a crypto-vector mismatch.

**DoD:** proven bidirectional media compatibility, real devices.

### E4.7 — Review/Seal movement

**Objective:** The record itself as the review surface (not a summary card), matching web's approved design exactly.

**Dependencies:** E4.1–E4.6 all feeding into this screen's content.

**Parallelizable:** No — this is the phase's final integration point.

**Implementation notes:** **sealing requires connectivity, full stop (Decision 7).** If offline, the Seal action is visibly present but states plainly that connectivity is required — never a fake-optimistic "sealed" state, never a queued-sealing mechanism.

**Acceptance criteria:** `POST /capsules/:id/seal` succeeds online; offline, the action is blocked with a stated reason, not silently disabled or silently queued.

**Verification:** real seal attempt online; real seal attempt with airplane mode on, confirm the stated block.

**Failure conditions:** any code path that queues a seal attempt for later, or presents an offline seal as successful, is a direct violation of Decision 7 and must be treated as a blocking defect, not a style note.

**DoD:** matches Decision 7 exactly, no exceptions.

### E4.8 — Cross-platform capsule verification (phase-closing gate)

**Objective:** The blueprint's own final acceptance bar for this entire phase, restated as its own ticket rather than left implicit.

**Dependencies:** E4.1–E4.7 complete.

**Parallelizable:** No — this is the phase gate.

**Acceptance criteria:** **a capsule created on mobile must open correctly on web, and a capsule created on web must open correctly on mobile** — letter text, every enclosed media kind, and recipient/schedule metadata all verified, not just one representative case.

**Verification:** at minimum one full round-trip test per direction, exercising text + at least one image + the voice recorder's output, on both platforms.

**DoD:** both directions proven, on real devices, not just in a unit test against fixtures.

### E4.9 — Error/validation states across creation

**Objective:** Cross-cutting pass matching E2.10's discipline for this phase.

**Dependencies:** E4.1–E4.8.

**Parallelizable:** No — end-of-phase pass.

**Acceptance criteria:** every validation failure (schedule out of range, quota exceeded, media failed) is stated specifically, matching the exact language already established server-side/on web where it exists.

**Verification:** deliberately trigger each failure mode.

**DoD:** no generic error message reachable anywhere in the creation flow.

### E4.10 — Accessibility pass, Creation

**Objective:** VoiceOver/TalkBack correctness across Address/Compose/Seal.

**Dependencies:** E1.10, E4.1–E4.9.

**Parallelizable:** No.

**Verification:** manual screen-reader pass, both platforms, including the voice recorder's elapsed-time readout being announced periodically for a user recording without sight of the screen (a genuinely mobile-only accessibility case, per blueprint §13's screen spec table).

**DoD:** full pass, no gap.

## 11. Phase 5 — Reveal + media

**Governing reference, restated:** the existing web `EnclosureViewer` and `RevealCeremony`/`use-transit.ts` are the *behavioral* reference — three rules (in-place never a modal, museum-label chrome, nothing decrypts itself) and the Held-Beat timing model port; the DOM/CSS implementation does not. **No reveal haptics anywhere (Decision 3).** Capsule semantics (One Reading Only, released media, expired/destroyed states) are not reinterpreted for mobile — they are the same semantics, verified against the same API responses.

### E5.1 — Deep-link entry into reveal

**Objective:** Wire E0.2's confirmed (or contingency-resolved) fragment-handling into a real reveal-screen entry point.

**Dependencies:** E0.2 resolved, E1.5 (navigation shell).

**Parallelizable:** No — this gates the rest of the phase's real-world usability, though internal-navigation testing of the ceremony itself (E5.2) can proceed with a manually-constructed test URL in the interim.

**Acceptance criteria:** a real Universal/App Link opens directly to the reveal screen, account-free, matching web's zero-account guarantee exactly — never forcing login first.

**Verification:** real link tap, physical device, both platforms.

**Failure conditions:** any path that gates the reveal screen behind an auth check is a direct violation of the product's account-free reveal guarantee.

### E5.2 — Reveal ceremony (Held Beat)

**Objective:** The scalar-driven timing sequence (approach → 200–400ms full stop → instant state change), rebuilt in Reanimated using `withTiming` exclusively for Held-tier motion.

**Dependencies:** E5.1 (or a test-harness URL in the interim), E1.10 (reduced-motion foundation).

**Parallelizable:** Yes, alongside E5.3's early scaffolding.

**Implementation notes:** explicitly avoid `withSpring`/`withDecay` anywhere in this sequence. Skip behavior must mutate the driving timeline scalar synchronously on tap — not defer to the next animation frame, replicating the exact fix web's own `use-transit.ts` needed once (a `requestAnimationFrame`-dependent skip that was inert whenever rAF was suspended). **No haptics anywhere in this ticket's scope.**

**Acceptance criteria:** matches the Held Beat's three mandatory parts (constant-velocity approach, true zero-movement stop, instant state change); skip works reliably including when the app was recently backgrounded; reduced-motion preserves every held beat per `07 §VI` rule 4, not a lesser experience.

**Verification:** manual timing verification against the documented tier table; reduced-motion toggle test.

**Risks:** medium — easy to approximate wrong with a spring-default animation library if built without close reference to `07 Part VI`.

### E5.3 — Letter rendering

**Objective:** The record-register letter display within the ceremony's arrival sequence.

**Dependencies:** E1.2/E1.3 (tokens, typography), E5.2.

**Parallelizable:** Yes.

**Acceptance criteria:** correct typography (Source Serif 4), correct staggered-paragraph arrival matching web's opacity-only (never positional) animation rule.

**Verification:** visual check against a real decrypted letter.

**Risks:** low.

### E5.4 — Media viewer (image/audio)

**Objective:** Inline-by-default rendering per Decision 9, for the two simplest media kinds first.

**Dependencies:** E5.3, `@tc/crypto` decrypt path (already proven in E4.6).

**Parallelizable:** Yes, alongside E5.5.

**Acceptance criteria:** inline by default; nothing decrypts until explicitly opened (rule 3); a released enclosure shows the museum-label chrome with the Open control removed and the release date stated, never a broken state.

**Verification:** real enclosed image/audio, real released-media state (test capsule with M4 release already exercised).

**Risks:** low, well-proven decrypt path.

### E5.5 — Media viewer (video/PDF/document)

**Objective:** The remaining three media kinds, including the genuinely harder native cases.

**Dependencies:** E5.4's shared viewer shell.

**Parallelizable:** Yes, alongside E5.4.

**Implementation notes:** video — inline constrained, tap-to-expand full-screen (Decision 9's "deliberate expand action"). PDF — RN has no native embed equivalent to web's `<object>`; evaluate a dedicated PDF-render library, or fall straight to the "kept as it was enclosed, take a copy" stated fallback web already uses for genuinely unsupported cases, rather than building a half-working embed. Unsupported documents — identical stated fallback, never a broken icon.

**Acceptance criteria:** video expand/collapse works correctly; PDF either renders correctly or falls through honestly to the stated fallback — no silent failure state.

**Verification:** real enclosed video and PDF, both platforms.

**Risks:** medium — PDF rendering is the one media kind without a clean, obvious RN equivalent; budget real evaluation time here, don't assume a library "just works."

### E5.6 — One Reading Only / confirm-read

**Objective:** Wire `POST /r/:token/confirm-read` at the exact correct moment — post-decrypt, never earlier.

**Dependencies:** E5.2/E5.3 (need to know precisely when decrypt has genuinely succeeded).

**Parallelizable:** No — this is the phase's highest-consequence ticket; get the timing exactly right, do not rush it alongside other work.

**Implementation notes:** matching web's exact discipline — not gated on the ceremony's animation finishing, not fired on a bare content fetch, fired only once genuine client-side decryption has succeeded.

**Acceptance criteria:** a "one reading only" capsule is destroyed (letter, media, replies all gone server-side) only after the client has genuinely decrypted it — never destroyed by a bare link-open, never left un-destroyed after a genuine read.

**Verification:** real end-to-end test: seal a "one reading only" capsule, open on mobile, confirm exactly one `confirm-read` call fires at the right moment, confirm destruction occurs, confirm the post-destruction "Destroyed" state renders correctly on subsequent access attempts (both recipient tombstone and owner's capsule page, per blueprint §11.3).

**Failure conditions:** destruction firing before genuine decryption, or failing to fire after genuine decryption, are both treated as security-severity defects, not ordinary bugs — this feature's entire purpose is a destructive promise the product makes explicitly in its own copy.

**DoD:** matches blueprint §11.3/§15 exactly.

### E5.7 — Accessibility (reveal-specific)

**Objective:** The product's own highest-stakes accessibility surface, per `07 §XIII`'s explicit framing ("a product whose entire premise is *this will reach the person you intend* cannot ship a reveal that fails for someone using a screen reader").

**Dependencies:** E5.2–E5.6 complete.

**Parallelizable:** No.

**Acceptance criteria:** `AccessibilityInfo.announceForAccessibility` fires on arrival; focus moves to the letter heading; the full sequence reads coherently aloud, not merely "has labels."

**Verification:** manual VoiceOver/TalkBack pass, both platforms — this specific ticket is explicitly called out in the blueprint's testing strategy as needing a human pass, not automated tooling alone.

**DoD:** a screen-reader user can complete a full reveal and understand what happened, confirmed by an actual pass, not inferred from label presence.

### E5.8 — Error/retry behavior

**Objective:** Failed decrypt, network failure mid-reveal, malformed link — all stated, never silent.

**Dependencies:** E5.1–E5.7.

**Parallelizable:** No — end-of-phase cross-cutting pass.

**Acceptance criteria:** every failure mode from E0.2's spike (malformed fragment, missing fragment) has a real, reachable, stated UI state — not a crash, not a blank screen.

**Verification:** deliberately trigger each documented failure mode from E0.2.

**DoD:** every E0.2-documented failure path resolves to a stated, non-crashing UI state.

### E5.9 — Reveal deep-link, non-installed fallback confirmation

**Objective:** Confirm (not assume) that a reveal link opened without the app installed still falls through correctly to the existing, unmodified web reveal page.

**Dependencies:** E0.2's findings.

**Parallelizable:** Yes, can run alongside E5.2–E5.8 since it requires no app-side code at all.

**Acceptance criteria:** matches Decision 17 exactly — web remains a fully valid fallback, no capsule link is ever app-only.

**Verification:** real link tap on a device without the app installed.

**DoD:** confirmed working, no app-side change needed if E0.2's Universal Link config is correct.

## 12. Phase 6 — Replies + biometrics

*(Two genuinely independent sub-tracks — Replies depends on Phase 5; Biometrics depends only on Phase 2. Do not sequence one after the other by default; run them in parallel.)*

### Replies

### E6.1 — Correspondence rendering

**Objective:** Port the single shared thread component (`Correspondence.tsx`'s pattern) — one component, both sender/recipient sides, only the "who reads as You" flag differing.

**Dependencies:** Phase 5 (replies live inside the reveal/capsule-detail record).

**Parallelizable:** Yes, alongside E6.2.

**Acceptance criteria:** matches web's explicit "not a chat UI" discipline — no bubbles, no avatars, no alignment-by-author, no unread dots. Entries divided by rules, a hallmark for who/when, record register throughout.

**Verification:** visual check against web's existing correspondence rendering for the same real thread.

**Risks:** low — this is a well-specified, already-proven pattern to port.

### E6.2 — Decrypt replies

**Objective:** Client-side decrypt using the capsule key (already resolved from either the link fragment or master-key unwrap — no new key exchange).

**Dependencies:** E6.1, the media-decrypt utility built once in Phase 4/5 (shared, per §15's non-parallelization warning).

**Parallelizable:** Yes, alongside E6.1's UI work.

**Acceptance criteria:** a reply encrypted on web decrypts correctly on mobile.

**Verification:** real cross-platform reply round-trip.

**Risks:** low, same AES-GCM path as everything else.

### E6.3 — Compose reply

**Objective:** Recipient-side or sender-side reply composition, matching web's "fills the composer, canned phrases don't send-on-click" fix (a real, once-shipped bug on web worth not reintroducing).

**Dependencies:** E6.1.

**Parallelizable:** Yes.

**Acceptance criteria:** canned phrases fill a text field rather than sending immediately on tap.

**Verification:** manual check against this specific, documented past bug.

**Risks:** low if the lesson is heeded; a real regression risk if built from scratch without reading web's own comment history on this exact point.

### E6.4 — Encrypt + send reply

**Objective:** Client-side AES-GCM encrypt, `POST` to the existing reply endpoint (recipient/sender/guest routes already exist and need no backend change).

**Dependencies:** E6.3.

**Parallelizable:** No — final integration step for this sub-track.

**Acceptance criteria:** a reply sent from mobile decrypts correctly on web, and the reverse.

**Verification:** real cross-platform round-trip.

**Risks:** low.

### E6.5 — Reply history + retry

**Objective:** Thread persistence, retry-on-failure for a send that didn't confirm.

**Dependencies:** E6.4.

**Parallelizable:** No.

**Acceptance criteria:** a failed send is retryable without duplicating an already-sent reply; history renders in correct chronological order across both authors.

**Verification:** deliberately fail a send (airplane mode mid-send), confirm retry behavior.

**DoD:** no duplicate sends, no lost replies.

### Biometrics

### E6.6 — Biometric enrollment

**Objective:** "Protect my capsules" toggle — the enrollment flow, per blueprint §5.2's wrap-of-a-wrap architecture.

**Dependencies:** E0.3 (SecureStore findings), Phase 2 (master key already resolved in memory at enrollment time — enrollment happens *after* a normal password unlock, never independently of one).

**Parallelizable:** Yes, fully independent of E6.1–E6.5.

**Implementation notes:** at enrollment, with the master key already in memory, generate a fresh random AES key, wrap the master key under it (reusing `@tc/crypto`'s existing `wrapKey`/`unwrapKey` — no new crypto primitive), store the wrapping key in `expo-secure-store` with `requireAuthentication: true`, store the wrapped-master-key blob in ordinary secure storage.

**Acceptance criteria:** enrollment only succeeds when a real master key is already resolved in memory; the biometric wrap is a second, parallel path to the *same* master key, never an independently-generated key with its own scope (Decision 11's explicit requirement — no second cryptographic authority).

**Verification:** real enrollment on a physical device with real biometric hardware.

**Risks:** medium — this is the ticket most likely to accidentally create a second cryptographic authority if implemented carelessly; review against blueprint §5.2 line by line before merging.

### E6.7 — Biometric unlock

**Objective:** App-open (or return-from-background) biometric prompt releasing the wrapping key, unwrapping the master key.

**Dependencies:** E6.6.

**Parallelizable:** No — depends directly on E6.6.

**Acceptance criteria:** successful biometric auth produces the exact same in-memory master-key state a password unlock would.

**Verification:** real biometric unlock, confirm decrypted content is accessible identically to a password-unlocked session.

**Risks:** low once E6.6 is correct.

### E6.8 — Fallback to password

**Objective:** Every biometric failure mode falls through to the password form — never a dead end (Decision 12).

**Dependencies:** E6.7.

**Parallelizable:** No.

**Acceptance criteria:** matches blueprint §5.3's full table — auth failure, biometrics disabled at OS level, enrollment changed — all resolve to the standard password-unlock form, identical to a user who never enrolled biometrics at all.

**Verification:** deliberately trigger each failure mode (disable biometrics in OS settings mid-test, fail auth repeatedly, change enrolled biometric) and confirm fallback in every case.

**Failure conditions:** any biometric failure mode that does not offer a working password path is a hard failure — this is the ticket most directly protecting against Decision 12 being silently violated.

**DoD:** zero dead ends across every documented failure mode.

### E6.9 — Post-logout / password-change interaction

**Objective:** Correct invalidation behavior matching blueprint §5.3's table.

**Dependencies:** E6.6–E6.8, E2.7 (password change), E2.9 (logout).

**Parallelizable:** No.

**Acceptance criteria:** logout deletes both the wrapped-master-key blob and its biometric wrapping key, requiring re-enrollment next login; an in-session password change does **not** invalidate the biometric wrap (it wraps the master key directly, which is unchanged by a password change) — these are different, and must be implemented differently, not treated as the same "invalidate on any credential event" rule.

**Verification:** exercise both events, confirm the differing outcomes match the table exactly.

**DoD:** matches blueprint §5.3 precisely — no over-invalidation, no under-invalidation.

### E6.10 — Security settings screen

**Objective:** The user-facing toggle and its surrounding copy, in Profile → Security.

**Dependencies:** E6.6–E6.9.

**Parallelizable:** Yes, once the underlying logic exists.

**Acceptance criteria:** copy is honest about what the toggle does (gates the key, not merely the screen) without becoming a crypto lecture — matching Meridian's plain, exact voice.

**Verification:** review against `07 Part VIII`'s voice rules.

**DoD:** shipped, reviewed copy.

### E6.11 — Accessibility, Replies + Biometrics

**Objective:** Screen-reader correctness for both sub-tracks.

**Dependencies:** all prior Phase 6 tickets.

**Parallelizable:** No — end-of-phase pass.

**Verification:** manual VoiceOver/TalkBack pass on correspondence threads and the biometric enrollment/unlock flow.

**DoD:** full pass, no gap.

## 13. Phase 7 — Push + deep links

**Governing constraint, restated:** content-blind at every tier (Decision 6/13) — push payloads never contain capsule text, reply text, or any decrypted content, at any privacy tier including the "most detailed" one.

### E7.1 — Backend push adapter

**Objective:** New backend module, mirroring the existing email adapter's shape.

**Dependencies:** none — pure backend work, can start in Phase 0 in parallel with every native track.

**Parallelizable:** Yes, from the earliest point in the whole project.

**Expected files/packages:** new `apps/api/src/modules/push/` (or equivalent), consuming Expo's unified push service.

**Acceptance criteria:** a push send succeeds against a real registered token, dispatched alongside the existing email sends in the relevant scheduler handlers (unlock, reply, retention warnings — the latter already exist as scheduled actions from M4).

**Verification:** real push delivery test once a real token exists (Phase 7's native side).

**Risks:** low — this is well-precedented, mirroring existing, working infrastructure.

### E7.2 — `PUT /push-tokens` endpoint

**Objective:** New endpoint, using the already-existing `push_tokens` table (schema present, `platform`/`lastSeenAt`/`invalidAt` columns already modeled, nothing writes to it today).

**Dependencies:** none — backend-only, parallel to everything.

**Parallelizable:** Yes.

**Acceptance criteria:** registers/updates a token; token pruning on `invalidAt` works correctly (matching the schema's existing anticipation of this).

**Verification:** API integration test.

**Risks:** low.

### E7.3 — Native push token registration

**Objective:** Client-side Expo push registration, calling E7.2.

**Dependencies:** E7.2, Phase 1 (app shell), Phase 2 (authenticated session to register against).

**Parallelizable:** No — depends on both backend and native foundation.

**Acceptance criteria:** re-registers on app foreground if the token changed (standard Expo practice); permission requested at a sensible point, not during generic onboarding (mirrors Decision 18's just-in-time principle, applied to notification permission specifically).

**Verification:** real device registration, confirm `push_tokens` row exists correctly.

**Risks:** low.

### E7.4 — Content-blind payload construction

**Objective:** Enforce Decision 6/13's floor at the point payloads are actually built, not just as a policy statement.

**Dependencies:** E7.1.

**Parallelizable:** Yes, alongside E7.3.

**Acceptance criteria:** every push category (unlock, reply, media/storage warning, other lifecycle events) constructs its title/body from the same content-blind discipline M3's email notifications already established — verified by an explicit test asserting no ciphertext, plaintext letter/reply content, or capsule body ever appears in a constructed payload.

**Verification:** unit test on payload construction for every category; manual review against Decision 13's three privacy tiers.

**Failure conditions:** any payload containing capsule/reply content, at any privacy tier, is a security-severity defect.

**DoD:** every category proven content-blind, including at the "most detailed" tier.

### E7.5 — Notification privacy tiers

**Objective:** The three user-selectable tiers from blueprint §12.4.

**Dependencies:** E7.4.

**Parallelizable:** Yes.

**Acceptance criteria:** matches the three tiers exactly (highly private/generic, useful but content-blind, normal content-blind) — the floor at every tier is content-blind, never merely "less detailed."

**Verification:** manual check of payload content at each tier setting.

**DoD:** three tiers implemented, floor verified content-blind at all three.

### E7.6 — Deep link from push tap

**Objective:** Tapping a push notification routes into the correct capsule detail/reveal screen.

**Dependencies:** E0.2/E5.1's confirmed deep-link handling, E7.3.

**Parallelizable:** No — depends on both push and deep-link foundations.

**Acceptance criteria:** routes correctly whether the app is cold, warm, or already open, matching the same rigor E0.2 already established for capsule links generally.

**Verification:** real push tap, all three app-state scenarios, both platforms.

**Risks:** low once E0.2/E5.1 are solid — this is largely wiring, not new architecture.

### E7.7 — Universal Links / App Links production configuration

**Objective:** Ship the real `apple-app-site-association`/`assetlinks.json` hosting (moving from E0.2's throwaway spike domain to the real production domain).

**Dependencies:** E0.2 resolved.

**Parallelizable:** Yes, can happen alongside E7.1–E7.6 once E0.2's findings are in.

**Acceptance criteria:** matches Decision 17 exactly — installed → native app, not installed → web, no capsule link ever app-only.

**Verification:** real link tap from an external source (Messages, Mail), both installed and not-installed states, both platforms, production domain.

**DoD:** confirmed working in the real production configuration, not just the spike's throwaway one.

## 14. Phase 8 — Release infrastructure

### E8.1 — EAS project + build profiles

**Objective:** Development, preview, production build profiles.

**Dependencies:** Phase 1 minimally functional (something worth building).

**Parallelizable:** Yes — account/profile setup itself has no code dependency at all and can start as early as Phase 0 (see §22).

**Acceptance criteria:** all three profiles build successfully for both platforms.

**Verification:** a real build artifact installs and runs on a physical device from each profile.

**Risks:** low, standard EAS setup.

### E8.2 — Signing + app identifiers

**Objective:** Real certificates/provisioning, confirming the already-set `com.timelycapsule.app` identifier carries through correctly.

**Dependencies:** E8.1, Apple Developer Program + Google Play Console accounts provisioned (external, non-code dependency).

**Parallelizable:** Yes, alongside E8.1.

**Acceptance criteria:** signed builds install via TestFlight/Play internal track.

**Verification:** real install from each store's test track.

**Risks:** low, well-precedented; timeline risk is store-side, not engineering-side.

### E8.3 — Environment configuration

**Objective:** Mirror web's public-vs-secret `.env`/build-var discipline via `app.config.ts` + EAS build-profile env vars.

**Dependencies:** E8.1.

**Parallelizable:** Yes.

**Acceptance criteria:** no secret value is ever baked into a client-readable bundle; API URLs correctly differ per build profile.

**Verification:** inspect a built artifact for any leaked secret.

**Risks:** low if the existing web discipline is followed exactly, not reinvented.

### E8.4 — App Store / Play Store metadata

**Objective:** Store listing content, in the Meridian voice (`07 Part VIII`).

**Dependencies:** a functionally complete app to honestly represent (per the blueprint's own explicit lesson from the marketing site's screenshot-honesty fix — do not screenshot a mockup, screenshot the real, working app).

**Parallelizable:** Partially — copy can be drafted earlier; real screenshots cannot happen until Phases 3–6 are functionally real.

**Acceptance criteria:** every screenshot is a real, working screen — never a device-frame mockup (`07 §XVI` bans this outright, and it was already flagged as a direct contradiction with the old T-28 ticket text in the prior Stage E audit).

**Verification:** manual review confirming every submitted asset is a genuine capture.

**Risks:** low technically, real risk of quietly reintroducing the "fake UI" mistake the marketing site itself already made and fixed once — hold the line here deliberately.

### E8.5 — Privacy manifests / data-safety questionnaires

**Objective:** Accurate iOS privacy manifest and Google Play data-safety answers.

**Dependencies:** E7's telemetry scope finalized (Decision 19 — minimal operational only).

**Parallelizable:** Yes, once Decision 19's scope is implemented.

**Acceptance criteria:** answers accurately reflect actual data collection — crash reporting, performance, app version, OS/platform — and explicitly do **not** claim or imply behavioral analytics, since none exists.

**Verification:** cross-check every declared data type against the actual SDK configuration.

**Risks:** medium — a store rejection or a compliance misstatement is a real cost of getting this wrong; do not template-fill this from a generic app's answers.

### E8.6 — Accessibility audit (release gate)

**Objective:** Full-app VoiceOver/TalkBack pass, not just the per-phase passes already done.

**Dependencies:** all functional phases complete.

**Parallelizable:** No — this is a release-gate ticket by nature.

**Acceptance criteria:** every per-phase accessibility ticket's findings are re-confirmed holistically, with particular attention to the reveal ceremony (E5.7) as the highest-stakes surface.

**Verification:** a real, full-app screen-reader walkthrough, both platforms.

**DoD:** no known accessibility gap on any core flow.

### E8.7 — Crash/error reporting

**Objective:** Sentry (or equivalent), wired to Decision 19's minimal-telemetry scope — crash reporting, performance, app version, OS/platform only.

**Dependencies:** E8.3.

**Parallelizable:** Yes.

**Implementation notes:** verify the RN Sentry SDK's default breadcrumb capture does not include request bodies/headers containing tokens — this needs explicit configuration, not the SDK's out-of-box default, matching the log-redaction discipline already established on web (PR #45).

**Acceptance criteria:** crash reports are useful for debugging without ever containing a token, key, or decrypted content fragment.

**Verification:** deliberately trigger a crash near an auth call, inspect the captured report for leaked sensitive data.

**Risks:** medium — default SDK behavior across most crash-reporting tools tends toward "capture everything," which is exactly wrong here; requires deliberate scrubbing configuration, not default trust.

### E8.8 — Release checklist / final sign-off

**Objective:** The single gate before store submission.

**Dependencies:** every prior Phase 8 ticket, and every phase's own DoD.

**Parallelizable:** No.

**Acceptance criteria:** matches §21's full Definition of Done, checked line by line.

**Verification:** a dedicated final pass, not an assumption that prior phase sign-offs already cover it collectively.

**DoD:** §21, in full, on real devices, both platforms.

## 15. Parallel workstreams

| Track | Work | Dependencies | Can start | Output |
|---|---|---|---|---|
| **A — Crypto** | E0.1 (Argon2id spike), then E2.6/E4.6/E6.2 (integration points) | None | Immediately | A proven, byte-identical native KDF; every downstream decrypt path unblocked |
| **B — Design system** | E1.2–E1.4 (tokens, typography, theme) | None | Immediately | Native token file, font bundling, theme provider — feeds every UI ticket in every later phase |
| **C — Backend push** | E7.1–E7.2 (adapter + endpoint) | None | Immediately | Working push infrastructure, ready the moment native registration (E7.3) needs it |
| **D — Navigation/deep links** | E0.4, then E0.2, then E1.1/E1.5 | None (D's own start), E0.4 before E0.2 | Immediately | Confirmed router, proven (or contingency-resolved) fragment handling, real navigation shell |
| **E — EAS/infrastructure** | E8.1–E8.3 (accounts, profiles, env config) | None (account provisioning has zero code dependency) | Immediately | Working build pipeline, ready before Phase 8 needs it in earnest |
| **F — Recovery** | E0.5 (design decision), then E2.8 (implementation) | None for E0.5; E2.6 for E2.8 | E0.5 immediately; E2.8 once Phase 2's crypto integration lands | A working recovery-code-restore flow — the fix for a real, currently-open product gap |

**Must NOT be parallelized:**
- The media-decrypt utility (used by E4.6 and E5.4/E5.5/E6.2) — build once, in whichever of Phase 4/5 reaches it first, and have the other phase consume it. Racing two implementations risks exactly the kind of "two decrypt paths that can silently disagree" defect M2 was built on web specifically to eliminate.
- E2.5/E2.6 (master-key retrieval/wrap-unwrap) against E6.6 (biometric enrollment) — enrollment depends on a correctly-working password-unlock path existing first; building them simultaneously risks the exact "second cryptographic authority" failure Decision 11 forbids.
- E0.2 and E0.4 — E0.2 needs a router to test against; sequence D's own two spikes, don't run them as truly independent tracks even though both are labeled "Track D."

## 16. Ticket format

Every implementation ticket in this document uses:

```
### E-X.X — [Name]

**Objective** — what this ticket produces
**Why it exists** — the blueprint section or repository finding that motivates it
**Dependencies** — what must exist first
**Parallelizable** — yes/no, and with what
**Repository surface** — files/packages expected to change
**Implementation notes** — anything non-obvious, cited against the blueprint where relevant
**Acceptance criteria** — the concrete, checkable bar
**Verification** — how it's actually proven (device, test, manual pass)
**Failure conditions** — what counts as this ticket having failed, not merely "needing polish"
**Definition of Done** — the closing statement
```

Not every ticket above populates every field explicitly where a field would be redundant (e.g. a ticket with no special failure mode beyond its acceptance criteria) — the fields are always considered, only always *written* where they add information beyond the acceptance criteria already stated.

## 17. Testing strategy

| Layer | Tooling | Must run on physical device? |
|---|---|---|
| Unit | Vitest | No |
| Crypto vector tests | `@tc/crypto`'s existing + extended (E0.1) test-vector suite | No for the vector match itself; **yes** for the real-device latency/behavior confirmation |
| API integration | Existing 291-test Supertest suite, extended for E7's push module and any E0.5-derived recovery endpoint change | No |
| Component tests | React Native Testing Library | No |
| Navigation tests | Against E0.4's confirmed router | No for basic routing; **yes** for deep-link-specific cases (see below) |
| Deep-link tests | E0.2's exact experiment matrix | **Yes — mandatory.** Simulator/emulator deep-link behavior has repeatedly proven unreliable as a stand-in for real OS link-handling across this kind of spike |
| Device tests — iOS | Manual | **Yes** |
| Device tests — Android | Manual, including a mid-tier device specifically | **Yes** |
| Cross-platform capsule tests | E4.8's phase gate, extended to media (E4.6) and replies (E6.2/E6.4) | **Yes** — the compatibility claim is only proven on real devices exercising the real native crypto path, not a simulator running the same JS engine as the CI machine |
| Security tests | E7.4's content-blindness assertions, E6's biometric failure-mode table | Biometric-specific tests: **yes, mandatory** — no simulator reliably exercises real biometric hardware |
| Accessibility tests | VoiceOver/TalkBack manual passes, per-phase and at release (E8.6) | **Yes — mandatory**, explicitly called out in the blueprint as needing a human pass |
| Release tests | Real TestFlight/Play internal track installs | **Yes** |

**Must be tested on physical devices, no exceptions:** deep-link fragment preservation (E0.2), biometric enrollment/unlock/fallback (E6.6–E6.9), push delivery (E7.3/E7.6), the Argon2id spike's latency measurement (E0.1), and every accessibility pass (screen-reader behavior on simulators is not a reliable proxy).

## 18. Security checklist

- [ ] Master key never sent plaintext to the server, at any point, in any flow — including the new recovery-restore flow (E2.8), where only the re-wrapped blob travels, never the raw key.
- [ ] Capsule plaintext never sent to the server — enforced mechanically already (the `no-restricted-imports` ESLint rule on delivery handlers) and unaffected by mobile client behavior.
- [ ] Media plaintext never sent to the server — client-side encryption before any byte leaves the device (E4.6), matching web exactly.
- [ ] Replies encrypted client-side before send (E6.4).
- [ ] Push payloads content-blind at every privacy tier, including the most detailed one (E7.4/E7.5) — verified by an explicit assertion test, not review alone.
- [ ] Auth tokens live in `expo-secure-store`, never `AsyncStorage`/a general-purpose store (E1.7).
- [ ] Biometric-protected key material gates the actual master key, never merely a UI screen (E6.6) — no second cryptographic authority (Decision 11).
- [ ] Recovery-code handling never weakens the crypto contract — E0.5/E2.8's flow reuses existing, tested primitives exactly, invents nothing new.
- [ ] URL fragment (`#k=`) never logged, never sent to any analytics/crash-reporting breadcrumb, verified explicitly for the chosen router/linking library and the crash-reporting SDK (E8.7).
- [ ] Logging/redaction discipline matches web's own PR #45 fix — no token, key, or content fragment in any log, dev or production.
- [ ] Screenshots/app-switcher previews for reveal/composer screens — `[OPEN DECISION]` per blueprint §16, not yet resolved; must be decided before Phase 5/4 ship, not left implicit.
- [ ] Guest Mode excluded from every phase (Decision 2) — no guest code path anywhere in Phases 0–8.
- [ ] No unnecessary telemetry — Decision 19's floor (crash/performance/version/platform only) verified against the actual SDK configuration at E8.5/E8.7, not assumed from intent alone.

## 19. Cross-platform compatibility matrix

| Capability | Web → Mobile | Mobile → Web | iOS | Android |
|---|---|---|---|---|
| Login (password) | READY (protocol) | READY (protocol) | SPIKE REQUIRED (E0.1) | SPIKE REQUIRED (E0.1) |
| Master key | READY (AES/HKDF layer) | READY (AES/HKDF layer) | SPIKE REQUIRED (E0.1, the KDF step specifically) | SPIKE REQUIRED (E0.1) |
| Capsule text | READY (AES-GCM, zero WASM dependency) | READY | VERIFY (E2.6/E4.8, once master key resolves) | VERIFY |
| Media | READY (AES-GCM streaming, zero WASM dependency) | READY | VERIFY (E4.6) | VERIFY |
| Replies | READY (same capsule-key path) | READY | VERIFY (E6.2/E6.4) | VERIFY |
| One Reading Only | READY (same API contract) | n/a (destructive, one-directional by nature) | IMPLEMENT (E5.6) | IMPLEMENT |
| Scheduling | READY (data model, contracts) | READY | IMPLEMENT (native picker UI, E4.1) | IMPLEMENT |
| Deep links | SPIKE REQUIRED (E0.2 — fragment survival unverified) | n/a | SPIKE REQUIRED | SPIKE REQUIRED |
| Recovery | **IMPLEMENT — does not exist on web either** (E0.5/E2.8) | **IMPLEMENT** | IMPLEMENT | IMPLEMENT |

**Nothing above is marked READY purely because the architecture suggests it should work** — every READY row traces to a specific, cited, already-implemented and already-tested code path (AES-GCM's `crypto.subtle` portability, the existing API contracts). Every row touching Argon2id or native link-handling is marked SPIKE REQUIRED, not READY, because those are precisely the two things this whole plan exists to verify rather than assume.

## 20. Risk register

| Risk | Level | Likelihood | Impact | Mitigation | Owner/track | Blocking? |
|---|---|---|---|---|---|---|
| Argon2id native implementation doesn't match `hash-wasm` output | CRITICAL | Medium | Every existing user's master key becomes undecryptable on mobile | E0.1's exact-vector acceptance gate; no implementation ships without passing it | Track A | **Yes — blocks Phase 2 entirely** |
| Deep-link fragment stripped by OS/router | HIGH | Medium — genuinely unverified, not a known-safe default | Every mobile-opened reveal link fails silently | E0.2's spike, with a stated contingency plan if it fails | Track D | Blocks Phase 5's deep-link entry, not Phase 5's in-app reveal testing |
| Biometric wrap accidentally becomes a second cryptographic authority | HIGH | Low if E6.6 is reviewed against blueprint §5.2 directly | Silent security-model drift, hard to detect after the fact | Explicit code-review gate citing blueprint §5.2 before merging E6.6 | Track A / Phase 6 | Blocks Phase 6's biometric sub-track only |
| Recovery-code flow (E0.5/E2.8) ships with a subtly wrong re-wrap sequence | HIGH | Low-medium — the primitives are simple, the sequencing has a real ordering constraint | Could produce a `masterKeyWrap` unreadable by *either* the old or new password | E2.8's explicit cross-platform round-trip verification (seal, reset, restore, confirm still-openable) | Track F | Blocks E2.8's own DoD, not the rest of Phase 2 |
| Native media behavior (PDF rendering specifically) has no clean RN equivalent | MEDIUM | Medium — confirmed genuine gap, no library evaluated yet | A degraded reveal experience for PDF enclosures specifically | E5.5's honest-fallback design (stated "take a copy" rather than a broken embed) | Phase 5 | Not blocking — a graceful degradation path already exists to fall back to |
| One Reading Only destruction fires at the wrong moment | HIGH | Low if E5.6 is built with the same care as web's own implementation | Either a capsule destroyed before genuine reading, or never destroyed after genuine reading | E5.6's explicit, high-severity acceptance criteria and dedicated verification pass | Phase 5 | Blocks E5.6's own sign-off, security-severity if missed |
| Push/deep-link interaction mis-routes on cold start specifically | MEDIUM | Medium — cold-start deep-link handling is a common RN pain point generally | A push tap that doesn't land on the right screen | E7.6's explicit three-app-state test matrix | Phase 7 | Not blocking overall, blocks E7.6's own sign-off |
| App Store / Play Store review rejects on privacy-manifest inaccuracy | MEDIUM | Low if E8.5 is done carefully | Release delay (calendar time, not engineering time) | E8.5's explicit cross-check against actual SDK config | Phase 8 | Not blocking earlier phases, real risk to release timeline |
| SecureStore backup/reinstall behavior differs from assumption | MEDIUM | Unknown — genuinely unverified | Could silently weaken the "gone after logout/reinstall" guarantee §5.3 relies on | E0.3's explicit verification spike | Track A/D adjacent | Blocks Phase 2/6's confident design of the storage model |
| Argon2id on-device latency unacceptable on real mid-tier hardware | MEDIUM | Unknown until measured | Poor login UX, possible pressure to weaken params (must be resisted per §7.4) | E0.1's explicit mid-tier-device measurement requirement | Track A | Not blocking correctness, could affect UX-tuning decisions later |
| Web's pre-existing uncommitted theme/hydration diff interacts unexpectedly with a shared package mobile also touches | LOW | Low | Confusion during Phase 1 if that diff lands mid-implementation | No mobile ticket depends on web's uncommitted files; flagged for awareness only | n/a | Not blocking |

## 21. Definition of Done — Mobile V1

Mobile V1 is **not** done merely because screens render, navigation works, or builds succeed. It is done when every item below is verified on real devices, both platforms:

- [ ] Authentication works end-to-end (login, signup, Google OAuth, session restoration with no wrong-state flash).
- [ ] An existing master key remains accessible after login — never silently regenerated (E2.5's four-branch logic verified).
- [ ] Recovery works — a user who resets their password and has their recovery code regains full historical access, proven end-to-end (E2.8).
- [ ] A capsule created on mobile opens correctly on web (E4.8).
- [ ] A capsule created on web opens correctly on mobile (E4.8).
- [ ] Real media (image, audio, video, and the PDF fallback path) decrypts and renders correctly, cross-platform (E4.6, E5.4/E5.5).
- [ ] Replies work — compose, send, decrypt, and history all correct, cross-platform (E6.1–E6.5).
- [ ] One Reading Only destroys correctly, at the correct moment, verified end-to-end including the post-destruction tombstone state on both recipient and owner surfaces (E5.6).
- [ ] Push notifications deliver, are content-blind at every privacy tier, and deep-link correctly on tap (E7.1–E7.6).
- [ ] Universal Links / App Links open the native app when installed and fall through to web when not, on both platforms (E7.7).
- [ ] Content remains encrypted in transit and at rest everywhere in the stack, including local offline drafts (E4.3) and biometric key wraps (E6.6).
- [ ] No sensitive data (tokens, keys, content fragments, URL fragments) appears in any log or crash report (E8.7).
- [ ] Accessibility passes on the full app, with particular, separately-verified attention to the reveal ceremony (E8.6).
- [ ] iOS passes the full testing pyramid on physical hardware.
- [ ] Android passes the full testing pyramid on physical hardware, including a mid-tier device specifically.
- [ ] Production builds succeed and install correctly from both stores' test tracks (E8.1/E8.2).

## 22. Recommended execution order

1. **Phase 0 crypto spike (E0.1)** — the one true hard blocker; start first, in parallel with everything below.
2. **Deep-link spike (E0.2)** — depends on E0.4's router choice being at least tentatively settled; run these two together as one sequenced pair, not fully independent.
3. **SecureStore spike (E0.3)** — fully independent, start immediately alongside E0.1.
4. **Navigation foundation (E0.4)** — start first among the "D" track items, feeding E0.2.
5. **Recovery design decision (E0.5)** — fully independent, start immediately; surfaces the founder decision (§25, item 8 in the blueprint) that should be answered before Phase 2 implementation, not before Phase 0 design work.
6. **Foundation (Phase 1)** — begins once E0.4 has a direction, does not wait on E0.1/E0.3 to *complete*, only to be in progress.
7. **Auth/master key (Phase 2)** — begins once E0.1 is proven and E0.3's findings inform the session-storage design; E0.5's decision must be in hand before E2.8 specifically.
8. **Dashboard (Phase 3)** — begins once Phase 2 produces a real authenticated session.
9. **Creation (Phase 4)** — begins once Phase 2 (master key) and Phase 3 (navigation to return to) exist; build the shared media-decrypt utility here or in Phase 5, whichever reaches it first, and do not duplicate it.
10. **Reveal (Phase 5)** — can start its ceremony/timing work (E5.2/E5.3) in parallel with Phase 4, but its deep-link entry (E5.1) waits on E0.2's resolution.
11. **Replies/biometrics (Phase 6)** — Replies waits on Phase 5; Biometrics waits only on Phase 2 and E0.3 — run these two sub-tracks in parallel with each other, not sequentially.
12. **Push/deep links (Phase 7)** — backend half (E7.1/E7.2) can start as early as Phase 0; native half waits on Phase 1 (shell) and E0.2 (fragment handling).
13. **Release infrastructure (Phase 8)** — account/profile setup (E8.1's early half) can start as early as Phase 0; screenshots/store metadata wait on Phases 3–6 being functionally real.
14. **Final real-device verification (E8.6/E8.8)** — the last gate, checking §21 line by line, not assumed from earlier phase sign-offs alone.

## 23. "What can we do right now?"

### Can start immediately
- E0.1 — Argon2id spike (Track A)
- E0.3 — SecureStore behavior spike (Track A/D-adjacent)
- E0.4 — Navigation foundation spike (Track D)
- E0.5 — Recovery-flow design decision (Track F)
- E1.2 — Meridian native design tokens (Track B)
- E1.3 — Typography bundling (Track B)
- E7.1 — Backend push adapter (Track C)
- E7.2 — `PUT /push-tokens` endpoint (Track C)
- E8.1 (early half) — EAS project creation, account provisioning (Track E)

### Blocked on crypto
- E2.5, E2.6, E4.6, E6.2, E6.4, E6.6 — anything requiring a resolved master key or the native KDF path directly. (Non-KDF crypto — AES-GCM, HKDF — is already unblocked; only the password/passphrase-derivation step waits on E0.1.)

### Blocked on infrastructure
- E7.3 (native push registration) — needs a real Firebase project wired.
- E8.2 (signing) — needs Apple Developer Program + Google Play Console accounts provisioned.

### Blocked on founder decision
- E2.8's exact API contract shape (extend `resetPassword` vs. a new endpoint) — downstream of E0.5's design, itself downstream of the still-open "fix web too, or mobile-first" question (blueprint §25, item 8).
- Screenshot/app-switcher redaction for reveal/composer (§18 checklist item) — `[OPEN DECISION]`, not yet resolved by any prior document.

### Requires real device
- E0.1's latency measurement, E0.2's entire experiment matrix, E0.3's entire experiment matrix, E6.6–E6.9 (biometrics), E7.3/E7.6 (push delivery and deep-link tap routing), E8.6 (accessibility audit), E8.8 (final sign-off).
