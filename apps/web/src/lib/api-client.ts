import {
  ApiErrorSchema,
  AuthResponseSchema,
  ForgotPasswordRequestSchema,
  GoogleOAuthRequestSchema,
  LoginRequestSchema,
  MeResponseSchema,
  PatchMeRequestSchema,
  RefreshResponseSchema,
  ResetPasswordRequestSchema,
  SignupRequestSchema,
  VerifyEmailRequestSchema,
  type AuthResponse,
  type ForgotPasswordRequest,
  type GoogleOAuthRequest,
  type LoginRequest,
  type MeResponse,
  type PatchMeRequest,
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

export type { AuthResponse, MeResponse };
