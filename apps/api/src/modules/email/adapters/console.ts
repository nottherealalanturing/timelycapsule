import { logger } from '../../../logger.js';
import type { EmailAdapter, SendEmailInput, SendEmailResult } from '../adapter.js';

/** Dev/test stand-in — logs instead of sending, same role as T-04's OTP console logging. */
export class ConsoleEmailAdapter implements EmailAdapter {
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    logger.info(
      { event: 'email_sent_console', to: input.to, subject: input.subject, text: input.text },
      'Email (console adapter)',
    );
    return { providerId: null };
  }
}
