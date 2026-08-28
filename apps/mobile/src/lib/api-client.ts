import {
  AuthResponseSchema,
  CapsuleListResponseSchema,
  CapsuleResponseSchema,
  LoginRequestSchema,
  LogoutRequestSchema,
  MeResponseSchema,
  MediaListResponseSchema,
  MediaViewResponseSchema,
  NotificationsListResponseSchema,
  ReceivedListResponseSchema,
  RefreshResponseSchema,
  ReplyThreadListResponseSchema,
  type ListCapsulesQuery,
  type LoginRequest,
  type PaginatedQuery,
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

/**
 * Builds a query string from a plain object, dropping `undefined` values —
 * matches apps/web/src/lib/api-client.ts's `capsulesApi.list`/`(reveal)`
 * inline pattern exactly (a `URLSearchParams` built per-caller), not a new
 * convention. `request()` itself is untouched — the query string is just
 * part of the path, the same way web's own client does it.
 */
function toQueryString(query: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(query).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined);
  if (entries.length === 0) return '';
  const params = new URLSearchParams(entries.map(([k, v]) => [k, String(v)]));
  return `?${params}`;
}

/**
 * Read-only capsule-domain endpoints for E1.3 (browsing only — no create/
 * patch/seal/etc., those belong to the creation ticket). Response shapes
 * are consumed exactly as the server returns them, deliberately including
 * their real, sometimes-inconsistent characteristics rather than
 * normalizing them away at this layer (per the E1.3 final readiness
 * audit): `list`'s `nextCursor` is `null` both at true end-of-list and,
 * separately, whenever `collectionId` is set (the server bypasses
 * pagination entirely for that filter) — this client does not try to tell
 * those two cases apart, since the server itself doesn't distinguish them
 * in the response. `get`'s `contentDocEnc`/`ownerKeyWrap` are `null` for an
 * owned capsule that hasn't been through its first autosave yet — this
 * client returns that null-shaped `Capsule` as-is; classifying it as
 * "nothing to decrypt" is `capsule-crypto.ts`'s job (E1.3.7), not this
 * layer's.
 */
export const capsulesApi = {
  list: (query: Partial<ListCapsulesQuery> = {}) =>
    request(`/capsules${toQueryString(query)}`, CapsuleListResponseSchema, { auth: true }),

  get: (id: string) => request(`/capsules/${id}`, CapsuleResponseSchema, { auth: true }),

  /** Unpaginated — the server returns every media row for the capsule in one response (naturally small, bounded by storage quota). */
  media: (id: string) => request(`/capsules/${id}/media`, MediaListResponseSchema, { auth: true }),

  /**
   * Optional E1.3.9 scope — exposed here because the contract makes it a
   * one-line addition, but no reply UI is built by this ticket. Ciphertext
   * only (`bodyEnc`); decrypting a thread's replies uses the same capsule
   * key `capsule-crypto.ts` resolves for the letter, via `decryptField`.
   */
  replies: (id: string) => request(`/capsules/${id}/replies`, ReplyThreadListResponseSchema, { auth: true }),
};

/**
 * `GET /received` returns a flat, complete array — confirmed via the final
 * readiness audit that the server applies no `LIMIT`/cursor to this query
 * at all, unlike `capsulesApi.list`. Do not add cursor/infinite-query
 * handling here; there is no cursor for the server to accept. Note the
 * response's `ReceivedCapsule` items key the capsule by `capsuleId`, not
 * `id` (unlike `Capsule`/`CapsuleListItem`) — this client preserves that
 * field name exactly as the server sends it; normalizing it to `id` is a
 * UI-layer concern (E1.3.4's `CapsuleRow`), not this client's.
 */
export const receivedApi = {
  list: () => request('/received', ReceivedListResponseSchema, { auth: true }),
};

/**
 * In-app notifications are pull-only — confirmed via the final readiness
 * audit that no WebSocket/real-time push exists despite
 * `plan/03-ARCHITECTURE.md`'s older description of one; callers must poll
 * (on-foreground, pull-to-refresh), which is a UI-layer concern, not
 * something this client papers over with an invented subscription API.
 */
export const notificationsApi = {
  list: (query: Partial<PaginatedQuery> = {}) =>
    request(`/notifications${toQueryString(query)}`, NotificationsListResponseSchema, { auth: true }),
};

/**
 * `view` returns a time-limited (15-minute) presigned URL, not the bytes
 * themselves — the caller fetches that URL separately and decrypts the
 * response body with `capsule-crypto.ts`'s `decryptField`, the same as
 * content. A `released` media item's `view` call fails server-side with a
 * dedicated `media_released` error code (surfaced here as a normal
 * `ApiClientError`, code `media_released`) — this client does not hide or
 * reinterpret that; a caller must check a media item's `status` before
 * calling `view` if it wants to avoid the round-trip entirely.
 */
export const mediaApi = {
  view: (mediaId: string) => request(`/media/${mediaId}/view`, MediaViewResponseSchema, { auth: true }),
};
