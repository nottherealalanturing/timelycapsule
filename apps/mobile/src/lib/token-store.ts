import * as SecureStore from 'expo-secure-store';

/**
 * Mobile equivalent of apps/web/src/lib/token-store.ts. Same two values,
 * same shape — session tokens only, never the master key (see
 * master-key-context.tsx's own header comment for why). SecureStore
 * (Keychain/Keystore-backed) is the platform-appropriate mechanism per
 * Stage E blueprint §14 — plain, unauthenticated entries (no
 * `requireAuthentication`), since these aren't the biometric-gated
 * material blueprint §5.2 describes; that's out of this task's scope.
 *
 * Async, unlike web's synchronous localStorage-backed version — every
 * caller here already awaits.
 */
const ACCESS_KEY = 'tc_access_token';
const REFRESH_KEY = 'tc_refresh_token';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export async function getTokens(): Promise<Tokens | null> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export async function setTokens(tokens: Tokens): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([SecureStore.deleteItemAsync(ACCESS_KEY), SecureStore.deleteItemAsync(REFRESH_KEY)]);
}
