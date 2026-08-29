/**
 * Build the LinkedIn banner assets (personal + company).
 *   node design/.build-linkedin.mjs
 *
 * Writes design/launch/linkedin/. Same approach as design/.build-launch.mjs:
 * real fonts, real tokens, no image model, no product screenshot involved —
 * these two assets are pure typography and the mark's own geometry, so a
 * generator would drift from the identity the moment it touched either.
 *
 * Both render at dsf:2 (retina) at LinkedIn's real 1x display dimensions —
 * LinkedIn downscales on upload regardless, and this matches every other
 * asset in the pack.
 */
import { mkdirSync, writeFileSync, existsSync, statSync, rmSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const OUT = 'design/launch/linkedin';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FONTS = resolve('design/.fonts');
mkdirSync(OUT, { recursive: true });

const T = {
  paper: '#E9EAE6',
  ink: '#16181A',
  muted: '#5E635C',
  rule: 'rgba(22,24,26,.14)',
  ruleStrong: 'rgba(22,24,26,.28)',
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
.sans{font-family:PS,system-ui,sans-serif}
`;

const page = (w, h, bg, body) =>
  `<style>${FONT_CSS}
   html,body{width:${w}px;height:${h}px;overflow:hidden;background:${bg}}
   .p{position:relative;width:${w}px;height:${h}px;overflow:hidden}</style><div class="p">${body}</div>`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function render(outPath, w, h, html, dsf = 2) {
  const tmp = `/tmp/tc-li-${Math.random().toString(36).slice(2)}.html`;
  writeFileSync(tmp, html);
  rmSync(outPath, { force: true });
  const proc = spawn(
    CHROME,
    [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      '--disable-background-networking', '--disable-sync', '--mute-audio',
      `--force-device-scale-factor=${dsf}`, '--allow-file-access-from-files',
      '--user-data-dir=/tmp/tc-li-profile',
      '--virtual-time-budget=1500',
      `--window-size=${w},${h}`, `--screenshot=${outPath}`, 'file://' + tmp,
    ],
    { stdio: 'ignore' },
  );
  let last = -1;
  for (let i = 0; i < 200; i++) {
    await sleep(100);
    if (existsSync(outPath)) {
      const size = statSync(outPath).size;
      if (size > 0 && size === last) break;
      last = size;
    }
  }
  try { proc.kill('SIGKILL'); } catch {}
  rmSync(tmp, { force: true });
  if (!existsSync(outPath)) throw new Error(`render failed: ${outPath}`);
  return statSync(outPath).size;
}

/* The real lockup — geometry and kerning already solved (brand/IDENTITY.md
   §4). Read directly rather than reconstructed, so a future lockup edit
   propagates here automatically. currentColor resolves against the
   wrapping element's `color`, so this can be recoloured without touching
   the file. */
const LOCKUP_SVG_RAW = readFileSync(resolve('design/brand/lockup-horizontal.svg'), 'utf8');
/** Re-sizes the lockup to a target rendered width, aspect-locked. The file's
    own width/height attributes are its 7458×946 native artboard — an <img>
    would scale to a wrapper automatically, but this is inlined raw <svg> (so
    `currentColor` resolves against the CSS `color` it's wrapped in), and an
    inline <svg> respects its own width/height attributes over a parent's CSS
    width unless they're overridden directly. */
const lockup = (targetW) => {
  const h = (targetW * 946.35) / 7458.86;
  return LOCKUP_SVG_RAW.replace(/width="[\d.]+"/, `width="${targetW}"`).replace(/height="[\d.]+"/, `height="${h}"`);
};

/* ═══════════════════════════════════════════════════════════════════════
   1 · Company banner — LinkedIn Page cover, 1128×191 (4200×700 accepted;
   this pack renders dsf:2 at the real 1x spec, same convention as
   everywhere else).
   ═══════════════════════════════════════════════════════════════════════ */
{
  const W = 1128, H = 191;
  const html = page(W, H, T.paper, `
    <div style="position:absolute;left:64px;top:50%;transform:translateY(-50%);color:${T.ink}">
      ${lockup(300)}
    </div>
    <div style="position:absolute;right:56px;bottom:34px;text-align:right">
      <div class="mono" style="font-size:12px;color:${T.muted};line-height:1.7">Sealed until the date<br>you choose</div>
    </div>
    <div style="position:absolute;left:64px;right:56px;bottom:22px;height:1px;background:${T.rule}"></div>
  `);
  const bytes = await render(`${OUT}/company-banner.png`, W, H, html);
  console.log(`company-banner.png  ${W}×${H} (dsf2)  ${(bytes / 1024).toFixed(0)}kb`);
}

/* ═══════════════════════════════════════════════════════════════════════
   2 · Personal banner — LinkedIn profile cover, 1584×396.
   Direction B: the meridian, stretched to the frame, doing the connecting —
   not a logo lockup, not a tagline. Anyone who has seen the product
   recognises the geometry; anyone who hasn't just sees a considered,
   quiet line. Text sits right of centre — LinkedIn overlaps the profile
   photo on the bottom-left (~568×264 at the largest, mobile) and this
   keeps everything meaningful clear of it with margin to spare.
   ═══════════════════════════════════════════════════════════════════════ */
{
  const W = 1584, H = 396;
  const axisY = 198; // vertical centre
  const notchX = 1050; // where the gap sits
  const notchGap = 34; // width of the gap, proportional to the real mark's 10/64 ratio at this stroke weight
  const markerX = 860; // held at "half distance" from the notch, per brand rule — never touching
  // LinkedIn overlaps the profile photo on the bottom-left — up to 568px wide
  // on mobile. Starting the line at 620 keeps the whole composition clear of
  // it entirely, rather than trusting "it's just a plain rule under there."
  const lineStart = 620;
  const lineEnd = 1500;

  const html = page(W, H, T.paper, `
    <svg width="${W}" height="${H}" style="position:absolute;left:0;top:0">
      <line x1="${lineStart}" y1="${axisY}" x2="${notchX - notchGap / 2}" y2="${axisY}"
            stroke="${T.ink}" stroke-width="2"/>
      <line x1="${notchX + notchGap / 2}" y1="${axisY}" x2="${lineEnd}" y2="${axisY}"
            stroke="${T.ink}" stroke-width="2"/>
      <circle cx="${markerX}" cy="${axisY}" r="7" fill="${T.ink}"/>
    </svg>
    <div class="mono" style="position:absolute;left:64px;top:56px;font-size:13px;color:${T.muted};letter-spacing:.14em">
      ASSAD ISAH</div>
    <div style="position:absolute;left:${notchX + 70}px;top:${axisY - 92}px;width:520px">
      <p class="sans" style="font-size:22px;font-weight:600;color:${T.ink};letter-spacing:-.01em">Software engineer</p>
      <p class="mono" style="margin-top:10px;font-size:13px;color:${T.muted};letter-spacing:.12em">
        CURRENTLY BUILDING TIMELYCAPSULE</p>
    </div>
  `);
  const bytes = await render(`${OUT}/personal-banner.png`, W, H, html);
  console.log(`personal-banner.png  ${W}×${H} (dsf2)  ${(bytes / 1024).toFixed(0)}kb`);
}

console.log('done');
