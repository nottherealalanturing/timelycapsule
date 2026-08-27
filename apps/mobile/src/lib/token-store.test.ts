import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `expo-secure-store` cannot even be imported under plain Node — confirmed
 * directly (`Cannot find module '.../build/ExpoSecureStore'`), not
 * assumed — because it's a native Expo module with no JS-only fallback.
 * vi.mock intercepts the import before Node ever tries to load the real
 * module, so this file exercises token-store.ts's actual get/set/clear
 * logic against an in-memory fake store, not the real Keychain/Keystore
 * (that's on-device-only evidence — see the E1.2 report).
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

const { clearTokens, getTokens, setTokens } = await import('./token-store');

describe('token-store.ts', () => {
  beforeEach(() => {
    store.clear();
  });

  it('returns null when no tokens have been set', async () => {
    expect(await getTokens()).toBeNull();
  });

  it('returns null when only one of the two tokens is present', async () => {
    store.set('tc_access_token', 'access-only');
    expect(await getTokens()).toBeNull();
  });

  it('round-trips a full token pair', async () => {
    await setTokens({ accessToken: 'a1', refreshToken: 'r1' });
    expect(await getTokens()).toEqual({ accessToken: 'a1', refreshToken: 'r1' });
  });

  it('overwrites a previously stored pair', async () => {
    await setTokens({ accessToken: 'a1', refreshToken: 'r1' });
    await setTokens({ accessToken: 'a2', refreshToken: 'r2' });
    expect(await getTokens()).toEqual({ accessToken: 'a2', refreshToken: 'r2' });
  });

  it('clears both values', async () => {
    await setTokens({ accessToken: 'a1', refreshToken: 'r1' });
    await clearTokens();
    expect(await getTokens()).toBeNull();
  });
});
