/**
 * Build a before/after review page from design/shots/{before,after}.
 *   node design/.build-compare.mjs <outfile.html> "<Title>" "<subtitle>"
 * Images are inlined as data URIs — artifact CSP blocks external hosts.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [out, title, subtitle] = process.argv.slice(2);
const DIR = 'design/shots';
const LABELS = {
  landing: ['Marketing landing', 'The only route a stranger sees first'],
  login: ['Log in', 'Auth card — dense form primitives'],
  guest: ['Guest mode · /try', 'The no-account composer path'],
  home: ['Home timeline', 'The waiting state — the primary screen'],
};

const b64 = (p) => `data:image/jpeg;base64,${readFileSync(p).toString('base64')}`;
const names = existsSync(join(DIR, 'after'))
  ? readdirSync(join(DIR, 'after')).filter((f) => f.endsWith('.jpg')).map((f) => f.replace('.jpg', ''))
  : [];

const rows = names.map((n) => {
  const before = join(DIR, 'before', `${n}.jpg`);
  const after = join(DIR, 'after', `${n}.jpg`);
  if (!existsSync(before) || !existsSync(after)) return '';
  const [h, sub] = LABELS[n] ?? [n, ''];
  return `
  <section class="cmp">
    <header><h2>${h}</h2><p>${sub}</p></header>
    <div class="pair">
      <figure><figcaption><span class="tag v1">Before · V1</span></figcaption>
        <img src="${b64(before)}" alt="${h}, before" loading="lazy"></figure>
      <figure><figcaption><span class="tag v2">After · Meridian V2</span></figcaption>
        <img src="${b64(after)}" alt="${h}, after" loading="lazy"></figure>
    </div>
  </section>`;
}).join('\n');

writeFileSync(out, `<title>${title}</title>
<style>
:root{--ground:#0b0e14;--raised:#141922;--ink:#e6e8ec;--muted:#8b93a3;
  --brass:#e0b84a;--rule:rgba(230,232,236,.13);--paper:#e9eae6;--paper-ink:#16181a;
  --sans:"IBM Plex Sans","Helvetica Neue",system-ui,sans-serif;
  --serif:Charter,"Iowan Old Style",Georgia,serif;
  --mono:ui-monospace,"SF Mono",Menlo,monospace;}
@media (prefers-color-scheme:light){:root{--ground:#e9eae6;--raised:#f3f4f0;
  --ink:#16181a;--muted:#5e635c;--brass:#6e5a0e;--rule:rgba(22,24,26,.15);}}
:root[data-theme=light]{--ground:#e9eae6;--raised:#f3f4f0;--ink:#16181a;
  --muted:#5e635c;--brass:#6e5a0e;--rule:rgba(22,24,26,.15);}
:root[data-theme=dark]{--ground:#0b0e14;--raised:#141922;--ink:#e6e8ec;
  --muted:#8b93a3;--brass:#e0b84a;--rule:rgba(230,232,236,.13);}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);
  line-height:1.6;-webkit-font-smoothing:antialiased}
main{max-width:1240px;margin:0 auto;padding:40px 28px 90px}
.eyebrow{font-family:var(--mono);font-size:.68rem;letter-spacing:.2em;
  text-transform:uppercase;color:var(--muted);margin:0 0 12px}
h1{font-family:var(--serif);font-size:clamp(1.9rem,4.6vw,2.7rem);line-height:1.1;
  font-weight:600;letter-spacing:-.015em;margin:0 0 12px;text-wrap:balance}
.lede{font-family:var(--serif);font-size:1.1rem;color:var(--muted);
  max-width:60ch;margin:0 0 8px}
.cmp{border-top:1px solid var(--rule);padding:34px 0 0;margin-top:34px}
.cmp header h2{font-family:var(--serif);font-size:1.3rem;font-weight:600;
  margin:0 0 3px}
.cmp header p{margin:0 0 18px;color:var(--muted);font-size:.87rem}
.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:20px}
figure{margin:0;min-width:0}
figcaption{margin:0 0 8px}
.tag{font-family:var(--mono);font-size:.62rem;letter-spacing:.16em;
  text-transform:uppercase;padding:3px 8px;border-radius:2px;display:inline-block}
.tag.v1{border:1px solid var(--rule);color:var(--muted)}
.tag.v2{background:var(--brass);color:var(--ground);font-weight:600}
img{width:100%;height:auto;display:block;border:1px solid var(--rule);
  border-radius:3px;background:var(--raised)}
footer{border-top:1px solid var(--rule);margin-top:44px;padding-top:22px;
  color:var(--muted);font-size:.83rem}
</style>
<main>
  <p class="eyebrow">Meridian V2 · Implementation review</p>
  <h1>${title}</h1>
  <p class="lede">${subtitle}</p>
  ${rows}
  <footer>Captured from the running app at 1180&times;820 &commat;2x, identical routes
  and viewport. &ldquo;Before&rdquo; is the V1 tree restored from git, not a mock-up.</footer>
</main>
`);
console.log('wrote', out, '·', names.length, 'pairs');
