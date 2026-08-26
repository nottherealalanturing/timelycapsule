/**
 * Build the TimelyCapsule launch assets.
 *   node design/.build-launch.mjs [--only <substring>] [--recapture] [--freeze]
 *
 * Writes design/launch/**. Every asset is rendered from the real fonts and the
 * real tokens — no image model is involved, because this identity's imagery is
 * typography and data (04 §9), and a generator cannot set Plex Mono at 0.14em
 * tracking or hold #E9EAE6 without drifting warm.
 *
 * Chrome writes its screenshot and then does not exit. Waiting on the process
 * costs ~40s per asset; watching for the file costs ~1s. See render().
 *
 * SELF-CONTAINED: the marketing-screenshot section needs six crops of the real
 * app. Those crops (design/launch/.raw/crops/*.png) and their source capture
 * (design/launch/.raw/home1280.png) are produced automatically by
 * ensureRawCaptures() below if missing — this script no longer depends on a
 * capture step run by hand outside of it. That capture needs the web dev
 * server reachable at http://localhost:3001 (`pnpm --filter @tc/web run dev`,
 * or `pnpm dev` at the repo root); ensureRawCaptures() fails with that
 * instruction if it isn't. Pass --recapture to force a fresh capture even if
 * the cached one already exists (the product UI moved).
 *
 * --freeze copies the current design/launch/{x,instagram,artwork,og,
 * screenshots} output into design/launch/final/, which this script otherwise
 * never writes to. That directory is the stable, approved set the copy deck
 * and calendar reference — freeze it only after the assets it copies have
 * been reviewed, since a later unreviewed generator edit cannot silently
 * change something already frozen.
 */
import {
  mkdirSync, writeFileSync, readFileSync, existsSync, statSync, rmSync, cpSync, readdirSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';

const OUT = 'design/launch';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FONTS = resolve('design/.fonts');
const DEV_URL = 'http://localhost:3001/';
const ONLY = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1]
  : null;
const RECAPTURE = process.argv.includes('--recapture');
const FREEZE = process.argv.includes('--freeze');

for (const d of ['x', 'instagram', 'artwork', 'og', 'screenshots']) {
  mkdirSync(join(OUT, d), { recursive: true });
}

/* ── --freeze: copy the approved output tree and exit ─────────────────── */
if (FREEZE) {
  const FINAL = join(OUT, 'final');
  const GROUPS = ['x', 'instagram', 'artwork', 'og', 'screenshots'];
  rmSync(FINAL, { recursive: true, force: true });
  mkdirSync(FINAL, { recursive: true });
  let count = 0;
  for (const g of GROUPS) {
    const src = join(OUT, g);
    if (!existsSync(src)) continue;
    cpSync(src, join(FINAL, g), { recursive: true });
    count += readdirSync(src).length;
  }
  writeFileSync(
    join(FINAL, 'FROZEN-AT.txt'),
    `Frozen ${new Date().toISOString()} from design/launch/{${GROUPS.join(',')}}.\n` +
      `${count} files. Re-run \`node design/.build-launch.mjs --freeze\` after any\n` +
      `reviewed change to update this copy — nothing else writes here.\n`,
  );
  console.log(`froze ${count} files into ${FINAL}/`);
  process.exit(0);
}

/* ── tokens ─────────────────────────────────────────────────────────────
   Verified values, design/05-IDENTITY-DECISION.md. Brass appears only where
   the asset is actually depicting WAITING. Nowhere else, ever. */
const T = {
  paper: '#E9EAE6',
  raised: '#F3F4F0',
  ink: '#16181A',
  muted: '#5E635C',
  verdigris: '#3F6154',
  iron: '#2C3A4A',
  rule: 'rgba(22,24,26,.14)',
  ruleStrong: 'rgba(22,24,26,.28)',
  brassRecord: '#6E5A0E',
  dark: '#0B0E14',
  darkRaised: '#141922',
  darkInk: '#E6E8EC',
  darkMuted: '#8B93A3',
  darkRule: 'rgba(230,232,236,.11)',
  brass: '#E0B84A',
  steel: '#7A8AB0',
  /* instrument temperature ramp, cold → warm */
  temp: ['#7A8AB0', '#8E88B2', '#A78CA6', '#BE9186', '#D0A06A', '#E0B84A'],
};

/* ── the mark ───────────────────────────────────────────────────────────
   Geometry identical to design/.build-brand.mjs. Never redrawn, never
   full-bleed: lengthening the segments would push the 2.1:1 ratio to 2.7:1
   and the notch would stop reading. */
const mark = (h, color, density = 'primary') => {
  const w = (h * 30.5) / 52;
  const body =
    density === 'minimal'
      ? `<path d="M46 6V27M46 37V58" stroke="${color}" stroke-width="9"/><circle cx="19" cy="32" r="8" fill="${color}"/>`
      : `<path d="M45 6V27M45 37V58" stroke="${color}" stroke-width="5"/><circle cx="22" cy="32" r="5" fill="${color}"/>`;
  return `<svg width="${w}" height="${h}" viewBox="17 6 30.5 52" fill="none" style="display:block">${body}</svg>`;
};

const FONT_CSS = `
@font-face{font-family:'PS';src:url('file://${FONTS}/plex-sans.woff2') format('woff2');font-weight:100 700;font-display:block}
@font-face{font-family:'PM';src:url('file://${FONTS}/plex-mono.woff2') format('woff2');font-weight:400;font-display:block}
@font-face{font-family:'PM';src:url('file://${FONTS}/plex-mono-500.woff2') format('woff2');font-weight:500;font-display:block}
@font-face{font-family:'SS';src:url('file://${FONTS}/source-serif.woff2') format('woff2');font-weight:200 900;font-display:block}
*{margin:0;padding:0;box-sizing:border-box}
html,body{-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
.mono{font-family:PM,monospace;text-transform:uppercase;letter-spacing:.14em;font-variant-numeric:tabular-nums}
.serif{font-family:SS,Georgia,serif;font-weight:400}
.sans{font-family:PS,system-ui,sans-serif;font-variant-numeric:tabular-nums}
`;

