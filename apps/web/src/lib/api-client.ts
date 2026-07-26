import {
  ApiErrorSchema,
  AuthResponseSchema,
  CapsuleActivityResponseSchema,
  CapsuleListResponseSchema,
  CapsuleResponseSchema,
  SystemTimeResponseSchema,
  CompleteMediaRequestSchema,
  CreateCapsuleRequestSchema,
  CreateMediaTicketRequestSchema,
  CreateMediaTicketResponseSchema,
  CreateRecipientRequestSchema,
  CreateRecipientResponseSchema,
  ExtendCapsuleRequestSchema,
  ForgotPasswordRequestSchema,
  GoogleOAuthRequestSchema,
  LoginRequestSchema,
  MediaListResponseSchema,
  MediaResponseSchema,
  MediaViewResponseSchema,
  MeResponseSchema,
  PatchCapsuleRequestSchema,
  PatchMediaRequestSchema,
  PatchMeRequestSchema,
  PatchRecipientRequestSchema,
  RecipientResponseSchema,
  RecipientsListResponseSchema,
  RefreshResponseSchema,
  ResetPasswordRequestSchema,
  SignupRequestSchema,
  VerifyEmailRequestSchema,
  type AuthResponse,
  type CompleteMediaRequest,
  type CreateCapsuleRequest,
  type CreateMediaTicketRequest,
  type CreateRecipientRequest,
  type ExtendCapsuleRequest,
  type ForgotPasswordRequest,
  type GoogleOAuthRequest,
  type ListCapsulesQuery,
  type LoginRequest,
  type MeResponse,
  type PatchCapsuleRequest,
  type PatchMediaRequest,
  type PatchMeRequest,
  type PatchRecipientRequest,
  type ResetPasswordRequest,
  type SignupRequest,
  type VerifyEmailRequest,
} from '@tc/contracts';
import { z } from 'zod';
import { clearTokens, getTokens, setTokens } from './token-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001/v1';

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

// A refresh already in flight is shared by concurrent 401s instead of each
// firing its own — avoids racing the rotating-refresh-token endpoint (T-04
// revokes the whole session on reuse of an already-rotated-out token).
let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const tokens = getTokens();
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
          clearTokens();
          return false;
        }
        const body = RefreshResponseSchema.parse(await res.json());
        setTokens(body.tokens);
        return true;
      } catch {
        clearTokens();
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  /** internal: prevents infinite retry loops on the refresh call itself */
  _retried?: boolean;
}

