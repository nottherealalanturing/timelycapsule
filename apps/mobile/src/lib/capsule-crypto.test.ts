import { encryptBytes, generateMasterKey, toBase64Url, unwrapCapsuleKeyForOwner, wrapCapsuleKeyForOwner, wrapMasterKeyWithPassword } from '@tc/crypto';
import { describe, expect, it } from 'vitest';
import {
  decryptCapsuleContent,
  decryptField,
  decryptReplyBody,
  emptyEnvelope,
  encodeIvCiphertext,
  envelopeText,
  envelopeToText,
  readEnvelope,
  resolveCapsuleKey,
  textToEnvelope,
  type LetterEnvelope,
} from './capsule-crypto';

/** Matches apps/web/src/lib/capsule-crypto.ts's `encodeIvCiphertext` wire format: iv(12)||ciphertext, base64'd once. */
function encodeField(iv: Uint8Array, ciphertext: Uint8Array): string {
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return toBase64Url(combined);
}

async function buildFixture(envelope: LetterEnvelope) {
  const masterKey = generateMasterKey();
  const capsuleKey = generateMasterKey(); // any random 256-bit key serves as a capsule key in a test
  const ownerKeyWrap = await wrapCapsuleKeyForOwner(capsuleKey, masterKey);
  const { iv, ciphertext } = await encryptBytes(capsuleKey, new TextEncoder().encode(JSON.stringify(envelope)));
  const contentDocEnc = encodeField(iv, ciphertext);
  return { masterKey, capsuleKey, ownerKeyWrap, contentDocEnc };
}

