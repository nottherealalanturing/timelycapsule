import {
  AuthResponseSchema,
  LoginRequestSchema,
  LogoutRequestSchema,
  MeResponseSchema,
  RefreshResponseSchema,
  type LoginRequest,
} from '@tc/contracts';
import { Platform } from 'react-native';
import { z } from 'zod';
import { clearTokens, getTokens, setTokens } from './token-store';

/**
 * Mobile equivalent of apps/web/src/lib/api-client.ts, scoped to only the
 * auth endpoints this task needs (login, refresh, logout, /me) — not a
 * full port of every endpoint web's client has. Same request/response
 * shapes from @tc/contracts, same auto-refresh-on-401 pattern, same
 * single-flight refresh lock; the only real difference is token storage
 * being async (SecureStore) instead of sync (localStorage).
 *
 * The Android emulator's own `localhost` is the emulator itself, not the
 * host machine — `10.0.2.2` is the documented alias Android emulators
 * provide for the host's loopback (confirmed against a real API server
 * during E1.2's manual verification: `localhost` produced a network error,
 * `10.0.2.2` reached it). iOS Simulator has no such indirection — its
 * `localhost` already is the host Mac. A physical device on either
 * platform needs the host's real LAN IP instead, which is why
 * EXPO_PUBLIC_API_URL always wins when set.
 */
const DEV_API_URL = Platform.OS === 'android' ? 'http://10.0.2.2:4001/v1' : 'http://localhost:4001/v1';
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? DEV_API_URL;

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const tokens = await getTokens();
  if (!tokens) return false;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
        if (!res.ok) {
          await clearTokens();
          return false;
        }
        const body = RefreshResponseSchema.parse(await res.json());
        await setTokens(body.tokens);
        return true;
      } catch {
        await clearTokens();
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  _retried?: boolean;
}

async function request<T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false, _retried = false } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Platform': 'ios' };

  if (auth) {
    const tokens = await getTokens();
    if (tokens) headers.Authorization = `Bearer ${tokens.accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Network failure (no connectivity, DNS, server unreachable) — a
    // distinct, generic-code error so callers (the login screen) can show
    // "check your connection" rather than "invalid credentials".
    throw new ApiClientError('network_error', 'Could not reach the server. Check your connection.', 0);
  }

  if (res.status === 401 && auth && !_retried) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return request(path, schema, { ...options, _retried: true });
    }
  }

  if (!res.ok) {
    const raw = await res.json().catch(() => null);
    const loose = raw as { error?: { code?: unknown; message?: unknown } } | null;
    if (typeof loose?.error?.code === 'string' && typeof loose.error.message === 'string') {
      throw new ApiClientError(loose.error.code, loose.error.message, res.status);
    }
    throw new ApiClientError('internal_error', 'Something went wrong', res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return schema.parse(await res.json());
}

export const authApi = {
  login: (input: LoginRequest) => request('/auth/login', AuthResponseSchema, { method: 'POST', body: LoginRequestSchema.parse(input) }),

  logout: () => request('/auth/logout', z.void(), { method: 'POST', auth: true, body: LogoutRequestSchema.parse({}) }),

  getMe: () => request('/me', MeResponseSchema, { auth: true }),
};
