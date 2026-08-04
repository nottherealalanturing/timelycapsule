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
  /** Staged new address awaiting the `change_email` OTP confirmation (T-18) — null unless an email change is in progress. */
  pendingEmail: z.string().email().nullable(),
  displayName: z.string(),
  handle: z.string().nullable(),
  avatarKey: z.string().nullable(),
  /**
   * `YYYY-MM-DD`, or null. The column has existed since T-02 and
   * `PatchMeRequest` has always accepted it; nothing read it back until
   * Capsule Creation V2's Horizon, which uses it to offer a writer moments in
   * their own life ("When you turn 40") rather than only lengths of time.
   */
  birthday: z.string().nullable(),
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
  /** Present when converting a guest session (01 §4.1b / T-15b) — claims that session's capsule(s) into the new account. */
  guestToken: z.string().min(1).optional(),
});
export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const GoogleOAuthRequestSchema = z.object({
  idToken: z.string().min(1),
  /** Present when converting a guest session (01 §4.1b / T-15b) — claims that session's capsule(s) into the new account. */
  guestToken: z.string().min(1).optional(),
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

/**
 * Password change while logged in (Settings → Account, T-18) — distinct
 * from forgot/reset (T-04): the caller already knows their current
 * password, so the master key can be re-wrapped client-side (unwrap under
 * the old password, re-wrap under the new one) and sent up alongside the
 * new password hash, exactly like signup's masterKeyWrap. Forgot/reset has
 * no such thing to send since the user *doesn't* have the old password.
 */
export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: PasswordSchema,
  masterKeyWrap: z.string().min(1),
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

/**
 * Sets a first encryption password for an OAuth-only account (no prior
 * passwordHash/masterKeyWrap) — distinct from ChangePassword, which
 * requires knowing an existing password to re-wrap the master key under.
 * A Google-only signup never generates a master key at all (no password to
 * derive it from), so this is the only path such an account has to
 * establish one; both the new masterKeyWrap and a fresh recoveryKeyWrap
 * are generated client-side, exactly like password signup.
 */
export const SetInitialPasswordRequestSchema = z.object({
  newPassword: PasswordSchema,
  masterKeyWrap: z.string().min(1),
  recoveryKeyWrap: z.string().min(1),
});
export type SetInitialPasswordRequest = z.infer<typeof SetInitialPasswordRequestSchema>;

export const ChangeEmailRequestSchema = z.object({
  newEmail: z.string().email(),
  currentPassword: z.string().min(1),
});
export type ChangeEmailRequest = z.infer<typeof ChangeEmailRequestSchema>;

export const ConfirmEmailChangeRequestSchema = z.object({
  code: z.string().min(1),
});
export type ConfirmEmailChangeRequest = z.infer<typeof ConfirmEmailChangeRequestSchema>;

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
