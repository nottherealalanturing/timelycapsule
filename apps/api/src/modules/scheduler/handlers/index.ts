import type { QueueName } from '../queue.js';
import { accountPurgeHandler } from './account-purge.js';
import { breakglassOpenHandler } from './breakglass-open.js';
import { capsuleUnlockHandler } from './capsule-unlock.js';
import { dataExportHandler } from './data-export.js';
import type { ActionHandler } from './dispatch.js';
import { recipientUnlockHandler } from './recipient-unlock.js';
import { reminderHandler } from './reminder.js';
import { trashPurgeHandler } from './trash-purge.js';

export const HANDLERS: Record<QueueName, ActionHandler> = {
  capsule_unlock: capsuleUnlockHandler,
  recipient_unlock: recipientUnlockHandler,
  trash_purge: trashPurgeHandler,
  breakglass_open: breakglassOpenHandler,
  reminder: reminderHandler,
  data_export: dataExportHandler,
  account_purge: accountPurgeHandler,
};

export { runAction } from './dispatch.js';
export type { ActionHandler } from './dispatch.js';
