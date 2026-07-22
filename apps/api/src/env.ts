// Loads apps/api/.env if present (Node 20.6+ built-in — no dotenv dependency).
// Silently no-ops when absent (e.g. CI, where env vars come from the platform).
try {
  process.loadEnvFile();
} catch {
  // no .env file — fine in CI/production where vars are injected externally
}
