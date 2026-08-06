/**
 * Produce the TimelyCapsule identity package.
 *   node design/.build-brand.mjs
 *
 * Writes design/brand/**: source SVGs, then rasterises every icon set with the
 * installed Chrome (no image dependencies). Geometry is defined once, here, so
 * every asset is generated from the same numbers.
 *
 * The wordmark's letterforms come from design/.wordmark-outlines.json, produced
 * by design/.build-wordmark.py. They are real outlines, not live <text>.
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { join, extname } from 'node:path';

const OUT = 'design/brand';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = '/tmp/tc-brand-profile';

/* Clear only what this script generates.
   IDENTITY.md is hand-written and lives in this folder. An earlier version of
   this script began with `rmSync(OUT, {recursive:true})`, which deleted it on
   every run — the guideline that governs the assets was being destroyed by the
   thing that builds them, and only git made that recoverable. Never widen this
   back to a blanket delete: whitelist the generated extensions instead. */
const GENERATED_EXT = new Set(['.svg', '.png', '.ico']);
const SUBDIRS = ['icon', 'icon-paper', 'favicon', 'social'];

/* --sheet-only re-renders just the contact sheet from the existing SVG
   sources. The full raster pass is ~30 sequential Chrome launches and takes
   twenty minutes; reviewing the sheet should not cost that.

   --ico-only re-runs just the favicon.ico assembly step from the existing
   favicon-*.png rasters, for the same reason: rebuilding the ICO packing
   logic shouldn't cost a 20-minute raster pass. */
const SHEET_ONLY = process.argv.includes('--sheet-only');
const ICO_ONLY = process.argv.includes('--ico-only');

if (existsSync(OUT) && !SHEET_ONLY && !ICO_ONLY) {
  for (const name of readdirSync(OUT)) {
    if (GENERATED_EXT.has(extname(name).toLowerCase())) {
      rmSync(join(OUT, name), { force: true });
    }
  }
  for (const d of SUBDIRS) rmSync(join(OUT, d), { recursive: true, force: true });
}
for (const d of SUBDIRS) mkdirSync(join(OUT, d), { recursive: true });

/* ── THE PALETTE ───────────────────────────────────────────────────────
   Verified values from design/05-IDENTITY-DECISION.md. The mark itself is
   achromatic permanently (IDENTITY.md §2) — these are ground colours only,
   never applied to the mark as a hue. Brass appears in no brand asset: it
   means WAITING and a logo is not waiting.                             */
const INSTRUMENT_GROUND = '#0B0E14';
const INSTRUMENT_INK = '#E6E8EC';
const RECORD_GROUND = '#E9EAE6';
const RECORD_INK = '#16181A';

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
   the whole idea and must survive any future adjustment.

   Segment-to-notch ratio is 2.1 : 1 (21 units of segment, 10 of notch).
   This is why no asset may run the meridian to the edge of its frame —
   full-bleed would lengthen the segments to 2.7 : 1 and the notch would
   stop reading. IDENTITY.md §5 keeps that treatment for the *motif*,
   which is a different object and never appears on a brand surface.   */

const primary = (color = 'currentColor') => `
  <path d="M45 6V27M45 37V58" stroke="${color}" stroke-width="5" stroke-linecap="butt"/>
  <circle cx="22" cy="32" r="5" fill="${color}"/>`;

const minimal = (color = 'currentColor') => `
  <path d="M46 6V27M46 37V58" stroke="${color}" stroke-width="9" stroke-linecap="butt"/>
  <circle cx="19" cy="32" r="8" fill="${color}"/>`;

/* The primary mark's ink bounding box on the 64 grid. The mark is NOT
   centred in its own 64 box, so every framing decision below measures from
   these numbers rather than assuming symmetry. */
const MARK_BB = { x: 17, y: 6, w: 30.5, h: 52 };
const MARK_CX = MARK_BB.x + MARK_BB.w / 2; // 32.25
const MARK_CY = MARK_BB.y + MARK_BB.h / 2; // 32
/* Half-diagonal — what a circular avatar crop and an Android mask actually
   clip against. Rectangular clear space is not sufficient for either. */
const MARK_HALF_DIAG = Math.hypot(MARK_BB.w / 2, MARK_BB.h / 2); // 30.14

