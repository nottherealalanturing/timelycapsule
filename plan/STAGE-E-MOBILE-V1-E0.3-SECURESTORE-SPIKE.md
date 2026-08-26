# E0.3 — SecureStore Behavior Spike

Companion to `plan/STAGE-E-MOBILE-V1-PHASE-0-SPIKES.md` (Spike 3) and `plan/STAGE-E-MOBILE-V1-IMPLEMENTATION-BLUEPRINT.md` §5 (biometric architecture) / §14 (local data). This is a spike report, not an implementation — `apps/mobile` was not modified to produce it.

## 1. Verdict

**PASS**, with one real, load-bearing platform divergence and one genuine Simulator-fidelity limitation, both documented below rather than glossed over.

Expo SecureStore (`~57.0.1`, resolved via `npx expo install` against `apps/mobile`'s actual Expo `~57.0.7`) is suitable for TimelyCapsule's specific requirement — a device-bound wrapping key gated by biometrics, wrapping a ciphertext blob stored unprotected (per blueprint §5.2) — **provided the app is built around two platform behaviors that are not symmetric**: Android wipes SecureStore on uninstall and cryptographically invalidates biometric-gated items on any credential-enrollment change (confirmed); iOS Keychain survives uninstall and — in this Simulator's testing — did not invalidate on a biometric-enrollment change (unconfirmed on physical hardware; see §16).

## 2. Environment

| | |
|---|---|
| iOS Simulator | iPhone 16, iOS 18.6 |
| Android Emulator | Pixel 7 AVD, `google/sdk_gphone64_arm64` (Play-enabled image) |
| Expo / RN | `~57.0.16` / `0.86.2` (throwaway app; matches `apps/mobile`'s `~57.0.7`/`0.86.0` closely) |
| expo-secure-store | `~57.0.1` (resolved by `npx expo install` against this Expo SDK) |
| expo-local-authentication | `~57.0.2` |
| Test payload | Deterministic synthetic 32 bytes (`0x00..0x1f`), base64-encoded — shaped exactly like a real `@tc/crypto` master key, never a real one |

## 3. Existing key architecture (read from the repository, not invented)

Traced through `packages/crypto/src/{master-key,capsule-key,wrap,kdf}.ts`, `packages/crypto/README.md`, `apps/web/src/lib/master-key-context.tsx`, `apps/web/src/components/MasterKeyGate.tsx`, and `plan/STAGE-E-MOBILE-V1-IMPLEMENTATION-BLUEPRINT.md` §5/§14.

1. **The master key** is a random 256-bit AES key (`generateMasterKey()` = `generateAesKey()`), generated once per user at signup (or on first password-set, for Google-only accounts via `MasterKeyGate`). Never rotated, only re-wrapped.
2. **Wrapping**: `wrapMasterKeyWithPassword(masterKey, password)` → Argon2id(password, salt) → AES-GCM-wrap → one base64url string (`salt(16) || iv(12) || ciphertext`), stored server-side as `user.masterKeyWrap`. A second, independent wrap exists via `wrapMasterKeyWithRecoveryCode` (HKDF, not Argon2id) → `recoveryKeyWrap`, also server-side.
3. **Recovery after login**: the client fetches `masterKeyWrap` from the server (part of the user object), then `unwrapMasterKeyWithPassword(wrap, password)` locally. The server never sees the password or the key.
4. **Kept only in memory**: the master key itself. `master-key-context.tsx`'s own comment: *"In-memory only — never persisted (localStorage/sessionStorage), per the zero-access rule."* `MasterKeyGate` re-prompts for the password on every fresh page load.
5. **What survives a browser refresh today**: only the auth access/refresh tokens (`token-store.ts`, plain `localStorage`, explicitly flagged in its own comment as a stopgap). The master key does not — this is deliberate, not an oversight, and web currently has **zero** "remember my key" feature at all. Mobile's biometric convenience-unlock (blueprint §5) is a genuinely new capability, not a port of an existing one.
6. **Secrets vs. safe metadata**: the master key (raw) and the password/recovery code are secrets that must never leave memory unencrypted. `masterKeyWrap`/`recoveryKeyWrap` (ciphertext strings) are safe to hold in ordinary storage or transmit — they're meaningless without the corresponding password/recovery code/device wrapping key.
7. **Biometric/device-unlock, per blueprint §5.2** (a `[RECOMMENDATION]`, constrained by locked Decisions 5/11/12): do **not** store the master key itself, and do **not** store a copy of the password. Instead: generate a fresh random AES "device wrapping key," wrap the *already-unwrapped* master key under it (reusing `wrapKey`/`unwrapKey` with `ZERO_SALT`, exactly like `capsule-key.ts`'s owner-wrap does for key-to-key wraps — no new crypto), store the wrapped-master-key blob in **ordinary** SecureStore (no auth gate — it's ciphertext), and store the **device wrapping key** in SecureStore **with** `requireAuthentication: true`. This spike's test harness mirrors that exact two-item shape.

## 4. SecureStore configuration tested

- Plain: `setItemAsync(key, value, {})` / `getItemAsync(key, {})`.
- Protected: `setItemAsync(key, value, { requireAuthentication: true, keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY, authenticationPrompt })` / matching `getItemAsync`.
- Payload: base64 of a deterministic 32-byte array — the exact shape `wrapKey`'s output or a raw master key would take.

## 5. iOS results

- `isAvailableAsync()`: `true`. `hasHardware=true`, `isEnrolled` correctly toggled `false`→`true`→`false` as Face ID enrollment was changed via the Simulator's Features menu.
- Plain store/read: byte-exact, 32ms / 8ms.
- **Protected store did not prompt for Face ID at all** (12ms, silent success) once enrolled. **Protected read also did not prompt** (3ms) — it succeeded silently. `[VERIFIED, Simulator]` / `[OPEN — needs physical-device confirmation of real prompt UX and latency]`.
- Force-kill (`simctl terminate`) + relaunch: both plain and protected items survived, byte-exact.
- **Uninstall + reinstall: both plain and protected items survived, byte-exact, with no re-authentication required for the protected one.** `[VERIFIED]` — iOS Keychain is not app-sandbox storage; it persists independently of the app bundle on the same device by default.
- **Biometric un-enrollment did not invalidate the protected item** — it remained fully readable, byte-exact, after toggling Face ID off. The native source (`SecureStoreModule.swift`) does correctly request `.biometryCurrentSet` (the flag Apple documents as being invalidated on any biometry change), so this is very likely a **Simulator fidelity limitation** in how "Features > Face ID > Enrolled" is implemented, not evidence that the real feature doesn't work — see §16.

## 6. Android results

- `isAvailableAsync()`: `true`. `hasHardware=true`, `isEnrolled` correctly toggled `false`→`true`→`false` (via real fingerprint enrollment through Settings, driven by `adb`/`emu finger touch`, and `adb shell locksettings clear` to remove the credential).
- Plain store/read: byte-exact, 48ms / 8ms.
- **Protected store with no biometric enrolled: fails outright** — `code=ERR_AUTHENTICATION`, *"Could not Authenticate the user: No biometrics are currently enrolled"* (16ms). Does not fall back to unprotected storage.
- Protected store/read with a real enrolled fingerprint (satisfied via `adb emu finger touch`): succeeded, byte-exact. (Timings for these specific calls include manual test-navigation delay and are not meaningful latency numbers — see §11.)
- Force-kill + relaunch: plain item survived, byte-exact.
- **Uninstall + reinstall: the plain item did NOT survive — `getItem` returned `null`.** `[VERIFIED]` — opposite of iOS.
- **Credential invalidation (clearing the device lock credential, which cascades to remove the enrolled fingerprint): the protected item's read did NOT throw an error — it silently returned `null`, indistinguishable from "never written."** `[VERIFIED]` — this is the single most important error-taxonomy finding of this spike; see §10.

## 7. Persistence matrix

| Scenario | iOS | Android | Confidence |
|---|---|---|---|
| Background → foreground | Survives (process not killed) | Survives (process not killed) | `[VERIFIED]` (inherent to not being a persistence event at all) |
| Force-kill → relaunch | Survives, byte-exact | Survives, byte-exact | `[VERIFIED]` |
| Uninstall → reinstall (plain) | **Survives**, byte-exact | **Wiped**, returns `null` | `[VERIFIED]`, both platforms |
| Uninstall → reinstall (protected) | **Survives**, byte-exact, no re-auth needed | Not separately re-tested (plain result already establishes the platform wipes on uninstall; protected items live in the same wipe boundary) | `[VERIFIED]` iOS; `[INFERENCE]` Android |

## 8. Biometric matrix

| Question | iOS | Android | Confidence |
|---|---|---|---|
| `requireAuthentication:true` available | Yes | Yes | `[VERIFIED]` |
| Requires special config | No (just the option + `NSFaceIDUsageDescription`) | No (just the option) | `[VERIFIED]` |
| Prompt shown on write | **No**, silent success | N/A — write itself fails if nothing enrolled | `[VERIFIED]` |
| Prompt shown on read | **No** on Simulator (silent success) | Yes, real `BiometricPrompt`, satisfied via `emu finger touch` | `[VERIFIED, Simulator]` for iOS — real-device prompt behavior `[OPEN]` |
| Write with nothing enrolled | *(not separately forced — write succeeded regardless of enrollment on iOS)* | **Throws immediately**, `ERR_AUTHENTICATION` | `[VERIFIED]` |
| Read after enrollment added later | Succeeds | Succeeds | `[VERIFIED]` |

## 9. Credential-change results

- **Android: real, cryptographic invalidation confirmed at the OS level.** Clearing the lock credential (which cascades to remove the fingerprint) made the previously-written protected item return `null` on read — silently, not as an error.
- **iOS: no invalidation observed on Simulator.** The protected item remained fully readable after toggling Face ID enrollment off. Code inspection confirms the correct `.biometryCurrentSet` access-control flag is requested, so this is most likely the iOS Simulator's Face ID feature not faithfully reproducing a real device's Secure Enclave/Keychain invalidation semantics — but this spike cannot prove that distinction from software alone. **`[OPEN DECISION — physical iOS device required]`.**

## 10. Error taxonomy

| Condition | iOS | Android |
|---|---|---|
| Missing key | `null` (no error) | `null` (no error) |
| Write, biometric required, none enrolled | *(not forced independently — see above)* | Throws: `Error`, `code: ERR_AUTHENTICATION`, message names the root cause (`"No biometrics are currently enrolled"`) |
| Read, item exists but credential changed since write | **`null`** (Simulator; real-device behavior unconfirmed) | **`null`** (confirmed on real cryptographic invalidation) |
| Malformed value (e.g. corrupted base64) | Not a SecureStore-level concept — SecureStore stores/returns opaque strings verbatim; any encoding validation is the application's own responsibility, not something SecureStore detects or reports | Same |

**The load-bearing conclusion**: on **both** platforms, "the secret was never written" and "the secret exists but is no longer accessible due to a credential change" are **the same observable outcome (`null`)**. A mobile key-gate cannot distinguish "user hasn't enrolled biometric protection yet" from "biometric protection broke because the user re-enrolled a fingerprint/Face ID" by inspecting the SecureStore read result alone. This is a real design constraint for E1/E2, not a corner case — see §15.

## 11. Performance measurements

- **Plain store**: 32–48ms (iOS/Android). **Plain read**: 5–16ms. This is the number that matters for perceived login latency from SecureStore itself — effectively instantaneous, no loading state needed for this step alone.
- **Protected read (Simulator, enrolled, no manual interaction needed on iOS)**: 3–5ms.
- **Protected read (Android, real `emu finger touch` interaction)**: contaminated by manual test-navigation time (measured 1939ms, 26587ms in raw logs) — **not real device latency**, purely how long it took the human/script driving the test to reach and satisfy the prompt. On a real device, `BiometricPrompt`/Face ID's own latency is dominated by the actual biometric capture (typically a few hundred ms to ~1s), not by SecureStore I/O.
- Argon2id and AES-GCM unwrap latency are **not** part of this spike — they were already measured in E0.1 (native `crypto_pwhash` matched `hash-wasm` byte-for-byte on both platforms; derivation itself is the dominant cost of a password-based unlock, not SecureStore I/O, which this spike shows is negligible by comparison).
- **Conclusion**: a login/key-gate loading state is warranted because of Argon2id (E0.1's territory, ~100ms+ observed there), not because of SecureStore, which is fast enough to not need one on its own.

## 12. Security analysis

Answering the task's explicit questions, plainly:

1. **Can an attacker with ordinary access to AsyncStorage/localStorage obtain the master key?** Only if the app puts it there — and per blueprint §5.1 (already the stated architecture, reaffirmed here, not re-decided) it must never be. AsyncStorage is unencrypted, app-sandboxed but not OS-secret-store-protected.
2. **Can the master key be placed in AsyncStorage safely?** No. General-purpose storage is the wrong trust boundary regardless of any application-level encryption layered on top, because that encryption's own key becomes just another secret needing the same protection — this doesn't reduce the problem, it duplicates it.
3. **Should the master key ever be persisted outside SecureStore?** No, and per §5.1/§14 it should not even be the master key stored *in* SecureStore directly — only a device wrapping key (biometric-gated) and a wrapped-master-key blob (unprotected, since it's ciphertext), per §3.7 above.
4. **Wrapped or raw master key in SecureStore?** Wrapped-master-key blob unprotected + device wrapping key protected — never the raw master key at rest, ever, on any platform. This spike's test harness deliberately used a synthetic 32-byte value shaped like a raw key only to prove the *mechanism* round-trips correctly; it is not a recommendation to store a raw key that way in production.
5. **What does SecureStore protect against?** Ordinary app-sandbox-level access (other apps, casual on-device inspection without escalated privileges), and — for `requireAuthentication:true` items — a thief who has the unlocked device but not the enrolled biometric/passcode.
6. **What does it NOT protect against?** A compromised OS or a sufficiently privileged attacker with the device unlocked and biometric already satisfied (e.g., malware running with the app's own entitlements), and — per this spike's own findings — it does not by itself distinguish "missing" from "invalidated" (§10), so the *application* must add that distinction, not assume SecureStore provides it.
7. **Rooted/jailbroken devices?** Out of this architecture's threat model to prevent, exactly as blueprint §5.3 already states — a compromised OS can extract Keychain/Keystore-protected material through other means; SecureStore is not a defense against that, and this spike does not claim otherwise.
8. **OS invalidates protected credentials?** Android: confirmed, silently returns `null`. iOS: expected per Apple's documented `.biometryCurrentSet` semantics and confirmed present in the actual code path used, but **not empirically confirmed on this Simulator** — physical-device verification required before relying on it.
9. **After app deletion?** Android: everything gone. iOS: **everything remains**, including biometric-gated items, until the device itself is reset or the user manually manages Keychain data (which iOS Settings does allow, separately from app deletion). This is the single most consequential platform asymmetry this spike found.
10. **User loses access to the device?** Password + recovery code (server-independent, per `@tc/crypto`'s own documented "lose both = unrecoverable by design, including by us") remain the only way back in — SecureStore/biometric convenience-unlock is never the only path, consistent with Decision 12 ("password is the biometric fallback").

**Not oversold**: SecureStore is a well-implemented wrapper over each platform's native Keychain/Keystore, not a hardware security module in its own right — it inherits whatever hardware-backing (Secure Enclave, StrongBox/TEE) the underlying OS API provides on that specific device, which this spike cannot verify device-by-device.

## 13. Proposed production storage model

Built entirely from the architecture already discovered in §3 — no new server storage, no new key hierarchy:

```
SecureStore (mobile-only, new):
  tc_device_wrap_key       (requireAuthentication: true)  → random AES-256 key, base64
  tc_wrapped_master_key    (no auth gate — it's ciphertext) → wrapKey(masterKey, tc_device_wrap_key, ZERO_SALT)
  tc_access_token          (mirrors web's token-store.ts)
  tc_refresh_token         (mirrors web's token-store.ts)

Memory (JS, never persisted, mirrors web exactly):
  master key        → resolved via password unlock OR biometric unlock, lives for the app session only
  capsule key(s)    → resolved per-capsule as already implemented, unchanged

Server (unchanged, already exists):
  users.masterKeyWrap     → Argon2id(password)-wrapped master key, existing representation
  users.recoveryKeyWrap   → HKDF(recovery code)-wrapped master key, existing representation
```

No new server column, no new table. The only genuinely new persistence surface is the two mobile-only SecureStore entries for the biometric convenience path — everything else already existed in the architecture before this spike.

## 14. What belongs in memory vs. SecureStore vs. server

| Item | Location | Why |
|---|---|---|
| Master key (raw) | Memory only | Zero-access rule, identical to web today |
| Capsule key(s) (raw) | Memory only | Same |
| Device wrapping key | SecureStore, `requireAuthentication: true` | The one item biometrics actually gates |
| Wrapped master key (ciphertext) | SecureStore, no auth gate | Gains nothing from an extra gate — it's already opaque |
| Access/refresh tokens | SecureStore, no auth gate | Mirrors web's `localStorage` use, just in the OS-secret-store instead |
| `masterKeyWrap` / `recoveryKeyWrap` | Server (existing columns) | Already the source of truth; mobile fetches, never originates |
| Password / recovery code | Never stored anywhere, any platform | Existing, unchanged rule |

## 15. Recommendation

**[RECOMMENDATION]**, per the task's instruction to compare against existing constraints rather than silently deciding: biometric unlock should be **Option B — an optional convenience unlock layered on top of password/recovery-based key recovery**, never a replacement and never required for every retrieval.

This is not a new decision — it is what locked Decisions 5, 11, and 12 already require (§5 of the blueprint, restated, not re-litigated): the key is gated, not the screen (Decision 5); password is the universal fallback (Decision 12); every biometric failure mode resolves back to the ordinary password form, never a dead end (Decision 11's "restated" framing). Option A (biometric required for every retrieval) is directly excluded by Decision 12. Option C (defer entirely) is not excluded by any locked decision, but the blueprint's own Phase 6 already scopes biometrics into Mobile V1 — whether to actually build it in V1 or slip it is a scheduling call, not something this spike resolves or should resolve.

**One consequence this spike adds that the blueprint's §5.3 state table did not fully anticipate**: because SecureStore surfaces "invalidated" and "missing" identically as `null` (§10), the enrollment-flow code must not assume a `null` protected read always means "biometrics were never turned on" — it could mean "biometrics broke." The practical fix (mechanically simple, not a new decision): if the app's own separate flag (e.g., a plain, unprotected SecureStore or app-state marker of "biometric protection is enrolled") says protection *should* exist but the protected read comes back `null`, treat that specific combination as "biometric protection was invalidated — please re-enroll," a distinct, better message than a generic "protection not set up yet." This is a UX/implementation detail for E1/E2, not a new architectural decision.

## 16. Limitations

- iOS credential-invalidation behavior (§6, §9) was **not** confirmed to work as documented — only confirmed that the code requests the correct flag. The Simulator did not demonstrate invalidation, and this spike cannot determine whether that's a Simulator limitation (most likely, given the flag is correct) or a genuine gap, without a physical device.
- iOS's silent (no visible prompt) success on both protected write and protected read was observed only on Simulator. Real Face ID/Touch ID has a visible, non-instant UI (and can fail — wrong face, too many attempts, user cancellation) that this Simulator path did not exercise at all.
- Android's protected-item timings are contaminated by manual test-navigation delay and are not real latency numbers (§11).
- Backup/restore-to-a-new-device behavior (a Simulator/emulator cannot meaningfully test this) was not attempted — `WHEN_UNLOCKED_THIS_DEVICE_ONLY` is documented by Apple to exclude the item from backups, but this spike did not verify that empirically.

## 17. Physical-device requirements

A physical iOS device (any Face ID or Touch ID model) is required to:
- Confirm whether biometric enrollment changes actually invalidate a `requireAuthentication:true` Keychain item (§9, §16) — this is the single most important open item from this entire spike, since the whole "protect my capsules" design in blueprint §5.3 depends on it.
- Observe real Face ID/Touch ID prompt UX, timing, and failure-path behavior (cancel, wrong face, lockout) that Simulator does not reproduce.
- Confirm the backup-exclusion behavior of `WHEN_UNLOCKED_THIS_DEVICE_ONLY`.

A physical Android device is lower-priority (the emulator's fingerprint simulation via `emu finger touch` produced real `BiometricPrompt`/Keystore behavior, including genuine cryptographic invalidation on credential change) but would still be worth a spot-check on a non-Pixel OEM skin before shipping, since biometric implementations vary more across Android OEMs than across iOS devices.

## 18. Exact implementation consequences for E1/E2

- E1/E2 should implement the two-item SecureStore model exactly as in §13/§14 — no new design work needed, it's a direct application of blueprint §5.2's already-approved recommendation.
- E1/E2 must implement the `null`-is-ambiguous handling described in §15's consequence paragraph — a small, concrete addition to the enrollment/unlock flow's state machine, not a redesign.
- E1/E2 must not assume uninstall clears mobile-persisted secrets on iOS (§7) — any "reset this device" or logout flow must explicitly call `deleteItemAsync` for both SecureStore keys, on both platforms, rather than relying on uninstall as an implicit cleanup mechanism.
- E1/E2 should treat the iOS credential-invalidation question (§16/§17) as an open item to verify on a physical device before shipping the biometric feature, not as a blocker to starting E1's non-biometric work (login, session tokens, master-key-in-memory) — those do not depend on this open item at all.

## 19. Whether any production code needs changing before E1

**No.** Nothing in this spike found a defect in existing web or API code, and nothing here requires a change to `apps/mobile` (still untouched) or any backend contract before E1 can begin. The one open item (§16/§17) blocks shipping the *biometric* feature specifically, not E1's broader scope.

## 20. Exact next spike/task

Per the Phase 0 spike plan, the remaining open items are: (a) physical-device verification of E0.2's real Universal Link/App Link delivery, and (b) physical-device verification of this spike's iOS credential-invalidation question (§16/§17) — both require hardware this session does not have. Absent new hardware, the next available Phase 0 item is Spike 5 (Recovery-flow design decision), which is a design/decision task, not a technical spike, and needs no device.
