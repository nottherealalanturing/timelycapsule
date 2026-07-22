import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import '../env.js';
import { audit } from './audit.js';
import { db, pool } from './client.js';
import { auditEvents, users } from './schema/index.js';

describe('audit()', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('writes a row that can be read back', async () => {
    const [user] = await db
      .insert(users)
      .values({
        email: `audit-test-${randomUUID()}@example.com`,
        displayName: 'Audit Test User',
      })
      .returning();
    if (!user) throw new Error('user insert failed');

    await audit(db, {
      actorType: 'user',
      actorId: user.id,
      action: 'test.event',
      subjectType: 'user',
      subjectId: user.id,
      metadata: { ok: true },
    });

    const rows = await db.select().from(auditEvents).where(eq(auditEvents.subjectId, user.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe('test.event');
    expect(rows[0]?.actorType).toBe('user');
    expect(rows[0]?.metadata).toEqual({ ok: true });

    await db.delete(auditEvents).where(eq(auditEvents.subjectId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  });
});
