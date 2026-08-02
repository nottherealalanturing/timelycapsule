/**
 * T-22 k6 load test — drain assertion.
 *
 * Polls `scheduled_actions` for the seeded run's `capsule_unlock` +
 * `recipient_unlock` rows and reports how long the real scheduler + worker
 * processes (started separately, exactly as they run in production) take to
 * drive the whole backlog to a terminal state. Asserts <10 minutes
 * (`plan/05-BUILD-PLAYBOOK.md` T-22 DoD).
 *
 * A polling script, not k6 itself, because this is the one side of the test
 * that genuinely has no HTTP surface — the drain is a background worker
 * loop, not an endpoint. k6 is used for the concurrent-read half
 * (`reveal-read.js`), which runs at the same time against a real API
 * process, for the same reason: simulating recipients hitting their reveal
 * links as their capsules unlock is the part of "10k unlocks in 1 min" that
 * genuinely is HTTP load.
 *
 * Usage: NODE_ENV=test tsx loadtest/wait-for-drain.ts <ownerId>
 */
import '../src/env.js';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { db, pool } from '../src/db/client.js';
import { capsuleRecipients, capsules, scheduledActions } from '../src/db/schema/index.js';

const POLL_MS = 5_000;
const TIMEOUT_MS = 10 * 60_000;

async function main() {
  const ownerId = process.argv[2];
  if (!ownerId) {
    console.error('Usage: tsx loadtest/wait-for-drain.ts <ownerId>');
    process.exit(1);
  }

  const capsuleIds = (await db.select({ id: capsules.id }).from(capsules).where(eq(capsules.ownerId, ownerId))).map((c) => c.id);
  const recipientIds = (
    await db.select({ id: capsuleRecipients.id }).from(capsuleRecipients).where(inArray(capsuleRecipients.capsuleId, capsuleIds))
  ).map((r) => r.id);

  console.log(`Watching ${capsuleIds.length} capsule_unlock + ${recipientIds.length} recipient_unlock actions...`);

  const t0 = Date.now();
  while (Date.now() - t0 < TIMEOUT_MS) {
    const pendingCapsuleUnlocks = await db
      .select({ id: scheduledActions.id })
      .from(scheduledActions)
      .where(and(eq(scheduledActions.kind, 'capsule_unlock'), inArray(scheduledActions.subjectId, capsuleIds), ne(scheduledActions.state, 'done')));

    const pendingRecipientUnlocks = await db
      .select({ id: scheduledActions.id })
      .from(scheduledActions)
      .where(and(eq(scheduledActions.kind, 'recipient_unlock'), inArray(scheduledActions.subjectId, recipientIds), ne(scheduledActions.state, 'done')));

    const remaining = pendingCapsuleUnlocks.length + pendingRecipientUnlocks.length;
    const elapsedS = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`  t+${elapsedS}s: ${pendingCapsuleUnlocks.length} capsule_unlock, ${pendingRecipientUnlocks.length} recipient_unlock still pending`);

    if (remaining === 0) {
      const totalS = (Date.now() - t0) / 1000;
      console.log(`\nDRAINED in ${totalS.toFixed(1)}s (${(totalS / 60).toFixed(2)} min) — ${totalS < 600 ? 'PASS' : 'FAIL'} (<10min)`);
      await pool.end();
      process.exit(totalS < 600 ? 0 : 1);
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  console.log(`\nDID NOT DRAIN within ${TIMEOUT_MS / 60_000} minutes — FAIL`);
  await pool.end();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
