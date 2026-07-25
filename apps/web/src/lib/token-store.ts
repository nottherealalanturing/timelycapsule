// Session persistence for T-06 (plan/05-BUILD-PLAYBOOK.md). Tokens live in
// localStorage rather than an httpOnly cookie — simplest thing that gives
// "session persistence" across reloads/tabs for a CSR app talking to a
// separate API origin; revisit if XSS-hardening becomes a priority (see
// plan/PROGRESS.md decisions log).
const ACCESS_KEY = 'tc-access-token';
const REFRESH_KEY = 'tc-refresh-token';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export function getTokens(): Tokens | null {
  if (typeof window === 'undefined') return null;
  const accessToken = localStorage.getItem(ACCESS_KEY);
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export function setTokens(tokens: Tokens): void {
  localStorage.setItem(ACCESS_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}
