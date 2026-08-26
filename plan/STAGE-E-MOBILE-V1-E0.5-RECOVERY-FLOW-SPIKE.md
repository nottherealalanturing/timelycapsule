# E0.5 — Recovery Flow Design Spike

Companion to `plan/STAGE-E-MOBILE-V1-PHASE-0-SPIKES.md` (Spike 5) and blueprint §8 ("Authentication + recovery"). This is a read-only design/architecture investigation — no application code, schema, or crypto was modified to produce it.

## 1. Executive verdict

**The recovery architecture is not ambiguous — it is precisely determinable from the existing crypto primitives — but it is currently incomplete in a way that produces a real dead end today.** `@tc/crypto` already exports everything needed (`restoreMasterKeyFromRecoveryCode`, `wrapMasterKeyWithPassword`) and the `changePassword` endpoint already proves the correct wiring pattern (client re-wraps, server just stores ciphertext). The forgot-password path simply never calls any of it. This is `[NOT IMPLEMENTED]`, not `[BLOCKER]` — nothing about the existing architecture prevents fixing it, and no new cryptography, schema, or founder decision is required to do so. Two real, previously-undocumented findings are reported below that go beyond what the blueprint already knew (§3, §11): the server does not currently expose `recoveryKeyWrap` to any client response at all, and a dead, unused `recovery_codes` table exists in the schema that most plausibly belongs to the *unrelated, deferred* TOTP-2FA feature, not master-key recovery — a naming collision worth flagging so nobody builds on it by mistake.

## 2. Current web recovery reality

Traced against actual code, not documentation, per the task's instruction.

**A. User knows their password.** `apps/web/src/lib/auth-context.tsx`'s `login` → `authApi.login` → server returns `{user, tokens}` where `user.masterKeyWrap` is the base64 ciphertext. `MasterKeyGate` then calls `unlockWithPassword(user.masterKeyWrap, password)` → `unwrapMasterKeyWithPassword` → master key in memory. `[VERIFIED, IMPLEMENTED]`

**B. User forgets their password.** `(auth)/reset/page.tsx`'s `handleForgot` → `authApi.forgotPassword({email})` → API's `forgotPassword` issues a single-use, hashed, 1-hour-TTL email token (`issuePasswordResetToken`, `otp.ts`) and emails a link. Clicking it lands back on `/reset?token=...`, which renders only a "New password" field. `handleReset` → `authApi.resetPassword({token, newPassword})` → API's `resetPassword` (`service.ts:244`) does exactly two things: `hashPassword(newPassword)` → update `passwordHash`; `revokeAllSessions`. **It never reads, derives, or touches `masterKeyWrap` in any way.** `[VERIFIED]` — this exactly matches the blueprint's own §8.2 finding; re-verified against the live code, not assumed from the doc.

Consequence, traced forward: user logs in with the new password → `MasterKeyGate` calls `unlockWithPassword(user.masterKeyWrap, newPassword)` → `unwrapMasterKeyWithPassword` runs Argon2id(newPassword, oldSalt) → AES-GCM auth-tag verification fails (wrong key) → throws → UI shows "Wrong password. Try again." with the **exact same password the user just set**, and no path forward from that screen. `[VERIFIED]` — a real, reproducible dead end, not a theoretical one.

**C. User changes their password (while logged in, knows current password).** Settings → Account → `changePassword` mutation (not read in full here, but its contract is exact): client unwraps master key with the current password (already in memory or re-derived), re-wraps with the new password via `wrapMasterKeyWithPassword`, sends `{currentPassword, newPassword, masterKeyWrap}` to `PATCH`/`POST` `changePassword`. API's `changePassword` (`service.ts:278`) verifies `currentPassword`, updates `passwordHash` **and** `masterKeyWrap` together, revokes other sessions (keeps the current one alive). `[VERIFIED, IMPLEMENTED]` — this is the architecturally correct pattern; it is what forgot-password should also do but doesn't.

**D. User loses access to their current device.** No device-binding exists anywhere in the current (web) architecture — the master key is derived fresh from password + server-supplied wrap on any device/browser. Losing a device has no special consequence on web today; the user logs in from a new browser exactly as any other login. `[VERIFIED]` — device loss is a mobile-specific concern (SecureStore/Keychain locality), not a web one.

**E. User has an authenticated session but changes password.** Same as C — `changePassword` explicitly keeps the *current* session alive (`revokeOtherSessions`, not `revokeAllSessions`) while invalidating every other device's session. `[VERIFIED]`

**F. User has historical encrypted capsules.** Every owned capsule's content key is wrapped under the *same* master key (`capsule-key.ts`'s `wrapCapsuleKeyForOwner`/`unwrapCapsuleKeyForOwner`, a zero-salt key-to-key wrap — no per-capsule password dependency). As long as the master key itself is recoverable (by whatever path), **every** owned capsule becomes readable again uniformly, in one step — there is no per-capsule re-encryption or migration concept anywhere in this architecture. `[VERIFIED, by code structure]`

## 3. Existing crypto recovery model

Traced through `packages/crypto/src/{recovery-kit,master-key,wrap,kdf}.ts` and `README.md`.

