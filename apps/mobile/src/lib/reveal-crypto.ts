import { decodeCapsuleKeyFromLink } from '@tc/crypto';
import { decryptField, readEnvelope, type LetterEnvelope } from './capsule-crypto';

/**
 * PHASE-5.2's own recipient-path decrypt boundary — deliberately separate
 * from `capsule-crypto.ts`'s `resolveCapsuleKey`/`decryptCapsuleContent`,
 * which are owner-only (they take `ownerKeyWrap` + the master key from
 * `useMasterKey()`). A recipient's capsule key never comes from either of
 * those; it comes from the link fragment (`keyFromOpenedUrl`, below) or
 * from `PassphraseGate`'s `unwrapCapsuleKeyWithPassphrase` call (PHASE-5.1).
 * This file reuses `decryptField`/`readEnvelope` — the same wire format and
 * the same tolerant envelope parsing already proven against real web-sealed
 * content — rather than reimplementing either. No new cryptography is
 * introduced anywhere in this file.
 */

export type DecryptRevealLetterResult =
  | { status: 'empty' }
  | { status: 'key_mismatch'; error: Error }
  | { status: 'ok'; envelope: LetterEnvelope };

/**
 * Collapses `decryptField`'s `decryption_failed` and a downstream JSON-parse
 * failure into one `key_mismatch` outcome — matching this codebase's own
 * established convention (`capsule-detail.tsx`'s `RecordSection`: "none of
 * them is something a retry fixes... none of them is a detail safe or
 * useful to explain further") rather than web's simpler single boolean
 * flag. From a recipient's perspective both cases read identically: the key
 * this link carries does not open this capsule.
 */
export async function decryptRevealLetter(capsuleKey: Uint8Array, contentDocEnc: string | null): Promise<DecryptRevealLetterResult> {
  if (!contentDocEnc) return { status: 'empty' };

  const fieldResult = await decryptField(capsuleKey, contentDocEnc);
  if (fieldResult.status !== 'ok') return { status: 'key_mismatch', error: fieldResult.error };

  try {
    const text = new TextDecoder().decode(fieldResult.plaintext);
    const parsed: unknown = JSON.parse(text);
    return { status: 'ok', envelope: readEnvelope(parsed) };
  } catch (error) {
    return { status: 'key_mismatch', error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * Mirrors web's own `keyFromUrlFragment()` (apps/web/src/app/(reveal)/c/
 * [token]/page.tsx) exactly — same regex, same "no key" (null) result for a
 * missing or malformed fragment, same reliance on `decodeCapsuleKeyFromLink`
 * never throwing being handled by the caller rather than assumed. Takes the
 * *whole* opened URL rather than just its fragment: `decodeCapsuleKeyFromLink`'s
 * own regex (`/(?:^|[#&])k=([^&]+)/`) already anchors on `#`/`&`, so it finds
 * the key correctly wherever it appears in the string — matching how this
 * function is actually called, from `Linking.useLinkingURL()`'s raw URL
 * string, which carries the fragment intact but not split out on React
 * Native (there is no `window.location.hash` equivalent here).
 */
export function keyFromOpenedUrl(url: string | null): Uint8Array | null {
  if (!url || !/(?:^|[#&])k=/.test(url)) return null;
  try {
    return decodeCapsuleKeyFromLink(url);
  } catch {
    return null;
  }
}
