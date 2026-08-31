import { fromBase64Url } from '@tc/crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `expo-secure-store` cannot be imported under plain Node (confirmed
 * directly, same reason as token-store.test.ts) — mocked with an in-memory
 * fake, same pattern as that file.
 */
const store = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    store.delete(key);
  }),
}));

const { getLocalDraftKey, _resetLocalDraftKeyCacheForTests } = await import('./local-draft-key');

describe('local-draft-key.ts', () => {
  beforeEach(() => {
    store.clear();
    _resetLocalDraftKeyCacheForTests();
  });

  it('generates a real 256-bit key on first use', async () => {
    const key = await getLocalDraftKey();
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  it('persists the generated key to SecureStore', async () => {
    const key = await getLocalDraftKey();
    const stored = store.get('tc_local_draft_key');
    expect(stored).toBeDefined();
    expect(fromBase64Url(stored!)).toEqual(key);
  });

  it('returns the exact same key on a second call (in-memory memoization, no second SecureStore write)', async () => {
    const SecureStore = await import('expo-secure-store');
    const first = await getLocalDraftKey();
    const writesAfterFirst = vi.mocked(SecureStore.setItemAsync).mock.calls.length;
    const second = await getLocalDraftKey();
    expect(second).toEqual(first);
    expect(vi.mocked(SecureStore.setItemAsync).mock.calls.length).toBe(writesAfterFirst);
  });

  it('loads the existing key from SecureStore rather than generating a new one, simulating an app restart', async () => {
    const first = await getLocalDraftKey();
    _resetLocalDraftKeyCacheForTests(); // drop the in-memory cache only — SecureStore (the map) keeps the value, like a real relaunch
    const second = await getLocalDraftKey();
    expect(second).toEqual(first);
  });

  it('two concurrent first-callers never generate two different keys (no lost-update race)', async () => {
    const SecureStore = await import('expo-secure-store');
    const before = vi.mocked(SecureStore.setItemAsync).mock.calls.length;
    const [a, b] = await Promise.all([getLocalDraftKey(), getLocalDraftKey()]);
    expect(a).toEqual(b);
    expect(vi.mocked(SecureStore.setItemAsync).mock.calls.length - before).toBe(1);
  });

  it('never logs the key material', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await getLocalDraftKey();
      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
