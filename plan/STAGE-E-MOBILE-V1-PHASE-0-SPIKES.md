# Stage E — Mobile V1, Phase 0 Spike Plan

Companion to `plan/STAGE-E-MOBILE-V1-EXECUTION-BACKLOG.md` (§5/§6, tickets E0.1–E0.5). This document isolates the five Phase 0 investigations as standalone, runnable experiments — short enough to execute directly without cross-referencing the full backlog for each one.

**None of these five spikes has a code dependency on any of the others except where stated.** Run them in parallel unless noted.

---

## Spike 1 — Native Argon2id compatibility

**Objective:** Prove a React Native-compatible Argon2id implementation produces byte-identical output to `hash-wasm`'s, for `@tc/crypto`'s exact production parameters.

**Current state:** `packages/crypto/src/kdf.ts:12`'s `deriveKeyFromPassword` calls `hash-wasm`'s `argon2id` — WebAssembly. Hermes has no WASM runtime. Params (`packages/crypto/src/constants.ts`): `parallelism: 1, iterations: 3, memorySize: 65536 KiB (64 MiB), hashLength: 32`. This function gates master-key unwrap (every login) and Passphrase Seal unwrap. `packages/crypto/test-vectors/v1.json` currently has 3 AES-GCM-only vectors — **no Argon2id vectors exist yet.**

**Hypothesis:** a maintained native Argon2id implementation (community RN binding, `libsodium`'s `crypto_pwhash`, or a custom native module) can reproduce `hash-wasm`'s output exactly, at acceptable latency on real mid-tier hardware.

**Exact experiment:**
1. Generate a fixed vector set from the *existing* `hash-wasm` implementation: several `(password, salt) → expected 32-byte key` pairs, covering at least one empty-adjacent password, one long password, one password with non-ASCII characters. Check these into `test-vectors/` following the existing `v1.json` pattern.
2. Evaluate candidates against this vector set, in a throwaway RN test harness, on real iOS and Android devices (not simulator-only).
3. Measure wall-clock derivation time on at least one mid-tier device per platform, not only a high-end test device.

**Expected evidence:** a table of `{candidate, platform, device tier, vector-match: pass/fail, measured latency}`.

**Pass criteria:** 100% vector match, on both platforms, on real devices, at a latency roughly comparable to web's own `~0.5–1s` target (per `constants.ts`'s comment) on mid-tier hardware.

**Fail criteria:** any vector mismatch on any platform; a candidate requiring different params (different iteration count, memory, or Argon2 variant) to be usable — this is not an acceptable trade, since it would break compatibility with every existing wrapped master key.

**What happens if it fails:** try the next candidate. If no existing binding passes, scope a custom native module (Swift/Kotlin wrapping a vetted Argon2id C library) as the fallback plan — not a WASM polyfill, and not a different KDF.

**Who/what it blocks:** Phase 2 (Authentication) in full; transitively, everything after it, since nothing in Phases 3–8 can access decrypted content without a resolved master key.

---

## Spike 2 — Deep-link fragment preservation

**Objective:** Determine whether `#k=...` survives a Universal Link (iOS) / App Link (Android) open into the native app.

**Current state:** the reveal capsule key travels only in the URL fragment, never sent to any server — this is the entire security boundary for shared capsules. No RN linking code exists yet to test this against.

**Dependency:** needs Spike 4's router choice settled first (or at least tentatively chosen) — build this spike's test harness on the same router the real app will use, not a throwaway alternative.

**Hypothesis:** the chosen router's linking configuration delivers the complete URL, fragment included, to the app on every real entry path.

**Exact experiment:** configure `apple-app-site-association`/`assetlinks.json` against a real or test domain; construct `https://<domain>/c/TESTTOKEN#k=<base64url-key>`; open it via each path below on a physical device, logging the exact URL/params the routing layer receives:

| Path | How to trigger |
|---|---|
| Cold start | Tap link from Messages/Mail with app not running |
| Warm start | Same, app backgrounded |
| App already open | Trigger via the `Linking` event listener while foregrounded |
| App not installed | Confirm web fallback (no app-side test) |
| Malformed fragment | Truncated/corrupted `#k=` value — confirm existing "key mismatch" state reachable |
| Missing fragment | No `#k=` at all — confirm existing "key missing" state reachable |

**Expected evidence:** the captured URL value at each row, both platforms.

**Pass criteria:** fragment arrives intact for cold start, warm start, and already-open, both platforms.

**Fail criteria:** fragment stripped/altered on any path, either platform.

**What happens if it fails:** two contingency directions, neither pre-committed: (a) route to an in-app WebView pointed at the existing, correct web reveal page for reveal links specifically, or (b) a server-side redirect carrying an encoded fragment value — riskier, only pursued if (a) is rejected, and only ever implemented with the fragment value never touching a real server log or datastore.

**Who/what it blocks:** Phase 5's deep-link entry (E5.1), Phase 7's push-triggered deep links (E7.6).

---

## Spike 3 — SecureStore behavior

**Objective:** Verify `expo-secure-store`'s real behavior — not documentation claims — for backup, reinstall, migration, and biometric-gate interaction.

**Current state:** blueprint §5/§8 assume specific platform behaviors (biometric-gated entries requiring the enrolled biometric on every read, entries not surviving reinstall) without repository-level proof — flagged `[OPEN DECISION, needs verification]`.

**Hypothesis:** `expo-secure-store`'s documented behavior matches reality on the exact Expo/RN versions this project uses (Expo ~57, RN 0.86).

**Exact experiment**, on physical iOS and Android devices:

