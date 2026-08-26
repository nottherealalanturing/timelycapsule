'use client';

import type { User } from '@tc/contracts';
import {
  formatRecoveryCode,
  generateMasterKey,
  generateRecoveryCode,
  wrapMasterKeyWithPassword,
  wrapMasterKeyWithRecoveryCode,
} from '@tc/crypto';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { track } from './analytics';
import { authApi } from './api-client';
import { useMasterKey } from './master-key-context';
import { clearTokens, getTokens, setTokens } from './token-store';

const ME_QUERY_KEY = ['me'] as const;

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /**
   * Resolves with the one-time formatted recovery kit — the caller MUST
   * show it to the user before navigating away (06 §A "mandatory nag").
   * Also resolves with the raw master key so the caller can, when a guest
   * capsule is being claimed, re-wrap its on-device key under it (T-15b's
   * documented gap — see signup/page.tsx).
   */
  signup: (input: {
    email: string;
    password: string;
    displayName: string;
    guestToken?: string;
  }) => Promise<{ user: User; recoveryKit: string; masterKey: Uint8Array }>;
  login: (input: { email: string; password: string }) => Promise<User>;
  googleOAuth: (idToken: string, guestToken?: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // Three states, not two — `null` means "haven't checked localStorage yet."
  // Starts `null` unconditionally (matching what SSR always renders, since
  // there's no localStorage server-side) and only reads the real value
  // after mount. Reading it synchronously here (the original approach) was
  // true-or-false on the client's very first hydration pass for any already
  // -logged-in visitor but was always false during SSR — a guaranteed
  // hydration mismatch on every auth-aware component (MarketingNavAuth,
  // notably). React's recovery from that discards and re-renders the
  // entire document purely client-side, and a client-rendered <script> tag
  // never executes (React only runs inline scripts from real SSR HTML) —
  // so it was silently wiping whatever data-theme the pre-paint script in
  // layout.tsx had just set, on every authenticated marketing-page visit.
  //
  // `null` (not `false`) matters: an earlier version of this fix collapsed
  // straight to `false`, which made `loading` (below) resolve `false` too
  // before the deferred check below had even run — (app)/layout.tsx's route
  // guard reads `!loading && !user` to redirect to /login, so every
  // authenticated hard-reload bounced a genuinely logged-in visitor. `null`
  // keeps `loading` `true` until the real answer is known, same as it was
  // before this whole fix, while still starting identically on server and
  // client so hydration itself stays clean.
  const [hasTokens, setHasTokens] = useState<boolean | null>(null);
  useEffect(() => {
    // Deferred — an effect body must not call setState synchronously
    // (react-hooks/set-state-in-effect), the same pattern useCorrectedNow
    // and SealCeremony use for their own first tick/reset.
    const timer = setTimeout(() => setHasTokens(Boolean(getTokens())), 0);
    return () => clearTimeout(timer);
  }, []);
  const { setMasterKey, clearMasterKey, unlockWithPassword } = useMasterKey();

  const { data: user = null, isLoading } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      try {
        const { user: me } = await authApi.getMe();
        return me;
      } catch {
        clearTokens();
        return null;
      }
    },
    enabled: hasTokens === true,
    // No initialData: `hasTokens` now always starts false (see above) and
    // flips true post-mount, so seeding `null` here as "initial" data would
    // mark the query fresh (staleTime below) before `hasTokens` ever flips —
    // React Query would then never actually fetch once enabled turned true,
    // leaving a real logged-in visitor stuck looking logged-out. `data`
    // already defaults to `null` at the destructure above until a real
    // fetch resolves, so this was doing nothing `hasTokens &&` (loading,
    // below) didn't already cover.
    staleTime: 60_000,
    retry: false,
  });

  const setUser = useCallback(
    (nextUser: User | null) => {
      queryClient.setQueryData(ME_QUERY_KEY, nextUser);
    },
    [queryClient],
  );

  const refreshUser = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
  }, [queryClient]);

  const signup: AuthContextValue['signup'] = useCallback(
    async (input) => {
      // Generate + wrap the owner master key entirely client-side before it
      // ever reaches the server (06 §A) — the server only ever stores the
      // two resulting ciphertexts (masterKeyWrap/recoveryKeyWrap).
      const masterKey = generateMasterKey();
      const masterKeyWrap = await wrapMasterKeyWithPassword(masterKey, input.password);
      const recoveryCodeBytes = generateRecoveryCode();
      const recoveryKeyWrap = await wrapMasterKeyWithRecoveryCode(masterKey, recoveryCodeBytes);
      const recoveryKit = formatRecoveryCode(recoveryCodeBytes);

      const { user: newUser, tokens } = await authApi.signup({ ...input, masterKeyWrap, recoveryKeyWrap, guestToken: input.guestToken });
      setTokens(tokens);
      setUser(newUser);
      // Already unwrapped in memory from generation above — no need to
      // round-trip through unlockWithPassword.
      setMasterKey(masterKey);
      track('signup_completed');
      return { user: newUser, recoveryKit, masterKey };
    },
    [setUser, setMasterKey],
  );

  const login: AuthContextValue['login'] = useCallback(
    async (input) => {
      const { user: loggedInUser, tokens } = await authApi.login(input);
      setTokens(tokens);
      setUser(loggedInUser);
      if (loggedInUser.masterKeyWrap) {
        // A wrong password would already have failed authApi.login() above,
        // so this unwrap is expected to succeed; if it doesn't (e.g. a
        // corrupted wrap), login still proceeds — the composer's unlock
        // gate is what actually enforces having a usable key.
        try {
          await unlockWithPassword(loggedInUser.masterKeyWrap, input.password);
        } catch {
          clearMasterKey();
        }
      }
      return loggedInUser;
    },
    [setUser, unlockWithPassword, clearMasterKey],
  );

  const googleOAuth: AuthContextValue['googleOAuth'] = useCallback(
    async (idToken, guestToken) => {
      const { user: oauthUser, tokens } = await authApi.googleOAuth({ idToken, guestToken });
      setTokens(tokens);
      setUser(oauthUser);
      return oauthUser;
    },
    [setUser],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearTokens();
      setUser(null);
      clearMasterKey();
    }
  }, [setUser, clearMasterKey]);

  return (
    <AuthContext.Provider
      value={{ user, loading: hasTokens === null || (hasTokens && isLoading), signup, login, googleOAuth, logout, refreshUser, setUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
