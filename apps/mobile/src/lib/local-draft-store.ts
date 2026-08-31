import { decryptBytes, encryptBytes, fromBase64Url, toBase64Url } from '@tc/crypto';
import * as SQLite from 'expo-sqlite';
import { readEnvelope, type LetterEnvelope } from './capsule-crypto';
import { getLocalDraftKey } from './local-draft-key';

/**
 * Encrypted local draft persistence (E1.4.4) — per the readiness audit's §9
 * and the implementation blueprint's §6. This is the bridge between two
 * confirmed-safe states: content the user has typed, and content the server
 * has actually accepted via `PATCH /capsules/:id` (E1.4.3's existing
 * autosave, ~3s debounced). A row here exists exactly while those two are
 * out of sync — inserted/updated on every edit (not debounced — see
 * `use-capsule-compose.ts`'s `setText`, since the whole point is surviving
 * an app kill that happens *before* the 3s server debounce fires), deleted
 * the moment a server save confirms.
 *
 * **Only the letter envelope is persisted here** — never media (Decision
 * 16: media requires connectivity), never a sealed/sealing state (Decision
 * 7: no offline sealing, no "queued" pseudo-state), never Address fields
 * (who/when already live server-side from the moment they're answered,
 * per E1.4.1 — there is no offline gap for them to bridge).
 *
 * Storage is `expo-sqlite` (`[RECOMMENDATION]` in both source docs, and the
 * only one with a reason: structured, queryable-by-capsule-id data, not a
 * key-value shape). Encryption is the existing `@tc/crypto` AES-256-GCM via
 * `encryptBytes`/`decryptBytes` under the device-local draft key
 * (`local-draft-key.ts`) — no new primitive, no new wire format beyond a
 * small versioned JSON envelope so a future schema change has somewhere to
 * branch from.
 */

const DB_NAME = 'tc_local_drafts.db';
const RECORD_VERSION = 1;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      // `schema_version` is a per-row field (not just a table-level
      // PRAGMA) so a future migration can tell *which* rows still need
      // upgrading without a separate ledger — deliberately minimal for
      // V1's single version, but the column exists from day one so adding
      // version 2 later never needs an `ALTER TABLE`.
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS local_drafts (
          capsule_id TEXT PRIMARY KEY NOT NULL,
          account_id TEXT NOT NULL,
          schema_version INTEGER NOT NULL,
          iv TEXT NOT NULL,
          ciphertext TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
      return db;
    });
  }
  return dbPromise;
}

/** Test-only: forces the next `getDb()` call to reopen (a fresh in-memory fake per test). Never used by app code. */
export function _resetLocalDraftDbForTests(): void {
  dbPromise = null;
}

/**
 * Insert-or-update the one local draft row for this capsule. Called on
 * every edit, not debounced — see this file's header comment for why.
 * Never throws to the caller in a way that should interrupt typing;
 * `use-capsule-compose.ts` wraps this in its own try/catch and treats a
 * failure here as "local safety net unavailable this time," not a reason
 * to break Compose.
 */
export async function saveLocalDraft(accountId: string, capsuleId: string, envelope: LetterEnvelope): Promise<void> {
  const key = await getLocalDraftKey();
  const bytes = new TextEncoder().encode(JSON.stringify({ v: RECORD_VERSION, envelope }));
  const { iv, ciphertext } = await encryptBytes(key, bytes);
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO local_drafts (capsule_id, account_id, schema_version, iv, ciphertext, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(capsule_id) DO UPDATE SET
       account_id = excluded.account_id,
       schema_version = excluded.schema_version,
       iv = excluded.iv,
       ciphertext = excluded.ciphertext,
       updated_at = excluded.updated_at`,
    [capsuleId, accountId, RECORD_VERSION, toBase64Url(iv), toBase64Url(ciphertext), Date.now()],
  );
}

export type LocalDraftLookup =
  | { status: 'none' }
  | { status: 'found'; envelope: LetterEnvelope }
  | { status: 'corrupted' };

interface LocalDraftRow {
  account_id: string;
  schema_version: number;
  iv: string;
  ciphertext: string;
}

/**
 * Looks up the local draft for this capsule, scoped to `accountId` — a row
 * belonging to a different account (should never exist given logout wipes
 * every row, but checked anyway as defense in depth, per the ticket's
 * explicit "never allow account B to accidentally decrypt account A's
 * local data" requirement) is treated identically to no row at all.
 *
 * A row that exists but fails to decrypt or parse (wrong/rotated device
 * key, truncated write, a future schema version this build doesn't
 * understand) is reported as `corrupted` and the bad row is deleted —
 * never surfaced as ciphertext, never partially rendered, and never left
 * behind to fail the same way again on every future open.
 */
export async function loadLocalDraft(accountId: string, capsuleId: string): Promise<LocalDraftLookup> {
  const db = await getDb();
  const row = await db.getFirstAsync<LocalDraftRow>(
    `SELECT account_id, schema_version, iv, ciphertext FROM local_drafts WHERE capsule_id = ?`,
    [capsuleId],
  );
  if (!row || row.account_id !== accountId) return { status: 'none' };

  try {
    const key = await getLocalDraftKey();
    const plaintext = await decryptBytes(key, fromBase64Url(row.iv), fromBase64Url(row.ciphertext));
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as { v?: number; envelope?: unknown };
    if (parsed.v !== RECORD_VERSION || !parsed.envelope) throw new Error('unrecognized local draft record shape');
    return { status: 'found', envelope: readEnvelope(parsed.envelope) };
  } catch {
    await deleteLocalDraft(capsuleId);
    return { status: 'corrupted' };
  }
}

/** Called once a server sync of this capsule's content is confirmed — the local row's entire reason to exist is gone. */
export async function deleteLocalDraft(capsuleId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM local_drafts WHERE capsule_id = ?`, [capsuleId]);
}

/**
 * Logout: unconditional wipe of every local draft row for this account
 * (readiness audit §9) — never a lingering plaintext-adjacent draft
 * belonging to a signed-out account. The device draft key itself is
 * deliberately **not** touched here (see `local-draft-key.ts`'s header
 * comment) — it's device-scoped, and deleting it would strand any other
 * account's not-yet-synced draft on a shared device.
 */
export async function deleteAllLocalDraftsForAccount(accountId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM local_drafts WHERE account_id = ?`, [accountId]);
}
