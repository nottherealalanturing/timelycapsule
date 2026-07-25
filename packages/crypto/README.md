# @tc/crypto

Zero-access encryption primitives for TimelyCapsule (plan/06-FEATURE-ADDENDUM.md §A,
plan/03-ARCHITECTURE.md §8). This package runs **client-side only** — web (browser
WebCrypto) and, once mobile crypto work starts, React Native (`react-native-quick-crypto`
or an equivalent WebCrypto polyfill). The API surface is plain `Uint8Array` in/out
specifically so it doesn't assume Node, the DOM, or any one platform's buffer type.

**The backend never imports this package and never sees plaintext capsule content,
capsule keys, master keys, passphrases, or recovery codes.** If a future change makes
that not true, it is a regression of the product's core security promise — stop and
reconsider.

## What's in here

| Concept | File | Purpose |
|---|---|---|
| Capsule key | `capsule-key.ts` | One random AES-256 key per capsule; encrypts the content doc + every file. |
| Owner wrap | `capsule-key.ts` | Capsule key wrapped under the owner's master key — lets the owner reopen their own capsules from any device. |
| Passphrase wrap | `capsule-key.ts` | Capsule key wrapped under Argon2id(passphrase) — the Passphrase Seal unlock condition. |
| Link fragment | `capsule-key.ts` | Capsule key placed directly in the recipient link's URL fragment (`#k=…`) — never sent to any server. |
| Master key | `master-key.ts` | One per user, generated at signup, wrapped under Argon2id(password); re-wrapped (not rotated) on password change. |
| Recovery kit | `recovery-kit.ts` | A printable code that re-derives the master key without the password. |
| AES-GCM | `aes.ts` | Single-shot (`encryptBytes`/`decryptBytes`) for small payloads, chunked streaming (`encryptStream`/`decryptStream`) for large files. |
| KDFs | `kdf.ts` | Argon2id (low-entropy secrets: passwords, passphrases) and HKDF-SHA256 (high-entropy secrets: the recovery code). |

## Threat notes

1. **Server compromise / insider access discloses nothing about content.** The server
   only ever holds ciphertext, wrapped keys, and plaintext *envelope* metadata (title,
   cover, dates — per product requirement, not a limitation of this package). This is
   the core mitigation for plan/03-ARCHITECTURE.md §17 threat #1 ("early content
   disclosure"). This package's job is to make that structurally true, not just policy.

2. **Residual risk shifts entirely to client code integrity.** If the JS/RN bundle
   serving this package is compromised (malicious build, compromised CDN, supply-chain
   attack on a dependency), the attacker can exfiltrate keys as they're used, regardless
   of how sound the cryptography is. Mitigation is out of this package's scope (SRI,
   signed releases, dependency pinning) but is load-bearing for the guarantee above to
   mean anything.

3. **Password loss + recovery-kit loss is unrecoverable by design, including by us.**
   There is no server-side escape hatch for the master key. This is the plan's explicit,
   accepted tradeoff (06-FEATURE-ADDENDUM.md §A) — don't build one later without
   revisiting this document and the product decision behind it.

4. **The recipient link fragment *is* the security boundary for shared capsules**, not
   an extra layer on top of one. Browsers never send URL fragments in requests, so the
   capsule key travels only from sender to recipient, never through TimelyCapsule's own
   servers. Consequences: (a) if a recipient forwards their link, they've forwarded the
   key — this is inherent to the design, not a bug, and is why sender-triggered link
   rotation exists (plan/03-ARCHITECTURE.md §17 threat #2); (b) **never add any code path
   that sends fragment contents to a server** (analytics, error reporting, logging) — it
   would silently break the zero-access guarantee for every affected capsule.

5. **Chunked streaming (`encryptStream`/`decryptStream`) authenticates each chunk's
   position *and* stream completeness.** Each chunk's AAD binds both its index (stops
   reordering/swapping within a stream) and an `isFinal` bit (stops truncation): both
   sides use a one-chunk lookahead to know whether the chunk they're about to
   encrypt/decrypt is the last one. If a transport drops the true final chunk(s), the
   chunk that arrives last on the decrypt side was originally encrypted with
   `isFinal=false` — decrypting it as if it *were* final (because nothing else arrived)
   fails GCM authentication, surfacing truncation as a thrown error rather than silently
   short plaintext. See `chunkAad` in `aes.ts` and the "detects a truncated stream" test
   in `aes.test.ts`.

6. **Argon2id parameters here are independently tuned from `apps/api`'s.** The backend's
   Argon2id use (hashing login passwords, via the native `argon2` npm package) is a
   different threat model — server-side, timing matters for request latency — from this
   package's client-side key-wrapping use (memory: 64 MiB, iterations: 3, parallelism: 1;
   see `constants.ts`). Do not assume the two share params, code paths, or a swap of one
   implies the other should change.

7. **Argon2id via `hash-wasm` (WASM) is the current choice for portability** across web
   and RN in one implementation. If RN mobile crypto work later finds this too slow on
   real devices, the fix is swapping the *implementation* behind `kdf.ts`'s exported
   function signatures (e.g. to a native RN Argon2 module) — every caller in this package
   goes through that one function, so the swap is contained.

## Audit readiness

- All cryptographic primitives are standard, unmodified constructions: AES-256-GCM
  (WebCrypto's native implementation, not hand-rolled), Argon2id (`hash-wasm`'s
  implementation), HKDF-SHA256 (WebCrypto's native implementation). This package adds no
  custom cipher or novel construction — only key-wrapping/envelope logic on top of them.
- `test-vectors/v1.json` (generated by `scripts/generate-test-vectors.mjs`) is fixed,
  checked-in input/output pairs for AES-256-GCM — the same file a future RN test suite
  should consume to prove cross-platform byte-for-byte interop, not just internal
  self-consistency. Regenerate only on a deliberate framing change.
- Every wrap/unwrap round-trip (owner, passphrase, recovery code, password) has a test
  proving the *correct* secret recovers the key and the *wrong* secret throws (relies on
  AES-GCM's authentication tag — a bit-flipped ciphertext or wrong key never silently
  returns wrong plaintext, it throws).
- No key material is ever logged: this package has no logging dependency at all, by
  design — grep for `console` here should always come back empty outside of dev scripts.
- Third-party audit of this package specifically is called out in
  plan/03-ARCHITECTURE.md §17 as a mitigation for content-disclosure risk, contingent on
  affordability — nothing here should assume that audit has happened yet.