- **What the recovery code wraps**: the same master key as the password wrap — not a different key, not a subset of capsules. One master key, two independent unlock paths (`wrapMasterKeyWithPassword` and `wrapMasterKeyWithRecoveryCode`), both producing the same `wrapKey`-shaped ciphertext blob (`salt(16) || iv(12) || ciphertext`).
- **What key it derives**: `deriveKeyFromRecoveryCode` — HKDF-SHA256(recoveryCode, salt, info=`"tc-recovery-kit-v1"`) → 256-bit AES key. Deliberately **not** Argon2id — the recovery code is already ~128 bits of random entropy (`generateRecoveryCodeBytes`, `RECOVERY_CODE_BYTES=16`), so memory-hard stretching buys nothing and only slows down the one path meant to be fast in an emergency. `[VERIFIED, by code + comment]`
- **Can it recover the master key?** Yes, unconditionally, given the two required inputs. `restoreMasterKeyFromRecoveryCode(wrapped, recoveryCode)` = `extractSalt(wrapped)` → `deriveKeyFromRecoveryCode` → `unwrapKey` → throws (AES-GCM auth failure) on a wrong code, exactly like the password path.
- **What data is required**: (1) the user's own printed/saved recovery code (client has it, server never does), (2) the corresponding `recoveryKeyWrap` ciphertext (server has it, client must fetch it).
- **Where that data is stored**: `recoveryKeyWrap` — `users.recovery_key_wrap`, a `bytea` column, server-side, set exactly once at signup (or `setInitialPassword` for OAuth-only accounts) and **never updated again by any existing code path**, including `changePassword`. `[VERIFIED]` — the original recovery code issued at signup remains the only valid one for the account's entire lifetime today, even after N password changes.
- **Server-assisted or client-side?** Entirely client-side. The server's only role is storing and returning opaque ciphertext (`recoveryKeyWrap`) — it never participates in the derivation or unwrap.
- **Does the server ever see the plaintext recovery code?** No — confirmed by a repo-wide grep: zero occurrences of a plaintext "recoveryCode" concept anywhere in `apps/api/src`. The server only ever holds `recoveryKeyWrap` (ciphertext).
- **Does the server ever see the plaintext master key?** No, by the same zero-access construction as the password path — generated, wrapped, and unwrapped exclusively client-side.
- **What happens after successful recovery?** Today: nothing, because nothing calls this function (§2B). Architecturally, per blueprint §8.3's already-correct design: the recovered master key should immediately be re-wrapped under a new password and sent to the server alongside the new password hash, in the same request — see §5.

## 4. Password-change architecture

The correct model is exactly the one the task asked to determine, and it is **already implemented** for the logged-in case:

> old password → unwrap master key → re-wrap master key under new password → send `{newPasswordHash, newMasterKeyWrap}` together

This is precisely `changePassword`'s contract (`ChangePasswordRequestSchema`: `{currentPassword, newPassword, masterKeyWrap}`, `service.ts`'s `changePassword`). **`resetPassword`'s contract does not include this** (`ResetPasswordRequestSchema`: `{token, newPassword}` — no `masterKeyWrap` field exists at all in the schema, let alone the handler). This is the exact, precise location of the gap — not a vague architectural uncertainty, a missing field in one Zod schema and one service function. `[VERIFIED]`

## 5. Forgot-password architecture

The task's example flow is verified compatible with the existing architecture, **with one addition beyond what the blueprint already stated**: the client cannot execute this flow today even if someone wired up the UI, because **`recoveryKeyWrap` is never returned to the client by any existing endpoint** (§11). The corrected, complete flow:

```
User forgets password
  → requests reset (existing /auth/password/forgot, unchanged)
  → clicks emailed link, lands on /reset?token=...
  → NEW: reset screen fetches recoveryKeyWrap for this token/account
       (does not exist today — see §11 for the exact contract needed)
  → offers "Have your recovery code?" alongside the plain "set new password" form
  → user enters recovery code
  → client: parseRecoveryCode → restoreMasterKeyFromRecoveryCode(recoveryKeyWrap, code)
      → throws on wrong code (existing AES-GCM behavior, no new crypto)
  → user chooses new password
  → client: wrapMasterKeyWithPassword(masterKey, newPassword) → new masterKeyWrap
  → client: authApi.resetPassword({token, newPassword, masterKeyWrap})  ← NEW field
  → server: verifies token exactly as today, additionally stores masterKeyWrap
       if present (mirrors changePassword's existing pattern exactly)
  → historical capsules remain readable (§2F already establishes why)
```

This requires: one new Zod field (`masterKeyWrap`, optional, on `ResetPasswordRequestSchema`), one new line in `resetPassword`'s `db.update` (mirroring `changePassword`'s existing pattern), and a way for the reset screen to obtain `recoveryKeyWrap` (§11 — the actual open design question). No new cryptography, no schema migration, no founder decision reopened. `[RECOMMENDATION]`, directly derived from the already-approved blueprint §8.3 design, not a new invention.

## 6. Mobile recovery architecture

Per case, using only the E0.3-verified SecureStore facts and the crypto model above — no new mechanism invented:

