import { PgBoss } from 'pg-boss';
import { logger } from '../../logger.js';

/**
 * pg-boss replaces the Redis/BullMQ design in plan/03-ARCHITECTURE.md §10 —
 * plan/04-ZERO-COST-PLAN.md: "Drop Redis entirely. Use pg-boss... The
 * scheduled_actions table stays as designed; pg-boss just handles
 * execution." One queue per action_kind so each handler subscribes narrowly.
 * `announce` is deliberately absent — T-14 moved it to a synchronous,
 * client-triggered send (see PROGRESS.md decisions log: the server can
 * never hold the capsule key that goes in the recipient link's fragment,
 * so nothing schedules an `announce` action anymore).
 */
export const QUEUE_NAMES = [
  'capsule_unlock',
  'recipient_unlock',
  'reminder',
  'breakglass_open',
  'trash_purge',
  'data_export',
  'account_purge',
  // M4 storage lifecycle.
  'media_release_warning',
  'media_release',
  // Post-M5 correctness — "one reading only" (expiry_strict).
  'capsule_expire',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export interface ActionJob {
  actionId: string;
  subjectId: string;
}

let boss: PgBoss | null = null;

export async function getQueue(): Promise<PgBoss> {
  if (boss) return boss;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const instance = new PgBoss({ connectionString });
  instance.on('error', (err: Error) => logger.error({ event: 'pgboss_error', err }, 'pg-boss error'));

  await instance.start();
  for (const name of QUEUE_NAMES) {
    await instance.createQueue(name);
  }

  boss = instance;
  return instance;
}

export async function stopQueue(): Promise<void> {
  if (!boss) return;
  await boss.stop({ graceful: true });
  boss = null;
}

/**
 * The promoter enqueues up to 5 minutes before an action's actual `runAt`
 * (the lookahead exists to give pg-boss lead time to pick the job up, not
 * to let it fire early) — `sendAfter` defers pg-boss's own execution until
 * `runAt`, so a job enqueued 4 minutes early still doesn't run until it's
 * actually due. Confirmed live: without this, a capsule sealed for now+2min
 * unlocked as soon as the promoter's next tick enqueued it, not at the
 * scheduled instant.
 */
export async function sendAction(queue: PgBoss, kind: QueueName, job: ActionJob, runAt: Date): Promise<void> {
  await queue.sendAfter(kind, job, { singletonKey: job.actionId }, runAt);
}
