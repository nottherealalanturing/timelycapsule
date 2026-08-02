/**
 * Build the applied-identity comparison: three complete brand systems,
 * each rendered across the same twenty applications.
 *
 * Generated rather than hand-written so every direction gets identical
 * treatment — the comparison is only fair if the only variable is the mark.
 *   node design/.build-identity.mjs
 */
import { writeFileSync } from 'node:fs';

/* ── the three marks, as reusable symbols ──────────────────────────────
   All use currentColor so a mark inherits whatever register it lands in. */
const SYMBOLS = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>

  <symbol id="m-keep" viewBox="0 0 64 64">
    <path d="M22 10 H10 V54 H22" fill="none" stroke="currentColor" stroke-width="4"/>
    <path d="M42 10 H54 V54 H42" fill="none" stroke="currentColor" stroke-width="4"/>
    <circle cx="32" cy="32" r="6" fill="currentColor"/>
  </symbol>
  <symbol id="m-keep-s" viewBox="0 0 64 64">
    <path d="M23 13 H13 V51 H23" fill="none" stroke="currentColor" stroke-width="9"/>
    <path d="M41 13 H51 V51 H41" fill="none" stroke="currentColor" stroke-width="9"/>
    <circle cx="32" cy="32" r="8" fill="currentColor"/>
  </symbol>

  <symbol id="m-transit" viewBox="0 0 64 64">
    <line x1="44" y1="8" x2="44" y2="56" stroke="currentColor" stroke-width="4"/>
    <circle cx="22" cy="32" r="8" fill="none" stroke="currentColor" stroke-width="4"/>
  </symbol>
  <symbol id="m-transit-s" viewBox="0 0 64 64">
    <line x1="46" y1="12" x2="46" y2="52" stroke="currentColor" stroke-width="10"/>
    <circle cx="19" cy="32" r="10" fill="currentColor"/>
  </symbol>

  <symbol id="m-mono" viewBox="0 0 64 64">
    <rect x="6" y="6" width="52" height="52" rx="4" fill="none" stroke="currentColor" stroke-width="4"/>
    <text x="32" y="33" text-anchor="middle" dominant-baseline="central"
      font-family="ui-monospace,'SF Mono',Menlo,monospace" font-size="24" font-weight="600"
      letter-spacing="-1" fill="currentColor">TC</text>
  </symbol>
  <symbol id="m-mono-s" viewBox="0 0 64 64">
    <rect x="3" y="3" width="58" height="58" rx="4" fill="none" stroke="currentColor" stroke-width="7"/>
    <text x="32" y="34" text-anchor="middle" dominant-baseline="central"
      font-family="ui-monospace,'SF Mono',Menlo,monospace" font-size="30" font-weight="700"
      letter-spacing="-2" fill="currentColor">TC</text>
  </symbol>

  <symbol id="motif-transit" viewBox="0 0 120 64">
    <line x1="84" y1="6" x2="84" y2="58" stroke="currentColor" stroke-width="2" opacity=".9"/>
    <line x1="10" y1="32" x2="84" y2="32" stroke="currentColor" stroke-width="1" opacity=".25"/>
    <circle cx="46" cy="32" r="5" fill="none" stroke="currentColor" stroke-width="2"/>
  </symbol>
