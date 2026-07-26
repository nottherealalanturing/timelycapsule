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
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { authApi } from './api-client';
import { useMasterKey } from './master-key-context';
import { clearTokens, getTokens, setTokens } from './token-store';

const ME_QUERY_KEY = ['me'] as const;

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** Resolves with the one-time formatted recovery kit — the caller MUST show it to the user before navigating away (06 §A "mandatory nag"). */
  signup: (input: { email: string; password: string; displayName: string }) => Promise<{ user: User; recoveryKit: string }>;
  login: (input: { email: string; password: string }) => Promise<User>;
  googleOAuth: (idToken: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [hasTokens] = useState(() => Boolean(getTokens()));
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
    enabled: hasTokens,
    initialData: hasTokens ? undefined : null,
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

      const { user: newUser, tokens } = await authApi.signup({ ...input, masterKeyWrap, recoveryKeyWrap });
      setTokens(tokens);
      setUser(newUser);
      // Already unwrapped in memory from generation above — no need to
      // round-trip through unlockWithPassword.
      setMasterKey(masterKey);
      return { user: newUser, recoveryKit };
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
    async (idToken) => {
      const { user: oauthUser, tokens } = await authApi.googleOAuth({ idToken });
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
      value={{ user, loading: hasTokens && isLoading, signup, login, googleOAuth, logout, refreshUser, setUser }}
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
