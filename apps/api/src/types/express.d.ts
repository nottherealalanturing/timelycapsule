import 'express';

declare global {
  namespace Express {
    interface Request {
      /** Set by modules/auth's `requireAuth` middleware once a bearer access token verifies. */
      user?: {
        id: string;
        sessionId: string;
      };
    }
  }
}
