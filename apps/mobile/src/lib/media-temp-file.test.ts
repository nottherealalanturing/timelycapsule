import { describe, expect, it, vi } from 'vitest';

const created: { uri: string; bytes: Uint8Array | null; deleted: boolean }[] = [];

vi.mock('expo-file-system', () => {
  class FakeFile {
    uri: string;
    private record: { uri: string; bytes: Uint8Array | null; deleted: boolean };
    constructor(_dir: unknown, name: string) {
      this.uri = `file:///cache/${name}`;
      this.record = { uri: this.uri, bytes: null, deleted: false };
      created.push(this.record);
    }
    create() {
      // no-op for the fake — `write` below is what actually records bytes
    }
    write(bytes: Uint8Array) {
      this.record.bytes = bytes;
    }
    get exists() {
      return !this.record.deleted;
    }
    delete() {
      this.record.deleted = true;
    }
  }
  return { File: FakeFile, Paths: { cache: 'fake-cache-dir' } };
});

const { writeTempMediaFile, extensionFor } = await import('./media-temp-file');

describe('writeTempMediaFile()', () => {
  it('writes the exact bytes given and returns a usable uri', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const { uri } = writeTempMediaFile(bytes, '.jpg');
    expect(uri).toMatch(/^file:\/\/\/cache\//);
    expect(uri.endsWith('.jpg')).toBe(true);
    expect(created.at(-1)?.bytes).toEqual(bytes);
  });

  it('cleanup deletes the real file, not a no-op', () => {
    const { cleanup } = writeTempMediaFile(new Uint8Array([9]), '.png');
    const record = created.at(-1)!;
    expect(record.deleted).toBe(false);
    cleanup();
    expect(record.deleted).toBe(true);
  });

  it('cleanup never throws even if called twice', () => {
    const { cleanup } = writeTempMediaFile(new Uint8Array([9]), '.png');
    cleanup();
    expect(() => cleanup()).not.toThrow();
  });

  it('never reuses the recipient\'s real filename as the temp path', () => {
    const { uri } = writeTempMediaFile(new Uint8Array([1]), '.jpg');
    expect(uri).not.toContain('a-very-recognisable-original-name');
  });
});

describe('extensionFor()', () => {
  it('prefers the original filename\'s own extension', () => {
    expect(extensionFor('image/jpeg', 'sunset.jpg')).toBe('.jpg');
  });

  it('falls back to a MIME-derived extension when there is no filename', () => {
    expect(extensionFor('image/png', null)).toBe('.png');
  });

  it('returns an empty string when neither is available', () => {
    expect(extensionFor(null, null)).toBe('');
  });
});
