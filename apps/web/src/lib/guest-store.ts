// Guest-mode persistence (T-15b, 01 §4.1b) — a guest has no master key, so
// unlike token-store.ts's account tokens, the raw capsule key itself lives
// here too. There's no way around this: "lose the link, lose the capsule"
// is the accepted tradeoff for zero-signup-friction capsule creation, and
// this cache exists only to let the guest revisit `/try/capsule` on the
// same device without having re-copied the link. Cleared on claim or when
// the guest abandons the flow.
const GUEST_TOKEN_KEY = 'tc-guest-token';
const GUEST_CAPSULE_KEY = 'tc-guest-capsule';

export interface GuestCapsuleCache {
  capsuleId: string;
  recipientToken: string;
  /** base64url-encoded raw AES key, generated client-side at creation (@tc/crypto's generateCapsuleKey). */
  capsuleKeyB64: string;
}

export function getGuestToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(GUEST_TOKEN_KEY);
}

export function setGuestToken(token: string): void {
  localStorage.setItem(GUEST_TOKEN_KEY, token);
}

export function getGuestCapsule(): GuestCapsuleCache | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(GUEST_CAPSULE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GuestCapsuleCache;
  } catch {
    return null;
  }
}

export function setGuestCapsule(cache: GuestCapsuleCache): void {
  localStorage.setItem(GUEST_CAPSULE_KEY, JSON.stringify(cache));
}

export function clearGuestSession(): void {
  localStorage.removeItem(GUEST_TOKEN_KEY);
  localStorage.removeItem(GUEST_CAPSULE_KEY);
}
