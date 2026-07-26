import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every test file opens its own pg Pool (node-postgres defaults to 10
    // connections each) against the single local docker-compose Postgres
    // (max_connections=100, plan/04-ZERO-COST-PLAN.md's zero-cost single
    // instance). Unbounded file parallelism scales past that ceiling once
    // enough suites exist (T-13 added 6), causing rare, hard-to-diagnose
    // connection-exhaustion flakes in otherwise-unrelated test files.
    // Capping concurrent files keeps worst-case connections well under the
    // limit without touching runtime pool config.
    fileParallelism: false,
  },
});
