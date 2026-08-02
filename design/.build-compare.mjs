/**
 * Build a Meridian V2 layer-review page.
 *   node design/.build-compare.mjs design/reviews/<layer>.json
 *
 * The spec drives everything; screenshots are inlined as data URIs because
 * the artifact CSP blocks external hosts. `before/` is the frozen V1
 * baseline (captured from a git-restored V1 tree), so every layer's page
 * shows cumulative progress from the same spine.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const DIR = 'design/shots';
const b64 = (p) => `data:image/jpeg;base64,${readFileSync(p).toString('base64')}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const SHOT_LABELS = {
  landing: ['Marketing landing', 'The only route a stranger sees first'],
  login: ['Log in', 'Auth card — the densest cluster of form primitives'],
  guest: ['Guest mode · /try', 'The no-account composer path'],
  home: ['Home timeline', 'The waiting state — the primary screen'],
};

const list = (items, cls = '') =>
  items?.length ? `<ul class="${cls}">${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '';

const shots = (spec.shots ?? []).map((n) => {
  const before = join(DIR, 'before', `${n}.jpg`);
  const after = join(DIR, 'after', `${n}.jpg`);
  if (!existsSync(before) || !existsSync(after)) return '';
  const [h, sub] = SHOT_LABELS[n] ?? [n, ''];
  return `<section class="cmp"><header><h3>${h}</h3><p>${sub}</p></header>
    <div class="pair">
      <figure><figcaption><span class="tag v1">V1 baseline</span></figcaption>
        <img src="${b64(before)}" alt="${h}, V1" loading="lazy"></figure>
      <figure><figcaption><span class="tag v2">After layer ${spec.layer}</span></figcaption>
        <img src="${b64(after)}" alt="${h}, after" loading="lazy"></figure>
    </div></section>`;
}).join('\n');

writeFileSync(spec.out, `<title>${esc(spec.title)}</title>
<style>
:root{--ground:#0b0e14;--raised:#141922;--ink:#e6e8ec;--muted:#8b93a3;
  --brass:#e0b84a;--steel:#7a8ab0;--alarm:#d2694e;--hold:#6e9e8a;
  --rule:rgba(230,232,236,.13);--paper:#e9eae6;--paper-ink:#16181a;
  --sans:"IBM Plex Sans","Helvetica Neue",system-ui,sans-serif;
  --serif:Charter,"Iowan Old Style",Georgia,serif;
  --mono:ui-monospace,"SF Mono",Menlo,monospace;}
@media (prefers-color-scheme:light){:root{--ground:#e9eae6;--raised:#f3f4f0;
  --ink:#16181a;--muted:#5e635c;--brass:#6e5a0e;--steel:#2c3a4a;--alarm:#a33f28;
  --hold:#3f6154;--rule:rgba(22,24,26,.15);}}
:root[data-theme=light]{--ground:#e9eae6;--raised:#f3f4f0;--ink:#16181a;
  --muted:#5e635c;--brass:#6e5a0e;--steel:#2c3a4a;--alarm:#a33f28;--hold:#3f6154;
  --rule:rgba(22,24,26,.15);}
:root[data-theme=dark]{--ground:#0b0e14;--raised:#141922;--ink:#e6e8ec;
  --muted:#8b93a3;--brass:#e0b84a;--steel:#7a8ab0;--alarm:#d2694e;--hold:#6e9e8a;
  --rule:rgba(230,232,236,.13);}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);
  line-height:1.6;-webkit-font-smoothing:antialiased}
main{max-width:1240px;margin:0 auto;padding:40px 28px 90px}
.eyebrow{font-family:var(--mono);font-size:.68rem;letter-spacing:.2em;
  text-transform:uppercase;color:var(--muted);margin:0 0 12px}
h1{font-family:var(--serif);font-size:clamp(1.9rem,4.6vw,2.7rem);line-height:1.1;
  font-weight:600;letter-spacing:-.015em;margin:0 0 12px;text-wrap:balance}
h2{font-family:var(--serif);font-size:1.45rem;font-weight:600;margin:0 0 14px}
.lede{font-family:var(--serif);font-size:1.1rem;color:var(--muted);
  max-width:62ch;margin:0 0 6px}
section.block{border-top:1px solid var(--rule);padding-top:30px;margin-top:34px}
ul{margin:0 0 14px;padding-left:1.1em;max-width:66ch}
li{margin-bottom:9px}
b,strong{font-weight:650}
code{font-family:var(--mono);font-size:.85em;background:var(--raised);
  padding:1px 5px;border-radius:2px}
.cmp{margin-top:26px}
.cmp header h3{font-family:var(--serif);font-size:1.2rem;font-weight:600;margin:0 0 3px}
.cmp header p{margin:0 0 16px;color:var(--muted);font-size:.86rem}
.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:20px}
figure{margin:0;min-width:0}figcaption{margin:0 0 8px}
.tag{font-family:var(--mono);font-size:.62rem;letter-spacing:.16em;
  text-transform:uppercase;padding:3px 8px;border-radius:2px;display:inline-block}
.tag.v1{border:1px solid var(--rule);color:var(--muted)}
.tag.v2{background:var(--brass);color:var(--ground);font-weight:600}
img{width:100%;height:auto;display:block;border:1px solid var(--rule);
  border-radius:3px;background:var(--raised)}
.note{border:1px solid var(--rule);border-left:2px solid var(--steel);
  border-radius:3px;padding:15px 19px;margin:0 0 18px;background:var(--raised);
  font-size:.9rem}
.note.warn{border-left-color:var(--brass)}
.note.kill{border-left-color:var(--alarm)}
.note p{margin:0 0 9px;max-width:62ch}.note p:last-child{margin-bottom:0}
.done li::marker{color:var(--hold)}
.issue li::marker{color:var(--alarm)}
.todo li::marker{color:var(--brass)}
footer{border-top:1px solid var(--rule);margin-top:44px;padding-top:22px;
  color:var(--muted);font-size:.82rem}
${spec.css ?? ''}
</style>
<main>
  <p class="eyebrow">Meridian V2 · Layer ${spec.layer} · Implementation review</p>
  <h1>${esc(spec.title)}</h1>
  <p class="lede">${spec.subtitle}</p>

  <section class="block"><h2>What changed</h2>${list(spec.summary)}</section>
  ${spec.decisions?.length ? `<section class="block"><h2>Implementation decisions</h2>${list(spec.decisions)}</section>` : ''}
  ${spec.extraHtml ? `<section class="block">${spec.extraHtml}</section>` : ''}
  ${shots ? `<section class="block"><h2>Screens</h2>${spec.shotsNote ?? ''}${shots}</section>` : ''}
  ${spec.issues?.length ? `<section class="block"><h2>Issues discovered</h2>${list(spec.issues, 'issue')}</section>` : ''}
  ${spec.inherited?.length ? `<section class="block"><h2>Inherited automatically</h2>${list(spec.inherited, 'done')}</section>` : ''}
  ${spec.remaining?.length ? `<section class="block"><h2>Remaining work</h2>${list(spec.remaining, 'todo')}</section>` : ''}

  <footer>Screens captured from the running app at 1180&times;820 &commat;2x, identical
  routes and viewport. The V1 baseline is the real V1 tree restored from git, not a
  mock-up. Part of the Meridian V2 implementation history.</footer>
</main>
${spec.script ? `<script>${spec.script}</script>` : ''}
`);
console.log('wrote', spec.out);
