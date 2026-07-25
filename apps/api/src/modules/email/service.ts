import { render } from '@react-email/render';
import type { ReactNode } from 'react';
import type { Database } from '../../db/client.js';
import { logger } from '../../logger.js';
import { getEmailAdapter } from './get-adapter.js';
import { markFailed, markSent, recordQueued } from './ledger.js';
import { NewDeviceAlert } from './templates/NewDeviceAlert.js';
import { PasswordReset } from './templates/PasswordReset.js';
import { VerifyEmail } from './templates/VerifyEmail.js';

async function sendTemplated(
  db: Database,
  input: { to: string; template: string; subject: string; node: ReactNode; payload?: unknown },
): Promise<void> {
  const [html, text] = await Promise.all([
    render(input.node),
    render(input.node, { plainText: true }),
  ]);

  const row = await recordQueued(db, { toRef: input.to, template: input.template, payload: input.payload });

  try {
    const { providerId } = await getEmailAdapter().send({ to: input.to, subject: input.subject, html, text });
    await markSent(db, row.id, providerId);
  } catch (err) {
    await markFailed(db, row.id, (row.attempts ?? 0) + 1);
    logger.error({ event: 'email_send_failed', template: input.template, to: input.to, err }, 'Email send failed');
    // Best-effort: auth flows must not fail just because email delivery did.
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
