export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  /** Provider's message id, used to correlate later webhook events. Null for adapters that don't have one. */
  providerId: string | null;
}

export interface EmailAdapter {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
