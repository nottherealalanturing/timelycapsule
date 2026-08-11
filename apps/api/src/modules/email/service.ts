import { render } from '@react-email/render';
import type { ReactNode } from 'react';
import type { Database } from '../../db/client.js';
import { logger } from '../../logger.js';
import { getEmailAdapter } from './get-adapter.js';
import { markFailed, markSent, recordQueued } from './ledger.js';
import { BounceAlert } from './templates/BounceAlert.js';
import { CapsuleUnlocked } from './templates/CapsuleUnlocked.js';
import { ExportReady } from './templates/ExportReady.js';
import { NewDeviceAlert } from './templates/NewDeviceAlert.js';
import { OpenedNotice } from './templates/OpenedNotice.js';
import { PasswordReset } from './templates/PasswordReset.js';
import { PreUnlockReminder, type PreUnlockReminderProps } from './templates/PreUnlockReminder.js';
import { ReplyReceived } from './templates/ReplyReceived.js';
import { SomethingWaiting } from './templates/SomethingWaiting.js';
import { VerifyEmail } from './templates/VerifyEmail.js';

/** Best-effort — swallows send failures so auth flows never fail just because email delivery did. */
async function sendTemplated(
  db: Database,
  input: { to: string; template: string; subject: string; node: ReactNode; payload?: unknown },
): Promise<void> {
  const [html, text] = await Promise.all([render(input.node), render(input.node, { plainText: true })]);
  const row = await recordQueued(db, { toRef: input.to, template: input.template, payload: input.payload });

  try {
    const { providerId } = await getEmailAdapter().send({ to: input.to, subject: input.subject, html, text });
    await markSent(db, row.id, providerId);
  } catch (err) {
    await markFailed(db, row.id, (row.attempts ?? 0) + 1);
    logger.error({ event: 'email_send_failed', template: input.template, to: input.to, err }, 'Email send failed');
  }
}

/**
 * Rethrows on failure — used by T-13 scheduler handlers, which already have
 * their own retry-with-backoff via `scheduled_actions`/pg-boss (T-14
 * decisions log: outbound_messages is the delivery ledger, scheduled_actions
 * is the retry mechanism, rather than standing up a second parallel queue).
 * On failure the ledger row is marked `failed` for this attempt, then the
 * error propagates so the caller's dispatch wrapper re-arms the action.
 */
async function sendTemplatedOrThrow(
  db: Database,
  input: { to: string; template: string; subject: string; node: ReactNode; payload?: unknown },
): Promise<void> {
  const [html, text] = await Promise.all([render(input.node), render(input.node, { plainText: true })]);
  const row = await recordQueued(db, { toRef: input.to, template: input.template, payload: input.payload });
  try {
    const { providerId } = await getEmailAdapter().send({ to: input.to, subject: input.subject, html, text });
    await markSent(db, row.id, providerId);
  } catch (err) {
    await markFailed(db, row.id, (row.attempts ?? 0) + 1);
    throw err;
  }
}

export async function sendVerifyEmailCode(db: Database, to: string, code: string): Promise<void> {
  await sendTemplated(db, {
    to,
    template: 'verify-email',
    subject: 'Confirm your email address',
    node: VerifyEmail({ code }),
  });
}

export async function sendPasswordReset(db: Database, to: string, resetUrl: string): Promise<void> {
  await sendTemplated(db, {
    to,
    template: 'password-reset',
    subject: 'Reset your password',
    node: PasswordReset({ resetUrl }),
  });
}

export async function sendNewDeviceAlert(db: Database, to: string, ip: string | null): Promise<void> {
  await sendTemplated(db, {
    to,
    template: 'new-device',
    subject: 'New login to your account',
    node: NewDeviceAlert({ ip, when: new Date().toUTCString() }),
  });
}

export async function sendSomethingWaiting(
  db: Database,
  to: string,
  input: { senderName: string; teaser: string | null; link: string },
): Promise<void> {
  await sendTemplatedOrThrow(db, {
    to,
    template: 'something-waiting',
    subject: `${input.senderName} sealed something for you`,
    node: SomethingWaiting(input),
    payload: input,
  });
}

export async function sendExportReady(db: Database, to: string, downloadUrl: string): Promise<void> {
  await sendTemplatedOrThrow(db, {
    to,
    template: 'export-ready',
    subject: 'Your data export is ready',
    node: ExportReady({ downloadUrl }),
  });
}

export async function sendCapsuleUnlocked(db: Database, to: string, input: { senderName: string }): Promise<void> {
  await sendTemplatedOrThrow(db, {
    to,
    template: 'capsule-unlocked',
    subject: 'Your capsule is open',
    node: CapsuleUnlocked(input),
    payload: input,
  });
}

export async function sendPreUnlockReminder(db: Database, to: string, input: PreUnlockReminderProps): Promise<void> {
  await sendTemplatedOrThrow(db, {
    to,
    template: 'pre-unlock-reminder',
    subject: input.audience === 'owner' ? 'Your words arrive soon' : 'Almost time',
    node: PreUnlockReminder(input),
    payload: input,
  });
}

export async function sendOpenedNotice(
  db: Database,
  to: string,
  input: { recipientName: string; capsuleTitle: string | null; dashboardUrl: string },
): Promise<void> {
  await sendTemplatedOrThrow(db, {
    to,
    template: 'opened-notice',
    subject: `${input.recipientName} opened your capsule`,
    node: OpenedNotice(input),
    payload: input,
  });
}

/**
 * The subject line is as bare as the body deliberately: a subject is the part
 * of an email most likely to be read over someone's shoulder on a lock screen,
 * so it says who wrote and stops there.
 */
export async function sendReplyReceived(
  db: Database,
  to: string,
  input: { recipientName: string; capsuleUrl: string },
): Promise<void> {
  await sendTemplatedOrThrow(db, {
    to,
    template: 'reply-received',
    subject: `${input.recipientName} replied to your capsule`,
    node: ReplyReceived(input),
    // Safe to persist in full only because there is no reply content in it.
    payload: input,
  });
}

/** Best-effort — fired from the Resend webhook handler, which must still ack the webhook even if this fails. */
export async function sendBounceAlert(
  db: Database,
  to: string,
  input: { recipientEmail: string; capsuleTitle: string | null; daysUntilUnlock: number | null; manageUrl: string },
): Promise<void> {
  await sendTemplated(db, {
    to,
    template: 'bounce-alert',
    subject: 'A recipient couldn’t be reached',
    node: BounceAlert(input),
    payload: input,
  });
}
