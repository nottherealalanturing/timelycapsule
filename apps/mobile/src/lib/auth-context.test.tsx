import { generateMasterKey, wrapMasterKeyWithPassword } from '@tc/crypto';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// react-native's package.json "main" resolves to Flow-typed source (Metro
// strips Flow via babel; vitest's plain esbuild/rollup pipeline can't parse
// it) — needed here only because api-client.ts's real module (loaded below
// via vi.importActual, to keep its real ApiClientError class) imports
// `Platform` from it.
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const secureStore = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => secureStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStore.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secureStore.delete(key);
  }),
}));

const login = vi.fn();
const logout = vi.fn();
const getMe = vi.fn();
vi.mock('./api-client', async () => {
  const actual = await vi.importActual<typeof import('./api-client')>('./api-client');
  return { ...actual, authApi: { login, logout, getMe } };
});

const { AuthProvider, useAuth } = await import('./auth-context');
const { MasterKeyProvider, useMasterKey } = await import('./master-key-context');
const { getTokens } = await import('./token-store');

function Harness({ onReady }: { onReady: (v: ReturnType<typeof useAuth> & { masterKey: Uint8Array | null }) => void }) {
  const auth = useAuth();
  const { masterKey } = useMasterKey();
  onReady({ ...auth, masterKey });
  return null;
}

type Handle = ReturnType<typeof useAuth> & { masterKey: Uint8Array | null };

async function render() {
  let latest!: Handle;
  await act(async () => {
    TestRenderer.create(
      <MasterKeyProvider>
        <AuthProvider>
          <Harness onReady={(v) => (latest = v)} />
        </AuthProvider>
      </MasterKeyProvider>,
    );
  });
  return {
    get current() {
      return latest;
    },
    act: async (fn: () => unknown) => {
      await act(async () => {
        await fn();
      });
    },
  };
}

const user = {
  id: '00000000-0000-0000-0000-000000000000',
  email: 'a@example.com',
  pendingEmail: null,
  displayName: 'A',
  handle: null,
  avatarKey: null,
  birthday: null,
  timezone: 'UTC',
  locale: 'en',
  status: 'active' as const,
  emailVerifiedAt: null,
  masterKeyWrap: null as string | null,
  createdAt: new Date().toISOString(),
};

describe('auth-context.tsx', () => {
  beforeEach(() => {
    secureStore.clear();
    login.mockReset();
    logout.mockReset();
    getMe.mockReset();
  });

  it('hydrates to unauthenticated when no tokens are stored', async () => {
    const h = await render();
    expect(h.current.authState).toBe('unauthenticated');
    expect(h.current.user).toBeNull();
  });

  it('hydrates to authenticated when valid tokens are stored and getMe succeeds', async () => {
    secureStore.set('tc_access_token', 'a1');
    secureStore.set('tc_refresh_token', 'r1');
    getMe.mockResolvedValue({ user });
    const h = await render();
    expect(h.current.authState).toBe('authenticated');
    expect(h.current.user).toEqual(user);
  });

  it('treats an invalid/expired session as logged out and clears tokens', async () => {
    secureStore.set('tc_access_token', 'a1');
    secureStore.set('tc_refresh_token', 'r1');
    getMe.mockRejectedValue(new Error('401'));
    const h = await render();
    expect(h.current.authState).toBe('unauthenticated');
    expect(await getTokens()).toBeNull();
  });

  it('login success stores tokens, sets user and authenticated state', async () => {
    login.mockResolvedValue({ user, tokens: { accessToken: 'a2', refreshToken: 'r2', expiresIn: 3600 } });
    const h = await render();
    await h.act(() => h.current.login({ email: user.email, password: 'pw' }));
    expect(h.current.authState).toBe('authenticated');
    expect(h.current.user).toEqual(user);
    expect(await getTokens()).toEqual({ accessToken: 'a2', refreshToken: 'r2' });
  });

  it('login propagates invalid-credentials errors and leaves state unauthenticated', async () => {
    login.mockRejectedValue(new Error('invalid credentials'));
    const h = await render();
    await expect(h.current.login({ email: user.email, password: 'wrong' })).rejects.toThrow();
    expect(h.current.authState).toBe('unauthenticated');
    expect(await getTokens()).toBeNull();
  });

  it('login unwraps the master key inline when masterKeyWrap is present', async () => {
    const key = generateMasterKey();
    const wrap = await wrapMasterKeyWithPassword(key, 'pw');
    login.mockResolvedValue({
      user: { ...user, masterKeyWrap: wrap },
      tokens: { accessToken: 'a3', refreshToken: 'r3', expiresIn: 3600 },
    });
    const h = await render();
    await h.act(() => h.current.login({ email: user.email, password: 'pw' }));
    expect(h.current.masterKey).toEqual(key);
  });

  it('login clears the master key if the unwrap fails (wrong password despite auth succeeding)', async () => {
    const key = generateMasterKey();
    const wrap = await wrapMasterKeyWithPassword(key, 'actual-password');
    login.mockResolvedValue({
      user: { ...user, masterKeyWrap: wrap },
      tokens: { accessToken: 'a4', refreshToken: 'r4', expiresIn: 3600 },
    });
    const h = await render();
    await h.act(() => h.current.login({ email: user.email, password: 'different-password-sent-to-unwrap' }));
    expect(h.current.authState).toBe('authenticated');
    expect(h.current.masterKey).toBeNull();
  });

  it('logout clears tokens, user, master key, and sets unauthenticated', async () => {
    login.mockResolvedValue({ user, tokens: { accessToken: 'a5', refreshToken: 'r5', expiresIn: 3600 } });
    logout.mockResolvedValue(undefined);
    const h = await render();
    await h.act(() => h.current.login({ email: user.email, password: 'pw' }));
    await h.act(() => h.current.logout());
    expect(h.current.authState).toBe('unauthenticated');
    expect(h.current.user).toBeNull();
    expect(h.current.masterKey).toBeNull();
    expect(await getTokens()).toBeNull();
  });

  it('logout clears local state even if the server call fails (network error)', async () => {
    login.mockResolvedValue({ user, tokens: { accessToken: 'a6', refreshToken: 'r6', expiresIn: 3600 } });
    logout.mockRejectedValue(new Error('network error'));
    const h = await render();
    await h.act(() => h.current.login({ email: user.email, password: 'pw' }));
    await h.act(() => h.current.logout());
    expect(h.current.authState).toBe('unauthenticated');
    expect(await getTokens()).toBeNull();
  });
});
