/**
 * Produce the TimelyCapsule identity package.
 *   node design/.build-brand.mjs
 *
 * Writes design/brand/**: source SVGs, then rasterises the icon set with the
 * installed Chrome (no image dependencies). Geometry is defined once, here,
 * so every asset is generated from the same numbers.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const OUT = 'design/brand';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'icon'), { recursive: true });
mkdirSync(join(OUT, 'favicon'), { recursive: true });

/* ── THE GEOMETRY ──────────────────────────────────────────────────────
   64-unit grid. One source of truth for every asset.

   PRIMARY (≥20px)          MINIMAL (<20px)
   meridian x        45     46
   stroke            5      9
   upper segment     6→27   6→27
   notch             10     10   (27→37)
   lower segment     37→58  37→58
   marker            r5     r8
   marker cx         22     19

   The notch height equals the marker diameter in the primary mark: the
   marker is exactly the size of the place reserved for it. That rhyme is
   the whole idea and must survive any future adjustment.                */

const primary = (color = 'currentColor') => `
  <path d="M45 6V27M45 37V58" stroke="${color}" stroke-width="5" stroke-linecap="butt"/>
  <circle cx="22" cy="32" r="5" fill="${color}"/>`;

const minimal = (color = 'currentColor') => `
  <path d="M46 6V27M46 37V58" stroke="${color}" stroke-width="9" stroke-linecap="butt"/>
  <circle cx="19" cy="32" r="8" fill="${color}"/>`;

const svg = (body, { w = 64, h = 64, vb = '0 0 64 64', extra = '' } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}" fill="none" role="img">${extra}${body}\n</svg>\n`;

/* ── source marks ───────────────────────────────────────────────────── */
const files = {
  'mark.svg': svg(primary(), { extra: '<title>TimelyCapsule</title>' }),
  'mark-minimal.svg': svg(minimal(), { extra: '<title>TimelyCapsule</title>' }),
  'mark-ink.svg': svg(primary('#E6E8EC')),
  'mark-paper.svg': svg(primary('#16181A')),
  'mark-black.svg': svg(primary('#000000')),
  'mark-white.svg': svg(primary('#FFFFFF')),

  /* app icon: mark on the instrument ground, 12.5% optical safe area */
  'app-icon.svg': svg(
    `<g transform="translate(8 8) scale(0.75)">${primary('#E6E8EC')}</g>`,
    { extra: '<rect width="64" height="64" rx="14" fill="#0B0E14"/>' },
  ),
  'app-icon-paper.svg': svg(
    `<g transform="translate(8 8) scale(0.75)">${primary('#16181A')}</g>`,
    { extra: '<rect width="64" height="64" rx="14" fill="#E9EAE6"/>' },
  ),
  'favicon.svg': svg(minimal('#E6E8EC'), {
    extra: '<rect width="64" height="64" rx="8" fill="#0B0E14"/>',
  }),
};

/* ── wordmark + lockups ─────────────────────────────────────────────────
   Text elements reference IBM Plex Sans. These MUST be converted to
   outlines before production use — a live <text> element renders in a
   fallback face anywhere the font is absent. */
const WM = (x, y, size, anchor = 'start') => `
  <text x="${x}" y="${y}" font-family="'IBM Plex Sans',system-ui,sans-serif"
    font-size="${size}" font-weight="600" letter-spacing="-0.2" text-anchor="${anchor}"
    dominant-baseline="middle" fill="currentColor">Timely<tspan font-weight="400"
    fill-opacity="0.62">Capsule</tspan></text>`;

files['wordmark.svg'] = svg(WM(0, 16, 26), { w: 232, h: 32, vb: '0 0 232 32' });

/* Horizontal lockup — mark height 32, gap 20 (see IDENTITY.md: the gap is
   deliberately wider than optical default, so the mark reads as a mark and
   not as punctuation attached to the word). */
files['lockup-horizontal.svg'] = svg(
  `<g transform="translate(0 4) scale(0.5)">${primary()}</g>${WM(52, 20, 24)}`,
  { w: 268, h: 40, vb: '0 0 268 40' },
);

files['lockup-vertical.svg'] = svg(
  `<g transform="translate(58 0) scale(0.66)">${primary()}</g>${WM(72, 68, 20, 'middle')}`,
  { w: 144, h: 84, vb: '0 0 144 84' },
);

for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(OUT, name), content);
}
console.log(`svg sources: ${Object.keys(files).length}`);

/* ── rasterise ──────────────────────────────────────────────────────────
   Chrome renders an exact-size page containing one asset. --headless=old
   with a transparent default background where the asset has no tile. */
function raster(outPath, size, inner, transparent) {
  const page = `<style>html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden;
    ${transparent ? '' : 'background:#0B0E14;'}}svg{display:block}</style>${inner}`;
  const tmp = `/tmp/tc-raster-${Date.now()}-${size}.html`;
  writeFileSync(tmp, page);
  const args = [
    '--headless=old', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--user-data-dir=/tmp/tc-r-${size}-${transparent ? 't' : 'o'}`,
    '--virtual-time-budget=1500', `--window-size=${size},${size}`,
    `--screenshot=${outPath}`,
  ];
  if (transparent) args.push('--default-background-color=00000000');
  args.push('file://' + tmp);
  try { execFileSync(CHROME, args, { stdio: 'ignore', timeout: 40000 }); } catch { /* writes anyway */ }
  rmSync(tmp, { force: true });
  return existsSync(outPath);
}

const ICON_SIZES = [1024, 512, 256, 192, 180, 128, 64, 48];
const FAVICON_SIZES = [48, 32, 16];

let made = 0;
for (const s of ICON_SIZES) {
  const inner = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64" fill="none">
    <rect width="64" height="64" rx="14" fill="#0B0E14"/>
    <g transform="translate(8 8) scale(0.75)">${primary('#E6E8EC')}</g></svg>`;
  if (raster(`${OUT}/icon/icon-${s}.png`, s, inner, false)) made++;
}
for (const s of FAVICON_SIZES) {
  const body = s < 20 ? minimal('#E6E8EC') : primary('#E6E8EC');
  const inner = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64" fill="none">
    <rect width="64" height="64" rx="${s < 20 ? 6 : 8}" fill="#0B0E14"/>${body}</svg>`;
  if (raster(`${OUT}/favicon/favicon-${s}.png`, s, inner, false)) made++;
}
/* transparent monochrome mark, for print and partner use */
for (const s of [512, 128]) {
  const inner = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64" fill="none">${primary('#000000')}</svg>`;
  if (raster(`${OUT}/mark-black-${s}.png`, s, inner, true)) made++;
}
console.log(`rasters: ${made}`);
