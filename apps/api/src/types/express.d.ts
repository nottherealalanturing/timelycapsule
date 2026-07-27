import 'express';

declare global {
  namespace Express {
    interface Request {
      /** Set by modules/auth's `requireAuth` middleware once a bearer access token verifies. */
      user?: {
        id: string;
        sessionId: string;
      };
      /** Set by modules/guest's `requireGuestSession` middleware once a bearer guest token verifies. */
      guestSession?: {
        id: string;
      };
    }
  }
}
