// Loads apps/api/.env.test (test runs) or .env (everything else) if present
// (Node 20.6+ built-in — no dotenv dependency). Silently no-ops when absent
// (e.g. CI, where env vars come from the platform).
//
// Tests get their own DATABASE_URL (a separate `timelycapsule_test` database,
// not the dev DB) so they never share `scheduled_actions` rows with a
// long-running local `pnpm dev:scheduler`/`dev:worker` process — those tick
// on a 30s interval against the dev DB and were found to race the promoter
// test suite's own inserts/updates on the very same table, causing rare
// double-promotion flakes that only reproduced locally, never in CI's
// already-isolated ephemeral database.
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
try {
  process.loadEnvFile(envFile);
} catch {
  // no env file — fine in CI/production where vars are injected externally
}
