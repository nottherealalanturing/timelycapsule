import pino from 'pino';

// `pino-http` (app.ts) logs every request/response through this same
// instance via `.child()` — pino's own `redact` is root-level config that
// every child inherits, so this is the one place to set it rather than
// pino-http's own options. Without it, pino-http's default req serializer
// writes every header verbatim, including `Authorization: Bearer <token>`
// and `Cookie` — real credentials, in plaintext, on every request line.
// Exported (not inlined below) so the redaction test can build a second,
// stream-capturing instance from the exact same config rather than a
// hand-copied one that could quietly drift from what production runs.
export const LOG_REDACT_OPTIONS = {
  paths: ['req.headers.authorization', 'req.headers.cookie'],
  censor: '[Redacted]',
};

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: LOG_REDACT_OPTIONS,
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true } },
});
