import { encryptBytes, fromBase64Url, generateAesKey, toBase64Url } from '@tc/crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Same in-memory-fake approach as token-store.test.ts/local-draft-key.test.ts. */
const secureStore = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => secureStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStore.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secureStore.delete(key);
  }),
}));

/**
 * `expo-sqlite` is a native module with no JS-only fallback, same reason
 * every other native Expo module in this codebase gets mocked for tests
 * (confirmed directly: importing it under plain Node throws before any of
 * this file's own code runs). This fake implements exactly the small,
 * fixed set of statements `local-draft-store.ts` actually issues — not a
 * general SQL engine — against a plain in-memory row map, so this file's
 * tests exercise the module's real upsert/lookup/delete/scoping logic and
 * its real `@tc/crypto` encryption, not a re-implementation of either.
 */
interface FakeRow {
  capsule_id: string;
  account_id: string;
  schema_version: number;
  iv: string;
  ciphertext: string;
  updated_at: number;
}
let rows = new Map<string, FakeRow>();

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => ({
    execAsync: vi.fn(async () => {}),
    runAsync: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('INSERT INTO local_drafts')) {
        const [capsuleId, accountId, schemaVersion, iv, ciphertext, updatedAt] = params as [
          string,
          string,
          number,
          string,
          string,
          number,
        ];
        rows.set(capsuleId, { capsule_id: capsuleId, account_id: accountId, schema_version: schemaVersion, iv, ciphertext, updated_at: updatedAt });
        return { changes: 1 };
      }
      if (sql.includes('DELETE FROM local_drafts WHERE capsule_id')) {
        const [capsuleId] = params as [string];
        const existed = rows.delete(capsuleId);
        return { changes: existed ? 1 : 0 };
      }
      if (sql.includes('DELETE FROM local_drafts WHERE account_id')) {
        const [accountId] = params as [string];
        let changes = 0;
        for (const [key, row] of rows) {
          if (row.account_id === accountId) {
            rows.delete(key);
            changes += 1;
          }
        }
        return { changes };
      }
      throw new Error(`FakeSQLite: unrecognized runAsync statement: ${sql}`);
    }),
    getFirstAsync: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('SELECT') && sql.includes('FROM local_drafts WHERE capsule_id')) {
        const [capsuleId] = params as [string];
        const row = rows.get(capsuleId);
        return row ? { account_id: row.account_id, schema_version: row.schema_version, iv: row.iv, ciphertext: row.ciphertext } : null;
      }
      throw new Error(`FakeSQLite: unrecognized getFirstAsync statement: ${sql}`);
    }),
  })),
}));

const { saveLocalDraft, loadLocalDraft, deleteLocalDraft, deleteAllLocalDraftsForAccount, _resetLocalDraftDbForTests } = await import(
  './local-draft-store'
);
const { _resetLocalDraftKeyCacheForTests } = await import('./local-draft-key');
const { emptyEnvelope, textToEnvelope } = await import('./capsule-crypto');

const ACCOUNT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACCOUNT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAPSULE_1 = '11111111-1111-1111-1111-111111111111';
const CAPSULE_2 = '22222222-2222-2222-2222-222222222222';

