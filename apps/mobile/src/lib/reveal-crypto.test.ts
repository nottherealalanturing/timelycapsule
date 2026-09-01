import { encodeCapsuleKeyForLink, encryptBytes, generateMasterKey } from '@tc/crypto';
import { describe, expect, it } from 'vitest';
import { encodeIvCiphertext } from './capsule-crypto';
import { decryptRevealLetter, keyFromOpenedUrl } from './reveal-crypto';

// Real @tc/crypto throughout — this is a genuine round-trip test of the
// exact wire format the backend/web actually produce, not a rendering test
// with crypto mocked away (matches capsule-detail.test.tsx's own convention).

async function encryptEnvelope(capsuleKey: Uint8Array, doc: unknown): Promise<string> {
  const plaintext = new TextEncoder().encode(JSON.stringify(doc));
  const { iv, ciphertext } = await encryptBytes(capsuleKey, plaintext);
  return encodeIvCiphertext(iv, ciphertext);
}

describe('decryptRevealLetter()', () => {
  it('decrypts a real envelope with the correct key', async () => {
    const capsuleKey = generateMasterKey();
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello from the past.' }] }] };
    const contentDocEnc = await encryptEnvelope(capsuleKey, doc);

    const result = await decryptRevealLetter(capsuleKey, contentDocEnc);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.envelope.doc).toEqual(doc);
    }
  });

  it('accepts a bare legacy document with no envelope wrapper, matching web\'s own tolerance', async () => {
    const capsuleKey = generateMasterKey();
    const bareDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Legacy capsule.' }] }] };
    const contentDocEnc = await encryptEnvelope(capsuleKey, bareDoc);

    const result = await decryptRevealLetter(capsuleKey, contentDocEnc);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.envelope.doc).toEqual(bareDoc);
  });

  it('reports key_mismatch for a genuinely wrong key (AES-GCM auth failure)', async () => {
    const rightKey = generateMasterKey();
    const wrongKey = generateMasterKey();
    const contentDocEnc = await encryptEnvelope(rightKey, { type: 'doc', content: [] });

    const result = await decryptRevealLetter(wrongKey, contentDocEnc);
    expect(result.status).toBe('key_mismatch');
  });

  it('reports key_mismatch (not a crash) for ciphertext that decrypts to non-JSON garbage', async () => {
    const capsuleKey = generateMasterKey();
    const { iv, ciphertext } = await encryptBytes(capsuleKey, new TextEncoder().encode('not json at all {{{'));
    const contentDocEnc = encodeIvCiphertext(iv, ciphertext);

    const result = await decryptRevealLetter(capsuleKey, contentDocEnc);
    expect(result.status).toBe('key_mismatch');
  });

  it('reports empty for a null contentDocEnc without attempting to decrypt anything', async () => {
    const capsuleKey = generateMasterKey();
    const result = await decryptRevealLetter(capsuleKey, null);
    expect(result.status).toBe('empty');
  });
});

describe('keyFromOpenedUrl()', () => {
  it('extracts a real capsule key from a well-formed deep link', () => {
    const capsuleKey = generateMasterKey();
    const url = `timelycapsule://c/SOMETOKEN#${encodeCapsuleKeyForLink(capsuleKey)}`;
    const decoded = keyFromOpenedUrl(url);
    expect(decoded).toEqual(capsuleKey);
  });

  it('returns null for a URL with no key at all', () => {
    expect(keyFromOpenedUrl('timelycapsule://c/SOMETOKEN')).toBeNull();
  });

  it('returns null for a null URL', () => {
    expect(keyFromOpenedUrl(null)).toBeNull();
  });

  it('returns null (never throws) for a malformed key value', () => {
    expect(keyFromOpenedUrl('timelycapsule://c/SOMETOKEN#k=not-valid-base64url!!!')).toBeNull();
  });

  it('finds the key when other query params are present, matching web\'s own regex behavior', () => {
    const capsuleKey = generateMasterKey();
    const url = `timelycapsule://c/SOMETOKEN?foo=bar#${encodeCapsuleKeyForLink(capsuleKey)}&extra=value`;
    expect(keyFromOpenedUrl(url)).toEqual(capsuleKey);
  });
});