/** A full-bleed page of exactly w×h. */
const page = (w, h, bg, body, css = '') =>
  `<style>${FONT_CSS}
   html,body{width:${w}px;height:${h}px;overflow:hidden;background:${bg}}
   .p{position:relative;width:${w}px;height:${h}px;overflow:hidden}
   ${css}</style><div class="p">${body}</div>`;

/* ── renderer ───────────────────────────────────────────────────────────
   Chrome writes the screenshot then hangs rather than exiting, so we watch
   for the file to appear and stop growing, then kill it. Turns a 40s wait
   per asset into about a second. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {string} outPath
 * @param {number} w  window width, CSS px (also the screenshot width unless dsf > 1)
 * @param {number} h  window height, CSS px
 * @param {{html?: string, url?: string, dsf?: number, budget?: number}} target
 *   Exactly one of html/url. dsf is device-scale-factor — output pixel size is
 *   w*dsf × h*dsf. budget is Chrome's --virtual-time-budget in ms; the default
 *   is enough for a static inline page but not for a live app to hydrate.
 */
async function render(outPath, w, h, { html, url, dsf = 1, budget = 1500 } = {}) {
  let tmp = null;
  let target = url;
  if (html != null) {
    tmp = `/tmp/tc-lp-${Math.random().toString(36).slice(2)}.html`;
    writeFileSync(tmp, html);
    target = 'file://' + tmp;
  }
  rmSync(outPath, { force: true });
  const proc = spawn(
    CHROME,
    [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      '--disable-background-networking', '--disable-sync', '--mute-audio',
      `--force-device-scale-factor=${dsf}`, '--allow-file-access-from-files',
      `--user-data-dir=/tmp/tc-lp-profile`,
      `--virtual-time-budget=${budget}`,
      `--window-size=${w},${h}`, `--screenshot=${outPath}`, target,
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
  if (tmp) rmSync(tmp, { force: true });
  if (!existsSync(outPath)) throw new Error(`render failed: ${outPath}`);
  return statSync(outPath).size;
}

const shot = (outPath, w, h, html) => render(outPath, w, h, { html });

/* ── raw product captures ──────────────────────────────────────────────
   The marketing-screenshot section (below) needs six crops of the real,
   running app. Rather than requiring a hand-run capture script beforehand,
   this reproduces it: capture one tall shot of "/" from the live dev server,
   then cut six named regions out of it. Coordinates are CSS pixels measured
   directly off the DOM (devtools getBoundingClientRect), not eyeballed.

   The crop step re-renders each region through Chrome rather than doing a
   raw pixel crop, using a div sized to the crop with a background-image
   positioned by -x,-y at the source's natural CSS size — background-size
   equal to natural size means no scaling, so this reproduces an exact crop
   while staying inside the same render() pipeline as everything else. */
const RAW_DIR = join(OUT, '.raw');
const HOME_RAW = join(RAW_DIR, 'home1280.png');
const CROPS_DIR = join(RAW_DIR, 'crops');
const HOME_W = 1280;
const HOME_H = 5600; // generous; the page is ~5450px tall, extra is blank and harmless
const HOME_DSF = 2; // matches the crop coordinates below, which were measured in CSS px

const CROPS = {
  dualclock: { x: 88, y: 1988, w: 724, h: 84 },
  waitingcard: { x: 64, y: 1856, w: 768, h: 344 },
  revealcard: { x: 480, y: 2393, w: 736, h: 491 },
  hero: { x: 0, y: 57, w: 1280, h: 503 },
  survival: { x: 0, y: 3084, w: 1280, h: 542 },
  write: { x: 0, y: 1096, w: 1280, h: 544 },
};

async function ensureRawCaptures() {
  mkdirSync(CROPS_DIR, { recursive: true });

  if (RECAPTURE || !existsSync(HOME_RAW)) {
    try {
      const res = await fetch(DEV_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      throw new Error(
        `Marketing screenshots need the web app running at ${DEV_URL} — ` +
          `start it with \`pnpm --filter @tc/web run dev\` (or \`pnpm dev\` at the ` +
          `repo root) and re-run this script. (${e.message})`,
      );
    }
    console.log(`capturing ${HOME_RAW} from ${DEV_URL} …`);
    await render(HOME_RAW, HOME_W, HOME_H, { url: DEV_URL, dsf: HOME_DSF, budget: 6000 });
  }

  const homeAbs = resolve(HOME_RAW);
  for (const [name, c] of Object.entries(CROPS)) {
    const out = join(CROPS_DIR, `${name}.png`);
    if (!RECAPTURE && existsSync(out)) continue;
    const html = `<style>html,body{margin:0;width:${c.w}px;height:${c.h}px;overflow:hidden}
      .c{width:${c.w}px;height:${c.h}px;background-image:url('file://${homeAbs}');
      background-repeat:no-repeat;background-position:-${c.x}px -${c.y}px;
      background-size:${HOME_W}px ${HOME_H}px}</style><div class="c"></div>`;
    await render(out, c.w, c.h, { html, dsf: HOME_DSF });
    console.log(`  crop ${name} ← home1280.png @ (${c.x},${c.y}) ${c.w}×${c.h} CSS px`);
  }
}

const ASSETS = [];
const add = (path, w, h, html) => ASSETS.push({ path, w, h, html });

/* ══════════════════════════════════════════════════════════════════════
   2 · X PROFILE
   ══════════════════════════════════════════════════════════════════════ */

/* Header 1500×500.
   The launch pack proposed a full-bleed meridian. That is the MOTIF, and the
   motif never appears on a brand surface (IDENTITY.md §5) — full bleed also
   breaks the 2.1:1 ratio. So: the mark, correctly proportioned, alone.

   X overlays the avatar at lower-left (~180px + margin) and centre-crops on
   mobile, so everything sits in the middle band and nothing enters the lower
   left quadrant. */
add(
  'x/header.png', 1500, 500,
  page(1500, 500, T.paper, `
    <div style="position:absolute;left:0;right:0;top:250px;transform:translateY(-50%);
                display:flex;justify-content:center">${mark(230, T.ink)}</div>
    <div style="position:absolute;left:64px;right:64px;bottom:52px;height:1px;background:${T.rule}"></div>
    <div class="mono" style="position:absolute;right:64px;bottom:22px;font-size:12px;color:${T.muted}">
      Sealed until a date you choose</div>
  `),
);

/* ══════════════════════════════════════════════════════════════════════
   3 · INSTAGRAM HIGHLIGHT COVERS — 1080×1080
   Engraved glyphs on paper: uniform stroke, true circles and straight lines,
   square terminals, mitred joins (04 §5). Round caps read consumer.
   No text inside the circle — Instagram sets the title beneath it already.
   ══════════════════════════════════════════════════════════════════════ */
const GL = { s: 26, c: T.ink }; // stroke, colour — one weight across the set
const glyphs = {
  kept: `<path d="M300 60V190M300 230V360" stroke="${GL.c}" stroke-width="${GL.s}"/>
         <circle cx="160" cy="210" r="26" fill="${GL.c}"/>`,
  geometry: `<path d="M110 150H360M110 270H280" stroke="${GL.c}" stroke-width="${GL.s}"/>`,
  register: `<rect x="96" y="150" width="140" height="140" fill="${GL.c}"/>
             <rect x="272" y="150" width="140" height="140" fill="none" stroke="${GL.c}" stroke-width="${GL.s}"/>`,
  clock: `<path d="M170 330V130M310 330V210" stroke="${GL.c}" stroke-width="${GL.s}"/>`,
  record: `<rect x="110" y="120" width="260" height="200" fill="none" stroke="${GL.c}" stroke-width="${GL.s}"/>
           <path d="M160 180H320" stroke="${GL.c}" stroke-width="${GL.s}"/>`,
  rules: `<path d="M240 90V370" stroke="${GL.c}" stroke-width="${GL.s}"/>`,
};
for (const [name, g] of Object.entries(glyphs)) {
  add(
    `instagram/highlight-${name}.png`, 1080, 1080,
    page(1080, 1080, T.paper, `
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
        <svg width="720" height="720" viewBox="0 0 480 440" fill="none">${g}</svg>
      </div>`),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   3 · THE NINE-POST GRID — 1080×1350 (4:5)
   Read top-left to bottom-right the nine are a sequence: the mark, the
   system, the instrument, time, the rhythm, the serial, the refusals, the
   word, the date.
   ══════════════════════════════════════════════════════════════════════ */

/* 01 · the mark */
add(
  'instagram/01-the-mark.png', 1080, 1350,
  page(1080, 1350, T.paper, `
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
      ${mark(560, T.ink)}
    </div>
    <div class="mono" style="position:absolute;left:88px;bottom:80px;font-size:17px;color:${T.muted}">
      The Transit · a marker approaching a meridian<br>that has a place reserved for it</div>
  `),
);

/* 02 · two registers — hard split, never a crossfade */
add(
  'instagram/02-two-registers.png', 1080, 1350,
  page(1080, 1350, T.paper, `
    <div style="position:absolute;left:0;top:0;width:540px;height:1350px;background:${T.dark}"></div>
    <div style="position:absolute;left:540px;top:0;width:540px;height:1350px;background:${T.paper}"></div>
    <div style="position:absolute;left:96px;top:480px;width:348px;height:300px;background:${T.raised};
                box-shadow:0 18px 40px rgba(0,0,0,.45)"></div>
    <div class="serif" style="position:absolute;left:130px;top:520px;width:280px;font-size:27px;
                line-height:1.5;color:${T.ink}">A record is an object, never a background.</div>
    <div class="mono" style="position:absolute;left:96px;top:96px;font-size:16px;color:${T.darkMuted}">Instrument</div>
    <div class="mono" style="position:absolute;left:636px;top:96px;font-size:16px;color:${T.muted}">Record</div>
    <div class="mono" style="position:absolute;left:96px;bottom:96px;font-size:15px;color:${T.darkMuted};line-height:1.9">
      #0B0E14<br>IBM Plex Sans</div>
    <div class="mono" style="position:absolute;left:636px;bottom:96px;font-size:15px;color:${T.muted};line-height:1.9">
      #E9EAE6<br>Source Serif 4</div>
  `),
);

/* 03 · the dual clock — the instrument, at its real proportions */
const dualClock = (elapsed, remaining, scale = 1) => `
  <div style="display:flex;gap:${110 * scale}px">
    <div>
      <div class="mono" style="font-size:${19 * scale}px;color:${T.darkMuted};margin-bottom:${26 * scale}px">Travelled</div>
      <div class="sans" style="font-size:${86 * scale}px;font-weight:400;color:${T.darkInk};letter-spacing:.02em">${elapsed}</div>
    </div>
    <div>
      <div class="mono" style="font-size:${19 * scale}px;color:${T.darkMuted};margin-bottom:${26 * scale}px">Remaining</div>
      <div class="sans" style="font-size:${86 * scale}px;font-weight:400;color:${T.darkInk};letter-spacing:.02em">${remaining}</div>
    </div>
  </div>`;

const transitAxis = (pos, width = 904) => {
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const x = (i / 10) * width;
    return `<line x1="${x}" y1="10" x2="${x}" y2="22" stroke="${T.darkRule}" stroke-width="2"/>`;
  }).join('');
  const cx = pos * width;
  const temp = T.temp[Math.min(5, Math.floor(pos * 6))];
  return `<svg width="${width}" height="34" viewBox="0 0 ${width} 34" fill="none" style="display:block">
    <line x1="0" y1="16" x2="${width}" y2="16" stroke="${T.darkRule}" stroke-width="2"/>
    ${ticks}
    <rect x="${width - 3}" y="0" width="3" height="32" fill="${T.darkMuted}"/>
    <circle cx="${cx}" cy="16" r="9" fill="${temp}"/>
  </svg>`;
};

add(
  'instagram/03-dual-clock.png', 1080, 1350,
  page(1080, 1350, T.dark, `
    <div class="mono" style="position:absolute;left:88px;top:96px;font-size:17px;color:${T.darkMuted}">TC-84KZQM3P</div>
    <div style="position:absolute;left:88px;top:430px">${transitAxis(0.24)}</div>
    <div style="position:absolute;left:88px;top:560px">${dualClock('2 y 11 m', '12 y 1 m')}</div>
    <div style="position:absolute;left:88px;right:88px;top:790px;height:1px;background:${T.darkRule}"></div>
    <div class="mono" style="position:absolute;left:88px;top:830px;font-size:17px;color:${T.darkMuted}">
      Sealed 1 January 2026 · opens 1 January 2036</div>
    <div class="serif" style="position:absolute;left:88px;right:88px;bottom:96px;font-size:34px;
                line-height:1.45;color:${T.darkInk}">Elapsed and remaining, weighted equally, always together.</div>
  `),
);

/* 04 · a decade — a printed scale, not a UI */
{
  const W = 880, N = 10;
  const ticks = Array.from({ length: N + 1 }, (_, i) => {
    const x = (i / N) * W;
    return `<line x1="${x}" y1="0" x2="${x}" y2="${i % 5 === 0 ? 46 : 26}" stroke="${T.ink}" stroke-width="2.5"/>`;
  }).join('');
  const labels = Array.from({ length: N + 1 }, (_, i) => {
    if (i % 5 !== 0) return '';
    const x = (i / N) * W;
    return `<text x="${x}" y="86" fill="${T.muted}" font-family="PM" font-size="21"
            letter-spacing="2" text-anchor="${i === 0 ? 'start' : i === N ? 'end' : 'middle'}">${2026 + i}</text>`;
  }).join('');
  add(
    'instagram/04-a-decade.png', 1080, 1350,
    page(1080, 1350, T.paper, `
      <div class="serif" style="position:absolute;left:96px;right:96px;top:250px;font-size:62px;
                  line-height:1.22;color:${T.ink}">Ten years is 3,653 days.</div>
      <div style="position:absolute;left:100px;top:640px">
        <svg width="${W}" height="100" viewBox="0 -2 ${W} 100" fill="none">
          <line x1="0" y1="0" x2="${W}" y2="0" stroke="${T.ink}" stroke-width="2.5"/>
          ${ticks}<circle cx="${W * 0.07}" cy="0" r="11" fill="${T.ink}"/>${labels}
        </svg>
      </div>
      <div class="serif" style="position:absolute;left:96px;right:130px;top:880px;font-size:33px;
                  line-height:1.5;color:${T.muted}">A person holds about three of them in mind at once. That gap is the whole product.</div>
    `),
  );
}

/* 05 · the held beat — the signature, drawn as what it is: a stop */
{
  const W = 880, H = 210;
  add(
    'instagram/05-held-beat.png', 1080, 1350,
    page(1080, 1350, T.dark, `
      <div class="mono" style="position:absolute;left:96px;top:110px;font-size:17px;color:${T.darkMuted}">The held beat</div>
      <div style="position:absolute;left:100px;top:430px">
        <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none">
          <line x1="0" y1="${H - 26}" x2="${W}" y2="${H - 26}" stroke="${T.darkRule}" stroke-width="2"/>
          <path d="M0 ${H - 26} L${W * 0.46} ${H * 0.52}" stroke="${T.darkInk}" stroke-width="3.5" stroke-linecap="butt"/>
          <path d="M${W * 0.46} ${H * 0.52} L${W * 0.64} ${H * 0.52}" stroke="${T.brass}" stroke-width="4.5"/>
          <path d="M${W * 0.64} ${H * 0.52} L${W * 0.64} 26 L${W} 26" stroke="${T.darkInk}" stroke-width="3.5"/>
          <line x1="${W * 0.46}" y1="${H * 0.52}" x2="${W * 0.46}" y2="${H - 8}" stroke="${T.darkRule}" stroke-width="1.5" stroke-dasharray="5 6"/>
          <line x1="${W * 0.64}" y1="26" x2="${W * 0.64}" y2="${H - 8}" stroke="${T.darkRule}" stroke-width="1.5" stroke-dasharray="5 6"/>
        </svg>
      </div>
      <div class="mono" style="position:absolute;left:100px;top:660px;width:${W}px;display:flex;
                  font-size:15px;color:${T.darkMuted}">
        <span style="width:46%">Approach</span><span style="width:18%">Stop</span><span>Consequence</span></div>
      <div class="mono" style="position:absolute;left:100px;top:700px;width:${W}px;display:flex;
                  font-size:15px;color:${T.brass}">
        <span style="width:46%">constant velocity</span><span style="width:18%">400 ms</span><span>instant</span></div>
      <div class="serif" style="position:absolute;left:96px;right:96px;bottom:150px;font-size:36px;
                  line-height:1.42;color:${T.darkInk}">Every animation library wants to peak in the middle. Stopping instead is what turns a transition into a threshold.</div>
    `),
  );
}

/* 06 · the hallmark */
add(
  'instagram/06-hallmark.png', 1080, 1350,
  page(1080, 1350, T.paper, `
    <div class="mono" style="position:absolute;left:0;right:0;top:560px;text-align:center;
                font-size:96px;letter-spacing:.06em;color:${T.ink}">TC-84KZQM3P</div>
    <div style="position:absolute;left:150px;right:150px;top:730px;height:1px;background:${T.ruleStrong}"></div>
    <div class="serif" style="position:absolute;left:96px;right:96px;bottom:150px;font-size:34px;
                line-height:1.45;color:${T.muted};text-align:center">Every instrument carries its maker's mark and its serial number. Every capsule carries one too.</div>
  `),
);

/* 07 · the refusals — a ruled notice, no strikethroughs, no red */
{
  const items = [
    'No streaks', 'No badges', 'No “on this day”', 'No progress bar',
    'No preview of anything sealed', 'No urgency of any kind', 'No confetti', 'No sound at a reveal',
  ];
  add(
    'instagram/07-refusals.png', 1080, 1350,
    page(1080, 1350, T.paper, `
      <div class="mono" style="position:absolute;left:96px;top:110px;font-size:17px;color:${T.muted}">A partial list</div>
      <div style="position:absolute;left:96px;right:96px;top:160px;height:1px;background:${T.ruleStrong}"></div>
      <div style="position:absolute;left:96px;right:96px;top:230px">
        ${items
          .map(
            (t) => `<div style="display:flex;align-items:baseline;gap:26px;padding:26px 0;border-bottom:1px solid ${T.rule}">
              <span style="width:34px;height:1px;background:${T.ink};display:inline-block;transform:translateY(-9px)"></span>
              <span class="serif" style="font-size:38px;color:${T.ink}">${t}</span></div>`,
          )
          .join('')}
      </div>
      <div class="serif" style="position:absolute;left:96px;right:96px;bottom:96px;font-size:28px;
                  line-height:1.5;color:${T.muted}">Features arrive. Refusals have to be held.</div>
    `),
  );
}

/* 08 · Kept — lower-left third, never centred (04 §8) */
add(
  'instagram/08-kept.png', 1080, 1350,
  page(1080, 1350, T.paper, `
    <div class="serif" style="position:absolute;left:96px;bottom:300px;font-size:290px;
                font-weight:400;letter-spacing:-.02em;color:${T.ink};line-height:.9">Kept</div>
    <div class="mono" style="position:absolute;left:104px;bottom:170px;font-size:19px;
                color:${T.muted};line-height:2">Kept time · kept safe · kept its word · a keepsake</div>
  `),
);

/* 09 · the date — the register change, held as a still */
add(
  'instagram/09-the-date.png', 1080, 1350,
  page(1080, 1350, T.dark, `
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
                width:600px;height:400px;background:${T.raised};
                box-shadow:0 30px 90px rgba(0,0,0,.6);display:flex;flex-direction:column;
                align-items:center;justify-content:center;gap:34px">
      <div class="mono" style="font-size:17px;color:${T.muted}">It opens</div>
      <div class="serif" style="font-size:76px;color:${T.ink};letter-spacing:-.01em">2026</div>
    </div>
    <div class="mono" style="position:absolute;left:0;right:0;bottom:110px;text-align:center;
                font-size:17px;color:${T.darkMuted}">There is no countdown on this account</div>
  `),
);

/* ══════════════════════════════════════════════════════════════════════
   5 · LAUNCH ARTWORK
   ══════════════════════════════════════════════════════════════════════ */

/* Coming soon — an empty frame. The held beat as a still image: the
   instrument has cleared and the record has not arrived. */
add(
  'artwork/coming-soon.png', 1080, 1350,
  page(1080, 1350, T.dark, `
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
                width:600px;height:400px;border:1px solid rgba(230,232,236,.22)"></div>
    <div class="mono" style="position:absolute;left:0;right:0;bottom:110px;text-align:center;
                font-size:16px;color:${T.darkMuted}">Not yet</div>
  `),
);

/* Launch day — the record has arrived. Same frame, filled. */
add(
  'artwork/launch-day.png', 1080, 1350,
  page(1080, 1350, T.dark, `
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
                width:600px;height:400px;background:${T.raised};box-shadow:0 30px 90px rgba(0,0,0,.6);
                display:flex;align-items:center;justify-content:center">
      <div class="serif" style="font-size:84px;color:${T.ink}">Open.</div>
    </div>
    <div class="mono" style="position:absolute;left:0;right:0;bottom:110px;text-align:center;
                font-size:16px;color:${T.darkMuted}">timelycapsule.com</div>
  `),
);

/* Quote cards — paper, serif, one line, attribution as a rule not a name. */
const quotes = [
  ['What you seal will come back. Exactly when you said.', 'The promise'],
  ['A record is an object, never a background.', 'Gate 1'],
  ['If it moves, it is an instrument. If it holds still, it is the institution.', 'The constitution'],
];
quotes.forEach(([q, src], i) => {
  add(
    `artwork/quote-${i + 1}.png`, 1080, 1350,
    page(1080, 1350, T.paper, `
      <div class="serif" style="position:absolute;left:96px;right:96px;top:50%;transform:translateY(-50%);
                  font-size:${q.length > 60 ? 60 : 70}px;line-height:1.28;color:${T.ink};letter-spacing:-.012em">${q}</div>
      <div style="position:absolute;left:96px;bottom:150px;width:64px;height:1px;background:${T.ruleStrong}"></div>
      <div class="mono" style="position:absolute;left:96px;bottom:104px;font-size:16px;color:${T.muted}">${src}</div>
      <div style="position:absolute;right:96px;bottom:96px">${mark(52, T.ink)}</div>
    `),
  );
});

/* Waiting cards — the only assets in the kit permitted brass, because they
   are the only ones actually showing WAITING. */
[
  ['3 y 2 m', '11 y 10 m', 0.21, 'TC-84KZQM3P'],
  ['13 y 11 m', '0 y 1 m', 0.93, 'TC-9QXA4TFP'],
].forEach(([e, r, pos, hm], i) => {
  add(
    `artwork/waiting-${i + 1}.png`, 1080, 1080,
    page(1080, 1080, T.dark, `
      <div class="mono" style="position:absolute;left:88px;top:88px;font-size:17px;color:${T.darkMuted}">${hm}</div>
      <div class="mono" style="position:absolute;right:88px;top:86px;font-size:15px;color:${T.brass}">● Sealed</div>
      <div style="position:absolute;left:88px;top:380px">${transitAxis(pos)}</div>
      <div style="position:absolute;left:88px;top:500px">${dualClock(e, r, 0.92)}</div>
      <div style="position:absolute;left:88px;right:88px;top:730px;height:1px;background:${T.darkRule}"></div>
      <div class="mono" style="position:absolute;left:88px;top:770px;font-size:16px;color:${T.darkMuted}">
        Sealed 1 January 2026 · opens 1 January 2038</div>
    `),
  );
});

/* ══════════════════════════════════════════════════════════════════════
   7 · OPEN GRAPH — 1200×630
   Content-free by construction (04 §12.12). No capsule title, no recipient,
   no excerpt, no sender. Paper, because OG cards are viewed as small tiles
   in feeds that are usually light.
   ══════════════════════════════════════════════════════════════════════ */
const og = (title, sub) =>
  page(1200, 630, T.paper, `
    <div style="position:absolute;left:80px;top:72px;display:flex;align-items:center;gap:26px">
      ${mark(46, T.ink)}
      <div style="width:1px;height:46px;background:${T.rule}"></div>
      <div class="mono" style="font-size:15px;color:${T.muted}">TimelyCapsule</div>
    </div>
    <div class="serif" style="position:absolute;left:80px;right:120px;top:230px;font-size:66px;
                line-height:1.2;color:${T.ink};letter-spacing:-.014em">${title}</div>
    <div class="mono" style="position:absolute;left:80px;bottom:74px;font-size:16px;color:${T.muted}">${sub}</div>
    <div style="position:absolute;left:80px;right:80px;bottom:132px;height:1px;background:${T.rule}"></div>
  `);

add('og/og-home.png', 1200, 630, og('What you seal will come back. Exactly when you said.', 'Sealed on your device — kept until the date you chose'));
add('og/og-pricing.png', 1200, 630, og('If you stop paying, everything you have already sealed still arrives.', 'What it costs'));
add('og/og-help.png', 1200, 630, og('Questions, answered plainly.', 'Help'));
add('og/og-capsule-shared.png', 1200, 630, og('A record has been sealed.', 'Contents are unreadable to anyone but its recipient'));
/* The reveal card must reveal nothing at all — not even a sentence. */
add(
  'og/og-reveal.png', 1200, 630,
  page(1200, 630, T.dark, `
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
                width:420px;height:264px;border:1px solid rgba(230,232,236,.20)"></div>
  `),
);

/* ══════════════════════════════════════════════════════════════════════
   4 · MARKETING SCREENSHOTS
   Real UI, captured from the running app at localhost:3001 — not redrawn,
   not mocked. The only cleanup is cropping and a frame; no pixel of the
   product itself is altered.

   Frame per the pack: one hairline, 6px radius, NO traffic lights, no URL
   bar, no tab strip, no shadow, no tilt. Browser chrome is somebody else's
   identity in the middle of ours, and instruments do not hover.

   The register shown is the shipped default (paper). Dark is a user
   override, not the product's face, and presenting it as the only surface
   would be a small lie.
   ══════════════════════════════════════════════════════════════════════ */
await ensureRawCaptures();

const shotB64 = (name) =>
  'data:image/png;base64,' +
  readFileSync(join(CROPS_DIR, `${name}.png`)).toString('base64');

/** A captured region, framed. w is the rendered CSS width. */
const framed = (name, w, radius = 6) =>
  `<img src="${shotB64(name)}" style="display:block;width:${w}px;height:auto;
     border:1px solid ${T.rule};border-radius:${radius}px">`;

/** Bare crop, no frame — for a component rather than a screen. */
const bare = (name, w) =>
  `<img src="${shotB64(name)}" style="display:block;width:${w}px;height:auto">`;

/* S01 · the Dual Clock, cropped bare. It is a component, not a screen, so it
   gets no frame. The thing that is on every screen is the honest thing to
   lead with. */
add(
  'screenshots/01-dual-clock.png', 1080, 1350,
  page(1080, 1350, T.raised, `
    <div class="mono" style="position:absolute;left:88px;top:104px;font-size:17px;color:${T.muted}">
      The Dual Clock · on every screen</div>
    <div style="position:absolute;left:64px;right:64px;top:50%;transform:translateY(-50%)">
      ${bare('dualclock', 952)}</div>
    <div class="serif" style="position:absolute;left:88px;right:88px;bottom:130px;font-size:36px;
                line-height:1.42;color:${T.ink}">Almost nothing in software shows you what has already passed.</div>
  `),
);

/* S02 · the waiting screen at rest. The acceptance test in public: does a
   sealed capsule sitting untouched read as kept rather than as empty? */
add(
  'screenshots/02-waiting.png', 1080, 1350,
  page(1080, 1350, T.paper, `
    <div class="mono" style="position:absolute;left:88px;top:104px;font-size:17px;color:${T.muted}">
      A capsule, mid-wait</div>
    <div style="position:absolute;left:88px;top:50%;transform:translateY(-50%)">
      ${framed('waitingcard', 904)}</div>
    <div class="serif" style="position:absolute;left:88px;right:88px;bottom:130px;font-size:36px;
                line-height:1.42;color:${T.ink}">This is what a decade of custody looks like on a Tuesday.</div>
  `),
);

/* S03 · the composer — the hardest moment in the product (07 §IV), and the
   screen that makes a stranger imagine themselves writing. */
add(
  'screenshots/03-composer.png', 1600, 900,
  page(1600, 900, T.paper, `
    <div style="position:absolute;left:50%;top:56%;transform:translate(-50%,-50%)">
      ${framed('write', 1360)}</div>
    <div class="mono" style="position:absolute;left:120px;top:56px;font-size:16px;color:${T.muted}">
      The composer · no templates, no suggestions</div>
  `),
);

/* S04 · the reveal — the payoff, and the only place paper appears in-product. */
add(
  'screenshots/04-reveal.png', 1600, 900,
  page(1600, 900, T.paper, `
    <div style="position:absolute;left:120px;top:50%;transform:translateY(-50%);width:620px">
      <div class="serif" style="font-size:52px;line-height:1.26;color:${T.ink};letter-spacing:-.012em">
        The instrument clears. The frame holds empty. Then the record arrives.</div>
      <div class="mono" style="margin-top:34px;font-size:15px;color:${T.muted};line-height:1.9">
        Never a crossfade</div>
    </div>
    <div style="position:absolute;right:110px;top:50%;transform:translateY(-50%)">
      ${framed('revealcard', 700)}</div>
  `),
);

/* S05 · the landing page as it actually ships. */
add(
  'screenshots/05-hero.png', 1600, 900,
  page(1600, 900, T.paper, `
    <div style="position:absolute;left:50%;top:52%;transform:translate(-50%,-50%)">
      ${framed('hero', 1400)}</div>
    <div class="mono" style="position:absolute;left:100px;bottom:44px;font-size:15px;color:${T.muted}">
      timelycapsule.com</div>
  `),
);

/* S06 · the survival section — the most persuasive thing on the site and the
   one most competitors will not dare write down. */
add(
  'screenshots/06-survival.png', 1600, 900,
  page(1600, 900, T.paper, `
    <div style="position:absolute;left:50%;top:52%;transform:translate(-50%,-50%)">
      ${framed('survival', 1400)}</div>
    <div class="mono" style="position:absolute;left:100px;bottom:44px;font-size:15px;color:${T.muted}">
      Will you still be here in 2041?</div>
  `),
);

/* ── X · 16:9 variants ──────────────────────────────────────────────────
   X crops 4:5 badly in a timeline, so the posts that carry an image get a
   wide cut rather than the Instagram one. Same content, recomposed — never
   the 4:5 letterboxed. */

add(
  'x/post-mark.png', 1600, 900,
  page(1600, 900, T.paper, `
    <div style="position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);
                display:flex;justify-content:center">${mark(420, T.ink)}</div>
    <div class="mono" style="position:absolute;left:100px;bottom:60px;font-size:15px;color:${T.muted}">
      The Transit · the notch is exactly the width of the marker approaching it</div>
  `),
);

add(
  'x/post-kept.png', 1600, 900,
  page(1600, 900, T.paper, `
    <div class="serif" style="position:absolute;left:110px;top:50%;transform:translateY(-50%);
                font-size:250px;color:${T.ink};line-height:.9;letter-spacing:-.02em">Kept</div>
    <div class="mono" style="position:absolute;right:110px;bottom:96px;text-align:right;
                font-size:16px;color:${T.muted};line-height:2.1">Kept time<br>Kept safe<br>Kept its word<br>A keepsake</div>
  `),
);

{
  const W = 1180, N = 10;
  const ticks = Array.from({ length: N + 1 }, (_, i) => {
    const x = (i / N) * W;
    return `<line x1="${x}" y1="0" x2="${x}" y2="${i % 5 === 0 ? 44 : 24}" stroke="${T.ink}" stroke-width="2.5"/>`;
  }).join('');
  const labels = [0, 5, 10].map((i) => {
    const x = (i / N) * W;
    return `<text x="${x}" y="84" fill="${T.muted}" font-family="PM" font-size="20" letter-spacing="2"
            text-anchor="${i === 0 ? 'start' : i === N ? 'end' : 'middle'}">${2026 + i}</text>`;
  }).join('');
  add(
    'x/post-decade.png', 1600, 900,
    page(1600, 900, T.paper, `
      <div class="serif" style="position:absolute;left:110px;top:210px;font-size:66px;color:${T.ink};
                  letter-spacing:-.014em">Ten years is 3,653 days.</div>
      <div style="position:absolute;left:114px;top:430px">
        <svg width="${W}" height="96" viewBox="0 -2 ${W} 96" fill="none">
          <line x1="0" y1="0" x2="${W}" y2="0" stroke="${T.ink}" stroke-width="2.5"/>
          ${ticks}<circle cx="${W * 0.07}" cy="0" r="10" fill="${T.ink}"/>${labels}
        </svg></div>
      <div class="serif" style="position:absolute;left:110px;top:640px;width:900px;font-size:31px;
                  line-height:1.5;color:${T.muted}">A person holds about three of them in mind at once. That gap is the whole product.</div>
    `),
  );
}

{
  const W = 1180, H = 230;
  add(
    'x/post-held-beat.png', 1600, 900,
    page(1600, 900, T.dark, `
      <div class="mono" style="position:absolute;left:110px;top:96px;font-size:16px;color:${T.darkMuted}">The held beat</div>
      <div style="position:absolute;left:114px;top:250px">
        <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none">
          <line x1="0" y1="${H - 26}" x2="${W}" y2="${H - 26}" stroke="${T.darkRule}" stroke-width="2"/>
          <path d="M0 ${H - 26} L${W * 0.46} ${H * 0.52}" stroke="${T.darkInk}" stroke-width="3.5"/>
          <path d="M${W * 0.46} ${H * 0.52} L${W * 0.64} ${H * 0.52}" stroke="${T.brass}" stroke-width="4.5"/>
          <path d="M${W * 0.64} ${H * 0.52} L${W * 0.64} 26 L${W} 26" stroke="${T.darkInk}" stroke-width="3.5"/>
          <line x1="${W * 0.46}" y1="${H * 0.52}" x2="${W * 0.46}" y2="${H - 8}" stroke="${T.darkRule}" stroke-width="1.5" stroke-dasharray="5 6"/>
          <line x1="${W * 0.64}" y1="26" x2="${W * 0.64}" y2="${H - 8}" stroke="${T.darkRule}" stroke-width="1.5" stroke-dasharray="5 6"/>
        </svg></div>
      <div class="mono" style="position:absolute;left:114px;top:510px;width:${W}px;display:flex;font-size:15px;color:${T.darkMuted}">
        <span style="width:46%">Approach</span><span style="width:18%">Stop</span><span>Consequence</span></div>
      <div class="mono" style="position:absolute;left:114px;top:548px;width:${W}px;display:flex;font-size:15px;color:${T.brass}">
        <span style="width:46%">constant velocity</span><span style="width:18%">400 ms</span><span>instant</span></div>
      <div class="serif" style="position:absolute;left:110px;bottom:110px;width:1180px;font-size:34px;
                  line-height:1.4;color:${T.darkInk}">Stopping is what turns a transition into a threshold.</div>
    `),
  );
}

/* Tweet 2 needs its own 16:9 dual-clock plate — it previously pointed at the
   4:5 screenshots/01-dual-clock.png, which is exactly the letterboxed-in-
   timeline crop this section's own rule exists to avoid. Same component,
   composed for the wide frame instead of borrowed from the Instagram one. */
{
  const AXIS_W = 1180;
  add(
    'x/post-dualclock.png', 1600, 900,
    page(1600, 900, T.dark, `
      <div class="mono" style="position:absolute;left:110px;top:96px;font-size:16px;color:${T.darkMuted}">
        TC-84KZQM3P</div>
      <div style="position:absolute;left:114px;top:260px">${transitAxis(0.24, AXIS_W)}</div>
      <div style="position:absolute;left:114px;top:360px">${dualClock('2 y 11 m', '12 y 1 m', 0.86)}</div>
      <div class="serif" style="position:absolute;left:110px;bottom:110px;width:1180px;font-size:34px;
                  line-height:1.4;color:${T.darkInk}">Elapsed and remaining, weighted equally, always together.</div>
    `),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   5 · REAL-UI POSTS (2026-08-25 marketing refresh)

   Real authenticated app + real public reveal-page UI — not the marketing
   homepage's own demo sections (which is all §4 above, and everything the
   pre-refresh pack ever drew from, ever hit). Captured via
   design/.capture-marketing-raw.mjs: a dev-only session-token seed
   (apps/web/src/app/layout.tsx's DEV_SESSION_SEED_SCRIPT, NODE_ENV-gated)
   for the dashboard, the existing dev/schedule composer harness (now
   accepting ?movement=) for the composer, and the real public /c/[token]
   link — needing no auth at all — for reveal + replies. Light theme
   throughout, per the corrected default; nothing here is the product's old
   dark-mode face.

   One-reading-only has no screenshot: the Conditions panel that shows it is
   real but only reachable by a click, and headless Chrome's --screenshot
   mode has no interaction capability (see .capture-marketing-raw.mjs's own
   notes) — a typographic card quoting the product's own verbatim copy
   (confirmed live) stands in, same idiom as REFUSALS/KEPT below. */
const rawCrop = (name) =>
  'data:image/png;base64,' + readFileSync(join(CROPS_DIR, `${name}.png`)).toString('base64');
const rawFramed = (name, w, radius = 6) =>
  `<img src="${rawCrop(name)}" style="display:block;width:${w}px;height:auto;
     border:1px solid ${T.rule};border-radius:${radius}px">`;

/** One real-UI concept, rendered as both an X 16:9 plate and an IG 4:5 plate. */
function realUIPost({ xPath, igPath, crop, label, caption, xImgW = 1000, igImgW = 860 }) {
  add(
    xPath, 1600, 900,
    page(1600, 900, T.paper, `
      <div class="mono" style="position:absolute;left:100px;top:64px;font-size:15px;color:${T.muted}">${label}</div>
      <div style="position:absolute;left:100px;top:50%;transform:translateY(-46%)">${rawFramed(crop, xImgW)}</div>
      <div class="serif" style="position:absolute;right:90px;top:50%;transform:translateY(-50%);width:430px;
                  font-size:29px;line-height:1.46;color:${T.ink}">${caption}</div>
    `),
  );
  add(
    igPath, 1080, 1350,
    page(1080, 1350, T.paper, `
      <div class="mono" style="position:absolute;left:80px;top:96px;font-size:16px;color:${T.muted}">${label}</div>
      <div style="position:absolute;left:50%;top:420px;transform:translate(-50%,0)">${rawFramed(crop, igImgW)}</div>
      <div class="serif" style="position:absolute;left:80px;right:80px;bottom:110px;font-size:31px;
                  line-height:1.46;color:${T.ink}">${caption}</div>
    `),
  );
}

realUIPost({
  xPath: 'x/post-composer.png', igPath: 'instagram/10-composer.png', crop: 'composer-write',
  label: 'The composer', xImgW: 980, igImgW: 900,
  caption: 'It asks one question, then gets out of the way. No templates — those write the company&rsquo;s words. This is supposed to be yours.',
});

realUIPost({
  xPath: 'x/post-sealing.png', igPath: 'instagram/11-sealing.png', crop: 'composer-review',
  label: 'Before it seals', xImgW: 980, igImgW: 900,
  caption: 'A photo, a voice note, the place it was written &mdash; attached, then read once more. After that, nothing inside can change. Not by you, not by anyone.',
});

realUIPost({
  xPath: 'x/post-waiting.png', igPath: 'instagram/12-waiting.png', crop: 'dashboard-row',
  label: 'A Tuesday, mid-custody', xImgW: 980, igImgW: 900,
  caption: 'No notification. No nudge. No reason to check. A sealed letter needs to be left alone until the date says otherwise.',
});

realUIPost({
  xPath: 'x/post-reveal.png', igPath: 'instagram/13-reveal.png', crop: 'reveal-letter',
  label: 'On the day', xImgW: 620, igImgW: 640,
  caption: 'The screen goes dark first. Holds there for a beat. Then paper. Never a crossfade &mdash; a crossfade says the screen changed. This says something arrived.',
});

realUIPost({
  xPath: 'x/post-replies.png', igPath: 'instagram/14-replies.png', crop: 'replies-thread',
  label: 'Not the last word', xImgW: 560, igImgW: 620,
  caption: 'Once it opens, the person who received it can write back &mdash; sealed exactly the way the original was. Not a thread. A second letter, answering the first.',
});

/* One-reading-only — typographic, real quoted product copy, no screenshot
   (see the note above for why). Same idiom as x/post-kept.png. */
add(
  'x/post-one-reading.png', 1600, 900,
  page(1600, 900, T.dark, `
    <div class="mono" style="position:absolute;left:110px;top:96px;font-size:16px;color:${T.darkMuted}">One reading only</div>
    <div class="serif" style="position:absolute;left:110px;right:140px;top:220px;font-size:52px;line-height:1.28;
                color:${T.darkInk};letter-spacing:-.012em">Not every letter is meant to be kept forever.</div>
    <div class="serif" style="position:absolute;left:110px;right:220px;bottom:120px;font-size:28px;line-height:1.55;
                color:${T.darkMuted}">Choose it, and the record is destroyed the instant it has been read &mdash; no copy, not one, anywhere.</div>
  `),
);
add(
  'instagram/15-one-reading-only.png', 1080, 1350,
  page(1080, 1350, T.dark, `
    <div class="mono" style="position:absolute;left:80px;top:110px;font-size:16px;color:${T.darkMuted}">One reading only</div>
    <div class="serif" style="position:absolute;left:80px;right:80px;top:280px;font-size:50px;line-height:1.3;
                color:${T.darkInk};letter-spacing:-.012em">Not every letter is meant to be kept forever.</div>
    <div class="serif" style="position:absolute;left:80px;right:80px;bottom:130px;font-size:27px;line-height:1.6;
                color:${T.darkMuted}">Choose it, and the record is destroyed the instant it has been read &mdash; no copy, not one, anywhere.</div>
  `),
);

/* ── run ────────────────────────────────────────────────────────────── */
const list = ONLY ? ASSETS.filter((a) => a.path.includes(ONLY)) : ASSETS;
console.log(`rendering ${list.length} asset(s)`);
let n = 0;
for (const a of list) {
  const bytes = await shot(join(OUT, a.path), a.w, a.h, a.html);
  n++;
  console.log(`  ${String(n).padStart(2)}/${list.length}  ${a.path}  ${a.w}×${a.h}  ${(bytes / 1024).toFixed(0)}kb`);
}
console.log('done');
