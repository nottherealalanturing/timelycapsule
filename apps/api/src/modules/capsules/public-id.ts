import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { capsules } from '../../db/schema/index.js';

// Unambiguous alphabet — excludes 0/O, 1/I/L and other easily-confused
// characters, since this is read aloud/typed by support and users
// (plan/03-ARCHITECTURE.md §8: "human-readable support/display handle").
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const LENGTH = 8;
const MAX_ATTEMPTS = 10;

function randomPublicId(): string {
  let id = '';
  for (let i = 0; i < LENGTH; i++) {
    id += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return id;
}

/** Generates a public_id, retrying on the (astronomically unlikely) collision. */
export async function generateUniquePublicId(db: Database): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = randomPublicId();
    const [existing] = await db.select({ id: capsules.id }).from(capsules).where(eq(capsules.publicId, candidate)).limit(1);
    if (!existing) {
      return candidate;
    }
  }
  throw new Error('Failed to generate a unique public_id after multiple attempts');
}
