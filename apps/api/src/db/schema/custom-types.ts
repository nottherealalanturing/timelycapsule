import { customType } from 'drizzle-orm/pg-core';

/**
 * Case-insensitive text (requires the `citext` extension — enabled in the
 * first migration, see src/db/migrate.ts). Used for emails/handles/tags
 * per plan/03-ARCHITECTURE.md §13 so `WHERE email = $1` is naturally
 * case-insensitive without a lower() wrapper at every call site.
 */
export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

/** Postgres `inet` type, used for session IP addresses. */
export const inet = customType<{ data: string }>({
  dataType() {
    return 'inet';
  },
});
