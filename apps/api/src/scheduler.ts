import './env.js';
import { db } from './db/client.js';
import { logger } from './logger.js';
import { systemClock } from './lib/clock.js';
import { getQueue, stopQueue, promoteDueActions, sweep, reresolveWallClockActions, reconcileScheduledUnlocks } from './modules/scheduler/index.js';

/**
 * The scheduler process: promoter + sweeper on a fast tick, resolver +
 * reconciliation on a daily cadence — all sharing one process per
 * plan/04-ZERO-COST-PLAN.md's single-VPS topology (api/worker/scheduler as
 * separate commands from one codebase, no separate infra). A single
 * instance needs no leader election; the promoter's `FOR UPDATE SKIP
 * LOCKED` claim keeps a second instance safe if one is ever added.
 */
const TICK_MS = Number(process.env.SCHEDULER_TICK_MS ?? 30_000);
const DAILY_MS = 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const queue = await getQueue();
  logger.info({ event: 'scheduler_started', tickMs: TICK_MS }, 'Scheduler started');

  let running = true;
  const stop = (): void => {
    running = false;
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  let lastReconcileAt = 0;
  let lastResolveAt = 0;

  while (running) {
    try {
      await promoteDueActions(db, queue, systemClock);
      await sweep(db, systemClock);

      const now = Date.now();
      if (now - lastReconcileAt >= DAILY_MS) {
        await reconcileScheduledUnlocks(db, systemClock);
        lastReconcileAt = now;
      }
      if (now - lastResolveAt >= DAILY_MS) {
        await reresolveWallClockActions(db, systemClock);
        lastResolveAt = now;
      }
    } catch (err) {
      logger.error({ event: 'scheduler_tick_failed', err }, 'Scheduler tick failed');
    }
    await new Promise((resolve) => setTimeout(resolve, TICK_MS));
  }

  await stopQueue();
}

main().catch((err) => {
  logger.error({ event: 'scheduler_fatal', err }, 'Scheduler crashed');
  process.exit(1);
});