async function request<T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false, _retried = false } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    const tokens = getTokens();
    if (tokens) headers.Authorization = `Bearer ${tokens.accessToken}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && auth && !_retried) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return request(path, schema, { ...options, _retried: true });
    }
  }

  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(await res.json().catch(() => null));
    if (parsed.success) {
      throw new ApiClientError(parsed.data.error.code, parsed.data.error.message, res.status);
    }
    throw new ApiClientError('internal_error', 'Something went wrong', res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return schema.parse(await res.json());
}

export const authApi = {
  signup: (input: SignupRequest) =>
    request('/auth/signup', AuthResponseSchema, { method: 'POST', body: SignupRequestSchema.parse(input) }),

  login: (input: LoginRequest) =>
    request('/auth/login', AuthResponseSchema, { method: 'POST', body: LoginRequestSchema.parse(input) }),

  googleOAuth: (input: GoogleOAuthRequest) =>
    request('/auth/oauth/google', AuthResponseSchema, {
      method: 'POST',
      body: GoogleOAuthRequestSchema.parse(input),
    }),

  logout: () => request('/auth/logout', z.void(), { method: 'POST', auth: true, body: {} }),

  verifyEmail: (input: VerifyEmailRequest) =>
    request('/auth/verify-email', MeResponseSchema, {
      method: 'POST',
      auth: true,
      body: VerifyEmailRequestSchema.parse(input),
    }),

  resendVerifyEmail: () => request('/auth/verify-email/resend', z.unknown(), { method: 'POST', auth: true }),

  forgotPassword: (input: ForgotPasswordRequest) =>
    request('/auth/password/forgot', z.unknown(), {
      method: 'POST',
      body: ForgotPasswordRequestSchema.parse(input),
    }),

  resetPassword: (input: ResetPasswordRequest) =>
    request('/auth/password/reset', z.unknown(), {
      method: 'POST',
      body: ResetPasswordRequestSchema.parse(input),
    }),

  getMe: () => request('/me', MeResponseSchema, { auth: true }),

  patchMe: (input: PatchMeRequest) =>
    request('/me', MeResponseSchema, { method: 'PATCH', auth: true, body: PatchMeRequestSchema.parse(input) }),
};

export const systemApi = {
  time: () => request('/system/time', SystemTimeResponseSchema),
};

export const capsulesApi = {
  create: (input: CreateCapsuleRequest) =>
    request('/capsules', CapsuleResponseSchema, { method: 'POST', auth: true, body: CreateCapsuleRequestSchema.parse(input) }),

  list: (query: Partial<ListCapsulesQuery> = {}) => {
    const entries = Object.entries(query).filter(([, v]) => v !== undefined) as [string, string | number][];
    const params = new URLSearchParams(entries.map(([k, v]) => [k, String(v)]));
    return request(`/capsules?${params}`, CapsuleListResponseSchema, { auth: true });
  },

  get: (id: string) => request(`/capsules/${id}`, CapsuleResponseSchema, { auth: true }),

  patch: (id: string, input: PatchCapsuleRequest) =>
    request(`/capsules/${id}`, CapsuleResponseSchema, {
      method: 'PATCH',
      auth: true,
      body: PatchCapsuleRequestSchema.partial().parse(input),
    }),

  seal: (id: string) => request(`/capsules/${id}/seal`, CapsuleResponseSchema, { method: 'POST', auth: true, body: {} }),

  duplicate: (id: string) =>
    request(`/capsules/${id}/duplicate`, CapsuleResponseSchema, { method: 'POST', auth: true, body: {} }),

  archive: (id: string) => request(`/capsules/${id}/archive`, CapsuleResponseSchema, { method: 'POST', auth: true, body: {} }),

  unarchive: (id: string) =>
    request(`/capsules/${id}/unarchive`, CapsuleResponseSchema, { method: 'POST', auth: true, body: {} }),

  trash: (id: string) => request(`/capsules/${id}/trash`, CapsuleResponseSchema, { method: 'POST', auth: true, body: {} }),

  restore: (id: string) => request(`/capsules/${id}/restore`, CapsuleResponseSchema, { method: 'POST', auth: true, body: {} }),

  withdraw: (id: string) => request(`/capsules/${id}/withdraw`, CapsuleResponseSchema, { method: 'POST', auth: true, body: {} }),

  extend: (id: string, input: ExtendCapsuleRequest) =>
    request(`/capsules/${id}/extend`, CapsuleResponseSchema, {
      method: 'POST',
      auth: true,
      body: ExtendCapsuleRequestSchema.parse(input),
    }),

  activity: (id: string) => request(`/capsules/${id}/activity`, CapsuleActivityResponseSchema, { auth: true }),
};

export const recipientsApi = {
  list: (capsuleId: string) => request(`/capsules/${capsuleId}/recipients`, RecipientsListResponseSchema, { auth: true }),

  create: (capsuleId: string, input: CreateRecipientRequest) =>
    request(`/capsules/${capsuleId}/recipients`, CreateRecipientResponseSchema, {
      method: 'POST',
      auth: true,
      body: CreateRecipientRequestSchema.parse(input),
    }),

  patch: (capsuleId: string, recipientId: string, input: PatchRecipientRequest) =>
    request(`/capsules/${capsuleId}/recipients/${recipientId}`, RecipientResponseSchema, {
      method: 'PATCH',
      auth: true,
      body: PatchRecipientRequestSchema.parse(input),
    }),

  delete: (capsuleId: string, recipientId: string) =>
    request(`/capsules/${capsuleId}/recipients/${recipientId}`, z.void(), { method: 'DELETE', auth: true }),
};

export const mediaApi = {
  list: (capsuleId: string) => request(`/capsules/${capsuleId}/media`, MediaListResponseSchema, { auth: true }),

  createTicket: (capsuleId: string, input: CreateMediaTicketRequest) =>
    request(`/capsules/${capsuleId}/media/tickets`, CreateMediaTicketResponseSchema, {
      method: 'POST',
      auth: true,
      body: CreateMediaTicketRequestSchema.parse(input),
    }),

  complete: (mediaId: string, input: CompleteMediaRequest) =>
    request(`/media/${mediaId}/complete`, MediaResponseSchema, {
      method: 'POST',
      auth: true,
      body: CompleteMediaRequestSchema.parse(input),
    }),

  patch: (mediaId: string, input: PatchMediaRequest) =>
    request(`/media/${mediaId}`, MediaResponseSchema, {
      method: 'PATCH',
      auth: true,
      body: PatchMediaRequestSchema.parse(input),
    }),

  delete: (mediaId: string) => request(`/media/${mediaId}`, z.void(), { method: 'DELETE', auth: true }),

  view: (mediaId: string) => request(`/media/${mediaId}/view`, MediaViewResponseSchema, { auth: true }),
};

export type { AuthResponse, MeResponse };
