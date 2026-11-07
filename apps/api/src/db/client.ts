import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

/*
 * Pool caps (single 1 GB app VM -> one small Postgres with max_connections=20):
 * every process (api, worker, scheduler) opens its own pool, and pg-boss opens
 * another, so the ceiling must be explicit. Defaults are conservative; override
 * per service with DB_POOL_MAX. Idle connections are released so a quiet
 * process does not hold server slots.
 */
const intEnv = (name: string, fallback: number): number => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

export const pool = new Pool({
  connectionString,
  max: intEnv('DB_POOL_MAX', 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
export const db = drizzle(pool, { schema });
export type Database = typeof db;
