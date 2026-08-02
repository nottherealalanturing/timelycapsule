/**
 * T-22 k6 load test — seed step.
 *
 * Creates 10,000 sealed capsules, each with one recipient, and one
 * `capsule_unlock` scheduled_action per capsule with `run_at` spread across
 * the next 60 seconds — "10k unlocks in 1 min" (`plan/05-BUILD-PLAYBOOK.md`
 * T-22), a mass-simultaneous-unlock event (New Year's Eve is the real-world
 * shape of this).
 *
 * Run with `NODE_ENV=test` — this is deliberate, not incidental:
 *   - Forces the console email adapter (`email/get-adapter.ts`) regardless
 *     of the real `RESEND_API_KEY` configured in `.env`, so draining 10k
 *     `recipient_unlock` actions never sends a single real email.
 *   - Points at `timelycapsule_test`, not the shared dev database, so this
 *     doesn't pollute real dev data or collide with anything else running
 *     against it.
 *
 * Seeding goes directly to the DB, not through the HTTP API — deliberately.
 * Seeding isn't what's being load-tested (the scheduler's drain throughput
 * is), and going through the API would mean fighting the very rate limits
 * this same ticket just added (60 mutations/15min/user — nowhere near
 * enough to create 10k capsules from one account). `promoter.test.ts`
 * already seeds this same way for the same reason.
 */
import '../src/env.js';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db, pool } from '../src/db/client.js';
import { capsuleRecipients, capsules, scheduledActions, users } from '../src/db/schema/index.js';
import { generateAccessToken, hashAccessToken } from '../src/modules/recipients/access-token.js';

const COUNT = 10_000;
const WINDOW_MS = 60_000;
export const RUN_TAG = `loadtest-${Date.now()}`;

// A sample, not all 10k — k6's job is to shape realistic concurrent read
// load during the drain, not exhaustively hit every token. The raw token is
// captured here and nowhere else: `capsuleRecipients.accessTokenHash` only
// ever stores the hash (by design — the token is the decryption key
// fragment's carrier), so this is the only point the plaintext exists.
const TOKEN_SAMPLE_SIZE = 2000;
const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const [owner] = await db
    .insert(users)
    .values({ email: `${RUN_TAG}@example.com`, displayName: 'Load Test Owner', status: 'active' })
    .returning();

  console.log(`Seeding ${COUNT} capsules (tag: ${RUN_TAG}, owner: ${owner!.id})...`);
  const t0 = Date.now();
  const now = Date.now();
  const sampledTokens: string[] = [];

  const BATCH = 500;
  for (let i = 0; i < COUNT; i += BATCH) {
    const batchSize = Math.min(BATCH, COUNT - i);

    const capsuleRows = Array.from({ length: batchSize }, (_, j) => {
      const idx = i + j;
      const runAt = new Date(now + Math.floor((idx / COUNT) * WINDOW_MS));
      return {
        ownerId: owner!.id,
        type: 'personal' as const,
        // Full UUID, not a short slice — a 6-char slice collided at this
        // volume (10k rows into a ~16.7M-value space is a near-certain
        // birthday-paradox collision). Real capsule creation goes through
        // `createCapsule`, one row at a time under normal traffic, where
        // this was never going to surface.
        publicId: `LT-${randomUUID()}`,
        state: 'sealed' as const,
        title: `Load test capsule ${idx}`,
        sealedAt: new Date(now - 24 * 3_600_000),
        unlockAt: runAt,
        seals: [],
      };
    });
    const inserted = await db.insert(capsules).values(capsuleRows).returning({ id: capsules.id, unlockAt: capsules.unlockAt });

    const rawTokens = inserted.map(() => generateAccessToken());
    if (sampledTokens.length < TOKEN_SAMPLE_SIZE) {
      sampledTokens.push(...rawTokens.slice(0, TOKEN_SAMPLE_SIZE - sampledTokens.length));
    }

    await db.insert(capsuleRecipients).values(
      inserted.map((c, j) => ({
        capsuleId: c.id,
        email: `${RUN_TAG}-recipient-${i + j}@example.com`,
        accessTokenHash: hashAccessToken(rawTokens[j]!),
        status: 'added' as const,
      })),
    );

    await db.insert(scheduledActions).values(
      inserted.map((c) => ({
        kind: 'capsule_unlock' as const,
        subjectId: c.id,
        runAt: c.unlockAt!,
        idempotencyKey: `capsule_unlock:${c.id}`,
      })),
    );

    process.stdout.write(`\r  ${Math.min(i + BATCH, COUNT)}/${COUNT}`);
  }

  writeFileSync(join(__dirname, 'tokens.json'), JSON.stringify(sampledTokens));
  console.log(`\nSeeded in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${sampledTokens.length} tokens written to loadtest/tokens.json`);
  console.log(`OWNER_ID=${owner!.id}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
