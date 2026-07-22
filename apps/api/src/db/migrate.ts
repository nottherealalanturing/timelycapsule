import '../env.js';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client.js';
import { logger } from '../logger.js';

async function main() {
  // citext must exist before any migration creates a column of that type.
  await pool.query('CREATE EXTENSION IF NOT EXISTS citext');

  await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
  logger.info('migrations applied');
  await pool.end();
}

main().catch((err) => {
  logger.error(err, 'migration failed');
  process.exit(1);
});
