/**
 * One-off raw captures for the 2026-08-25 marketing refresh — real
 * authenticated/product UI, not the marketing homepage's own demo sections
 * (which is all design/.build-launch.mjs's ensureRawCaptures() ever hit).
 *
 * Reuses the exact render() approach from design/.build-launch.mjs (headless
 * Chrome CLI screenshot, poll-for-stable-file-size instead of waiting on the
 * process). Uses its OWN profile dir (not /tmp/tc-lp-profile) so seeding a
 * real session's tokens into it never leaks into that script's own homepage
 * capture.
 *
 * Usage: node design/.capture-marketing-raw.mjs
 * Requires the web dev server at localhost:3001 and an access/refresh token
 * pair for a real account with at least one sealed capsule (passed via
 * SEED_AT / SEED_RT env vars).
 */
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = '/tmp/tc-marketing-profile';
const OUT_DIR = 'design/launch/.raw';
mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function render(outPath, w, h, url, { dsf = 1, budget = 4000 } = {}) {
  rmSync(outPath, { force: true });
  const proc = spawn(
    CHROME,
    [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      '--disable-background-networking', '--disable-sync', '--mute-audio',
      `--force-device-scale-factor=${dsf}`,
      `--user-data-dir=${PROFILE}`,
      `--virtual-time-budget=${budget}`,
      `--window-size=${w},${h}`, `--screenshot=${outPath}`, url,
    ],
    { stdio: 'ignore' },
  );
  let last = -1;
  for (let i = 0; i < 400; i++) {
    await sleep(100);
    if (existsSync(outPath)) {
      const size = statSync(outPath).size;
      if (size > 0 && size === last) break;
      last = size;
    }
  }
  try { proc.kill('SIGKILL'); } catch {}
  if (!existsSync(outPath)) throw new Error(`render failed: ${outPath}`);
  console.log(`  ${outPath} (${statSync(outPath).size} bytes)`);
}

const AT = process.env.SEED_AT;
const RT = process.env.SEED_RT;
if (!AT || !RT) {
  console.error('SEED_AT / SEED_RT env vars required (real access/refresh token pair).');
  process.exit(1);
}
const seed = `__seed_at=${encodeURIComponent(AT)}&__seed_rt=${encodeURIComponent(RT)}`;

const REVEAL_URL =
  'http://localhost:3001/c/6QCTKAEGA6MXJOOM4UAG7BMYXA#k=wh3xShvyHGIxNkowuvN3CbYZE-jRBfvij63-rgFiZvQ';

console.log('Capturing real authenticated + public UI at 2x scale...');

await render(join(OUT_DIR, 'dashboard-waiting.png'), 1400, 500, `http://localhost:3001/home?${seed}`, { dsf: 2, budget: 5000 });
await render(join(OUT_DIR, 'composer-address.png'), 1400, 620, `http://localhost:3001/dev/schedule?movement=address`, { dsf: 2 });
await render(join(OUT_DIR, 'composer-compose.png'), 1400, 620, `http://localhost:3001/dev/schedule?movement=compose`, { dsf: 2 });
await render(join(OUT_DIR, 'composer-seal.png'), 1400, 620, `http://localhost:3001/dev/schedule?movement=seal`, { dsf: 2 });
await render(join(OUT_DIR, 'composer-conditions.png'), 1400, 900, `http://localhost:3001/dev/schedule?movement=seal&conditions=1`, { dsf: 2 });
await render(join(OUT_DIR, 'reveal-replies.png'), 1000, 900, REVEAL_URL, { dsf: 2, budget: 5000 });

console.log('Done.');