const svg = (body, { w = 64, h = 64, vb = '0 0 64 64', extra = '' } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}" fill="none" role="img">${extra}${body}\n</svg>\n`;

/* ── source marks ───────────────────────────────────────────────────── */
const files = {
  'mark.svg': svg(primary(), { extra: '<title>TimelyCapsule</title>' }),
  'mark-minimal.svg': svg(minimal(), { extra: '<title>TimelyCapsule</title>' }),
  'mark-ink.svg': svg(primary(INSTRUMENT_INK)),
  'mark-paper.svg': svg(primary(RECORD_INK)),
  'mark-black.svg': svg(primary('#000000')),
  'mark-white.svg': svg(primary('#FFFFFF')),

  /* app icon: mark on the instrument ground, 12.5% optical safe area */
  'app-icon.svg': svg(
    `<g transform="translate(8 8) scale(0.75)">${primary(INSTRUMENT_INK)}</g>`,
    { extra: `<rect width="64" height="64" rx="14" fill="${INSTRUMENT_GROUND}"/>` },
  ),
  'app-icon-paper.svg': svg(
    `<g transform="translate(8 8) scale(0.75)">${primary(RECORD_INK)}</g>`,
    { extra: `<rect width="64" height="64" rx="14" fill="${RECORD_GROUND}"/>` },
  ),
  'favicon.svg': svg(minimal(INSTRUMENT_INK), {
    extra: `<rect width="64" height="64" rx="8" fill="${INSTRUMENT_GROUND}"/>`,
  }),
};

/* ── the avatar tile ────────────────────────────────────────────────────
   A social profile picture is the MARK, not the motif — IDENTITY.md §5 puts
   favicon, app icon and lockups in the mark column, and the mark may not be
   redrawn to suit a frame.

   Two constraints decide the one free variable (how large the mark sits in
   its tile), and they pull in opposite directions:

     · Clear space is 1 notch-height = 10 units on all four sides (§3), and
       for a CIRCULAR crop it must hold on the diagonal, not just the axes.
     · The mark must render at ≥20px or it has to switch to minimal density
       (§3). Platforms render avatars as small as 32px in a timeline.

   Solving the second for a 32px render: the mark is 52 units tall, so the
   tile can be at most 52 / (20/32) = 83.2 units before the mark drops under
   20px. Rounding to a tile of 81.25 units puts the mark at 64% of the tile —
   20.5px at a 32px render, which clears the threshold with 0.5px to spare,
   and leaves 14.6 units of clear space on the short axis and 10.5 units on
   the diagonal. Both rules hold simultaneously, but only just.

   Expressed as a viewBox offset so the mark's path data stays byte-identical
   to mark.svg. The geometry is untouched; only the frame moves.          */
const AVATAR_TILE = 81.25;
const avatarVb = [
  -(AVATAR_TILE / 2 - MARK_CX),
  -(AVATAR_TILE / 2 - MARK_CY),
  AVATAR_TILE,
  AVATAR_TILE,
].map((n) => +n.toFixed(4));

const avatar = (ink, ground) =>
  svg(primary(ink), {
    w: 1024,
    h: 1024,
    vb: avatarVb.join(' '),
    /* Square, no corner radius: every platform applies its own circular mask,
       and a baked-in radius would show the page through the corners. */
    extra: `<rect x="${avatarVb[0]}" y="${avatarVb[1]}" width="${AVATAR_TILE}" height="${AVATAR_TILE}" fill="${ground}"/>`,
  });

files['social/avatar-paper.svg'] = avatar(RECORD_INK, RECORD_GROUND);
files['social/avatar-ink.svg'] = avatar(INSTRUMENT_INK, INSTRUMENT_GROUND);

/* ── the maskable icon ──────────────────────────────────────────────────
   Android adaptive icons clip to an arbitrary shape. The guaranteed-visible
   region is a centred circle of diameter 80% of the canvas, so the mark's
   half-diagonal must fit inside 40% of the canvas: 30.14 / 0.4 = 75.4 units
   minimum. An 80-unit tile clears it, and the ground runs full bleed so the
   mask never cuts a transparent corner. */
const MASK_TILE = 80;
const maskVb = [
  -(MASK_TILE / 2 - MARK_CX),
  -(MASK_TILE / 2 - MARK_CY),
  MASK_TILE,
  MASK_TILE,
].map((n) => +n.toFixed(4));