describe('local-draft-store.ts', () => {
  beforeEach(() => {
    rows = new Map();
    secureStore.clear();
    _resetLocalDraftKeyCacheForTests();
    _resetLocalDraftDbForTests();
  });

  describe('encrypt/decrypt round trip', () => {
    it('round-trips an empty draft', async () => {
      const envelope = emptyEnvelope();
      await saveLocalDraft(ACCOUNT_A, CAPSULE_1, envelope);
      const result = await loadLocalDraft(ACCOUNT_A, CAPSULE_1);
      expect(result).toEqual({ status: 'found', envelope });
    });

    it('round-trips a normal single-paragraph draft', async () => {
      const envelope = textToEnvelope('Dear future me, this is a real letter.');
      await saveLocalDraft(ACCOUNT_A, CAPSULE_1, envelope);
      expect(await loadLocalDraft(ACCOUNT_A, CAPSULE_1)).toEqual({ status: 'found', envelope });
    });

    it('round-trips multi-paragraph content', async () => {
      const envelope = textToEnvelope('First paragraph.\n\nSecond paragraph.\nThird line, same paragraph? No — new one.');
      await saveLocalDraft(ACCOUNT_A, CAPSULE_1, envelope);
      expect(await loadLocalDraft(ACCOUNT_A, CAPSULE_1)).toEqual({ status: 'found', envelope });
    });

    it('round-trips Unicode and special characters', async () => {
      const envelope = textToEnvelope('café résumé 日本語 🎉 emoji, "quotes", \'apostrophes\', <tags> & ampersands');
      await saveLocalDraft(ACCOUNT_A, CAPSULE_1, envelope);
      expect(await loadLocalDraft(ACCOUNT_A, CAPSULE_1)).toEqual({ status: 'found', envelope });
    });

    it('round-trips a large draft (tens of thousands of characters)', async () => {
      const envelope = textToEnvelope('Lorem ipsum dolor sit amet. '.repeat(3000));
      await saveLocalDraft(ACCOUNT_A, CAPSULE_1, envelope);
      expect(await loadLocalDraft(ACCOUNT_A, CAPSULE_1)).toEqual({ status: 'found', envelope });
    });

    it('produces a different IV (and ciphertext) on every save, even for identical plaintext', async () => {
      const envelope = textToEnvelope('same content both times');
      await saveLocalDraft(ACCOUNT_A, CAPSULE_1, envelope);
      const first = { ...rows.get(CAPSULE_1)! };
      await saveLocalDraft(ACCOUNT_A, CAPSULE_1, envelope);
      const second = rows.get(CAPSULE_1)!;
      expect(second.iv).not.toBe(first.iv);
      expect(second.ciphertext).not.toBe(first.ciphertext);
    });

    it('never stores the plaintext letter text anywhere in the raw row', async () => {
      const secret = 'a very specific and searchable plaintext sentence';
      await saveLocalDraft(ACCOUNT_A, CAPSULE_1, textToEnvelope(secret));
      const raw = JSON.stringify(rows.get(CAPSULE_1));
      expect(raw).not.toContain(secret);
    });
  });

  describe('corruption and failure handling', () => {
    it('reports "none" when no local draft exists for this capsule', async () => {
      expect(await loadLocalDraft(ACCOUNT_A, CAPSULE_1)).toEqual({ status: 'none' });
    });

    it('reports "corrupted" and deletes the row when the ciphertext has been tampered with', async () => {
      await saveLocalDraft(ACCOUNT_A, CAPSULE_1, textToEnvelope('hello'));
      const row = rows.get(CAPSULE_1)!;
      row.ciphertext = toBase64Url(new Uint8Array([...fromBase64Url(row.ciphertext)].map((b) => b ^ 0xff)));

      expect(await loadLocalDraft(ACCOUNT_A, CAPSULE_1)).toEqual({ status: 'corrupted' });
      expect(rows.has(CAPSULE_1)).toBe(false);
    });

    it('reports "corrupted" and deletes the row when the IV has been tampered with', async () => {
      await saveLocalDraft(ACCOUNT_A, CAPSULE_1, textToEnvelope('hello'));
      const row = rows.get(CAPSULE_1)!;
      row.iv = toBase64Url(new Uint8Array(12).fill(0)); // a plausible-looking but wrong IV

      expect(await loadLocalDraft(ACCOUNT_A, CAPSULE_1)).toEqual({ status: 'corrupted' });
      expect(rows.has(CAPSULE_1)).toBe(false);
    });

    it('reports "corrupted" (not a crash, not the wrong plaintext) when the row was encrypted under a different key entirely', async () => {
      await saveLocalDraft(ACCOUNT_A, CAPSULE_1, textToEnvelope('hello'));
      const row = rows.get(CAPSULE_1)!;
      const wrongKey = generateAesKey();
      const { iv, ciphertext } = await encryptBytes(wrongKey, new TextEncoder().encode(JSON.stringify({ v: 1, envelope: textToEnvelope('hello') })));
      row.iv = toBase64Url(iv);
      row.ciphertext = toBase64Url(ciphertext);

      expect(await loadLocalDraft(ACCOUNT_A, CAPSULE_1)).toEqual({ status: 'corrupted' });
    });

    it('reports "corrupted" for a malformed JSON payload after successful decryption', async () => {
      await saveLocalDraft(ACCOUNT_A, CAPSULE_1, textToEnvelope('hello'));
      const { getLocalDraftKey } = await import('./local-draft-key');
      const key = await getLocalDraftKey();
      const { iv, ciphertext } = await encryptBytes(key, new TextEncoder().encode('not valid json{{{'));
      const row = rows.get(CAPSULE_1)!;
      row.iv = toBase64Url(iv);
      row.ciphertext = toBase64Url(ciphertext);

      expect(await loadLocalDraft(ACCOUNT_A, CAPSULE_1)).toEqual({ status: 'corrupted' });
    });

    it('reports "corrupted" for a future/unrecognized schema version', async () => {
      await saveLocalDraft(ACCOUNT_A, CAPSULE_1, textToEnvelope('hello'));
      const { getLocalDraftKey } = await import('./local-draft-key');
      const key = await getLocalDraftKey();
      const { iv, ciphertext } = await encryptBytes(
        key,
        new TextEncoder().encode(JSON.stringify({ v: 999, envelope: textToEnvelope('hello') })),
      );
      const row = rows.get(CAPSULE_1)!;
      row.iv = toBase64Url(iv);
      row.ciphertext = toBase64Url(ciphertext);

      expect(await loadLocalDraft(ACCOUNT_A, CAPSULE_1)).toEqual({ status: 'corrupted' });
    });

    it('reports "corrupted" when the decrypted payload is missing the envelope field', async () => {
      await saveLocalDraft(ACCOUNT_A, CAPSULE_1, textToEnvelope('hello'));
      const { getLocalDraftKey } = await import('./local-draft-key');
      const key = await getLocalDraftKey();
      const { iv, ciphertext } = await encryptBytes(key, new TextEncoder().encode(JSON.stringify({ v: 1 })));
      const row = rows.get(CAPSULE_1)!;
      row.iv = toBase64Url(iv);
      row.ciphertext = toBase64Url(ciphertext);

      expect(await loadLocalDraft(ACCOUNT_A, CAPSULE_1)).toEqual({ status: 'corrupted' });
    });
  });

  describe('lifecycle: multiple drafts, delete, account scoping', () => {
    it('supports multiple independent drafts for the same account', async () => {
      await saveLocalDraft(ACCOUNT_A, CAPSULE_1, textToEnvelope('capsule one'));
      await saveLocalDraft(ACCOUNT_A, CAPSULE_2, textToEnvelope('capsule two'));

      expect(await loadLocalDraft(ACCOUNT_A, CAPSULE_1)).toEqual({ status: 'found', envelope: textToEnvelope('capsule one') });
      expect(await loadLocalDraft(ACCOUNT_A, CAPSULE_2)).toEqual({ status: 'found', envelope: textToEnvelope('capsule two') });
    });

    it('upserts — saving twice for the same capsule updates the one row rather than creating a second', async () => {
      await saveLocalDraft(ACCOUNT_A, CAPSULE_1, textToEnvelope('first version'));
      await saveLocalDraft(ACCOUNT_A, CAPSULE_1, textToEnvelope('second version'));
      expect(rows.size).toBe(1);
      expect(await loadLocalDraft(ACCOUNT_A, CAPSULE_1)).toEqual({ status: 'found', envelope: textToEnvelope('second version') });
    });

    it('deleteLocalDraft removes exactly the one row, leaving others untouched', async () => {
      await saveLocalDraft(ACCOUNT_A, CAPSULE_1, textToEnvelope('keep this'));
      await saveLocalDraft(ACCOUNT_A, CAPSULE_2, textToEnvelope('delete this'));
      await deleteLocalDraft(CAPSULE_2);

      expect(await loadLocalDraft(ACCOUNT_A, CAPSULE_1)).toEqual({ status: 'found', envelope: textToEnvelope('keep this') });
      expect(await loadLocalDraft(ACCOUNT_A, CAPSULE_2)).toEqual({ status: 'none' });
    });

    it('deleting a capsule id that has no row is a safe no-op', async () => {
      await expect(deleteLocalDraft('99999999-9999-9999-9999-999999999999')).resolves.toBeUndefined();
    });

    it('a row belonging to a different account is never returned, even if not yet wiped (defense in depth)', async () => {
      await saveLocalDraft(ACCOUNT_A, CAPSULE_1, textToEnvelope('account A content'));
      expect(await loadLocalDraft(ACCOUNT_B, CAPSULE_1)).toEqual({ status: 'none' });
    });

    it('deleteAllLocalDraftsForAccount wipes every row for that account and no others', async () => {
      await saveLocalDraft(ACCOUNT_A, CAPSULE_1, textToEnvelope('A one'));
      await saveLocalDraft(ACCOUNT_A, CAPSULE_2, textToEnvelope('A two'));
      const CAPSULE_3 = '33333333-3333-3333-3333-333333333333';
      await saveLocalDraft(ACCOUNT_B, CAPSULE_3, textToEnvelope('B one'));

      await deleteAllLocalDraftsForAccount(ACCOUNT_A);

      expect(await loadLocalDraft(ACCOUNT_A, CAPSULE_1)).toEqual({ status: 'none' });
      expect(await loadLocalDraft(ACCOUNT_A, CAPSULE_2)).toEqual({ status: 'none' });
      expect(await loadLocalDraft(ACCOUNT_B, CAPSULE_3)).toEqual({ status: 'found', envelope: textToEnvelope('B one') });
    });

    it('wiping an account with no local drafts is a safe no-op', async () => {
      await expect(deleteAllLocalDraftsForAccount(ACCOUNT_A)).resolves.toBeUndefined();
    });
  });

  describe('database initialization', () => {
    it('multiple concurrent operations before the database has finished opening all resolve correctly (single shared open, not one per call)', async () => {
      const SQLite = await import('expo-sqlite');
      const before = vi.mocked(SQLite.openDatabaseAsync).mock.calls.length;
      await Promise.all([
        saveLocalDraft(ACCOUNT_A, CAPSULE_1, textToEnvelope('one')),
        saveLocalDraft(ACCOUNT_A, CAPSULE_2, textToEnvelope('two')),
      ]);
      expect(vi.mocked(SQLite.openDatabaseAsync).mock.calls.length - before).toBe(1);
    });
  });

  describe('security: no plaintext or key material in logs', () => {
    it('never logs during a normal save/load cycle', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await saveLocalDraft(ACCOUNT_A, CAPSULE_1, textToEnvelope('sensitive letter content'));
        await loadLocalDraft(ACCOUNT_A, CAPSULE_1);
        expect(logSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
      } finally {
        logSpy.mockRestore();
        errorSpy.mockRestore();
      }
    });

    it('never logs during corruption handling either', async () => {
      await saveLocalDraft(ACCOUNT_A, CAPSULE_1, textToEnvelope('hello'));
      const row = rows.get(CAPSULE_1)!;
      row.ciphertext = toBase64Url(new Uint8Array([...fromBase64Url(row.ciphertext)].map((b) => b ^ 0xff)));

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await loadLocalDraft(ACCOUNT_A, CAPSULE_1);
        expect(logSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
      } finally {
        logSpy.mockRestore();
        errorSpy.mockRestore();
      }
    });
  });
});
