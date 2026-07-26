import './env.js';
import { db } from './db/client.js';
import { logger } from './logger.js';
import { systemClock } from './lib/clock.js';
import { getQueue, QUEUE_NAMES, HANDLERS, runAction, type ActionJob } from './modules/scheduler/index.js';

/** The worker process: pg-boss job processor, one `.work()` subscription per action kind. */
async function main(): Promise<void> {
  const queue = await getQueue();

  for (const name of QUEUE_NAMES) {
    await queue.work<ActionJob>(name, async (jobs) => {
      for (const job of jobs) {
        await runAction(db, systemClock, job.data, HANDLERS[name]);
      }
    });
  }

  logger.info({ event: 'worker_started', queues: QUEUE_NAMES }, 'Worker started');
}

main().catch((err) => {
  logger.error({ event: 'worker_fatal', err }, 'Worker crashed');
  process.exit(1);
});