files['app-icon-maskable.svg'] = svg(primary(INSTRUMENT_INK), {
  vb: maskVb.join(' '),
  extra: `<rect x="${maskVb[0]}" y="${maskVb[1]}" width="${MASK_TILE}" height="${MASK_TILE}" fill="${INSTRUMENT_GROUND}"/>`,
});

/* ── wordmark + lockups, outlined ───────────────────────────────────────
   IDENTITY.md §4 required these be converted to outlines before production
   use. They now are: real IBM Plex Sans contours, shaped with HarfBuzz so
   the kerning matches what a browser rendered from the live <text> version.
   Nothing here depends on the font being installed anywhere, ever again.

   Setting: "Timely" 600 · "Capsule" 400 at 62% opacity · tracking −0.2.   */
const WM_PATH = 'design/.wordmark-outlines.json';
if (!existsSync(WM_PATH)) {
  throw new Error(
    `${WM_PATH} is missing. Run: python3 design/.build-wordmark.py\n` +
      '(needs the next/font cache in apps/web/.next — build the web app once first)',
  );
}
const WM = JSON.parse(readFileSync(WM_PATH, 'utf8'));
const CAP = WM.capHeight; // 698 font units

/** The wordmark's two runs as <path> elements, baseline at y=0. */
const wordmarkPaths = (color = 'currentColor') =>
  WM.runs
    .map(
      (r) =>
        `\n  <path d="${r.d}" fill="${color}"${r.weight === 400 ? ' fill-opacity="0.62"' : ''}/>`,
    )
    .join('');

/** Union of boxes, each {x,y,w,h}. */
const union = (boxes) => {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w));
  const y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: x2 - x, h: y2 - y };
};

const round2 = (n) => +n.toFixed(2);

/* Wordmark alone — viewBox is the true ink box, origin normalised to 0 0. */
{
  const { x, y, w, h } = WM.ink;
  files['wordmark.svg'] = svg(
    `<g transform="translate(${round2(-x)} ${round2(-y)})">${wordmarkPaths()}\n  </g>`,
    { w: round2(w), h: round2(h), vb: `0 0 ${round2(w)} ${round2(h)}`, extra: '<title>TimelyCapsule</title>' },
  );
}

/* Horizontal lockup — primary.
   IDENTITY.md §4: "Mark at cap height of the wordmark; gap = 1.2× the mark's
   width, which is wider than optical default. This is deliberate: at a normal
   gap the mark reads as punctuation attached to the word rather than as a
   mark."

   The previous build shipped a mark at 1.55× cap height and a gap of 1.85×
   the mark width — neither number was the documented rule. Both are now
   derived from §4 directly, so the file cannot drift from the guideline. */
{
  const s = CAP / MARK_BB.h; // mark ink height == cap height
  const markW = MARK_BB.w * s;
  const gap = 1.2 * markW;
  /* Place the mark so its ink sits from the baseline up to cap height. */
  const mx = -MARK_BB.x * s;
  const my = -(MARK_BB.y + MARK_BB.h) * s;
  const wmx = markW + gap - WM.ink.x;

  const box = union([
    { x: 0, y: -CAP, w: markW, h: CAP },
    { x: markW + gap, y: WM.ink.y, w: WM.ink.w, h: WM.ink.h },
  ]);

  files['lockup-horizontal.svg'] = svg(
    `<g transform="translate(${round2(-box.x)} ${round2(-box.y)})">` +
      `\n  <g transform="translate(${round2(mx)} ${round2(my)}) scale(${round2(s)})">${primary()}</g>` +
      `\n  <g transform="translate(${round2(wmx)} 0)">${wordmarkPaths()}</g>\n  </g>`,
    {
      w: round2(box.w),
      h: round2(box.h),
      vb: `0 0 ${round2(box.w)} ${round2(box.h)}`,
      extra: '<title>TimelyCapsule</title>',
    },
  );
}

