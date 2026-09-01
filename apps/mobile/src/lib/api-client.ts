import {
  AuthResponseSchema,
  CapsuleListResponseSchema,
  CapsuleResponseSchema,
  CompleteMediaRequestSchema,
  CreateCapsuleRequestSchema,
  CreateMediaTicketRequestSchema,
  CreateMediaTicketResponseSchema,
  CreateRecipientRequestSchema,
  CreateRecipientResponseSchema,
  LoginRequestSchema,
  LogoutRequestSchema,
  MeResponseSchema,
  MediaListResponseSchema,
  MediaResponseSchema,
  MediaViewResponseSchema,
  NotificationsListResponseSchema,
  PatchCapsuleRequestSchema,
  PlaceCheckRequestSchema,
  PlaceCheckResponseSchema,
  ReceivedListResponseSchema,
  RecipientsListResponseSchema,
  RefreshResponseSchema,
  RemindRequestSchema,
  ReplyThreadListResponseSchema,
  RequestIdentityCodeResponseSchema,
  RevealResponseSchema,
  VerifyIdentityRequestSchema,
  VerifyIdentityResponseSchema,
  type CompleteMediaRequest,
  type CreateCapsuleRequest,
  type CreateMediaTicketRequest,
  type CreateRecipientRequest,
  type ListCapsulesQuery,
  type LoginRequest,
  type PaginatedQuery,
  type PatchCapsuleRequest,
  type PlaceCheckRequest,
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
  /**
   * Sent as `Idempotency-Key` (`apps/api/src/middleware/idempotency.ts`) —
   * only meaningful on a POST the server actually wires the middleware to
   * (media ticket create/complete, seal, etc.; see that route's own
   * comment). Callers that don't pass one get no protection, matching the
   * middleware's own "honored, not required" design.
   */
  idempotencyKey?: string;
  _retried?: boolean;
}

