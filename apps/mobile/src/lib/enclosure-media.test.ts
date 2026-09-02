import { encryptBytes, generateMasterKey } from '@tc/crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptEnclosure, enclosureNoun, formatBytes } from './enclosure-media';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

describe('decryptEnclosure()', () => {
  it('fetches the signed URL and decrypts the real iv||ciphertext wire format', async () => {
    const capsuleKey = generateMasterKey();
    const plaintext = new TextEncoder().encode('a real photograph, bytes and all');
    const { iv, ciphertext } = await encryptBytes(capsuleKey, plaintext);
    const combined = new Uint8Array(iv.length + ciphertext.length);
    combined.set(iv, 0);
    combined.set(ciphertext, iv.length);

    vi.mocked(fetch).mockResolvedValue(new Response(combined));

    const result = await decryptEnclosure('https://signed.example/blob', capsuleKey);
    expect(new TextDecoder().decode(result)).toBe('a real photograph, bytes and all');
  });

  it('throws (never returns wrong plaintext) when fetch itself fails', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 403 }));
    await expect(decryptEnclosure('https://signed.example/blob', generateMasterKey())).rejects.toThrow();
  });

  it('throws on a genuinely wrong key (AES-GCM auth failure), never silently returns garbage', async () => {
    const rightKey = generateMasterKey();
    const wrongKey = generateMasterKey();
    const { iv, ciphertext } = await encryptBytes(rightKey, new TextEncoder().encode('secret'));
    const combined = new Uint8Array(iv.length + ciphertext.length);
    combined.set(iv, 0);
    combined.set(ciphertext, iv.length);
    vi.mocked(fetch).mockResolvedValue(new Response(combined));

    await expect(decryptEnclosure('https://signed.example/blob', wrongKey)).rejects.toThrow();
  });
});

describe('enclosureNoun()', () => {
  it('matches web\'s own full six-way noun set exactly', () => {
    expect(enclosureNoun('image')).toBe('Photograph');
    expect(enclosureNoun('video')).toBe('Video');
    expect(enclosureNoun('audio')).toBe('Voice recording');
    expect(enclosureNoun('voice')).toBe('Voice recording');
    expect(enclosureNoun('document')).toBe('Document');
    expect(enclosureNoun('archive')).toBe('Archive');
    expect(enclosureNoun('something-unknown')).toBe('Enclosure');
  });
});

describe('formatBytes()', () => {
  it('formats bytes, kilobytes, and megabytes', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('returns an empty string for null/undefined', () => {
    expect(formatBytes(null)).toBe('');
    expect(formatBytes(undefined)).toBe('');
  });
});
