'use client';

import type { User } from '@tc/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { authApi } from './api-client';
import { clearTokens, getTokens, setTokens } from './token-store';

const ME_QUERY_KEY = ['me'] as const;

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signup: (input: { email: string; password: string; displayName: string }) => Promise<User>;
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
      const { user: newUser, tokens } = await authApi.signup(input);
      setTokens(tokens);
      setUser(newUser);
      return newUser;
    },
    [setUser],
  );

  const login: AuthContextValue['login'] = useCallback(
    async (input) => {
      const { user: loggedInUser, tokens } = await authApi.login(input);
      setTokens(tokens);
      setUser(loggedInUser);
      return loggedInUser;
    },
    [setUser],
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
    }
  }, [setUser]);

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