</defs></svg>`;

const mark = (d, size, small = false, cls = '') =>
  `<svg class="${cls}" width="${size}" height="${size}" aria-hidden="true"><use href="#m-${d.id}${small ? '-s' : ''}"/></svg>`;

const DIRECTIONS = [
  {
    id: 'keep',
    n: 'I',
    name: 'The Keep',
    glyph: '[ • ]',
    idea: 'A custody. Two brackets closed on something — the brand’s one word, <b>Kept</b>, drawn.',
  },
  {
    id: 'transit',
    n: 'II',
    name: 'The Transit',
    glyph: '○ |',
    idea: 'A marker approaching an appointed moment. The product’s native geometry, promoted back to the mark.',
  },
  {
    id: 'mono',
    n: 'III',
    name: 'The Monogram',
    glyph: 'TC',
    idea: 'Initials in a cartouche. The most common institutional solution, and the one family not yet tested.',
  },
];

/* ── the twenty applications ───────────────────────────────────────────
   Each returns the inner HTML of one tile canvas for a given direction. */
const APPS = [
  ['Primary logo', 'lg', (d) => `<div class="ctr">${mark(d, 84)}</div>`],

  ['Wordmark', 'wide', () =>
    `<div class="ctr"><span class="wm">Timely<span class="thin">Capsule</span></span></div>`],

  ['Horizontal lockup', 'wide', (d) =>
    `<div class="ctr row g14">${mark(d, 34)}<span class="wm sm">Timely<span class="thin">Capsule</span></span></div>`],

  ['Vertical lockup', 'lg', (d) =>
    `<div class="ctr col g10">${mark(d, 40)}<span class="wm xs">Timely<span class="thin">Capsule</span></span></div>`],

  ['App icon', 'lg', (d) =>
    `<div class="ctr row g14">
       <div class="tile ic-lg">${mark(d, 62)}</div>
       <div class="tile ic-md">${mark(d, 34)}</div>
     </div>`],

  ['Favicon 16px', 'sm', (d) =>
    `<div class="ctr row g16">
       <div class="tile ic-xs">${mark(d, 12, true)}</div>
       <div class="tile ic-sm">${mark(d, 20, true)}</div>
     </div>`],

  ['Browser tab', 'wide', (d) =>
    `<div class="tabbar"><div class="tab">${mark(d, 13, true, 'tabico')}<span>TimelyCapsule</span><i>&times;</i></div>
       <div class="tab dim"><span class="fav2"></span><span>Inbox (3)</span><i>&times;</i></div></div>`],

  ['Website header', 'full', (d) =>
    `<div class="siteheader">
       <div class="row g10">${mark(d, 22)}<span class="wm xs">Timely<span class="thin">Capsule</span></span></div>
       <div class="nav"><span>How it works</span><span>Pricing</span><span>Sign in</span>
         <span class="cta">Seal a capsule</span></div>
     </div>`],

  ['Mobile splash', 'tall', (d) =>
    `<div class="phone"><div class="phone-in ctr col g12">${mark(d, 44)}
       <span class="wm xs">Timely<span class="thin">Capsule</span></span></div></div>`],

  ['Email footer', 'full', (d) =>
    `<div class="paper pad">
       <p class="pmail">&mdash; Michael</p>
       <div class="rule"></div>
       <div class="row g10 between">
         <div class="row g8">${mark(d, 18, false, 'inkmark')}<span class="hm">TimelyCapsule</span></div>
         <span class="hm dimhm">Sealed 14 March 2026 &middot; delivered 14 March 2041</span>
       </div>
     </div>`],

  ['Letterhead', 'tall', (d) =>
    `<div class="paper sheet">
       <div class="row g8">${mark(d, 20, false, 'inkmark')}<span class="hm">TimelyCapsule</span></div>
       <div class="rule tight"></div>
       <div class="lines"><i></i><i></i><i style="width:78%"></i><i style="width:88%"></i>
         <i style="width:64%"></i></div>
       <span class="hm dimhm foot">TC-84KZQM3P</span>
     </div>`],

  ['Embossed', 'lg', (d) =>
    `<div class="paper emboss ctr">
       <div class="embed">${mark(d, 58, false, 'e-hi')}${mark(d, 58, false, 'e-lo')}</div>
     </div>`],

  ['Monochrome', 'lg', (d) =>
    `<div class="ctr row g16">
       <div class="mono-a">${mark(d, 36)}</div>
       <div class="mono-b">${mark(d, 36)}</div>
     </div>`],

  ['Small-size usage', 'wide', (d) =>
    `<div class="ctr row g18 base">
       ${mark(d, 32, true)}${mark(d, 24, true)}${mark(d, 20, true)}${mark(d, 16, true)}
     </div>`],

  ['Large-size usage', 'full', (d) =>
    `<div class="bigmark">${mark(d, 132)}<div class="bigtxt">
       <span class="hm dimhm">EST. 2026</span>
       <p class="bigline">What you seal will come back.</p></div></div>`],

  ['Social avatar', 'lg', (d) =>
    `<div class="ctr row g16">
       <div class="avatar">${mark(d, 34)}</div>
       <div class="avatar sm2">${mark(d, 20, true)}</div>
     </div>`],

  ['Loading', 'wide', () =>
    `<div class="loadbox">
       <div class="sk" style="width:58%"></div><div class="sk" style="width:88%"></div>
       <div class="sk" style="width:40%"></div>
       <span class="hm dimhm nb">no spinner &middot; layout-stable</span>
     </div>`],

  ['Notification', 'full', (d) =>
    `<div class="notif">
       <div class="tile ic-nt">${mark(d, 22, true)}</div>
       <div class="ntxt"><b>TimelyCapsule</b>
         <p>A capsule sealed in 2026 is ready to open.</p></div>
       <span class="hm dimhm">now</span>
     </div>`],

  ['Empty state', 'wide', () =>
    `<div class="ctr col g12"><p class="empty">Nothing sealed yet.</p>
       <span class="btn">Write something</span></div>`],

  ['Waiting screen', 'full', (d) =>
    `<div class="wait">
       <div class="row g8 between"><span class="hm">TC-84KZQM3P</span>${mark(d, 14, true, 'wm-mark')}</div>
       <p class="wtitle">Letter to my daughter</p>
       <svg class="motif" width="150" height="52" viewBox="0 0 120 64" aria-hidden="true"><use href="#motif-transit"/></svg>
       <div class="clock"><div><span class="hm dimhm">TRAVELLED</span><b>2 y 11 m</b></div>
         <div><span class="hm dimhm">REMAINING</span><b>12 y 1 m</b></div></div>
     </div>`],
];

const sheet = (d) => `
<section class="dir" id="dir-${d.id}">
  <div class="dirhead">
    <span class="dn">${d.n}</span>
    <h2>${d.name}</h2>
    <span class="dglyph">${d.glyph}</span>
    <p class="didea">${d.idea}</p>
  </div>
  <div class="grid">
    ${APPS.map(([label, size, fn]) => `
      <figure class="cell ${size}">
        <figcaption>${label}</figcaption>
        <div class="canvas">${fn(d)}</div>
      </figure>`).join('')}
  </div>
