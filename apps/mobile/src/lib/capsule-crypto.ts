import { decryptBytes, fromBase64Url, unwrapCapsuleKeyForOwner } from '@tc/crypto';

/**
 * Shared mobile-side capsule decryption boundary (Stage E, E1.3.7). Every
 * screen that needs to decrypt something belonging to a capsule — the
 * letter now, media/replies once those tickets land — goes through this
 * file's two building blocks (`resolveCapsuleKey`, `decryptField`) rather
 * than each re-deriving the capsule key or re-implementing the
 * iv||ciphertext split independently. `decryptCapsuleContent` composes
 * them for the one case E1.3.8 needs today.
 *
 * This file only *calls* `@tc/crypto` — it introduces no new cryptography,
 * no new wire format, and no change to Argon2id or any other parameter.
 * The master key is never read from anywhere here; every function takes it
 * as an explicit parameter, supplied by the caller from the existing
 * `useMasterKey()` context (src/lib/master-key-context.tsx) — this file has
 * no React dependency and no knowledge of where the key came from, which is
 * what keeps it independently testable and keeps the key itself out of any
 * new persistence path (nothing in this file writes anywhere).
 */

/**
 * `contentDocEnc` (and, by the same convention, each media item's encrypted
 * blob and each reply's `bodyEnc`) is `iv(12) || ciphertext`, base64'd once
 * — matches apps/web/src/lib/capsule-crypto.ts's `encodeIvCiphertext`
 * exactly (see that file's own comment: this mirrors `@tc/crypto`'s own
 * `wrapKey` layout, not a delimited string). `AES_IV_BYTES` isn't part of
 * `@tc/crypto`'s public surface (only `.` is exported per its
 * package.json), so this is hardcoded here the same way web's own helper
 * hardcodes it — not a guess, a documented mirror of a fixed protocol
 * constant.
 */
const IV_BYTES = 12;

function splitIvCiphertext(base64: string): { iv: Uint8Array; ciphertext: Uint8Array } {
  const combined = fromBase64Url(base64);
  return { iv: combined.slice(0, IV_BYTES), ciphertext: combined.slice(IV_BYTES) };
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export type CapsuleKeyResult =
  | { status: 'no_content' }
  | { status: 'invalid_key_wrap'; error: Error }
  | { status: 'ok'; capsuleKey: Uint8Array };

/**
 * Step 1 of the decrypt chain: master key → capsule key. `ownerKeyWrap` is
 * `null` for an owned capsule that hasn't been through its first autosave
 * yet (a real, reachable state — a `draft` capsule with no content written
 * — confirmed in the E1.3 final readiness audit, not assumed) — that's
 * `no_content`, not a failure to report as an error. Anything else that
 * fails here (corrupted wrap, wrong master key producing an AES-GCM
 * auth-tag mismatch, malformed base64) is `invalid_key_wrap` — the caller
 * decides how to present that, this function only classifies it.
 */
export async function resolveCapsuleKey(ownerKeyWrap: string | null, masterKey: Uint8Array): Promise<CapsuleKeyResult> {
  if (!ownerKeyWrap) return { status: 'no_content' };
  try {
    const capsuleKey = await unwrapCapsuleKeyForOwner(ownerKeyWrap, masterKey);
    return { status: 'ok', capsuleKey };
  } catch (error) {
    return { status: 'invalid_key_wrap', error: asError(error) };
  }
}

export type DecryptFieldResult = { status: 'decryption_failed'; error: Error } | { status: 'ok'; plaintext: Uint8Array };

/**
 * Step 2: decrypt one `iv||ciphertext` field under an already-resolved
 * capsule key. Shared by content, media, and (later) replies — all use the
 * identical wire format under the same key. Both a malformed-base64 blob
 * and a genuine AES-GCM authentication failure surface here as
 * `decryption_failed` — from the caller's perspective both mean "this
 * ciphertext could not be turned into plaintext," and AES-GCM's own
 * guarantee (throw rather than return wrong plaintext) is preserved either
 * way, never swallowed into a silent bad result.
 */
export async function decryptField(capsuleKey: Uint8Array, ivCiphertextB64: string): Promise<DecryptFieldResult> {
  try {
    const { iv, ciphertext } = splitIvCiphertext(ivCiphertextB64);
    const plaintext = await decryptBytes(capsuleKey, iv, ciphertext);
    return { status: 'ok', plaintext };
  } catch (error) {
    return { status: 'decryption_failed', error: asError(error) };
  }
}

/**
 * What a capsule's encrypted blob actually contains — mirrors
 * apps/web/src/lib/letter-envelope.ts's `LetterEnvelope`/`PlaceMemory`
 * exactly (same shape, same tolerant-never-throws `readEnvelope` behavior).
 * Ported rather than imported: `apps/web/src/lib` isn't a shared package
 * apps/mobile can reach, and this logic has no DOM/React dependency of its
 * own, so duplicating these ~15 lines here is smaller and more honest than
 * inventing a new shared package boundary for one leaf file, which is out
 * of this ticket's scope. Full rendering of `doc` (the TipTap document) is
 * E1.3.8's concern, not this utility's — this only gets the envelope
 * *shape* right, matching the one other client that already reads it.
 */
export interface PlaceMemory {
  name: string;
  lat: number;
  lng: number;
}

export interface LetterEnvelope {
  doc: unknown;
  writtenAt: PlaceMemory | null;
}

export const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

function isTipTapDoc(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { type?: string }).type === 'doc';
}

