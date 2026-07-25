import { and, desc, eq, lt } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { capsuleVersions } from '../../db/schema/index.js';

const MAX_VERSIONS_PER_CAPSULE = 20;

type CapsuleSnapshot = Record<string, unknown>;

/**
 * Writes a snapshot of a draft's *pre-patch* state, then trims to the last
 * 20 (plan/05-BUILD-PLAYBOOK.md T-08: "Capsule versions (draft snapshots,
 * keep 20)"). Only ever called for drafts — sealed content is immutable, so
 * there's nothing further to version once sealed.
 */
export async function recordVersionSnapshot(db: Database, capsuleId: string, snapshot: CapsuleSnapshot): Promise<void> {
  await db.insert(capsuleVersions).values({ capsuleId, snapshot });

  const excess = await db
    .select({ id: capsuleVersions.id, createdAt: capsuleVersions.createdAt })
    .from(capsuleVersions)
    .where(eq(capsuleVersions.capsuleId, capsuleId))
    .orderBy(desc(capsuleVersions.createdAt));

  if (excess.length > MAX_VERSIONS_PER_CAPSULE) {
    const cutoff = excess[MAX_VERSIONS_PER_CAPSULE]!.createdAt;
    await db.delete(capsuleVersions).where(and(eq(capsuleVersions.capsuleId, capsuleId), lt(capsuleVersions.createdAt, cutoff)));
  }
}