/* Vertical lockup — for square spaces.
   §4 fixes the gap at 0.6× mark height but does not fix the mark's size, so
   it is set here at 2× cap height: large enough to lead the composition,
   close to what the previous build shipped (2.46×), and a declared ratio
   rather than an arbitrary scale factor. This is the one number on this file
   that §4 leaves open — if it is ever changed, change it here. */
{
  const markH = 2 * CAP;
  const s = markH / MARK_BB.h;
  const markW = MARK_BB.w * s;
  const gap = 0.6 * markH;
  const width = Math.max(markW, WM.ink.w);

  const markX = (width - markW) / 2;
  const wmX = (width - WM.ink.w) / 2 - WM.ink.x;
  /* Mark ink bottom at y=0; wordmark baseline one gap below it, measured to
     the cap line so the optical interval reads as the gap. */
  const baseline = gap + CAP;

  const box = union([
    { x: markX, y: -markH, w: markW, h: markH },
    { x: (width - WM.ink.w) / 2, y: baseline + WM.ink.y, w: WM.ink.w, h: WM.ink.h },
  ]);

  files['lockup-vertical.svg'] = svg(
    `<g transform="translate(${round2(-box.x)} ${round2(-box.y)})">` +
      `\n  <g transform="translate(${round2(markX - MARK_BB.x * s)} ${round2(-(MARK_BB.y + MARK_BB.h) * s)}) scale(${round2(s)})">${primary()}</g>` +
      `\n  <g transform="translate(${round2(wmX)} ${round2(baseline)})">${wordmarkPaths()}</g>\n  </g>`,
    {
      w: round2(box.w),
      h: round2(box.h),
      vb: `0 0 ${round2(box.w)} ${round2(box.h)}`,
      extra: '<title>TimelyCapsule</title>',
    },
  );
}

for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(OUT, name), content);
}
console.log(`svg sources: ${Object.keys(files).length}`);

/* ── rasterise ──────────────────────────────────────────────────────────
   Chrome renders an exact-size page containing one asset. --headless=old
   with a transparent default background where the asset has no tile.

   Chrome writes the screenshot and then does not exit — it has to be killed.
   The original version of this function waited on the process itself via
   execFileSync's `timeout`, which meant every single call paid the full
   40-second timeout before the catch-and-ignore fired: ~29 rasters made a
   full build take twenty minutes. Watching the output file for a size that
   stops changing, instead of waiting on the process, turns that into about a
   second per asset — the same fix `design/.build-launch.mjs` already uses. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function raster(outPath, w, h, inner, transparent) {
  const page = `<style>html,body{margin:0;padding:0;width:${w}px;height:${h}px;overflow:hidden;
    ${transparent ? '' : `background:${INSTRUMENT_GROUND};`}}svg{display:block}</style>${inner}`;
  const tmp = `/tmp/tc-raster-${Date.now()}-${w}x${h}.html`;
  writeFileSync(tmp, page);
  /* One shared profile directory, reused across every launch. A fresh
     --user-data-dir makes Chrome run first-run setup each time, which cost
     ~60s per asset and dominated the entire build. Launches are sequential,
     so sharing the profile is safe. The content is a static inline SVG with
     no network and no script, so the virtual time budget only needs to cover
     first paint. */
  const args = [
    '--headless=old', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-sync', '--disable-background-networking', '--mute-audio',
    `--user-data-dir=${PROFILE}`,
    '--virtual-time-budget=400', `--window-size=${w},${h}`,
    `--screenshot=${outPath}`,
  ];
  if (transparent) args.push('--default-background-color=00000000');
  args.push('file://' + tmp);

  rmSync(outPath, { force: true });
  const proc = spawn(CHROME, args, { stdio: 'ignore' });
  let last = -1;
  for (let i = 0; i < 200; i++) {
    await sleep(80);
    if (existsSync(outPath)) {
      const size = statSync(outPath).size;
      if (size > 0 && size === last) break;
      last = size;
    }
  }
  try { proc.kill('SIGKILL'); } catch {}
  rmSync(tmp, { force: true });
  return existsSync(outPath);
}

const ICON_SIZES = [1024, 512, 256, 192, 180, 128, 64, 48];
const FAVICON_SIZES = [48, 32, 16];
/* Uploaded avatar sizes. 1024 is the canonical upload; 400 is X's own native
   avatar resolution, kept so the platform never has to resample twice. */
const AVATAR_SIZES = [1024, 400];