/** Accepts either an envelope or a legacy bare document. Never throws — matches web's own tolerance exactly. */
export function readEnvelope(value: unknown): LetterEnvelope {
  if (isTipTapDoc(value)) return { doc: value, writtenAt: null };
  if (typeof value === 'object' && value !== null && 'doc' in value) {
    const env = value as Partial<LetterEnvelope>;
    return { doc: isTipTapDoc(env.doc) ? env.doc : EMPTY_DOC, writtenAt: env.writtenAt ?? null };
  }
  return { doc: EMPTY_DOC, writtenAt: null };
}

/**
 * Plain text of a letter, for surfaces that render a reading rather than an
 * editor (E1.3.8's detail screen) — mirrors
 * apps/web/src/lib/letter-envelope.ts's `envelopeText` exactly (same
 * paragraph-flattening rule), operating on an already-resolved
 * `LetterEnvelope` rather than re-parsing a raw value, since every caller
 * here already has one from `decryptCapsuleContent`'s `ok` result.
 * Deliberately tolerant: an unrecognized block contributes nothing rather
 * than throwing — an owner must never meet a crash because a node type
 * they have no way to care about failed to parse.
 */
export function envelopeText(envelope: LetterEnvelope): string {
  const node = envelope.doc as { content?: { content?: { text?: string }[] }[] } | null;
  if (!node?.content) return '';
  return node.content
    .map((block) => (block.content ?? []).map((leaf) => leaf.text ?? '').join(''))
    .filter((line) => line.length > 0)
    .join('\n\n');
}

/** A freshly-started letter — one empty paragraph, matching web's own `emptyEnvelope()` exactly. */
export function emptyEnvelope(): LetterEnvelope {
  return { doc: EMPTY_DOC, writtenAt: null };
}

/**
 * The write-side counterpart to `envelopeText`, for Compose's (E1.4.3) plain
 * multiline text field — not used by the read-only detail screen, which only
 * ever needs `envelopeText`'s display join. One `\n` is one paragraph break,
 * matching TipTap's own per-Enter paragraph creation on web (a soft line
 * break within a paragraph needs Shift+Enter there, which this ticket has no
 * need to reproduce on a plain `TextInput`). `envelopeToText` is this
 * function's exact inverse, so reopening Compose reads back precisely what
 * was typed — not `envelopeText`'s own double-newline *display* convention,
 * which is a separate, already-established, unrelated rendering choice.
 */
