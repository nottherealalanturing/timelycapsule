/** T-22 load test cleanup — deletes all seeded rows for one run's owner. */
import '../src/env.js';
import { eq, inArray } from 'drizzle-orm';
import { db, pool } from '../src/db/client.js';
import { capsuleRecipients, capsules, scheduledActions, users } from '../src/db/schema/index.js';

async function main() {
  const ownerId = process.argv[2];
  if (!ownerId) {
    console.error('Usage: tsx loadtest/cleanup.ts <ownerId>');
    process.exit(1);
  }

  const caps = await db.select({ id: capsules.id }).from(capsules).where(eq(capsules.ownerId, ownerId));
  const capIds = caps.map((c) => c.id);
  console.log(`Cleaning up ${capIds.length} capsules for owner ${ownerId}...`);

  if (capIds.length > 0) {
    const recs = await db.select({ id: capsuleRecipients.id }).from(capsuleRecipients).where(inArray(capsuleRecipients.capsuleId, capIds));
    const recIds = recs.map((r) => r.id);

    if (recIds.length > 0) {
      await db.delete(scheduledActions).where(inArray(scheduledActions.subjectId, recIds));
    }
    await db.delete(scheduledActions).where(inArray(scheduledActions.subjectId, capIds));
    await db.delete(capsuleRecipients).where(inArray(capsuleRecipients.capsuleId, capIds));
    await db.delete(capsules).where(inArray(capsules.id, capIds));
  }
  await db.delete(users).where(eq(users.id, ownerId));

  console.log('Cleanup done.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