let made = 0;
if (!SHEET_ONLY && !ICO_ONLY) {

/* Instrument app icons */
for (const s of ICON_SIZES) {
  const inner = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64" fill="none">
    <rect width="64" height="64" rx="14" fill="${INSTRUMENT_GROUND}"/>
    <g transform="translate(8 8) scale(0.75)">${primary(INSTRUMENT_INK)}</g></svg>`;
  if (await raster(`${OUT}/icon/icon-${s}.png`, s, s, inner, false)) made++;
}

/* Record-register app icons. None existed before; every paper-ground surface
   (social profiles, light-mode partner decks, print collateral) had to
   improvise from the dark tile or from nothing. */
for (const s of ICON_SIZES) {
  const inner = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64" fill="none">
    <rect width="64" height="64" rx="14" fill="${RECORD_GROUND}"/>
    <g transform="translate(8 8) scale(0.75)">${primary(RECORD_INK)}</g></svg>`;
  if (await raster(`${OUT}/icon-paper/icon-${s}.png`, s, s, inner, false)) made++;
}

/* Maskable (Android adaptive). Full-bleed ground, mark inside the 80% circle. */
for (const s of [512, 192]) {
  const inner = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="${maskVb.join(' ')}" fill="none">
    <rect x="${maskVb[0]}" y="${maskVb[1]}" width="${MASK_TILE}" height="${MASK_TILE}" fill="${INSTRUMENT_GROUND}"/>
    ${primary(INSTRUMENT_INK)}</svg>`;
  if (await raster(`${OUT}/icon/icon-maskable-${s}.png`, s, s, inner, false)) made++;
}

/* Favicons. Below 20px the mark switches density — that is the whole reason
   two densities exist, and 16px is where it earns its keep. */
for (const s of FAVICON_SIZES) {
  const body = s < 20 ? minimal(INSTRUMENT_INK) : primary(INSTRUMENT_INK);
  const inner = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64" fill="none">
    <rect width="64" height="64" rx="${s < 20 ? 6 : 8}" fill="${INSTRUMENT_GROUND}"/>${body}</svg>`;
  if (await raster(`${OUT}/favicon/favicon-${s}.png`, s, s, inner, false)) made++;
}

/* Social avatars, both registers. Square, opaque — platforms composite alpha
   unpredictably and apply their own circular mask. */
for (const [name, ink, ground] of [
  ['paper', RECORD_INK, RECORD_GROUND],
  ['ink', INSTRUMENT_INK, INSTRUMENT_GROUND],
]) {
  for (const s of AVATAR_SIZES) {
    const inner = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="${avatarVb.join(' ')}" fill="none">
      <rect x="${avatarVb[0]}" y="${avatarVb[1]}" width="${AVATAR_TILE}" height="${AVATAR_TILE}" fill="${ground}"/>
      ${primary(ink)}</svg>`;
    if (await raster(`${OUT}/social/avatar-${name}-${s}.png`, s, s, inner, false)) made++;
  }
}

/* Transparent monochrome mark, for print and partner use */
for (const s of [512, 128]) {
  const inner = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64" fill="none">${primary('#000000')}</svg>`;
  if (await raster(`${OUT}/mark-black-${s}.png`, s, s, inner, true)) made++;
}

/* Outlined lockup rasters, for partners who cannot take SVG. Black on
   transparent — one colour, per §2. */
{
  const lk = readFileSync(`${OUT}/lockup-horizontal.svg`, 'utf8');
  const [, vbw, vbh] = lk.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).map(Number);
  for (const w of [1024, 512]) {
    const h = Math.round((w * vbh) / vbw);
    const inner = lk
      .replace(/width="[\d.]+" height="[\d.]+"/, `width="${w}" height="${h}"`)
      .replace(/currentColor/g, '#000000');
    if (await raster(`${OUT}/lockup-horizontal-black-${w}.png`, w, h, inner, true)) made++;
  }
}

} // end !SHEET_ONLY
console.log(SHEET_ONLY ? 'rasters: skipped (--sheet-only)' : `rasters: ${made}`);

/* ── favicon.ico ────────────────────────────────────────────────────────
   Still required: Safari's reading list, Windows shortcuts, a long tail of
   feed readers and link unfurlers that never learned to ask for the SVG.
   PNG-in-ICO, which every browser since IE11 accepts.

   The embedded PNGs must be true RGBA (colour type 6) — Chrome's headless
   screenshot writes an opaque background as plain RGB (colour type 2), and
   at least one real consumer enforces the stricter reading: Next/Turbopack's
   image pipeline refused this file outright ("Processing image failed …
   the PNG is not in RGBA format"), which is how this got caught. Re-encode
   only the copies going into the ICO; the standalone favicon-*.png files are
   unaffected and stay RGB, which every browser accepts as a bare <link
   rel="icon" type="image/png">. */
