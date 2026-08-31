import { fromBase64Url, generateAesKey, toBase64Url } from '@tc/crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * The device-local draft-encryption key (E1.4.4), per the readiness audit's
 * §9 and the implementation blueprint's §6.3 — deliberately **independent
 * of the master key**. A draft typed while offline, before the day's first
 * unlock (cold app start, no network yet to validate a session against),
 * still needs something to encrypt under; the master key only exists in
 * memory after a real unlock, which may not have happened yet at that
 * moment. This key exists from first app use, is device-scoped (not
 * account-scoped — see `deleteAllLocalDraftsForAccount` in
 * `local-draft-store.ts` for why it is never deleted on logout), and is
 * held in `expo-secure-store` **without** `requireAuthentication` —
 * matching `token-store.ts`'s own precedent. This is a deliberately lower
 * bar than the master key: it protects the local SQLite file against
 * "someone reads it off a stolen/backed-up device," not against the app's
 * own runtime, which already has both this key and any content it protects
 * in memory whenever Compose is open.
 *
 * Reuses `@tc/crypto`'s existing `generateAesKey` (the same primitive
 * `generateCapsuleKey`/`generateMasterKey` are built on) — no new
 * cryptographic primitive, no new KDF, no Argon2id involvement (this key is
 * never derived from a password).
 */
const STORAGE_KEY = 'tc_local_draft_key';

let cached: Uint8Array | null = null;
let pending: Promise<Uint8Array> | null = null;

async function loadOrCreate(): Promise<Uint8Array> {
  const existing = await SecureStore.getItemAsync(STORAGE_KEY);
  if (existing) return fromBase64Url(existing);

  const key = generateAesKey();
  await SecureStore.setItemAsync(STORAGE_KEY, toBase64Url(key));
  return key;
}

/**
 * Get-or-create, memoized both in-memory (avoids a SecureStore round-trip
 * on every keystroke's local save) and against concurrent first-callers
 * (two overlapping calls before either has resolved must not each generate
 * and write a *different* key, which would silently strand whichever draft
 * was encrypted under the one that lost the race).
 */
export async function getLocalDraftKey(): Promise<Uint8Array> {
  if (cached) return cached;
  if (!pending) {
    pending = loadOrCreate().then((key) => {
      cached = key;
      pending = null;
      return key;
    });
  }
  return pending;
}

/** Test-only: clears the in-memory memoization so a fresh SecureStore read/create happens next call. Never used by app code. */
export function _resetLocalDraftKeyCacheForTests(): void {
  cached = null;
  pending = null;
}