</section>`;

const CSS = `
:root{--ground:#0b0e14;--raised:#141922;--ink:#e6e8ec;--muted:#8b93a3;--brass:#e0b84a;
 --steel:#7a8ab0;--rule:rgba(230,232,236,.13);--rule-hi:rgba(230,232,236,.26);
 --paper:#e9eae6;--paper-raised:#f3f4f0;--paper-ink:#16181a;--paper-muted:#5e635c;
 --hold:#6e9e8a;--alarm:#d2694e;
 --sans:"IBM Plex Sans","Helvetica Neue",Helvetica,system-ui,sans-serif;
 --serif:Charter,"Iowan Old Style",Georgia,"Times New Roman",serif;
 --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;}
@media (prefers-color-scheme:light){:root{--ground:#e9eae6;--raised:#f3f4f0;--ink:#16181a;
 --muted:#5e635c;--brass:#6e5a0e;--steel:#2c3a4a;--rule:rgba(22,24,26,.15);
 --rule-hi:rgba(22,24,26,.3);--hold:#3f6154;--alarm:#a33f28;}}
:root[data-theme=light]{--ground:#e9eae6;--raised:#f3f4f0;--ink:#16181a;--muted:#5e635c;
 --brass:#6e5a0e;--steel:#2c3a4a;--rule:rgba(22,24,26,.15);--rule-hi:rgba(22,24,26,.3);
 --hold:#3f6154;--alarm:#a33f28;}
:root[data-theme=dark]{--ground:#0b0e14;--raised:#141922;--ink:#e6e8ec;--muted:#8b93a3;
 --brass:#e0b84a;--steel:#7a8ab0;--rule:rgba(230,232,236,.13);--rule-hi:rgba(230,232,236,.26);
 --hold:#6e9e8a;--alarm:#d2694e;}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);
 font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}
main{max-width:1180px;margin:0 auto;padding:44px 26px 110px}
.eyebrow{font-family:var(--mono);font-size:.68rem;letter-spacing:.2em;text-transform:uppercase;
 color:var(--muted);margin:0 0 13px}
h1{font-family:var(--serif);font-size:clamp(2rem,4.6vw,2.8rem);line-height:1.08;font-weight:600;
 letter-spacing:-.017em;margin:0 0 14px;text-wrap:balance}
h2{font-family:var(--serif);font-size:1.6rem;font-weight:600;margin:0;letter-spacing:-.012em}
h3{font-size:1rem;font-weight:650;margin:0 0 8px}
p{margin:0 0 13px;max-width:64ch}
ul{margin:0 0 13px;padding-left:1.1em;max-width:64ch}li{margin-bottom:6px}
b,strong{font-weight:650}
code{font-family:var(--mono);font-size:.85em;background:var(--raised);padding:1px 5px;border-radius:2px}
.lede{font-family:var(--serif);font-size:1.1rem;color:var(--muted);max-width:60ch}
section{border-top:1px solid var(--rule);padding:40px 0 0;margin-top:40px}
.snum{font-family:var(--mono);font-size:.68rem;letter-spacing:.2em;color:var(--brass);
 text-transform:uppercase;display:block;margin-bottom:9px}
.note{border:1px solid var(--rule);border-left:2px solid var(--steel);border-radius:3px;
 padding:15px 19px;margin:0 0 18px;background:var(--raised);font-size:.89rem}
.note.warn{border-left-color:var(--brass)}.note.kill{border-left-color:var(--alarm)}
.note.good{border-left-color:var(--hold)}
.note p{margin:0 0 8px;max-width:62ch}.note p:last-child{margin-bottom:0}

.dirhead{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap;margin:0 0 20px}
.dirhead .dn{font-family:var(--mono);font-size:.7rem;color:var(--brass);letter-spacing:.18em}
.dirhead .dglyph{font-family:var(--mono);font-size:.95rem;color:var(--muted);letter-spacing:.1em}
.dirhead .didea{flex-basis:100%;margin:2px 0 0;color:var(--muted);font-size:.88rem;max-width:64ch}

.grid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}
.cell{margin:0;display:flex;flex-direction:column;gap:7px;min-width:0}
.cell figcaption{font-family:var(--mono);font-size:.55rem;letter-spacing:.11em;
 text-transform:uppercase;color:var(--muted)}
.canvas{border:1px solid var(--rule);border-radius:3px;background:var(--raised);
 min-height:104px;padding:12px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.cell.sm{grid-column:span 2}.cell.lg{grid-column:span 3}.cell.wide{grid-column:span 3}
.cell.full{grid-column:span 6}.cell.tall{grid-column:span 2}
.cell.tall .canvas{min-height:190px}
@media(max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}
 .cell.sm,.cell.lg,.cell.wide,.cell.full,.cell.tall{grid-column:span 2}}

.ctr{display:flex;align-items:center;justify-content:center;width:100%}
.row{flex-direction:row}.col{flex-direction:column}
.g8{gap:8px}.g10{gap:10px}.g14{gap:14px}.g16{gap:16px}.g18{gap:18px}
.between{justify-content:space-between}
.base{align-items:flex-end}
.wm{font-weight:600;letter-spacing:-.005em;font-size:1.45rem;line-height:1;white-space:nowrap}
.wm.sm{font-size:1.05rem}.wm.xs{font-size:.82rem}
.wm .thin{font-weight:400;color:var(--muted)}
.hm{font-family:var(--mono);font-size:.55rem;letter-spacing:.14em;text-transform:uppercase}
.dimhm{color:var(--muted)}

.tile{background:#0b0e14;color:#e6e8ec;display:grid;place-items:center;border-radius:22%;
 border:1px solid rgba(230,232,236,.14)}
.ic-lg{width:88px;height:88px}.ic-md{width:50px;height:50px}
.ic-sm{width:32px;height:32px;border-radius:7px}.ic-xs{width:16px;height:16px;border-radius:3px}
.ic-nt{width:34px;height:34px;border-radius:9px;flex:0 0 34px}

.tabbar{display:flex;gap:4px;align-items:flex-end;width:100%;padding-top:6px;
 border-bottom:1px solid var(--rule)}
.tab{display:flex;align-items:center;gap:6px;background:var(--ground);border:1px solid var(--rule);
 border-bottom:0;border-radius:6px 6px 0 0;padding:6px 9px;font-size:.66rem;color:var(--ink);
 white-space:nowrap;max-width:150px}
.tab i{color:var(--muted);font-style:normal;margin-left:2px}
.tab.dim{opacity:.45}
.fav2{width:11px;height:11px;border-radius:2px;background:var(--rule-hi);flex:0 0 11px}
.tabico{flex:0 0 13px}

.siteheader{display:flex;align-items:center;justify-content:space-between;width:100%;
 background:var(--ground);border:1px solid var(--rule);border-radius:3px;padding:11px 14px;gap:10px}
.nav{display:flex;gap:12px;align-items:center;font-size:.7rem;color:var(--muted);flex-wrap:wrap}
.nav .cta{background:var(--brass);color:var(--ground);font-weight:650;padding:5px 10px;
 border-radius:3px;font-size:.68rem}

.phone{width:118px;height:172px;border-radius:14px;border:1px solid var(--rule-hi);
 background:#0b0e14;padding:6px}
.phone-in{width:100%;height:100%;border-radius:9px;background:#0b0e14;color:#e6e8ec}

.paper{background:var(--paper);color:var(--paper-ink);border-radius:3px;width:100%}
.paper.pad{padding:14px 16px}
.pmail{font-family:var(--serif);font-size:.9rem;margin:0 0 10px;color:var(--paper-ink)}
.rule{height:1px;background:rgba(22,24,26,.16);margin:0 0 10px}
.rule.tight{margin:9px 0}
.inkmark{color:var(--paper-ink)}
.paper .hm{color:var(--paper-ink)}.paper .dimhm{color:var(--paper-muted)}
.sheet{padding:14px;display:flex;flex-direction:column;height:100%;min-height:168px}
.lines{display:flex;flex-direction:column;gap:6px;margin-top:4px;flex:1}
.lines i{height:4px;background:rgba(22,24,26,.14);border-radius:1px;width:96%}
.foot{margin-top:auto}

.emboss{padding:22px;display:grid;place-items:center;min-height:104px}
.embed{position:relative;width:58px;height:58px}
.embed svg{position:absolute;inset:0}
.e-hi{color:#ffffff;opacity:.75;transform:translateY(1px)}
.e-lo{color:#16181a;opacity:.3}

.mono-a{background:#ffffff;color:#000000;padding:12px;border-radius:3px;display:grid;place-items:center}
.mono-b{background:#000000;color:#ffffff;padding:12px;border-radius:3px;display:grid;place-items:center}

.bigmark{display:flex;align-items:center;gap:26px;width:100%;justify-content:center;flex-wrap:wrap}
.bigtxt{display:flex;flex-direction:column;gap:6px}
.bigline{font-family:var(--serif);font-size:1.3rem;margin:0;max-width:22ch;line-height:1.25}

.avatar{width:62px;height:62px;border-radius:50%;background:#0b0e14;color:#e6e8ec;
 display:grid;place-items:center;border:1px solid rgba(230,232,236,.14)}
.avatar.sm2{width:34px;height:34px}

.loadbox{display:flex;flex-direction:column;gap:7px;width:100%}
.sk{height:9px;border-radius:2px;background:color-mix(in srgb,var(--muted) 22%,transparent)}
.nb{margin-top:4px}

.notif{display:flex;align-items:center;gap:11px;width:100%;background:var(--ground);
 border:1px solid var(--rule);border-radius:9px;padding:10px 12px}
.ntxt{flex:1;min-width:0}
.ntxt b{font-size:.72rem;display:block}
.ntxt p{margin:1px 0 0;font-size:.74rem;color:var(--muted);max-width:none}

.empty{font-size:.95rem;margin:0;color:var(--ink)}
.btn{background:var(--brass);color:var(--ground);font-weight:650;font-size:.72rem;
 padding:6px 12px;border-radius:3px}

.wait{width:100%;background:#0b0e14;color:#e6e8ec;border:1px solid rgba(230,232,236,.13);
 border-radius:4px;padding:13px 15px;display:flex;flex-direction:column;gap:9px}
.wait .hm{color:#8b93a3}
.wtitle{font-family:var(--serif);font-size:1.05rem;margin:0}
.motif{color:#e0b84a;align-self:center}
.wm-mark{color:#8b93a3;opacity:.7}
.clock{display:flex;gap:26px;border-top:1px solid rgba(230,232,236,.13);padding-top:8px}
.clock div{display:flex;flex-direction:column;gap:2px}
.clock b{font-family:var(--mono);font-size:.82rem;font-variant-numeric:tabular-nums}

.tw{overflow-x:auto;border:1px solid var(--rule);border-radius:3px;margin:0 0 18px}
table{border-collapse:collapse;width:100%;font-size:.82rem;min-width:620px}
th,td{text-align:left;padding:8px 11px;border-bottom:1px solid var(--rule);vertical-align:top}
th{font-family:var(--mono);font-size:.58rem;letter-spacing:.13em;text-transform:uppercase;
 color:var(--muted);font-weight:500;background:var(--raised)}
tbody tr:last-child td{border-bottom:0}
td.n{font-family:var(--mono);font-variant-numeric:tabular-nums;white-space:nowrap}
.s5{color:var(--hold);font-weight:650}.s3{color:var(--brass)}.s1{color:var(--alarm)}
footer{border-top:1px solid var(--rule);margin-top:44px;padding-top:22px;color:var(--muted);font-size:.8rem}
@media (prefers-reduced-motion:reduce){*{transition-duration:.001ms!important;animation-duration:.001ms!important}}
`;

const html = `<title>Applied Identity — Three Complete Systems</title>
<style>${CSS}</style>
${SYMBOLS}
<main>
<p class="eyebrow">Meridian V2 · Phase 10 · Applied identity</p>
<h1>Three brands, twenty applications</h1>
<p class="lede">The same twenty surfaces, rendered three times. The only variable is the mark —
everything else is Meridian V2 as built, so the comparison measures the identity rather than the
presentation.</p>

<section>
  <span class="snum">How to read this</span>
  <h2>What changes and what does not</h2>
  <p>Type, colour, spacing, radii and copy are identical across all three systems. Only the symbol
  differs. That is deliberate: a mark that needs bespoke layout help is not a mark, and the point
  of this phase is to see which one <em>disappears into the work</em> most gracefully.</p>
  <div class="note warn">
    <p><b>The waiting screen is the control.</b> It uses the Transit <em>motif</em> in all three
    systems, because we agreed the motif is the product's native geometry regardless of which mark
    wins. Watch what happens in Direction II, where the motif and the mark become the same
    drawing.</p>
  </div>
</section>

${DIRECTIONS.map(sheet).join('\n')}

<section>
  <span class="snum">Judgement</span>
  <h2>What the applications revealed</h2>

  <div class="note kill">
    <p><b>Direction II · the mark vanishes into its own product.</b> On the waiting screen the
    logo and the motif are the same drawing, so the mark stops reading as an identity and starts
    reading as a UI control — a slider, a playhead. In the browser tab it is indistinguishable
    from a generic bullet at favicon size, and in the notification it disappears against the
    tile entirely.</p>
    <p>It also fails the avatar: a circle crop around a dot-and-line leaves a mark with no
    relationship to its frame. <b>Applied, Transit is weaker than it looked in isolation</b> — the
    opposite of what a good mark does.</p>
  </div>

  <div class="note kill">
    <p><b>Direction III · the monogram is the honest surprise, and it fails on one axis.</b> It is
    the strongest of the three at large sizes — letterhead, embossing and the large-size lockup are
    genuinely handsome, and it is the only direction that carries the name without the wordmark.</p>
    <p>But <b>&ldquo;TC&rdquo; is illegible at 16px</b>. Two letters inside a box at favicon size is
    a grey square with texture. Every other application improves; the one that matters most for
    recognition collapses. It also hard-codes a name that <code>09 §XIV.1</code> still lists as the
    largest unresolved brand risk.</p>
  </div>

  <div class="note good">
    <p><b>Direction I · holds everywhere, and gets stronger the smaller it goes.</b> The enclosure
    reads as a container at 132px and as a distinct silhouette at 16px. In the browser tab it is
    the only one of the three you could pick out of a strip of favicons. On the avatar the square
    bracket pair sits inside a circle with real tension. Embossed, the brackets catch light along
    four long edges — the best of the three on paper.</p>
    <p>Its one weakness is confirmed rather than resolved: on the website header beside the
    wordmark, it reads faintly like syntax. The fix is spacing, not redrawing — the lockup gap
    wants to be wider than the optical default.</p>
  </div>

  <div class="tw"><table>
    <thead><tr><th>Application</th><th>I · Keep</th><th>II · Transit</th><th>III · Monogram</th></tr></thead>
    <tbody>
      <tr><td>Favicon / browser tab</td><td class="n s5">5</td><td class="n s1">2</td><td class="n s1">1</td></tr>
      <tr><td>App icon</td><td class="n s5">5</td><td class="n s3">3</td><td class="n s3">3</td></tr>
      <tr><td>Social avatar</td><td class="n s5">5</td><td class="n s1">2</td><td class="n s3">3</td></tr>
      <tr><td>Website header</td><td class="n s3">3</td><td class="n s3">3</td><td class="n s5">4</td></tr>
      <tr><td>Mobile splash</td><td class="n s5">4</td><td class="n s3">3</td><td class="n s5">4</td></tr>
      <tr><td>Notification</td><td class="n s5">5</td><td class="n s1">2</td><td class="n s3">3</td></tr>
      <tr><td>Letterhead</td><td class="n s5">4</td><td class="n s3">3</td><td class="n s5">5</td></tr>
      <tr><td>Email footer</td><td class="n s5">4</td><td class="n s3">3</td><td class="n s5">4</td></tr>
      <tr><td>Embossed</td><td class="n s5">5</td><td class="n s3">3</td><td class="n s5">5</td></tr>
      <tr><td>Monochrome</td><td class="n s5">5</td><td class="n s5">5</td><td class="n s5">4</td></tr>
      <tr><td>Large-size usage</td><td class="n s5">4</td><td class="n s3">3</td><td class="n s5">5</td></tr>
      <tr><td>Small-size ladder</td><td class="n s5">5</td><td class="n s3">3</td><td class="n s1">1</td></tr>
      <tr><td>Waiting screen coexistence</td><td class="n s5">5</td><td class="n s1">1</td><td class="n s5">4</td></tr>
      <tr><td>Survives a rename</td><td class="n s5">5</td><td class="n s5">5</td><td class="n s1">0</td></tr>
      <tr><td><b>Total / 70</b></td><td class="n s5"><b>64</b></td><td class="n">41</td><td class="n">46</td></tr>
    </tbody>
  </table></div>
</section>

<section>
  <span class="snum">Recommendation</span>
  <h2>Direction I · The Keep</h2>
  <p>It wins on the axis this phase existed to test: <b>it performs across the whole ecosystem
  rather than in a presentation frame.</b> The two places a mark is most often seen — a browser tab
  and a notification — are exactly where the other two collapse, and where this one is at its
  strongest.</p>
  <p>The system is: <b>The Keep is the mark. The Transit is the motif.</b> They share a language
  (an enclosure, a marker within it) so the app icon and the waiting screen read as one family
  without being the same drawing. Direction II proved why that separation matters — collapsing them
  costs you the mark.</p>
  <div class="note">
    <p><b>Three fixes before production, all small:</b> widen the lockup gap so the brackets stop
    reading as syntax; thicken bracket strokes ~15% for physical emboss; and keep the marker
    centred at every size — the offset experiment is closed.</p>
    <p><b>Still open and still yours:</b> the wordmark commits you to the name. The Keep does not.
    Approving the symbol now unblocks the favicon, app icon and the whole screen rebuild.</p>
  </div>
</section>

<footer>Meridian V2 · applied identity. Twenty applications generated from one template so the
only variable is the mark. Supersedes the recommendations in <code>15</code> and <code>16</code>.</footer>
</main>`;

writeFileSync('design/17-identity-systems.html', html);
console.log('wrote design/17-identity-systems.html');