if (!SHEET_ONLY) {
  const toRgbaPng = (path) =>
    execFileSync('python3', [
      '-c',
      'import sys; from PIL import Image; import io; ' +
        'im = Image.open(sys.argv[1]).convert("RGBA"); buf = io.BytesIO(); ' +
        'im.save(buf, "PNG"); sys.stdout.buffer.write(buf.getvalue())',
      path,
    ]);

  const entries = FAVICON_SIZES.map((s) => ({
    size: s,
    data: toRgbaPng(`${OUT}/favicon/favicon-${s}.png`),
  })).sort((a, b) => a.size - b.size);

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const dir = [];
  for (const e of entries) {
    const d = Buffer.alloc(16);
    d.writeUInt8(e.size >= 256 ? 0 : e.size, 0);
    d.writeUInt8(e.size >= 256 ? 0 : e.size, 1);
    d.writeUInt8(0, 2); // palette
    d.writeUInt8(0, 3); // reserved
    d.writeUInt16LE(1, 4); // colour planes
    d.writeUInt16LE(32, 6); // bits per pixel
    d.writeUInt32LE(e.data.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += e.data.length;
    dir.push(d);
  }
  writeFileSync(
    `${OUT}/favicon/favicon.ico`,
    Buffer.concat([header, ...dir, ...entries.map((e) => e.data)]),
  );
  console.log(`favicon.ico: ${entries.map((e) => e.size).join(', ')}px`);
}

if (ICO_ONLY) process.exit(0);

/* ── contact sheet ──────────────────────────────────────────────────────
   One page showing every asset at the size it will actually be seen, so a
   review can check the thing rather than the intention.

   Two rules learned the hard way from the first version of this sheet:

     · Never show a record-register asset on a record-register sheet. The
       paper avatar and the paper app icon both vanished — same ground
       colour — which hid the one thing that actually needed judging.
     · Show every asset on the grounds it will really sit on. A profile
       picture is seen on #FFFFFF (both platforms, light) and #000000 (X,
       dark), never on our own paper.                                    */
{
  const swatch = (label, inner, w, h = w) =>
    `<figure><div class="a" style="width:${w}px;height:${h}px">${inner}</div><figcaption>${label}</figcaption></figure>`;

  const tile = (s, ground, ink, rx = 14) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="${rx}" fill="${ground}"/><g transform="translate(8 8) scale(0.75)">${primary(ink)}</g></svg>`;

  const av = (s, ground, ink) =>
    `<svg width="${s}" height="${s}" viewBox="${avatarVb.join(' ')}" fill="none" style="border-radius:50%;display:block"><rect x="${avatarVb[0]}" y="${avatarVb[1]}" width="${AVATAR_TILE}" height="${AVATAR_TILE}" fill="${ground}"/>${primary(ink)}</svg>`;

  const fav = (s) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="${s < 20 ? 6 : 8}" fill="${INSTRUMENT_GROUND}"/>${s < 20 ? minimal(INSTRUMENT_INK) : primary(INSTRUMENT_INK)}</svg>`;

  /* A profile row as a platform actually draws it: avatar, display name,
     handle. The only honest test of an avatar is next to the type it will
     always appear next to. */
  const profileRow = (s, ground, ink, avGround, avInk) =>
    `<div class="situ" style="background:${ground};color:${ink}">
       ${av(s, avGround, avInk)}
       <div class="who"><b>TimelyCapsule</b><span>@timelycapsule</span></div>
     </div>`;

  const lockH = readFileSync(`${OUT}/lockup-horizontal.svg`, 'utf8');
  const lockV = readFileSync(`${OUT}/lockup-vertical.svg`, 'utf8');
  const word = readFileSync(`${OUT}/wordmark.svg`, 'utf8');
  const fit = (raw, w) => {
    const [, vbw, vbh] = raw.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).map(Number);
    return raw.replace(
      /width="[\d.]+" height="[\d.]+"/,
      `width="${w}" height="${Math.round((w * vbh) / vbw)}"`,
    );
  };

  const page = `<style>
    @font-face{font-family:M;src:local('IBM Plex Mono'),local('SF Mono'),local('Menlo')}
    *{box-sizing:border-box}
    body{margin:0;padding:56px 64px;background:${RECORD_GROUND};color:${RECORD_INK};
      font-family:M,ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.1em;
      text-transform:uppercase;width:1600px}
    h1{font-size:11px;font-weight:400;letter-spacing:.22em;margin:0 0 4px}
    h2{font-size:9px;font-weight:400;letter-spacing:.2em;color:#5E635C;
      margin:38px 0 14px;padding-bottom:8px;border-bottom:1px solid rgba(22,24,26,.14)}
    .sub{color:#5E635C;margin:0 0 8px}
    .note{color:#7A5348;margin:-6px 0 14px;text-transform:none;letter-spacing:.04em;font-size:10px}
    .row{display:flex;flex-wrap:wrap;gap:26px;align-items:flex-end}
    figure{margin:0;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
    figcaption{color:#5E635C;font-size:8px;letter-spacing:.14em}
    .a{display:flex;align-items:center;justify-content:center}
    .pad{padding:20px;display:inline-flex;gap:26px;align-items:flex-end;border:1px solid rgba(22,24,26,.14)}
    .white{background:#fff}
    .black{background:#000}
    .ondark{background:${INSTRUMENT_GROUND};padding:18px}
    .situ{display:flex;align-items:center;gap:12px;padding:14px 18px;min-width:300px}
    .who{display:flex;flex-direction:column;gap:2px;text-transform:none;letter-spacing:0}
    .who b{font-family:-apple-system,system-ui,sans-serif;font-size:15px;font-weight:700}
    .who span{font-family:-apple-system,system-ui,sans-serif;font-size:13px;opacity:.55}
  </style>
  <h1>TimelyCapsule · identity package</h1>
  <p class="sub">contact sheet · every asset at true rendered size · generated by design/.build-brand.mjs</p>

  <h2>01 · the mark — both densities at true size</h2>
  <div class="row">
    ${[64, 32, 24, 20].map((s) => swatch(`primary ${s}px`, `<svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none">${primary(RECORD_INK)}</svg>`, s)).join('')}
    ${[20, 16, 12].map((s) => swatch(`minimal ${s}px`, `<svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none">${minimal(RECORD_INK)}</svg>`, s)).join('')}
  </div>

  <h2>02 · social avatar — on the grounds platforms actually use</h2>
  <p class="note">mark is 64% of the tile = 20.5px at a 32px render, just clearing the 20px density threshold (§3)</p>
  <div class="row">
    <figure><div class="pad white">
      ${[150, 48, 32].map((s) => swatch(`paper ${s}`, av(s, RECORD_GROUND, RECORD_INK), s)).join('')}
      ${[150, 48, 32].map((s) => swatch(`ink ${s}`, av(s, INSTRUMENT_GROUND, INSTRUMENT_INK), s)).join('')}
    </div><figcaption>on #ffffff · instagram + x light</figcaption></figure>
  </div>
  <div class="row" style="margin-top:20px">
    <figure><div class="pad black" style="color:#fff">
      ${[150, 48, 32].map((s) => swatch(`paper ${s}`, av(s, RECORD_GROUND, RECORD_INK), s)).join('')}
      ${[150, 48, 32].map((s) => swatch(`ink ${s}`, av(s, INSTRUMENT_GROUND, INSTRUMENT_INK), s)).join('')}
    </div><figcaption>on #000000 · x dark</figcaption></figure>
  </div>

  <h2>03 · avatar in situ — 48px, beside the name it will always sit beside</h2>
  <div class="row">
    <figure>${profileRow(48, '#ffffff', '#0f1419', RECORD_GROUND, RECORD_INK)}<figcaption>paper · light</figcaption></figure>
    <figure>${profileRow(48, '#000000', '#e7e9ea', RECORD_GROUND, RECORD_INK)}<figcaption>paper · dark</figcaption></figure>
    <figure>${profileRow(48, '#ffffff', '#0f1419', INSTRUMENT_GROUND, INSTRUMENT_INK)}<figcaption>ink · light</figcaption></figure>
    <figure>${profileRow(48, '#000000', '#e7e9ea', INSTRUMENT_GROUND, INSTRUMENT_INK)}<figcaption>ink · dark</figcaption></figure>
  </div>

  <h2>04 · app icon — instrument / record / maskable</h2>
  <div class="row">
    <figure><div class="pad white">
      ${[128, 64, 48].map((s) => swatch(`instrument ${s}`, tile(s, INSTRUMENT_GROUND, INSTRUMENT_INK), s)).join('')}
      ${[128, 64, 48].map((s) => swatch(`record ${s}`, tile(s, RECORD_GROUND, RECORD_INK), s)).join('')}
      ${swatch('maskable 128', `<svg width="128" height="128" viewBox="${maskVb.join(' ')}" fill="none"><rect x="${maskVb[0]}" y="${maskVb[1]}" width="${MASK_TILE}" height="${MASK_TILE}" fill="${INSTRUMENT_GROUND}"/>${primary(INSTRUMENT_INK)}</svg>`, 128)}
    </div><figcaption>on #ffffff — the record tile has an edge only against a ground that is not our paper</figcaption></figure>
  </div>

  <h2>05 · favicon — true size, density switches below 20px</h2>
  <div class="row">
    <figure><div class="pad white">
      ${FAVICON_SIZES.map((s) => swatch(`${s}px`, fav(s), s)).join('')}
    </div><figcaption>on #ffffff · browser tab</figcaption></figure>
  </div>

  <h2>06 · wordmark — outlined, zero live text</h2>
  <div class="row"><figure><div class="a">${fit(word, 420)}</div><figcaption>outlined · ibm plex sans 600/400 · tracking −0.2</figcaption></figure></div>

  <h2>07 · lockups — built to §4: mark at cap height, gap 1.2× mark width</h2>
  <p class="note">open question: at cap height the mark's stroke is 67 units against the wordmark's 197-unit stem — the mark reads 2.9× lighter than the word beside it</p>
  <div class="row">
    <figure><div class="a">${fit(lockH, 460)}</div><figcaption>horizontal · primary</figcaption></figure>
    <figure><div class="a">${fit(lockV, 190)}</div><figcaption>vertical</figcaption></figure>
  </div>
  <div class="row" style="margin-top:22px">
    <figure><div class="a ondark">${fit(lockH, 460).replace(/currentColor/g, INSTRUMENT_INK)}</div><figcaption>horizontal · reversed</figcaption></figure>
    <figure><div class="a" style="padding:18px">${fit(lockH, 300)}</div><figcaption>horizontal · small</figcaption></figure>
  </div>

  <h2>08 · clear space — 1 notch-height (10 units) on all four sides</h2>
  <div class="row">
    ${swatch(
      'mark + clear space',
      `<svg width="200" height="285" viewBox="7 -4 50.5 72" fill="none">
        <rect x="17" y="6" width="30.5" height="52" fill="none" stroke="#3F6154" stroke-width="0.4" stroke-dasharray="2 2"/>
        ${primary(RECORD_INK)}</svg>`,
      200, 285,
    )}
    ${swatch(
      'circular crop · diagonal clearance 10.5u',
      `<svg width="200" height="200" viewBox="${avatarVb.join(' ')}" fill="none">
        <circle cx="32.25" cy="32" r="40.625" fill="none" stroke="#3F6154" stroke-width="0.4" stroke-dasharray="2 2"/>
        <rect x="17" y="6" width="30.5" height="52" fill="none" stroke="#3F6154" stroke-width="0.3" stroke-dasharray="1 1.5"/>
        ${primary(RECORD_INK)}</svg>`,
      200,
    )}
  </div>
  `;

  writeFileSync('/tmp/tc-contact.html', page);
  const sheetOut = `${OUT}/CONTACT-SHEET.png`;
  const args = [
    '--headless=old', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${PROFILE}`, '--virtual-time-budget=1200',
    '--window-size=1600,2420', `--screenshot=${sheetOut}`,
    'file:///tmp/tc-contact.html',
  ];
  rmSync(sheetOut, { force: true });
  const sheetProc = spawn(CHROME, args, { stdio: 'ignore' });
  let sheetLast = -1;
  for (let i = 0; i < 200; i++) {
    await sleep(80);
    if (existsSync(sheetOut)) {
      const size = statSync(sheetOut).size;
      if (size > 0 && size === sheetLast) break;
      sheetLast = size;
    }
  }
  try { sheetProc.kill('SIGKILL'); } catch {}
  console.log('contact sheet: design/brand/CONTACT-SHEET.png');
}