| Property | Test |
|---|---|
| Basic round-trip | Write, background/foreground, read back |
| Backup behavior | Write both a `requireAuthentication: true` and `false` entry, force a device backup, restore onto a second device, check what survives |
| Reinstall | Write an entry, uninstall, reinstall, check what survives |
| Device migration | If feasible: iOS Quick Start / Android equivalent, check what carries over |
| Biometric-gate reliability | Confirm `requireAuthentication: true` reliably prompts Face ID/Touch ID/BiometricPrompt on every read |
| Enrollment change | Add/remove a fingerprint or reset Face ID; confirm the existing `requireAuthentication: true` entry becomes unreadable afterward (as §5.3 assumes) |

**Expected evidence:** a pass/fail/observed-behavior table per platform per row.

**Pass criteria:** biometric-gated reads reliably require the enrolled biometric; the reinstall-wipes-secure-storage assumption (which §5.3's re-enrollment-required design depends on) is confirmed, not assumed.

**Fail criteria:** any behavior that would silently weaken the master-key or biometric-wrap guarantee — e.g., a biometric-gated entry surviving an unencrypted backup and being restorable without the original biometric on a new device.

**Who/what it blocks:** Phase 2's session-token storage design, Phase 6's entire Biometrics sub-track.

---

## Spike 4 — Navigation foundation

**Objective:** Confirm Expo Router (the prior audit's recommendation) against real construction, or identify a specific, demonstrated reason to use bare React Navigation instead.

**Current state:** no navigation library exists in `apps/mobile` today. The recommendation was carried forward from the earlier Stage E audit, not re-derived from scratch — this spike confirms it holds, it does not re-litigate it from zero.

**Hypothesis:** Expo Router's file-based routing handles the four-tab IA, nested capsule-detail/reveal/composer stacks, auth gates, and deep links (feeding Spike 2) without a structural workaround.

**Exact experiment:** build a minimal prototype proving each of:
- Four-tab structure (Home/Received/Notifications/Profile) with nested full-screen pushes from a tab (capsule detail → reveal).
- An auth-gated route group that does not reproduce the hydration-race bug class found in web's own route guard (§14/§24 of the blueprint).
- The composer and reveal presented as genuine full-screen pushes, never a `Modal` component (`07 §XVI`'s ban on modals on the wait/reveal path).
- A `/c/[token]` route resolving with fragment access, on the same routing layer Spike 2 will test against.
- State/screen restoration correctly after backgrounding mid-flow.

**Expected evidence:** a working prototype, plus a written pass/fail per bullet above.

**Pass criteria:** Expo Router handles all of the above without a structural workaround.

**Fail criteria:** a specific, demonstrated (not theoretical) limitation for one of the bullets.

**What happens if it fails:** fall back to bare React Navigation; rebuild Spike 2 against it.

**Who/what it blocks:** Phase 1 in full, and transitively every phase after it. Should run first, or at minimum start before Spike 2.

---

## Spike 5 (Track) — Recovery-flow investigation

Not a technical spike in the same sense as 1–4 — this is a design/decision task against already-working, already-tested crypto, not an unknown to be experimentally resolved.

**Objective:** Produce a founder-approved recovery flow design, ready for Phase 2 implementation.

**Current state, exact:** `apps/web/src/app/(auth)/reset/page.tsx` calls `resetPassword({token, newPassword})` and redirects to `/login`. `apps/api/src/modules/auth/service.ts:244`'s `resetPassword()` updates only `passwordHash` — `masterKeyWrap` is untouched. `MasterKeyGate` correctly avoids generating a fresh master key (checks wrap-*presence*, not wrap-*validity*), but the only path forward from there is the ordinary password-unlock form, which then fails against the new password and shows "Wrong password. Try again." — a dead end. `restoreMasterKeyFromRecoveryCode`/`parseRecoveryCode` are exported from `@tc/crypto`, tested, and imported by **zero files** in `apps/web/src`, confirmed by direct grep.

**Hypothesis:** the existing, tested crypto primitives are sufficient to build a working recovery flow — no new cryptography is needed.

**Design to validate/approve:** on the reset screen, alongside "enter your new password," offer "Have your recovery code?" → `parseRecoveryCode` → `restoreMasterKeyFromRecoveryCode(existingWrap, code)` → master key recovered → `wrapMasterKeyWithPassword(masterKey, newPassword)` → send new password + fresh `masterKeyWrap` together, so the reset never produces an unreachable state.

**Not resolved by this spike, requires founder input:**
- Whether the existing `resetPassword` endpoint's contract is extended (optional `masterKeyWrap` field, mirroring `ChangePasswordRequestSchema`'s existing shape) or a new endpoint is added.
- Whether web gets this fix alongside mobile, or mobile ships it first with web's gap left open — blueprint §25 (open decision #8) states this plainly and does not decide it; this document does not decide it either.

**Output of this track:** a written, approved flow + API contract decision, handed to Phase 2's E2.8 for implementation — not the implementation itself.

**Who/what it blocks:** E2.8 specifically. Does not block the rest of Phase 2 (login/signup/session-restoration can proceed without this being resolved).

---

## Summary table

| Spike | Blocks | Can start now? | Needs physical device? |
|---|---|---|---|
| 1 — Argon2id | Phase 2 in full | Yes | Yes, mandatory |
| 2 — Deep-link fragment | Phase 5 (E5.1), Phase 7 (E7.6) | After Spike 4 | Yes, mandatory |
| 3 — SecureStore | Phase 2 (storage design), Phase 6 (biometrics) | Yes | Yes, mandatory |
| 4 — Navigation | Phase 1 in full | Yes | No (simulator sufficient for this one) |
| 5 — Recovery | E2.8 only | Yes | No (design task) |
