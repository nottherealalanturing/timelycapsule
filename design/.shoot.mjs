/**
 * Capture real app screens for before/after design review.
 *   node design/.shoot.mjs <label> [route...]
 * Writes design/shots/<label>/<name>.jpg. Drives installed Chrome; no deps.
 *
 * Uses --headless=old: the new headless mode does not reliably exit after
 * --screenshot and hangs until killed.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE ?? 'http://localhost:3001';
const label = process.argv[2];
if (!label) throw new Error('usage: node design/.shoot.mjs <label> [name:route ...]');

const args = process.argv.slice(3);
const ROUTES = args.length
  ? args.map((a) => { const i = a.indexOf(':'); return [a.slice(0, i), a.slice(i + 1)]; })
  : [['landing', '/'], ['login', '/login'], ['guest', '/try']];

const outDir = resolve('design/shots', label);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const [name, route] of ROUTES) {
  const png = join(outDir, `${name}.png`);
  try {
    execFileSync(CHROME, [
      '--headless=old',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--force-device-scale-factor=2',
      `--user-data-dir=/tmp/tc-shoot-${label}-${name}`,
      '--virtual-time-budget=4000',
      '--window-size=1180,820',
      `--screenshot=${png}`,
      BASE + route,
    ], { stdio: 'ignore', timeout: 45000 });
  } catch { /* Chrome often exits non-zero having written the file anyway */ }

  if (!existsSync(png)) { console.log('MISSED', name, route); continue; }
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '68',
    '-Z', '1100', png, '--out', join(outDir, `${name}.jpg`)], { stdio: 'ignore' });
  rmSync(png, { force: true });
  console.log('ok', name, route);
}
console.log('→', outDir);
