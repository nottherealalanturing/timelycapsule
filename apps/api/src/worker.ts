import './env.js';
import { db } from './db/client.js';
import { logger } from './logger.js';
import { systemClock } from './lib/clock.js';
import { getQueue, QUEUE_NAMES, HANDLERS, runAction, type ActionJob } from './modules/scheduler/index.js';

/** The worker process: pg-boss job processor, one `.work()` subscription per action kind. */
async function main(): Promise<void> {
  const queue = await getQueue();

  /*
   * T-22 load test: `.work()`'s own defaults are `batchSize: 1,
   * localConcurrency: 1` — one job fetched, processed, and completed before
   * the next fetch even starts. At that rate a mass-unlock event (T-22's DoD:
   * "10k unlocks in 1 min... assert drain <10 min") does not drain in
   * anything close to 10 minutes; it was measured, live, trickling through
   * at roughly one job every few seconds. Each handler here is a handful of
   * cheap, independent-per-job DB statements (no shared mutable state, no
   * per-recipient ordering requirement), so processing many concurrently is
   * safe — `FOR UPDATE SKIP LOCKED` in the promoter already establishes that
   * concurrent workers are a supported case.
   */
  for (const name of QUEUE_NAMES) {
    await queue.work<ActionJob>(name, { batchSize: 20, localConcurrency: 10 }, async (jobs) => {
      await Promise.all(jobs.map((job) => runAction(db, systemClock, job.data, HANDLERS[name])));
    });
  }

  logger.info({ event: 'worker_started', queues: QUEUE_NAMES }, 'Worker started');
}

main().catch((err) => {
  logger.error({ event: 'worker_fatal', err }, 'Worker crashed');
  process.exit(1);
});
