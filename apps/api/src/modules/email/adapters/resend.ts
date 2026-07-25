import { Resend } from 'resend';
import type { EmailAdapter, SendEmailInput, SendEmailResult } from '../adapter.js';

export class ResendEmailAdapter implements EmailAdapter {
  private readonly client: Resend;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const { data, error } = await this.client.emails.send({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    if (error) {
      throw new Error(`Resend send failed: ${error.message}`);
    }

    return { providerId: data?.id ?? null };
  }
}