describe('capsule-crypto.ts', () => {
  describe('resolveCapsuleKey', () => {
    it('returns no_content when ownerKeyWrap is null', async () => {
      const result = await resolveCapsuleKey(null, generateMasterKey());
      expect(result.status).toBe('no_content');
    });

    it('unwraps a real capsule key wrap correctly', async () => {
      const { masterKey, capsuleKey, ownerKeyWrap } = await buildFixture({ doc: null, writtenAt: null });
      const result = await resolveCapsuleKey(ownerKeyWrap, masterKey);
      expect(result.status).toBe('ok');
      if (result.status === 'ok') expect(result.capsuleKey).toEqual(capsuleKey);
    });

    it('reports invalid_key_wrap for the wrong master key (AES-GCM auth failure), not a crash', async () => {
      const { ownerKeyWrap } = await buildFixture({ doc: null, writtenAt: null });
      const result = await resolveCapsuleKey(ownerKeyWrap, generateMasterKey());
      expect(result.status).toBe('invalid_key_wrap');
      if (result.status === 'invalid_key_wrap') expect(result.error).toBeInstanceOf(Error);
    });

    it('reports invalid_key_wrap for a corrupted wrap string, not a crash', async () => {
      const result = await resolveCapsuleKey('not-a-real-wrap', generateMasterKey());
      expect(result.status).toBe('invalid_key_wrap');
    });
  });

  describe('decryptField', () => {
    it('decrypts a real field correctly', async () => {
      const capsuleKey = generateMasterKey();
      const { iv, ciphertext } = await encryptBytes(capsuleKey, new TextEncoder().encode('hello'));
      const result = await decryptField(capsuleKey, encodeField(iv, ciphertext));
      expect(result.status).toBe('ok');
      if (result.status === 'ok') expect(new TextDecoder().decode(result.plaintext)).toBe('hello');
    });

    it('reports decryption_failed for a tampered ciphertext, not a crash', async () => {
      const capsuleKey = generateMasterKey();
      const { iv, ciphertext } = await encryptBytes(capsuleKey, new TextEncoder().encode('hello'));
      ciphertext[0] = ciphertext[0]! ^ 0xff;
      const result = await decryptField(capsuleKey, encodeField(iv, ciphertext));
      expect(result.status).toBe('decryption_failed');
    });

    it('reports decryption_failed for garbage base64, not a crash', async () => {
      const result = await decryptField(generateMasterKey(), '###not-valid-base64###');
      expect(result.status).toBe('decryption_failed');
    });

    it('reports decryption_failed for the wrong key', async () => {
      const { iv, ciphertext } = await encryptBytes(generateMasterKey(), new TextEncoder().encode('hello'));
      const result = await decryptField(generateMasterKey(), encodeField(iv, ciphertext));
      expect(result.status).toBe('decryption_failed');
    });
  });

  describe('readEnvelope', () => {
    it('accepts a full envelope with a place memory', () => {
      const doc = { type: 'doc', content: [] };
      const writtenAt = { name: 'Lagos', lat: 6.5, lng: 3.4 };
      expect(readEnvelope({ doc, writtenAt })).toEqual({ doc, writtenAt });
    });

    it('accepts a legacy bare TipTap document with no envelope wrapper', () => {
      const doc = { type: 'doc', content: [{ type: 'paragraph' }] };
      expect(readEnvelope(doc)).toEqual({ doc, writtenAt: null });
    });

    it('never throws on a completely unrecognized shape', () => {
      expect(() => readEnvelope('not an object')).not.toThrow();
      expect(() => readEnvelope(null)).not.toThrow();
      expect(() => readEnvelope(42)).not.toThrow();
      expect(readEnvelope('nonsense').writtenAt).toBeNull();
    });
  });

  describe('envelopeText', () => {
    it('flattens paragraphs of text nodes, joined by a blank line', () => {
      const doc = {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'First line.' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Second' }, { type: 'text', text: ' line.' }] },
        ],
      };
      expect(envelopeText({ doc, writtenAt: null })).toBe('First line.\n\nSecond line.');
    });

    it('skips empty paragraphs rather than emitting blank lines for them', () => {
      const doc = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Only line.' }] }, { type: 'paragraph' }],
      };
      expect(envelopeText({ doc, writtenAt: null })).toBe('Only line.');
    });

    it('returns an empty string for a doc with no content, rather than throwing', () => {
      expect(envelopeText({ doc: { type: 'doc' }, writtenAt: null })).toBe('');
      expect(envelopeText({ doc: null, writtenAt: null })).toBe('');
    });
  });

  describe('decryptCapsuleContent (the full chain)', () => {
    it('decrypts a real, full envelope end to end', async () => {
      const envelope: LetterEnvelope = { doc: { type: 'doc', content: [{ type: 'paragraph' }] }, writtenAt: { name: 'Home', lat: 1, lng: 2 } };
      const { masterKey, ownerKeyWrap, contentDocEnc } = await buildFixture(envelope);

      const result = await decryptCapsuleContent({ ownerKeyWrap, contentDocEnc }, masterKey);
      expect(result.status).toBe('ok');
      if (result.status === 'ok') expect(result.envelope).toEqual(envelope);
    });

    it('decrypts a legacy bare-document payload correctly', async () => {
      const doc = { type: 'doc', content: [{ type: 'paragraph' }] };
      const { masterKey, ownerKeyWrap, contentDocEnc } = await buildFixture(doc as unknown as LetterEnvelope);

      const result = await decryptCapsuleContent({ ownerKeyWrap, contentDocEnc }, masterKey);
      expect(result.status).toBe('ok');
      if (result.status === 'ok') expect(result.envelope).toEqual({ doc, writtenAt: null });
    });

    it('returns no_content when contentDocEnc is null (a draft capsule)', async () => {
      const result = await decryptCapsuleContent({ ownerKeyWrap: null, contentDocEnc: null }, generateMasterKey());
      expect(result).toEqual({ status: 'no_content' });
    });

    it('returns no_content when ownerKeyWrap is null even if contentDocEnc somehow is not', async () => {
      const result = await decryptCapsuleContent({ ownerKeyWrap: null, contentDocEnc: 'ignored' }, generateMasterKey());
      expect(result).toEqual({ status: 'no_content' });
    });

    it('returns invalid_key_wrap for the wrong master key', async () => {
      const { ownerKeyWrap, contentDocEnc } = await buildFixture({ doc: null, writtenAt: null });
      const result = await decryptCapsuleContent({ ownerKeyWrap, contentDocEnc }, generateMasterKey());
      expect(result.status).toBe('invalid_key_wrap');
    });

    it('returns decryption_failed for tampered content ciphertext', async () => {
      const { masterKey, ownerKeyWrap, contentDocEnc } = await buildFixture({ doc: null, writtenAt: null });
      const corrupted = contentDocEnc.slice(0, -4) + 'XXXX';
      const result = await decryptCapsuleContent({ ownerKeyWrap, contentDocEnc: corrupted }, masterKey);
      expect(result.status).toBe('decryption_failed');
    });

    it('returns malformed_content when the decrypted bytes are not valid JSON', async () => {
      const masterKey = generateMasterKey();
      const capsuleKey = generateMasterKey();
      const ownerKeyWrap = await wrapCapsuleKeyForOwner(capsuleKey, masterKey);
      const { iv, ciphertext } = await encryptBytes(capsuleKey, new TextEncoder().encode('this is not json'));
      const contentDocEnc = encodeField(iv, ciphertext);

      const result = await decryptCapsuleContent({ ownerKeyWrap, contentDocEnc }, masterKey);
      expect(result.status).toBe('malformed_content');
    });

    it('never touches password-based wrapping — a masterKeyWrap-shaped string is irrelevant to this utility', async () => {
      // Sanity check that this module's boundary is exactly capsule-key <-> master-key,
      // never password-derived — wrapMasterKeyWithPassword output is not a valid ownerKeyWrap input.
      const masterKey = generateMasterKey();
      const passwordWrap = await wrapMasterKeyWithPassword(masterKey, 'irrelevant-password');
      const result = await resolveCapsuleKey(passwordWrap, generateMasterKey());
      expect(result.status).toBe('invalid_key_wrap');
    });
  });

  describe('decryptReplyBody', () => {
    it('decrypts a real reply body correctly — bare text, no JSON envelope', async () => {
      const capsuleKey = generateMasterKey();
      const { iv, ciphertext } = await encryptBytes(capsuleKey, new TextEncoder().encode('Thank you for this.'));
      const bodyEnc = encodeField(iv, ciphertext);
      const result = await decryptReplyBody(capsuleKey, bodyEnc);
      expect(result).toEqual({ status: 'ok', text: 'Thank you for this.' });
    });

    it('reports decryption_failed for the wrong capsule key, not a crash', async () => {
      const { iv, ciphertext } = await encryptBytes(generateMasterKey(), new TextEncoder().encode('hello'));
      const result = await decryptReplyBody(generateMasterKey(), encodeField(iv, ciphertext));
      expect(result.status).toBe('decryption_failed');
    });

    it('reports decryption_failed for tampered ciphertext, not a crash', async () => {
      const capsuleKey = generateMasterKey();
      const { iv, ciphertext } = await encryptBytes(capsuleKey, new TextEncoder().encode('hello'));
      ciphertext[0] = ciphertext[0]! ^ 0xff;
      const result = await decryptReplyBody(capsuleKey, encodeField(iv, ciphertext));
      expect(result.status).toBe('decryption_failed');
    });

    it('does not attempt any JSON parsing — a plaintext that looks like broken JSON still decrypts fine', async () => {
      const capsuleKey = generateMasterKey();
      const { iv, ciphertext } = await encryptBytes(capsuleKey, new TextEncoder().encode('{not valid json'));
      const result = await decryptReplyBody(capsuleKey, encodeField(iv, ciphertext));
      expect(result).toEqual({ status: 'ok', text: '{not valid json' });
    });
  });

  describe('textToEnvelope / envelopeToText (E1.4.3 write-side)', () => {
    it('a single line becomes one paragraph, and round-trips exactly', () => {
      const envelope = textToEnvelope('Dear future me,');
      expect(envelope.doc).toEqual({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dear future me,' }] }] });
      expect(envelopeToText(envelope)).toBe('Dear future me,');
    });

    it('each newline becomes its own paragraph, and round-trips exactly', () => {
      const envelope = textToEnvelope('First line.\nSecond line.\nThird line.');
      expect(envelope.doc).toEqual({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'First line.' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Second line.' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Third line.' }] },
        ],
      });
      expect(envelopeToText(envelope)).toBe('First line.\nSecond line.\nThird line.');
    });

    it('a blank line becomes an empty paragraph (no content key), matching EMPTY_DOC\'s own shape, and round-trips exactly', () => {
      const envelope = textToEnvelope('Before.\n\nAfter.');
      expect(envelope.doc).toEqual({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Before.' }] },
          { type: 'paragraph' },
          { type: 'paragraph', content: [{ type: 'text', text: 'After.' }] },
        ],
      });
      expect(envelopeToText(envelope)).toBe('Before.\n\nAfter.');
    });

    it('empty text produces exactly emptyEnvelope()\'s own doc shape', () => {
      expect(textToEnvelope('')).toEqual(emptyEnvelope());
    });

    it('preserves place-memory (writtenAt) untouched — Compose never sets it', () => {
      const writtenAt = { name: 'Lagos', lat: 6.5, lng: 3.4 };
      const envelope = textToEnvelope('Hello.', writtenAt);
      expect(envelope.writtenAt).toEqual(writtenAt);
    });

    it('reads back Unicode and special characters unchanged', () => {
      const text = 'Café ☕️, naïve façade — 日本語 — "quoted" & <tags>';
      expect(envelopeToText(textToEnvelope(text))).toBe(text);
    });

    it('envelopeToText on an already-decrypted real envelope matches what was typed, not envelopeText\'s display-only double-spacing', () => {
      const typed = 'Line one.\nLine two.';
      const envelope = textToEnvelope(typed);
      expect(envelopeToText(envelope)).toBe(typed);
      // The read-only detail screen's own join is deliberately different —
      // this is an existing, separate display convention, not a bug here.
      expect(envelopeText(envelope)).toBe('Line one.\n\nLine two.');
    });
  });

  describe('encodeIvCiphertext (E1.4.3 write-side wire format)', () => {
    it('produces standard base64 — "+", "/", and "=" padding, never "-" or "_"', async () => {
      // A payload long/varied enough that a real AES-GCM ciphertext is
      // overwhelmingly likely to contain at least one byte that maps to
      // '+' or '/' in standard base64 (vs. '-'/'_' in base64url) — this
      // isn't guaranteed by construction the way a fixed test vector would
      // be, but running it is still worth more than asserting shape alone.
      const capsuleKey = generateMasterKey();
      const { iv, ciphertext } = await encryptBytes(capsuleKey, new TextEncoder().encode('x'.repeat(200)));
      const encoded = encodeIvCiphertext(iv, ciphertext);
      expect(encoded).not.toMatch(/[-_]/);
      expect(encoded.length % 4).toBe(0); // always padded to a multiple of 4, unlike toBase64Url
    });

    it('round-trips through this file\'s own base64url-tolerant decoder (splitIvCiphertext, via decryptField)', async () => {
      const capsuleKey = generateMasterKey();
      const { iv, ciphertext } = await encryptBytes(capsuleKey, new TextEncoder().encode('hello, standard base64'));
      const encoded = encodeIvCiphertext(iv, ciphertext);
      const result = await decryptField(capsuleKey, encoded);
      expect(result.status).toBe('ok');
      if (result.status === 'ok') expect(new TextDecoder().decode(result.plaintext)).toBe('hello, standard base64');
    });

    it(
      'round-trips through the exact server-side transform (Buffer.from(x,"base64") inbound, ' +
        '.toString("base64") outbound) — the empirical proof the E1.4 readiness audit\'s §6.8 asks for, ' +
        'not merely assumed Buffer tolerance',
      async () => {
        const capsuleKey = generateMasterKey();
        const plaintext = 'Proving the exact wire format the real API decode/encode path uses.';
        const { iv, ciphertext } = await encryptBytes(capsuleKey, new TextEncoder().encode(plaintext));
        const sentByMobile = encodeIvCiphertext(iv, ciphertext);

        // apps/api/src/modules/capsules/service.ts's patchCapsule, inbound:
        // `Buffer.from(patch.contentDocEnc, 'base64')`.
        const storedBytes = Buffer.from(sentByMobile, 'base64');
        // apps/api/src/modules/capsules/mappers.ts's base64OrNull, outbound
        // on the next GET: `buf.toString('base64')`.
        const returnedByServer = storedBytes.toString('base64');

        expect(returnedByServer).toBe(sentByMobile); // standard base64 is stable through a real Buffer round-trip
        const result = await decryptField(capsuleKey, returnedByServer);
        expect(result.status).toBe('ok');
        if (result.status === 'ok') expect(new TextDecoder().decode(result.plaintext)).toBe(plaintext);
      },
    );

    it(
      'confirms the tolerance web\'s own ownerKeyWrap already relies on in production: a base64url wrap ' +
        'survives the exact real server Buffer round-trip and still unwraps to the identical capsule key',
      async () => {
        // wrapCapsuleKeyForOwner (shared @tc/crypto, unchanged, identical on
        // both platforms) produces base64url, not standard base64 — this is
        // not a mobile-specific choice, so it is proven here rather than
        // re-encoded. No mobile-side change results from this test; it only
        // confirms an assumption web's own production traffic already
        // depends on, silently, for every capsule either platform creates.
        const masterKey = generateMasterKey();
        const capsuleKey = generateMasterKey();
        const sentByEitherPlatform = await wrapCapsuleKeyForOwner(capsuleKey, masterKey);

        // apps/api/src/modules/capsules/service.ts's setOwnerKeyWrap/patchCapsule, inbound:
        const storedBytes = Buffer.from(sentByEitherPlatform, 'base64');
        // apps/api/src/modules/capsules/mappers.ts's base64OrNull, outbound on the next GET:
        const returnedByServer = storedBytes.toString('base64');

        expect(returnedByServer).not.toBe(sentByEitherPlatform); // text form does change (base64url in, standard base64 out)...
        const unwrapped = await unwrapCapsuleKeyForOwner(returnedByServer, masterKey);
        expect(unwrapped).toEqual(capsuleKey); // ...but the bytes it decodes to, and therefore the unwrap, do not
      },
    );
  });
});
