import type { QueueName } from '../queue.js';
import { announceHandler } from './announce.js';
import { breakglassOpenHandler } from './breakglass-open.js';
import { capsuleUnlockHandler } from './capsule-unlock.js';
import type { ActionHandler } from './dispatch.js';
import { recipientUnlockHandler } from './recipient-unlock.js';
import { reminderHandler } from './reminder.js';
import { trashPurgeHandler } from './trash-purge.js';

export const HANDLERS: Record<QueueName, ActionHandler> = {
  capsule_unlock: capsuleUnlockHandler,
  recipient_unlock: recipientUnlockHandler,
  announce: announceHandler,
  trash_purge: trashPurgeHandler,
  breakglass_open: breakglassOpenHandler,
  reminder: reminderHandler,
};

export { runAction } from './dispatch.js';
export type { ActionHandler } from './dispatch.js';