async function request<T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false, idempotencyKey, _retried = false } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Platform': 'ios' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

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
 * Capsule-domain endpoints. `list`/`get`/`media`/`replies`/`recipients`
 * (read-only) shipped with E1.3 — see that ticket's own audit for why their
 * response shapes are consumed exactly as the server returns them, not
 * normalized. `create`/`patch` are E1.4.1's own addition (the Address
 * movement): `create` starts a new draft (`{type}` only — every other
 * field is set by a later `patch`, matching web's own `/capsule/new` →
 * `PATCH /capsules/:id` two-step exactly); `patch` is a **partial** merge
 * server-side — a field omitted from the body is left untouched, an
 * explicit `null` clears it (confirmed against `apps/api/src/modules/
 * capsules/service.ts`'s `patchCapsule`, not assumed). Neither call ever
 * carries `contentDocEnc`/`ownerKeyWrap` — those are E1.4.3's job (Compose),
 * once a capsule key exists to encrypt anything with.
 */
export const capsulesApi = {
  list: (query: Partial<ListCapsulesQuery> = {}) =>
    request(`/capsules${toQueryString(query)}`, CapsuleListResponseSchema, { auth: true }),

  get: (id: string) => request(`/capsules/${id}`, CapsuleResponseSchema, { auth: true }),

  create: (input: CreateCapsuleRequest) =>
    request('/capsules', CapsuleResponseSchema, { method: 'POST', auth: true, body: CreateCapsuleRequestSchema.parse(input) }),

  patch: (id: string, input: Partial<PatchCapsuleRequest>) =>
    request(`/capsules/${id}`, CapsuleResponseSchema, {
      method: 'PATCH',
      auth: true,
      body: PatchCapsuleRequestSchema.parse(input),
    }),

  /** Unpaginated — the server returns every media row for the capsule in one response (naturally small, bounded by storage quota). */
  media: (id: string) => request(`/capsules/${id}/media`, MediaListResponseSchema, { auth: true }),

  /**
   * Ciphertext only (`bodyEnc`); decrypting a thread's replies uses the
   * same capsule key `capsule-crypto.ts` resolves for the letter, via
   * `decryptField`.
   */
  replies: (id: string) => request(`/capsules/${id}/replies`, ReplyThreadListResponseSchema, { auth: true }),

  /**
   * Plaintext recipient metadata (name/email/phone/status) — never
   * ciphertext, so no decryption is involved. Unpaginated: `listRecipients`
   * (apps/api/src/modules/recipients/service.ts) returns every row for the
   * capsule in one response, naturally small (bounded by the product's own
   * per-capsule recipient limit).
   */
  recipients: (id: string) => request(`/capsules/${id}/recipients`, RecipientsListResponseSchema, { auth: true }),

  /**
   * Movement III — Seal (E1.4.8). No body at all — the server reads the
   * already-persisted draft row (`apps/api/src/modules/capsules/
   * lifecycle.ts`'s `sealCapsule`), matching web's own `capsulesApi.seal`
   * exactly. `idempotencyKey` should be generated once per Review-screen
   * mount and reused across retries of that same attempt: seal is already
   * safe-by-rejection without one (a second call on an already-sealed
   * capsule reliably 409s as `capsule_sealed` rather than re-sealing), but
   * reusing a key turns "response lost, capsule actually sealed" into a
   * genuine replayed success instead of a confusing rejection — the exact
   * gap the E1.4 readiness audit's §7.5 flagged web itself as never closing
   * (web sends no Idempotency-Key on any request, seal included).
   */
  seal: (id: string, idempotencyKey: string) =>
    request(`/capsules/${id}/seal`, CapsuleResponseSchema, { method: 'POST', auth: true, idempotencyKey }),
};

/**
 * Owner-side recipient management for the Address movement (E1.4.1) — the
 * same `POST`/`DELETE /capsules/:id/recipients[/:id]` contracts web's
 * `AddresseeBeat.tsx` already calls, unchanged. `create`'s response
 * includes a one-time `accessToken` (the raw, never-stored-again recipient
 * link token) that this ticket has no use for yet — announcing a link is
 * E1.4.8's job (Seal), once a capsule is actually sealed — so it is simply
 * left unused by callers rather than discarded here; the full response is
 * still returned in case a future ticket needs it without re-deriving the
 * contract.
 */
export const recipientsApi = {
  create: (capsuleId: string, input: CreateRecipientRequest) =>
    request(`/capsules/${capsuleId}/recipients`, CreateRecipientResponseSchema, {
      method: 'POST',
      auth: true,
      body: CreateRecipientRequestSchema.parse(input),
    }),

  delete: (capsuleId: string, recipientId: string) =>
    request(`/capsules/${capsuleId}/recipients/${recipientId}`, z.void(), { method: 'DELETE', auth: true }),
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

  /**
   * The first step of E1.4.7's enclose pipeline — matches
   * `apps/web/src/lib/api-client.ts`'s own `mediaApi.createTicket` exactly
   * (same contract, same server route). `sizeBytes` is the **encrypted**
   * length (readiness audit §7.1's own note) — callers must pass the
   * ciphertext's length, never the original file's. `idempotencyKey` should
   * be generated once per pending enclosure and reused across retries of
   * *this* call specifically (see `media-upload.ts`'s own header comment for
   * why): the server replays the original ticket rather than creating a
   * duplicate if an earlier attempt actually succeeded but its response
   * never reached the client.
   */
  createTicket: (capsuleId: string, input: CreateMediaTicketRequest, idempotencyKey: string) =>
    request(`/capsules/${capsuleId}/media/tickets`, CreateMediaTicketResponseSchema, {
      method: 'POST',
      auth: true,
      body: CreateMediaTicketRequestSchema.parse(input),
      idempotencyKey,
    }),

  /** Finalizes a ticket after every part has uploaded. A fresh `idempotencyKey` per call is correct here (unlike `createTicket`'s reused one) — see `media-upload.ts`'s header comment for why this call's body legitimately varies between attempts. */
  complete: (mediaId: string, input: CompleteMediaRequest, idempotencyKey: string) =>
    request(`/media/${mediaId}/complete`, MediaResponseSchema, {
      method: 'POST',
      auth: true,
      body: CompleteMediaRequestSchema.parse(input),
      idempotencyKey,
    }),

  /** Cleans up an abandoned/orphaned ticket row (never-finished upload) or a truly-attached item the writer removed. No idempotency middleware on this route (`apps/api/src/modules/media/routes.ts`) — matches web's own `mediaApi.delete`, unprotected the same way there. */
  delete: (mediaId: string) => request(`/media/${mediaId}`, z.void(), { method: 'DELETE', auth: true }),
};

/**
 * Recipient (token-auth, no account) reveal endpoints — PHASE-5.1's own
 * scope, matching `apps/web/src/lib/api-client.ts`'s `revealApi` exactly
 * for the calls this ticket needs (`get`, `requestIdentityCode`,
 * `verifyIdentity`, `placeCheck`, `remind`). Every call is unauthenticated
 * (`auth` omitted/false) — the raw recipient token in the path is the only
 * credential, exactly as `apps/api/src/modules/reveal/routes.ts` expects.
 * Deliberately does not include `confirmRead`/`listReplies`/`reply` —
 * those are PHASE-5.3/6's own scope (see the readiness audit's ticket
 * map), and adding them here now would be exactly the kind of speculative,
 * unused surface this codebase's own conventions avoid.
 */
export const revealApi = {
  get: (token: string, gates: { placeGate?: string; identityGate?: string } = {}) =>
    request(`/r/${token}${toQueryString({ placeGate: gates.placeGate, identityGate: gates.identityGate })}`, RevealResponseSchema),

  requestIdentityCode: (token: string) =>
    request(`/r/${token}/verify/request`, RequestIdentityCodeResponseSchema, { method: 'POST', body: {} }),

  verifyIdentity: (token: string, code: string) =>
    request(`/r/${token}/verify`, VerifyIdentityResponseSchema, {
      method: 'POST',
      body: VerifyIdentityRequestSchema.parse({ code }),
    }),

  placeCheck: (token: string, input: PlaceCheckRequest) =>
    request(`/r/${token}/place-check`, PlaceCheckResponseSchema, {
      method: 'POST',
      body: PlaceCheckRequestSchema.parse(input),
    }),

  remind: (token: string, enabled: boolean) =>
    request(`/r/${token}/remind`, z.void(), { method: 'POST', body: RemindRequestSchema.parse({ enabled }) }),
};
