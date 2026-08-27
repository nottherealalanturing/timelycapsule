import type { User } from '@tc/contracts';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiClientError, authApi } from './api-client';
import { useMasterKey } from './master-key-context';
import { clearTokens, getTokens, setTokens } from './token-store';

/**
 * Mobile port of apps/web/src/lib/auth-context.tsx's login/logout/hydration
 * logic. Two real differences from web, both forced by the platform:
 *
 *  1. Three explicit hydration states (`unknown`/`authenticated`/
 *     `unauthenticated`) instead of web's `hasTokens: boolean | null` +
 *     react-query `isLoading` combo — there's no react-query here, and an
 *     explicit enum reads clearer than reusing web's two-flag scheme for
 *     the same three real states.
 *  2. `getTokens()`/`setTokens()`/`clearTokens()` are async (SecureStore),
 *     not sync (localStorage) — every call site here awaits them; the
 *     hydration effect below is the mobile equivalent of web's
 *     `setTimeout(() => setHasTokens(...), 0)` deferral, needed here only
 *     because the SecureStore read itself is genuinely async, not to dodge
 *     a setState-in-effect lint rule.
 *
 * Login still does inline master-key unwrap right after authentication,
 * exactly like web (see auth-context.tsx:136-155 on web) — confirmed by
 * reading web's actual implementation, not assumed. A wrong password would
 * already have failed authApi.login() itself; if the unwrap after a
 * *successful* login still fails (e.g. a corrupted wrap), login proceeds
 * anyway and clearMasterKey() runs — same behavior as web.
 */
export type AuthState = 'unknown' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  authState: AuthState;
  user: User | null;
  login: (input: { email: string; password: string }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>('unknown');
  const [user, setUser] = useState<User | null>(null);
  const { clearMasterKey, unlockWithPassword } = useMasterKey();
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    (async () => {
      const tokens = await getTokens();
      if (!tokens) {
        setAuthState('unauthenticated');
        return;
      }
      try {
        const { user: me } = await authApi.getMe();
        setUser(me);
        setAuthState('authenticated');
      } catch {
        // Session tokens present but no longer valid (expired refresh
        // token, revoked session, server-side logout elsewhere) — same
        // "clear and treat as logged out" behavior as web's getMe failure
        // handler.
        await clearTokens();
        setAuthState('unauthenticated');
      }
    })();
  }, []);

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      const { user: loggedInUser, tokens } = await authApi.login(input);
      await setTokens(tokens);
      setUser(loggedInUser);
      setAuthState('authenticated');
      if (loggedInUser.masterKeyWrap) {
        try {
          await unlockWithPassword(loggedInUser.masterKeyWrap, input.password);
        } catch {
          clearMasterKey();
        }
      }
      return loggedInUser;
    },
    [unlockWithPassword, clearMasterKey],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Server-side logout failing (network, already-expired token) must
      // not block clearing local state — a stuck "still logged in" client
      // is worse than a session that lingers server-side until it expires
      // naturally. Matches web's try/finally.
    } finally {
      await clearTokens();
      setUser(null);
      clearMasterKey();
      setAuthState('unauthenticated');
    }
  }, [clearMasterKey]);

  const refreshUser = useCallback(async () => {
    try {
      const { user: me } = await authApi.getMe();
      setUser(me);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        await clearTokens();
        setUser(null);
        clearMasterKey();
        setAuthState('unauthenticated');
      }
    }
  }, [clearMasterKey]);

  return (
    <AuthContext.Provider value={{ authState, user, login, logout, refreshUser }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
