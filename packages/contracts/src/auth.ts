import { z } from 'zod';

/**
 * Auth module schemas (T-04, plan/03-ARCHITECTURE.md §14 AUTH block).
 * 2FA (`/auth/totp/*`) and OAuth (`/auth/oauth/*`) are deferred to T-33/T-05
 * respectively — not modeled here yet.
 */

export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(256);

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  handle: z.string().nullable(),
  avatarKey: z.string().nullable(),
  timezone: z.string(),
  locale: z.string(),
  status: z.enum(['unverified', 'active', 'suspended', 'pending_deletion', 'deleted', 'ghost']),
  emailVerifiedAt: z.string().nullable(),
  /**
   * The owner master key, still wrapped under Argon2id(password) — base64,
   * `@tc/crypto`'s master-key.ts unwraps it client-side with the password
   * already in hand (login form, or the unlock re-prompt). Null for
   * accounts predating this column and for OAuth-only accounts with no
   * password to derive a wrap key from (T-11 decisions log).
   */
  masterKeyWrap: z.string().nullable(),
  createdAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const TokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
});
export type Tokens = z.infer<typeof TokensSchema>;

export const AuthResponseSchema = z.object({
  user: UserSchema,
  tokens: TokensSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const SignupRequestSchema = z.object({
  email: z.string().email(),
  password: PasswordSchema,
  displayName: z.string().min(1).max(120),
  /**
   * Client-generated owner master key, already wrapped twice before it
   * ever reaches the server (base64): once under Argon2id(password) and
   * once under a printable recovery code the signup UI must have shown
   * the user already (06 §A "mandatory nag"). The server only ever stores
   * ciphertext here — see users.masterKeyWrap/recoveryKeyWrap.
   */
  masterKeyWrap: z.string().min(1),
  recoveryKeyWrap: z.string().min(1),
});
export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const GoogleOAuthRequestSchema = z.object({
  idToken: z.string().min(1),
});
export type GoogleOAuthRequest = z.infer<typeof GoogleOAuthRequestSchema>;

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const RefreshResponseSchema = z.object({
  tokens: TokensSchema,
});
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

export const LogoutRequestSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

export const VerifyEmailRequestSchema = z.object({
  code: z.string().min(1),
});
export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequestSchema>;

export const ForgotPasswordRequestSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

export const ResetPasswordRequestSchema = z.object({
  token: z.string().min(1),
  newPassword: PasswordSchema,
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export const SessionSchema = z.object({
  id: z.string().uuid(),
  deviceName: z.string().nullable(),
  platform: z.enum(['web', 'ios', 'android']),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
  current: z.boolean(),
});
export type Session = z.infer<typeof SessionSchema>;

export const SessionsResponseSchema = z.object({
  data: z.array(SessionSchema),
});
export type SessionsResponse = z.infer<typeof SessionsResponseSchema>;

export const MeResponseSchema = z.object({
  user: UserSchema,
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const PatchMeRequestSchema = z
  .object({
    displayName: z.string().min(1).max(120),
    handle: z.string().min(3).max(30).nullable(),
    avatarKey: z.string().nullable(),
    birthday: z.string().nullable(),
    timezone: z.string(),
    locale: z.string(),
    quietHours: z.object({ start: z.string(), end: z.string() }).nullable(),
    marketingOptIn: z.boolean(),
  })
  .partial();
export type PatchMeRequest = z.infer<typeof PatchMeRequestSchema>;