| Case | What's actually available | Correct path |
|---|---|---|
| A. SecureStore has a valid master-key copy (device wrapping key + wrapped blob, per E0.3 §13's two-item model) | Device wrapping key readable (with or without biometric prompt) | Unwrap locally → master key in memory. No server round-trip needed beyond the existing session. |
| B. SecureStore is empty (never enrolled, or fresh install) | Nothing device-local | Fall through to password unlock — identical to web's `MasterKeyGate` today, using the server-supplied `masterKeyWrap`. |
| C. SecureStore wiped by Android uninstall | Nothing (E0.3-confirmed: Android wipes on uninstall) | Same as B — password unlock. This is expected, ordinary post-reinstall behavior, not a failure state. |
| D. iOS reinstall, Keychain unexpectedly still has the key (E0.3-confirmed: iOS survives uninstall) | Device wrapping key still present and still valid (unless credential-invalidated — see E) | Biometric unlock still works, with **no re-login required by SecureStore alone** — but see §8 for why this is a real product question, not just a technical curiosity, since the app's own *session* (tokens) may or may not have survived independently. |
| E. Biometric enrollment invalidated the protected copy | Android: `null`, confirmed cryptographically invalidated. iOS: unconfirmed on Simulator, expected-but-unverified on real hardware (E0.3 §16/§17) | Per E0.3's own conclusion: the app cannot tell "invalidated" from "never enrolled" from the SecureStore result alone — needs its own "biometric protection is enrolled" flag (see §7) to show "please re-enroll" instead of a generic empty state. Falls through to password. |
| F. No biometric available at all | `hasHardwareAsync()`/`isEnrolledAsync()` false | Device wrapping key was never written under `requireAuthentication:true` in the first place (or the app should never have offered biometric enrollment) — falls through to password, exactly as blueprint §5.3's "Biometrics disabled at the OS level" row already states. |
| G. Password forgotten (mobile) | Neither SecureStore nor password available | **Recovery code**, same client-side crypto as web, no mobile-specific primitive needed — `@tc/crypto` is platform-agnostic by design (plain `Uint8Array` in/out, per its own README). This is the one case that needs the same server-side gap (§5/§11) closed as web, and needs its own mobile UI, but zero new crypto. |

## 7. Biometric interaction

Directly building on E0.3's own stated conclusion (not redesigning it):

```
biometric protected key invalidated (or never enrolled)
  → SecureStore protected read returns null either way
  → app checks its own separate "biometric protection enrolled" flag
      → flag set + null result  → "biometric protection needs re-enrollment" (specific message)
      → flag unset + null result → ordinary "unlock with password" screen (no message needed)
  → password unlock (existing path, works identically to web)
      → if successful: optionally re-offer biometric enrollment (fresh device wrapping key,
         fresh wrap of the now-in-memory master key)
  → if password also unavailable → recovery code path (§6.G)
      → after successful recovery + new password set: same optional re-enrollment offer
```

**Additional metadata required, precisely one item**: a plain (non-authenticated) boolean/flag — could live in SecureStore itself (unprotected key, e.g. `tc_biometric_enrolled`) or in ordinary app state/AsyncStorage, since it carries no secret, only "the user turned this on once." `[RECOMMENDATION]` — this is the one piece of state E0.3 flagged as missing and this spike confirms is sufficient; no additional server-side metadata is needed, since biometric enrollment is a pure local-device concept with no server awareness at all in this architecture (the server never learns whether a given device has biometric protection enabled).

## 8. Device replacement

Three scenarios, exactly as asked, using only what the architecture actually provides — no invented mechanism:

**Old phone lost → new phone installed → user logs in → historical capsules remain readable.** Works today, architecturally, with no gap: login on the new device fetches `masterKeyWrap` from the server exactly as any login does, the user enters their password (which they still know), and every owned capsule is readable via the same single master key. No mobile-specific recovery mechanism needed for this case — it's an ordinary login. `[VERIFIED, by architecture]` (not implemented in `apps/mobile` yet, since no mobile auth exists — but the *contract* it will use is exactly the existing web one).

**Old phone lost → new phone installed → password forgotten → recovery code available.** Requires the same forgot-password fix as §5 — recovery is not a mobile-specific gap, it's the same gap web has, on both platforms, from the same missing server field. Once §5's fix exists, mobile uses the identical client-side crypto to restore the master key on the new device, sets a new password, and regains full access, exactly as web would.

**Old phone lost → new phone installed → password forgotten → recovery code unavailable.** **No recovery mechanism exists, by design, and none should be invented.** This is the explicit, accepted, product-level tradeoff already stated in `@tc/crypto`'s own README ("Password loss + recovery-kit loss is unrecoverable by design, including by us... There is no server-side escape hatch for the master key") and restated in `06-FEATURE-ADDENDUM.md` ("lose password + kit = unrecoverable by anyone, including us"). The correct product consequence is exactly what those documents already say: the account's historical encrypted content is permanently unreadable. The user can still reset their password (via the existing forgot-password token flow) to regain *account access* (login, settings, sending new capsules with a *new* master key going forward), but every capsule wrapped under the old, now-unrecoverable master key stays encrypted forever. `[VERIFIED, by explicit existing product decision — not this spike's invention]`.

## 9. Android/iOS persistence implications

E0.3's findings, applied to recovery specifically:

- **This does not create a security inconsistency that needs forcing to parity.** iOS Keychain surviving uninstall is standard, expected iOS platform behavior (not a TimelyCapsule-specific leak) — a thief who could exploit "old Keychain data survives reinstall" would need the device itself, at which point plenty of other attack surface already exists. Forcing Android to behave like iOS (or vice versa) would fight each platform's own OS conventions for no real security gain, since the master key is never the raw secret at rest anyway (only a device wrapping key + ciphertext, per §7).
- **It does create one real product-consistency question the app must decide deliberately, not by accident**: on iOS, after a reinstall, the biometric-gated device wrapping key may still work (E0.3 §5/§7) while the app's own *server session* (access/refresh tokens, which — per §14 of the blueprint — should also live in SecureStore, and which E0.3 did not separately test for reinstall survival since it only tested a single opaque payload) may or may not still be valid. If tokens are stored the same way and also survive on iOS, the net effect is "the app appears to still be logged in after a fresh install" — which may be a pleasant convenience or a confusing surprise depending on user expectation, and is worth a deliberate product call rather than an implicit one. **`[OPEN DECISION]`** — not resolved by this spike, flagged for founder/product input, not a technical blocker.
- Android's clean wipe-on-uninstall means this specific question simply doesn't arise there — a fresh install is always a fresh, logged-out state, matching typical Android user expectations for "uninstall = start over."

## 10. Recovery-code lifecycle

Answering precisely, marking anything not code-proven as a recommendation:

- **When generated**: at signup (every password-based signup, unconditionally — `auth-context.tsx`'s `signup`) and at `setInitialPassword` (the one-time OAuth-only-account path). `[VERIFIED]`
- **One code or multiple?** Exactly one per user, ever (one `recoveryKeyWrap` bytea column, no array, no separate table wired up). `[VERIFIED]`
- **One-time-use?** No concept of "used" exists for it at all — there is no consumption/invalidation step anywhere, because nothing currently calls the restore function in production code. If/when §5's fix ships, the code remains valid indefinitely and reusable (it's a wrap, not a token) unless a new password change also re-wraps under a *new* recovery code — which nothing currently does (see next point). `[VERIFIED, absence]`
- **Do codes rotate?** No — `changePassword` re-wraps `masterKeyWrap` only; `recoveryKeyWrap` is untouched by every existing write path except the one-time `setInitialPassword`. The original code from signup remains the only valid one forever, even after N password changes, unless a future design deliberately adds rotation (an `[OPEN DECISION]`, not decided here).
- **Does regeneration invalidate old codes?** No regeneration feature exists anywhere in the codebase (`grep` for "regenerate" across `apps/web/src` returns nothing). `[VERIFIED, absence]`
- **Stored server-side?** Yes, as ciphertext (`recoveryKeyWrap`), never as the plaintext code.
- **Hashed?** N/A in the sense of a verifiable hash-and-compare — it's an AES-GCM-wrapped blob, not a hashed credential; correctness is proven by successful decryption (auth-tag match), not hash comparison. Note the **naming collision**: a genuinely different, currently-unused `recovery_codes` table (`id, userId, codeHash, usedAt`) exists in the schema (`apps/api/src/db/schema/identity.ts:123`), matching `03-ARCHITECTURE.md`'s original planned shape (line 76) — but it has **zero references anywhere else in the codebase**. Its shape (single hashed code, `usedAt`, no linkage to the master-key model at all) most plausibly belongs to the separate, explicitly-deferred TOTP-2FA backup-codes feature (`03-ARCHITECTURE.md` line 351: `POST /auth/totp/confirm {code} → {recoveryCodes}`; `packages/contracts/src/auth.ts`'s header comment: *"2FA (/auth/totp/*)... deferred to T-33... not modeled here yet"*). **This is flagged as a documentation/schema artifact worth knowing about, not a contradiction requiring resolution in this spike** — nobody should build master-key recovery on top of this table; it is unrelated dead schema (or forward-provisioned schema for a different, unbuilt feature). `[VERIFIED — contradiction between `03-ARCHITECTURE.md`'s original recovery design and the actual implemented `recoveryKeyWrap` column model; the column model is what's real today]`.
- **Rate-limited?** N/A today — there is no server endpoint that accepts a recovery-code attempt at all (recovery is 100% client-side once `recoveryKeyWrap` is in hand), so there is nothing on the server to rate-limit. This has a real threat-model consequence — see §11.
- **Audited?** No `audit()` call exists anywhere in `apps/auth/service.ts` for password reset, password change, or (hypothetically) recovery — none of these events are written to the audit log today. `[VERIFIED, absence]`
- **After successful recovery?** Undefined today (nothing calls it in production). Per §5's proposed fix: the new masterKeyWrap replaces the old one; the recovery code itself is unchanged and remains valid for future use unless a rotation policy is separately decided.
- **User loses the code?** Exactly §8's third scenario — permanent, by design, already documented product-level, not a gap this spike found.

## 11. Security/threat model (recovery-focused only)

| Attacker has | Can they get the master key? | Why / why not |
|---|---|---|
| Password, no recovery code | Yes, via ordinary login/unlock — this is expected; the password *is* a full unlock credential | N/A — not a vulnerability, this is the intended primary path |
| Recovery code, no password | Yes, once `recoveryKeyWrap` is obtainable (today: not obtainable via any endpoint at all — see below) | The recovery code is designed to be a full, independent unlock credential — this is intended, not a flaw, matching "recovery code recovers everything password recovers" |
| Authenticated session (stolen tokens) | Not directly — session tokens alone don't yield `masterKeyWrap`'s plaintext; still need the password or recovery code to unwrap it | The zero-access design holds even against session compromise, as designed |
| Stolen, unlocked phone | Whatever biometric-gated SecureStore currently allows without further auth (per E0.3, this varies — see E0.3's own security analysis) | Not a recovery-specific question; already covered in E0.3 §12 |
| SecureStore contents (extracted device wrapping key + ciphertext) | Only if they also break the platform's own Keychain/Keystore protection, out of this architecture's threat model (per E0.3 §12.6-7) | Same boundary as E0.3 already established |
| Database access (server breach) | Gets `masterKeyWrap`/`recoveryKeyWrap` ciphertext, `passwordHash` — cannot derive the master key from either without the password or recovery code, both never stored server-side | This is exactly the zero-access guarantee working as designed |
| Intercepting recovery *requests* | N/A today — there is no network request that carries a recovery code (it never leaves the client), so there's nothing to intercept. If §5 ships, the recovery code still never crosses the network — only the *result* (a new `masterKeyWrap`) does, which is meaningless without the corresponding password | No new network exposure from implementing §5 |
| Repeatedly guessing recovery codes | **Cannot be server-rate-limited today, because there is no server-side recovery attempt at all** — if an attacker obtained a copy of `recoveryKeyWrap` (e.g., via a DB breach) they could brute-force the 130-bit code entirely offline, with no rate limit possible in principle (this is inherent to a fully client-side design, not a bug) | Mitigated by the code's own entropy (~130 bits, per `RECOVERY_CODE_BYTES=16`'s comment) — offline brute force is computationally infeasible regardless of rate limiting; this is the correct mitigation for this kind of offline-derivable secret, not a gap |
| An old recovery code after regeneration | N/A — no regeneration feature exists (§10), so this scenario cannot currently occur | If rotation is added later (an `[OPEN DECISION]`), the old `recoveryKeyWrap` would need explicit invalidation (overwritten, not left readable) — a design note for whoever builds rotation, not a problem today |

## 12. Server responsibilities

**Minimum required, precisely:**

- Server must store: `masterKeyWrap`, `recoveryKeyWrap` (both already exist as columns — no schema change needed).
- Client must derive: the master key itself (via password or recovery code), both new wraps on any change (password change or recovery).
- Must never cross the network: the raw master key, the password, the recovery code. (Already true; §5's fix doesn't change this — only the new `masterKeyWrap` ciphertext crosses, exactly like `changePassword` already does today.)
- **Does the server need a new endpoint?** No — `resetPassword`'s existing endpoint can be extended (optional `masterKeyWrap` field), exactly mirroring `changePassword`'s already-proven contract. A brand-new endpoint is not required, though it remains a legitimate, equally-valid alternative (see §17).
- **Does password reset currently destroy access to the encrypted master key?** Yes, functionally — not directly (`masterKeyWrap` is left untouched in the database), but the new password can never unwrap the *old* wrap, so the effect is identical to destruction unless the recovery-code path is used before or during the same reset. `[VERIFIED]`
- **Does recovery require schema changes?** No. Both required columns already exist.
- **What's missing, precisely**: (1) `resetPassword`'s Zod schema and service function don't accept/store `masterKeyWrap`; (2) no endpoint or response field currently exposes `recoveryKeyWrap` to any authenticated or reset-token-bearing client at all (`UserSchema` excludes it entirely) — this second gap is what makes the reset-screen's "enter your recovery code" step impossible today even as pure UI, since the client has no wrap to unwrap against.

## 13. Web/mobile parity matrix

| Capability | Web | Mobile | Shared contract | Difference |
|---|---|---|---|---|
| Master key generation | `[IMPLEMENTED]` `@tc/crypto` | `[NOT IMPLEMENTED]`, will reuse `@tc/crypto` unchanged | `@tc/crypto` | None once built — same function, same output |
| Password wrap/unwrap | `[IMPLEMENTED]` | `[NOT IMPLEMENTED]`, reuses `@tc/crypto` | `@tc/crypto` | Mobile additionally persists the *result* in SecureStore (§6); the crypto itself is identical |
| Recovery-code wrap/unwrap | `[IMPLEMENTED in @tc/crypto, unused by any UI]` | Same | `@tc/crypto` | None — genuinely platform-agnostic already (plain `Uint8Array`/string in/out) |
| Forgot-password UI | `[IMPLEMENTED, but incomplete — no recovery-code step]` | `[NOT IMPLEMENTED]` | `packages/contracts` (`ResetPasswordRequestSchema`) | Needs the same fix on both, from the same contract change |
| Device wrapping key (biometric) | N/A — no concept on web | `[NOT IMPLEMENTED]`, per blueprint §5.2 | Mobile-only; API layer (`apps/mobile`) | Entirely new to mobile, not a port |
| Session token storage | `localStorage` (flagged stopgap) | `expo-secure-store`, per blueprint §14 | Shape (`accessToken`/`refreshToken`) shared via `packages/contracts` | Storage mechanism differs; data shape does not |
| Recovery-kit display UI | `[IMPLEMENTED]` (`RecoveryKit.tsx`, `@tc/ui-web`) | `[NOT IMPLEMENTED]`, needs a native equivalent | Copy/warning text could be shared as data, not component code (`@tc/ui-web` is web-only) | Presentation layer necessarily platform-specific; the *code itself* (the string) is identical |

**Where recovery logic belongs**: all cryptographic operations (`generateMasterKey`, `wrapMasterKeyWithPassword`, `wrapMasterKeyWithRecoveryCode`, `restoreMasterKeyFromRecoveryCode`, `parseRecoveryCode`, `formatRecoveryCode`) already live in `@tc/crypto` and need zero duplication on mobile — this is the correct existing boundary, not a new one. Screen flow/UX state machines belong in each platform's own app layer (`apps/web`, `apps/mobile`), since they're necessarily built from different UI primitives. The API contract change (§5/§11) belongs in `packages/contracts` + `apps/api`, shared by both clients identically.

## 14. Failure-state taxonomy

| State | Exists today? | Needs design? |
|---|---|---|
| No recovery code (user never saved it) | Product consequence exists and is documented (§8, third scenario) | UI copy for this state doesn't exist yet on the reset screen — needs design (small) |
| Invalid recovery code | `restoreMasterKeyFromRecoveryCode` already throws (AES-GCM auth failure) — the *mechanism* exists | UI state ("that code doesn't match this account") needs building — small, same pattern as existing "Wrong password" handling |
| Expired/invalid recovery *session* (the reset token) | `[IMPLEMENTED]` — `consumePasswordResetToken` already throws `invalidOrExpiredCode`, surfaced today as "This reset link is invalid or has expired." | No new work |
| Recovery code "already used" | N/A — no use-tracking exists for the recovery code itself (§10); this state cannot currently occur | Only relevant if a future one-time-use policy is added — `[OPEN DECISION]`, not needed for the minimal fix |
| Master-key restoration failed | Same underlying throw as "invalid recovery code" — same UI state | Covered by the above |
| Password-change failed | `[IMPLEMENTED]` — `changePassword` throws `invalidCredentials` on wrong current password today | No new work |
| SecureStore missing (mobile) | Mechanism exists (`getItemAsync` → `null`, E0.3) | Fall-through-to-password UI needs building (mobile app doesn't exist yet) |
| SecureStore invalidated (mobile) | Mechanism exists but indistinguishable from "missing" (E0.3's central finding) | Needs the app-level enrolled-flag design from §7 |
| Biometric unavailable (mobile) | Mechanism exists (`hasHardwareAsync`/`isEnrolledAsync`, E0.3) | Fall-through UI needs building |
| Recovery successful | Would be a new state once §5 ships | Needs a confirmation screen — same register as the existing recovery-kit "Continue" pattern |
| Recovery partially completed (user abandons mid-flow) | No existing precedent to point to (nothing currently has a multi-step recovery flow) | `[OPEN DECISION]` — see §16 |

## 15. Historical encrypted-data compatibility

Traced directly from the master-key architecture (§2F), answering each item:

- **Read existing capsules?** Yes — content docs are encrypted under each capsule's content key, itself wrapped under the master key (`wrapCapsuleKeyForOwner`). Recovering the master key recovers every owned capsule's content key uniformly, in one step.
- **Decrypt replies?** Yes, by the same mechanism — replies live inside the same encrypted capsule structure (not independently keyed, per everything read in `@tc/crypto`; no separate reply-key concept exists in the package).
- **Decrypt media?** Yes — media is encrypted with the same per-capsule content key (`AES-256-GCM`, chunked streaming per `aes.ts`), not a separate key hierarchy.
- **Continue creating capsules?** Yes, unconditionally — new capsules generate a fresh content key wrapped under whatever the *current* master key is (unaffected by past recovery events).
- **Seal new capsules?** Yes — sealing has no separate crypto dependency beyond the capsule's own already-resolved content key.
- **Access received capsules?** Yes, and this was **already independent of the master key before this spike** — the recipient link's key travels in the URL fragment (`#k=...`), never depends on the owner's master key at all. Recovery has zero effect on received-capsule access either way.
- **Use Place Memory?** Yes — nothing in `@tc/crypto` suggests Place Memory (an enclosure type) has a distinct key hierarchy; it's encrypted the same as any other enclosure, under the capsule's content key.
- **Guest/account-claim encrypted data?** Yes, and also independent — `claimGhostRecipients` (`apps/api/src/modules/auth/ghost-claim.ts`) only re-links a `capsuleRecipients` row's `userId`; it performs no crypto operation at all, since a claimed guest recipient still decrypts via the recipient-link key, not the newly-created account's master key.

**Conclusion**: there is exactly one root of trust (the master key) for all *owned* content, and zero dependency on it for *received* content. Recovery either restores everything owned, or (if the code is also lost) restores nothing owned — there is no partial-recovery or per-feature exception anywhere in this architecture.

## 16. Recovery UX

Minimum flow, consistent with the existing Meridian register already established by `RecoveryKit.tsx`'s own comments (record/paper register, "the one genuinely unfamiliar concept, and the one place where confusion is unrecoverable") and `MasterKeyGate`'s existing dialog pattern:

- **Where it starts**: the existing `/reset?token=...` screen, alongside (not replacing) the current "set a new password" form — an added "Have your recovery code?" disclosure, matching how `MasterKeyGate`/`RecoveryKit` already present optional/advanced paths without cluttering the primary one.
- **Screens**: (1) existing forgot-password email-request screen, unchanged; (2) existing reset-token screen, extended with the recovery-code disclosure; (3) a recovery-code entry field (plain text input, matching the existing dash-grouped Crockford base32 format `parseRecoveryCode` already expects); (4) the same "set new password" field already present; (5) a success confirmation, reusing the existing post-`RecoveryKit`-nag "Continue" pattern rather than inventing a new one.
- **Necessary warnings**: state plainly, in the same voice `RecoveryKit.tsx` already uses, that submitting a *wrong* recovery code will not silently corrupt anything (it throws, safely) but that this is the *last* resort before an account starts fresh with no historical access — matching the existing signup-time warning's register, not a new tone.
- **When entered**: after the reset token is confirmed valid (so a wrong recovery code doesn't need to also re-validate a token), before the new password is submitted.
- **When new password is chosen**: same screen or an immediately-following step, submitted together with the freshly-derived `masterKeyWrap` in one request (§5).
- **Confirmation of success**: a distinct, calm confirmation state (not just a redirect to login) — this is the one moment the user should be told plainly "your capsules are back," matching the seriousness `RecoveryKit`'s own comments assign to this feature ("the one place where confusion is unrecoverable" cuts both ways — success should be equally unambiguous).
- **Should the recovery code ever be displayed again?** No — this spike found no existing mechanism to redisplay it (by design, since the server never has the plaintext to redisplay), and inventing one would contradict the zero-access architecture. This is a hard "no," not an open question.
- **Leaving halfway through**: not resolved by existing precedent (no current flow has this many steps). `[OPEN DECISION]` — flagged in §21, not decided here; the reset token's own existing 1-hour expiry already bounds how long a half-finished attempt can be resumed before needing to restart from the email link.

## 17. Recovery code storage / presentation

Checked directly against `RecoveryKit.tsx` and its two call sites (signup, Settings' `setInitialPassword`):

- **Displays the code once?** Yes — both call sites show it exactly once, gated behind a mandatory "I've saved this" checkbox before "Continue" is even enabled. `[VERIFIED]`
- **Lets the user download it?** **No** — no download affordance exists anywhere in `RecoveryKit.tsx`. `[VERIFIED, missing]`
- **Lets the user copy it?** Yes — "Copy to clipboard" button, `navigator.clipboard.writeText`. `[VERIFIED]`
- **Lets the user regenerate it?** No — confirmed absent (§10). `[VERIFIED, missing]`
- **Warns that losing it means permanent loss?** Yes, explicitly, in both call sites' surrounding copy ("we can't recover your account if you lose both your password and this code... Save it somewhere safe"). `[VERIFIED]`

**What's missing, exactly**: a download option (mentioned as a plausible "print and file" affordance in the component's own doc-comment, but never built) and any regeneration capability. Neither is required to fix the forgot-password dead end (§5) — both are independent, smaller product decisions.

## 18. API/schema decision

**B. Existing backend changes required.** (Not A — a real gap exists. Not C — no new endpoint is required, though one remains a valid alternative design, ranked below. Not D — no schema change is needed, both columns already exist. Not E — B alone is sufficient.)

Two concrete, independently-shippable changes, both extending existing contracts rather than inventing new ones:

1. **Extend `ResetPasswordRequestSchema`** with an optional `masterKeyWrap: z.string().min(1).optional()`, and extend `resetPassword`'s service function to include it in the same `db.update` call when present — directly mirroring `changePassword`'s already-proven pattern. This is the minimal change.
2. **Expose `recoveryKeyWrap` to the client for a *valid, unconsumed* reset token only** — not on `/me` (which would leak it to any authenticated session, an unnecessary widening of exposure for a value that's only ever needed during a lost-password flow) but scoped to the reset-token verification step itself. Two viable designs, ranked:
   - **(Ranked #1) Extend the existing reset-token verification implicitly**: have the `/reset?token=...` page's initial load (or a new lightweight `GET /auth/password/reset/:token` style lookup, gated by the same token/rate-limit already protecting `resetPassword`) return `{recoveryKeyWrap}` alongside whatever the token confirms. This keeps the recovery-code capability strictly scoped to someone who already possesses a just-issued, single-use, time-boxed reset token — a meaningfully narrower exposure surface than any account-wide endpoint, and reuses the existing token as the sole gate rather than inventing a second one.
   - **(Ranked #2) A dedicated new endpoint** (e.g. `POST /auth/password/recover` or similar) accepting `{token}` and returning `{recoveryKeyWrap}`, kept fully separate from `resetPassword` itself. Equally valid architecturally, but adds one more route/rate-limit surface for no clear benefit over #1 — recommended only if the team prefers keeping "read recovery material" and "consume the reset token" as strictly separate concerns for some other operational reason (e.g., audit-logging granularity) not evident from this spike.

Recommendation: **#1**, as the smaller, equally-safe change.

## 19. Acceptance tests

Concrete, ready to become tickets — none implemented by this spike:

1. **Password change**: given a logged-in user with a known password, `changePassword({currentPassword, newPassword, masterKeyWrap})` succeeds; the *same* master key unwraps under the new password; every other session is revoked; the current session survives.
2. **Recovery (web, happy path)**: given a user with a saved recovery code, `forgotPassword` → email link → `resetPassword({token, newPassword, masterKeyWrap})` (once §5/§18 ship) succeeds; the same master key (byte-identical to before) unwraps under the new password.
3. **Mobile recovery (once mobile auth exists)**: same crypto assertions as #2, executed via `@tc/crypto` calls from the mobile app, no divergence in output from the web path given identical inputs.
4. **Device replacement, code available**: new device, no SecureStore data, user supplies password → normal login succeeds, `masterKeyWrap` fetched fresh from server, capsules readable.
5. **Device replacement, password forgotten, code available**: new device → recovery flow (#2/#3) → capsules readable.
6. **Device replacement, code unavailable**: new device, password forgotten, no code → `resetPassword` without `masterKeyWrap` present succeeds at the *account* level (new password set, login works) but the *master key* remains permanently unrecoverable — assert that a fresh master key generated post-reset does **not** decrypt any pre-existing capsule content (proving the "permanent loss" consequence is real and enforced by the crypto, not just documented).
7. **Android reinstall**: store a synthetic protected item, uninstall, reinstall, assert `getItemAsync` returns `null` (already proven generically in E0.3; this ticket narrows it to the actual production key names once E1/E2 defines them).
8. **iOS reinstall**: same, assert the item **survives** (already proven generically in E0.3) — this test exists specifically to catch a regression if a future Keychain configuration change (e.g., an explicit `kSecAttrAccessibleWhenPasswordSetThisDeviceOnly` choice) accidentally changes this behavior.
9. **Biometric invalidation**: on Android, force credential clear (as in E0.3), assert the app's own "enrolled" flag (§7) plus a `null` protected read together produce the "re-enroll" UI state, not a generic empty one. On iOS: `[BLOCKED pending physical device]`, per E0.3 §17.
10. **Invalid recovery code**: `restoreMasterKeyFromRecoveryCode` with a syntactically-valid but wrong code throws; the UI surfaces a specific, calm error, not a crash or silent no-op.
11. **Successful restoration**: end-to-end, assert the master key recovered via the code is byte-identical to the one originally wrapped under the password at signup (provable via a fixed test vector, following the same pattern as `packages/crypto/test-vectors/`).
12. **Historical capsule decryption post-recovery**: seal a capsule, simulate password loss + recovery, assert the same capsule's content doc, replies, and media all still decrypt correctly under the recovered-and-rewrapped master key.

## 20. Recommended Recovery Architecture

1. **Authoritative key**: one random 256-bit AES master key per user, generated once (signup or first-password-set), never rotated — only ever re-wrapped. Unchanged from today.
2. **Password wrapping**: Argon2id(password, salt) → AES-GCM wrap, exactly `wrapMasterKeyWithPassword`/`unwrapMasterKeyWithPassword` as they exist today. No change.
3. **Recovery wrapping**: HKDF-SHA256(recoveryCode, salt) → AES-GCM wrap, exactly `wrapMasterKeyWithRecoveryCode`/`restoreMasterKeyFromRecoveryCode` as they exist today. No change, and — critically — no new primitive needed; this spike deliberately did not invent one.
4. **Device/biometric wrapping (mobile only)**: a third, independent wrap — a random device-bound AES key (never password- or recovery-derived), itself gated by `expo-secure-store`'s `requireAuthentication: true`, wrapping the already-in-memory master key with the existing zero-salt key-to-key `wrapKey` pattern `capsule-key.ts` already establishes. Purely additive; never a fourth cryptographic authority in the sense the founder decisions already warn against — it wraps the *same* master key, nothing new is derivable from it alone.
5. **Server responsibility**: store and return `masterKeyWrap` and `recoveryKeyWrap` as opaque ciphertext; verify passwords and reset tokens; never derive, store, or transmit the plaintext master key, password, or recovery code. Additively: accept an optional `masterKeyWrap` on password reset (§18), and expose `recoveryKeyWrap` scoped to a valid, unconsumed reset token (§18).
6. **Client responsibility**: all key generation, wrapping, and unwrapping (`@tc/crypto`, shared verbatim between web and mobile); all SecureStore/Keychain interaction (mobile-only, app-layer); every screen/state-machine decision.
7. **Recovery flow**: exactly as specified in §5 — forgot-password token confirms identity, recovery code (if supplied and correct) restores the master key locally, new password re-wraps it, both new wrap and new password hash are sent to the server together in one request, mirroring `changePassword`'s already-correct shape.
8. **Password-change flow**: unchanged — already correctly implemented (`changePassword`), serves as the reference pattern for fixing recovery.
9. **Device-replacement flow**: an ordinary login on the new device is sufficient when the password is known; falls to the recovery flow (§7) when it isn't; has no recourse when neither the password nor the recovery code is available, by explicit, pre-existing, accepted product design — not a gap this spike introduces or should close.
10. **Biometric-invalidation flow**: SecureStore returns `null` for both "never enrolled" and "invalidated" (E0.3); the app must track its own "enrolled" flag to tell the two apart and prompt re-enrollment specifically, then fall through to password, then to recovery — never a dead end, per Decision 12.
11. **If the recovery code is lost**: the account remains accessible (password reset still works for login), but every capsule encrypted under the now-permanently-unrecoverable master key is lost forever, by explicit existing design — this spike did not invent this consequence and does not recommend softening it, since doing so would require a server-side escape hatch the entire zero-access architecture is built to not have.
12. **Backend/schema changes required?** Yes, but minimal and additive: one optional field on one existing request schema, one additional line in one existing service function, and one scoped read of an already-existing column during an already-existing token-verification step. **No schema migration, no new table, no new cryptographic primitive.**
13. **What must be implemented before mobile login/recovery can ship**: (a) §18's two backend changes (shared prerequisite for both web's fix and mobile's from-scratch build); (b) `apps/mobile`'s own auth/session/master-key context, which does not exist yet at all (out of scope for this spike, in scope for E1); (c) the SecureStore two-item model from E0.3 §13, wired to real production key names; (d) physical-device confirmation of iOS biometric invalidation (E0.3 §17) before *shipping* — but this specifically gates the biometric convenience feature, not password/recovery-based login, which can ship independently and first.

## 21. Open decisions

Genuinely new items surfaced here, marked `[OPEN DECISION]`, none resolved by this spike:

1. Whether `resetPassword`'s extension (§18) is built as an implicit part of the existing reset-token verification step, or as a fully separate endpoint (§18 ranks a recommendation; does not decide).
2. Whether recovery-code rotation should exist at all, and if so, whether a password change should also silently rotate it (today it doesn't) — a real product/security tradeoff (convenience vs. an ever-more-stale, unrotated high-value secret) not addressed by any existing founder decision.
3. Whether a recovery code should become single-use once exercised (today it's implicitly infinite-use, since it's a wrap, not a token) — tightening this would need a new consumption-tracking mechanism (potentially resurrecting some form of the currently-dead `recovery_codes` table's own idea, or a simpler `usedAt` column added directly to `users`), a real design choice, not decided here.
4. Whether abandoning the recovery flow halfway through needs its own explicit resumable state, or whether the existing 1-hour token expiry is judged sufficient (§16's last point).
5. Whether the iOS Keychain-survives-reinstall behavior, combined with however session tokens end up stored on mobile, should be treated as "still logged in" or forced to a fresh login after any reinstall (§9) — a deliberate product call, not a technical necessity either way.
6. Whether to add a "download recovery code" affordance (§17) — independent of the recovery-flow fix, not required to close this spike's core gap.
7. Whether web should receive the forgot-password fix (§5/§18) in the same pass as mobile, or mobile-first with web's gap left open a while longer — this exact question is already listed as unresolved in blueprint §25 open decision #8, and remains unresolved here too, deliberately, since it is a scheduling call this spike has no authority to make.

## 22. Exact implementation dependencies

- E1/E2 mobile auth work depends on §18's backend changes existing (or being built alongside, as a shared PR) — mobile's own recovery UI has nothing to call without them.
- E1/E2 mobile auth work does **not** depend on E0.2's iOS Universal Link item or E0.3's iOS biometric-invalidation item — those gate deep-linking and the biometric convenience layer specifically, not password/recovery-based login, which can be built and shipped first.
- The SecureStore two-item model (E0.3 §13) is a direct input to whatever mobile module implements §6/§7 of this report — no re-derivation needed, it's already fully specified.
- Nothing here depends on any other pending Phase-0 spike — this was explicitly the last hardware-independent one.

## 23. Phase-0 status update

| Spike | Verdict |
|---|---|
| E0.1 — Native Argon2id compatibility | PASS |
| E0.4 — Navigation foundation | PASS |
| E0.2 — Deep-link fragment survival | PARTIAL (iOS physical-device item open) |
| E0.3 — SecureStore behavior | PASS (iOS physical-device item open) |
| **E0.5 — Recovery flow design** | **PASS** — architecture fully specified, gap precisely located, no ambiguity left for E1/E2 to guess at |

All hardware-independent Phase-0 spikes are now complete. The two remaining open items (iOS Universal Link delivery, iOS biometric-enrollment invalidation) both require a physical iOS device and both gate specific, separable features (deep-linked reveal; biometric convenience unlock) rather than the core login/recovery/navigation work this Phase-0 sequence was chartered to de-risk.
