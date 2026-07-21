# TimelyCapsule — Zero-Cost Addendum (OVERRIDES parts of 03-ARCHITECTURE §24)

**Context:** solo founder, near-zero capital. This document replaces the infra/vendor picks with a stack that runs at **$0–5/month until real traction**, without compromising the non-negotiables (delivery integrity, data durability, sealed-content trust). Product scope (01) and UX (02) are unchanged; a few Phase 1 simplifications are listed at the end.

## Target monthly bill
| Stage | Cost |
|---|---|
| Build & beta (0–500 users) | **$0** + one-time $25 Google Play + $99/yr Apple Developer (unavoidable for iOS) |
| Early traction (500–5k users) | ~$5–20 (single VPS + overflow storage) |
| Revenue-funded (5k+) | migrate pieces to the original 03-ARCHITECTURE picks as Stripe revenue covers them |

## Revised stack (free-tier first, escape hatch noted per row)

| Concern | Zero-cost pick | Free limits | Escape hatch later |
|---|---|---|---|
| API + workers + scheduler | **Render free web service** is unreliable (sleeps — a scheduler cannot sleep). Instead: **one Hetzner/Contabo VPS (~$4–5/mo)** running Docker Compose: api, worker, scheduler, Postgres, Caddy. This is the single spend worth making — the scheduler must be always-on. If truly $0: **Oracle Cloud Always Free** (4 ARM cores, 24 GB RAM, forever free) runs the whole stack comfortably — use it, with the caveat that Oracle occasionally reclaims idle instances (keep backups offsite; a reclaimed VM restores in an hour). **Recommendation: Oracle Always Free now, Hetzner when you can spare $5.** | forever | Fly/AWS per 03 |
| Database | **Postgres on the same VPS** (not Neon free — Neon free autosuspends and has 0.5 GB; fine for dev, not for the source-of-truth schedule ledger). Nightly `pg_dump` → free offsite (Cloudflare R2 free tier / Backblaze B2 10 GB free). | — | Managed RDS/Neon paid |
| Queue | **Drop Redis entirely. Use pg-boss** (Postgres-based job queue). One less service, and it *strengthens* the §10 design: schedule ledger and queue are now the same durable store. `scheduled_actions` stays as designed; pg-boss handles execution. At solo-startup scale Postgres handles thousands of jobs/min easily. | — | BullMQ+Redis if >50 jobs/sec sustained |
| Cache / rate limits | Postgres + in-memory per-instance (single node anyway) | — | Redis later |
| Object storage + CDN | **Cloudflare R2**: 10 GB storage, zero egress fees, free tier ops quota — plus **Cloudflare CDN free** in front. 10 GB covers beta; overage is $0.015/GB (1 TB ≈ $15). Free-plan user quota (100 MB) means 10 GB ≈ first 100 heavy users free. | 10 GB | Same product, just pay overage — no migration ever needed. This was already the recommended pick; it's also the cheapest. |
| Web hosting | **Vercel Hobby** (free) for Next.js — marketing, app, reveal pages. Hobby forbids commercial use nominally; the day Stripe revenue exists, Pro is $20 — until then it's standard practice for pre-revenue. Alternative fully-safe: **Cloudflare Pages (free, no commercial restriction)** with next-on-pages. **Recommendation: Cloudflare Pages** to avoid the ToS gray zone. | forever | Vercel Pro |
| Email | **Resend free: 3,000 emails/mo, 100/day** — enough for beta. Add **Brevo free (300/day)** as a second provider behind the `outbound_messages` abstraction for overflow/failover. Buy the domain (~$10/yr, the other unavoidable cost) and set up SPF/DKIM/DMARC meticulously — deliverability of unlock emails is the product. | 3k/mo | Postmark when >3k/mo (~$15) |
| SMS | **Cut from Phase 1–2 entirely** (was optional anyway). Email + push cover all flows; legacy check-ins use email + push. | — | Twilio at Business tier |
| Push | **APNs + FCM are free forever.** Via Expo push service (free) to skip server-side token juggling initially. | free | direct APNs/FCM |
| Mobile builds | **EAS free tier** (30 builds/mo, queue waits) + `expo run` local builds on your Mac for dev. OTA updates via EAS Update free tier (1k MAU). | 1k MAU | EAS paid ($19) |
| Auth | Keep self-built (already the plan — $0). Apple/Google OAuth are free. **Do not** add Auth0/Clerk (their free tiers become your most dangerous bill later). | — | — |
| Payments | **Stripe: no fixed cost, 2.9%+30¢** — pure pay-when-paid. **Defer IAP to post-launch**: launch mobile apps with a "manage subscription on the web" pattern where policy allows, or simply launch web billing first; Apple now permits external-purchase links in the US (and reader-app style flows elsewhere are evolving) — implement StoreKit only when App Store review forces it or revenue justifies the 15–30% cut. | free | StoreKit/Play Billing |
| Antivirus scan | **N/A permanently under zero-access E2E (06 §A)** — server can never scan contents. Controls are structural: MIME sniffing, size caps, serving all user files with `Content-Disposition: attachment` + strict CSP + separate media domain (`usercontent.timelycapsule.com`) so files can't XSS the app. | — | ClamAV/VirusTotal |
| CSAM hash-matching | Media is E2E ciphertext server-side (06 §A), so hash-scanning is structurally impossible; safety model is report-driven moderation with recipient-submitted evidence + metadata/behavioral signals, per 03 §18. | — | client-side hash-matching pre-encryption if ever legally required |
| Video transcoding | **No HLS ladder — permanent under E2E** (server can't transcode ciphertext) and also the zero-cost choice: client-side compression (record 720p/1080p H.264), encrypt, serve progressively from R2 (decrypt-while-download via streaming AES-GCM chunks per T-07b). Poster frame generated client-side pre-encryption. No adaptive bitrate — acceptable ≤ 1080p. | — | client-side multi-rendition uploads if ever needed |
| Image processing | `sharp` in the worker on the VPS (thumbs, EXIF strip, blurhash) — cheap, keep it. | — | — |
| Errors | **Sentry free (5k errors/mo)** or self-host GlitchTip on the VPS. Sentry free is fine. | 5k/mo | paid |
| Analytics | **PostHog Cloud free: 1M events/mo** — generous, keep. | 1M/mo | paid |
| Logs/metrics | pino → journald/files on VPS + **Grafana Cloud free** (or skip metrics UI; `docker stats` + Sentry alerts suffice pre-traction). | free | paid |
| Uptime/alerts | **UptimeRobot free** (5-min checks) on `/health` + a dead-man's-switch check for the scheduler (healthchecks.io free: scheduler pings every 5 min; missed ping → email). **The dead-man switch is mandatory** — it's your $0 replacement for PagerDuty on the "no capsule left behind" guarantee. | free | Grafana OnCall |
| Search | Postgres FTS (already the plan) | — | — |
| Status page | A static page on Cloudflare Pages + UptimeRobot public status (free) | free | — |
| CI/CD | GitHub Actions free tier (2k min/mo private repos) — plenty | free | — |
| Domain | ~$10/yr (Cloudflare Registrar, at-cost) | $10/yr | — |
| Help center | Markdown pages inside the Next.js site (no external tool) | — | — |
| Support | `support@` via Cloudflare Email Routing (free) → your Gmail | free | Plain inbox → helpdesk later |

## Architecture deltas (03-ARCHITECTURE remains authoritative except these)
1. **§12 topology:** collapse to: Cloudflare (DNS/CDN/WAF free) → single VPS (Caddy → api / worker / scheduler containers + Postgres) + R2 + Cloudflare Pages. No Redis, no read replica (add when needed).
2. **§10 scheduling:** promoter/sweeper pattern stays, but jobs execute via **pg-boss** in the same Postgres. Advisory-lock leader election unnecessary with one scheduler container; keep the code structured so a second instance is safe anyway.
3. **§9 media:** pipeline steps 4's video branch deferred; AV scan deferred (compensating controls above); archive-storage-class step deferred (irrelevant at 10 GB).
4. **§11 notifications:** SMS column dropped Phase 1; email provider = Resend behind the existing `outbound_messages` abstraction (switching providers later = one adapter).
5. **§24 testing:** unchanged — all free tools. The scheduler simulation suite remains non-negotiable.
6. **Backups (critical at $0):** nightly `pg_dump` + weekly R2 bucket manifest → Backblaze B2 (separate provider from R2 on purpose — provider-failure independence). Test a restore monthly. Losing data at $0/mo is still losing the company.

## Product scope trims for Phase 1 (cost-driven, all restorable later)
- Video caps: free 1 min/720p (unchanged), premium **10 min/1080p** instead of 30 min/4K until transcoding exists (update pricing table copy).
- Premium storage: market "100 GB" but soft-launch with fair-use since R2 overage is linear and cheap (100 GB user = ~$1.50/mo storage — fine at $7.99 price).
- Printed keepsakes, SMS, Business tier: already Phase 3 — unchanged.
- IAP: deferred (web billing first) as above; ship mobile apps read/create-capable with web upgrade link per current store rules.

## Order of first paid upgrades (when revenue starts)
1. Hetzner VPS $5 (if on Oracle) → reliability of the scheduler
2. Postmark $15 (when >3k emails/mo) → unlock-email deliverability
3. Vercel Pro or stay on CF Pages ($0)
4. Second small VPS or managed Postgres → separate DB from app
5. EAS paid, then Redis/queue scale-out — each only when a measured limit is hit. (Server transcoding is permanently off the table under E2E.)