export function textToEnvelope(text: string, writtenAt: PlaceMemory | null = null): LetterEnvelope {
  const doc = {
    type: 'doc',
    content: text
      .split('\n')
      .map((line) => (line.length > 0 ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' })),
  };
  return { doc, writtenAt };
}

/** The exact inverse of `textToEnvelope`, for loading existing content back into Compose's editable field. */
export function envelopeToText(envelope: LetterEnvelope): string {
  const node = envelope.doc as { content?: { content?: { text?: string }[] }[] } | null;
  if (!node?.content) return '';
  return node.content.map((block) => (block.content ?? []).map((leaf) => leaf.text ?? '').join('')).join('\n');
}

/**
 * The write-direction counterpart to `splitIvCiphertext` above — mirrors
 * `apps/web/src/lib/capsule-crypto.ts`'s `encodeIvCiphertext` exactly (plain
 * `btoa`, standard base64 alphabet and padding). Deliberately **not**
 * `@tc/crypto`'s `toBase64Url`: `contentDocEnc`/`ownerKeyWrap` are documented
 * as standard base64 on the wire (`packages/contracts/src/capsules.ts`,
 * decoded server-side via `Buffer.from(x, 'base64')`). That decode is
 * empirically tolerant of base64url input too (proven by `splitIvCiphertext`
 * above, base64url-based, already exercised against real web-sealed content
 * in every prior on-device test this Stage E arc has performed) — but the
 * E1.4 readiness audit's own §6.8 is explicit that mobile's *own*
 * newly-produced ciphertext should match the canonical wire format rather
 * than merely rely on that tolerance, so this is a small, dedicated encoder
 * rather than a reused one. `ownerKeyWrap` needs no equivalent: it is
 * produced by `@tc/crypto`'s own shared `wrapCapsuleKeyForOwner`, unchanged
 * and byte-for-byte identical on both platforms (including web's own base64
 * *url* output there) — there is no mobile-specific encoding choice to make
 * for that field at all.
 */
export function encodeIvCiphertext(iv: Uint8Array, ciphertext: Uint8Array): string {
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  let binary = '';
  for (const byte of combined) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export type DecryptCapsuleContentResult =
  | { status: 'no_content' }
  | { status: 'invalid_key_wrap'; error: Error }
  | { status: 'decryption_failed'; error: Error }
  | { status: 'malformed_content'; error: Error }
  | { status: 'ok'; envelope: LetterEnvelope };

/**
 * The full chain the E1.3 blueprint describes: API capsule → ownerKeyWrap →
 * capsule key → contentDocEnc → plaintext → LetterEnvelope. Deliberately
 * takes only the two fields it needs (not a full `Capsule`) so it's callable
 * from a test fixture or a real API response identically.
 *
 * `TextDecoder` is used to turn the decrypted UTF-8 bytes into a string
 * before `JSON.parse`. It runs under plain Node/Vitest unconditionally (a
 * standard global there), and Expo's own "winter" runtime layer declares a
 * `TextDecoder` polyfill (confirmed present in `expo`'s own type surface) —
 * but unlike this app's already-shipped Argon2id/AES-GCM paths, this
 * specific global's behavior has not yet been exercised on a real device by
 * any prior ticket. Flagging this rather than asserting it as proven: if a
 * real-device run ever shows `TextDecoder` missing, the fix is a
 * `TextDecoder` polyfill import at app entry, not a change to this
 * function's logic.
 */
export async function decryptCapsuleContent(
  capsule: { ownerKeyWrap: string | null; contentDocEnc: string | null },
  masterKey: Uint8Array,
): Promise<DecryptCapsuleContentResult> {
  if (!capsule.contentDocEnc) return { status: 'no_content' };

  const keyResult = await resolveCapsuleKey(capsule.ownerKeyWrap, masterKey);
  if (keyResult.status !== 'ok') return keyResult;

  const fieldResult = await decryptField(keyResult.capsuleKey, capsule.contentDocEnc);
  if (fieldResult.status !== 'ok') return fieldResult;

  try {
    const text = new TextDecoder().decode(fieldResult.plaintext);
    const parsed: unknown = JSON.parse(text);
    return { status: 'ok', envelope: readEnvelope(parsed) };
  } catch (error) {
    return { status: 'malformed_content', error: asError(error) };
  }
}

export type DecryptReplyResult = { status: 'decryption_failed'; error: Error } | { status: 'ok'; text: string };

/**
 * E1.3.9's one addition to this file — a reply is capsule content, so it is
 * encrypted exactly like the letter, under the same capsule key, with the
 * same `iv||ciphertext` wire format (`bodyEnc`; see
 * packages/contracts/src/replies.ts's own comment and apps/web/src/lib/
 * reply-crypto.ts's `openReply`, which this mirrors). The one real
 * difference from `decryptCapsuleContent`: a reply's plaintext is bare
 * text, not a JSON-encoded `LetterEnvelope` — `sealReply`/`openReply` on
 * web never call `JSON.stringify`/`JSON.parse` at all — so there is no
 * `malformed_content` case here and no envelope to read; `decryptField`'s
 * own two outcomes (`decryption_failed`/`ok`) are already the complete
 * result space for this function. Callers resolve the capsule key once
 * (via `resolveCapsuleKey`, reusing whatever the letter's own decrypt
 * already resolved) and pass it in — this function never touches the
 * master key or `ownerKeyWrap` itself.
 */
export async function decryptReplyBody(capsuleKey: Uint8Array, bodyEnc: string): Promise<DecryptReplyResult> {
  const fieldResult = await decryptField(capsuleKey, bodyEnc);
  if (fieldResult.status !== 'ok') return fieldResult;
  try {
    return { status: 'ok', text: new TextDecoder().decode(fieldResult.plaintext) };
  } catch (error) {
    return { status: 'decryption_failed', error: asError(error) };
  }
}
