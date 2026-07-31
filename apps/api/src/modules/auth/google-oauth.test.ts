import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import '../../env.js';
import { db, pool } from '../../db/client.js';
import { capsuleRecipients, capsules, oauthAccounts, users } from '../../db/schema/index.js';
import { TEST_GOOGLE_CLIENT_ID } from './google.js';
import { googleOAuth } from './service.js';

const createdUserIds: string[] = [];
const createdCapsuleIds: string[] = [];

let signGoogleToken: (payload: Record<string, unknown>) => Promise<string>;
let verify: (token: string) => Promise<import('./google.js').GoogleIdTokenPayload>;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
  const jwks = createLocalJWKSet({ keys: [jwk] });

  signGoogleToken = (payload) =>
    new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer('https://accounts.google.com')
      .setAudience(process.env.GOOGLE_OAUTH_WEB_CLIENT_ID ?? TEST_GOOGLE_CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

  const { verifyGoogleIdToken } = await import('./google.js');
  verify = (token: string) => verifyGoogleIdToken(token, jwks);
});

function uniqueEmail(): string {
  return `oauth-test-${randomUUID()}@example.com`;
}

const meta = { platform: 'web' as const, ip: '127.0.0.1', userAgent: 'vitest', deviceName: null };

describe('Google OAuth (T-05)', () => {
  afterAll(async () => {
    for (const id of createdCapsuleIds) {
      await db.delete(capsules).where(eq(capsules.id, id));
    }
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  it('creates a new user on first sign-in and marks the email verified', async () => {
    const email = uniqueEmail();
    const sub = randomUUID();
    const token = await signGoogleToken({ sub, email, email_verified: true, name: 'New Googler' });

    const result = await googleOAuth(db, token, meta, verify);
    createdUserIds.push(result.user.id);

    expect(result.created).toBe(true);
    expect(result.user.email).toBe(email);
    expect(result.user.status).toBe('active');
    expect(result.user.emailVerifiedAt).not.toBeNull();
    expect(result.tokens.accessToken).toBeTruthy();

    const [link] = await db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.providerUserId, sub));
    expect(link?.userId).toBe(result.user.id);
  });

  it('logs back in via the existing oauth link without creating a duplicate user', async () => {
    const email = uniqueEmail();
    const sub = randomUUID();
    const token = await signGoogleToken({ sub, email, email_verified: true, name: 'Repeat Googler' });

    const first = await googleOAuth(db, token, meta, verify);
    createdUserIds.push(first.user.id);
    expect(first.created).toBe(true);

    const second = await googleOAuth(db, token, meta, verify);
    expect(second.created).toBe(false);
    expect(second.user.id).toBe(first.user.id);
  });

  it('auto-links to an existing password account on verified-email match', async () => {
    const email = uniqueEmail();
    const [existingUser] = await db
      .insert(users)
      .values({ email, displayName: 'Existing Password User', passwordHash: 'irrelevant-hash', status: 'unverified' })
      .returning();
    createdUserIds.push(existingUser!.id);

    const sub = randomUUID();
    const token = await signGoogleToken({ sub, email, email_verified: true, name: 'Linked Googler' });

    const result = await googleOAuth(db, token, meta, verify);
    expect(result.created).toBe(false);
    expect(result.user.id).toBe(existingUser!.id);
    expect(result.user.status).toBe('active');
    expect(result.user.emailVerifiedAt).not.toBeNull();

    const [link] = await db.select().from(oauthAccounts).where(eq(oauthAccounts.providerUserId, sub));
    expect(link?.userId).toBe(existingUser!.id);
  });

  it('rejects an idToken whose email Google has not verified', async () => {
    const token = await signGoogleToken({
      sub: randomUUID(),
      email: uniqueEmail(),
      email_verified: false,
      name: 'Unverified Googler',
    });

    await expect(googleOAuth(db, token, meta, verify)).rejects.toThrow();
  });

  it('ghost-claims unclaimed capsule_recipients rows matching the verified email', async () => {
    const [owner] = await db
      .insert(users)
      .values({ email: uniqueEmail(), displayName: 'Capsule Owner' })
      .returning();
    createdUserIds.push(owner!.id);

    const [capsule] = await db
      .insert(capsules)
      .values({ publicId: randomUUID().slice(0, 8), ownerId: owner!.id, type: 'personal' })
      .returning();
    createdCapsuleIds.push(capsule!.id);

    const recipientEmail = uniqueEmail();
    const [recipient] = await db
      .insert(capsuleRecipients)
      .values({ capsuleId: capsule!.id, email: recipientEmail, accessTokenHash: randomUUID() })
      .returning();
    expect(recipient!.userId).toBeNull();

    const sub = randomUUID();
    const token = await signGoogleToken({
      sub,
      email: recipientEmail,
      email_verified: true,
      name: 'Ghost Claimant',
    });
    const result = await googleOAuth(db, token, meta, verify);
    createdUserIds.push(result.user.id);

    const [claimedRecipient] = await db
      .select()
      .from(capsuleRecipients)
      .where(eq(capsuleRecipients.id, recipient!.id));
    expect(claimedRecipient?.userId).toBe(result.user.id);

    const [claimedUser] = await db.select().from(users).where(eq(users.id, result.user.id));
    expect(claimedUser?.ghostClaimedAt).not.toBeNull();
  });
});
