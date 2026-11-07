# Production credentials: exact requirements and hidden-input procedure

Nothing here changes the running release. New values are **staged** in `/opt/timelycapsule/.env.production.next` (not read by any container) and swapped in later, during the v2026.11.2 release, with a rollback copy. The carried-over development values in `.env.production` stay untouched until then because release v2026.11.1 silently falls back to console/fake adapters if they are removed.

## 1. Resend (email)

What the app does with it (from the code): `emails.send` only (verification codes, password reset, new-device alerts, unlock/reminder/reply notices) and it verifies Resend **webhooks** on `POST /v1/webhooks/resend`.

**Sending domain (already set up in DNS; confirm in the Resend dashboard it says *Verified*):** `timelycapsule.com`, region `us-east-1`.
Records found today: `resend._domainkey` TXT (DKIM) present; `send.timelycapsule.com` MX -> `feedback-smtp.us-east-1.amazonses.com` and SPF TXT `v=spf1 include:amazonses.com ~all` present; `_dmarc` = `v=DMARC1; p=none;` (monitor-only; tighten to `quarantine` after a few weeks of clean reports). Apex mail (Zoho MX/SPF) is separate and unaffected. If the dashboard shows Pending/Failed, tell me before editing DNS.
From address stays `noreply@timelycapsule.com` (no change).

**API key to create:** Resend -> API Keys -> Create: name `tc-production-api`, permission **Sending access**, domain **timelycapsule.com** (not "All domains", not Full access). Copy it once (`re_...`). It cannot read domains or keys, which is intended.
**Webhook (do this only after DNS cutover; the endpoint must be public):** Webhooks -> Add endpoint `https://api.timelycapsule.com/v1/webhooks/resend`; events **email.delivered, email.bounced, email.complained** (the code acts on exactly these); copy the signing secret (`whsec_...`). Until it exists the endpoint answers 401 "Webhook not configured" (safe) and bounces are not tracked.
Values: `RESEND_API_KEY` (now), `RESEND_WEBHOOK_SECRET` (after cutover). `RESEND_FROM_EMAIL` unchanged.

## 2. Cloudflare R2 (media storage)

Operations the app performs with the token (from `r2-adapter.ts`): CreateMultipartUpload, UploadPart (via presigned URL, executed by the browser), CompleteMultipartUpload, AbortMultipartUpload, HeadObject, GetObject (presigned GET and server read), PutObject (presigned PUT for avatars, server writes), DeleteObject. No bucket listing, no bucket administration. **Permission level "Object Read & Write" covers all of these and nothing more.**

**Bucket:** R2 -> Create bucket: name `tc-media-prod`; **jurisdiction: Default** (do **not** pick EU: it changes the endpoint host to `<account>.eu.r2.cloudflarestorage.com` and the app's `R2_ENDPOINT` would stop working); location hint: Western Europe or Automatic (does not change the endpoint); storage class Standard; **public access stays off** (no r2.dev URL, no custom domain; all access goes through short-lived presigned URLs).

**CORS policy (Bucket -> Settings -> CORS Policy -> Add):**
```json
[
  {
    "AllowedOrigins": ["https://timelycapsule.com"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```
Why each entry (derived from the web code): the browser `PUT`s every multipart part and the avatar straight to R2 (cross-origin, so a preflight happens); it `GET`s ciphertext to decrypt on the device (`decryptEnclosure`); the avatar PUT sends a `Content-Type` header; **`ExposeHeaders: ETag` is mandatory**: after each part PUT the browser reads the `ETag` response header to complete the upload, and the code throws "returned no ETag (check bucket CORS ExposeHeaders)" without it. Only the production origin: no `*`, no localhost. If a real browser upload is denied after cutover, the first thing to widen is `AllowedHeaders` (to `["*"]`), not the origin.

**API token:** R2 -> Manage API tokens -> Create API token: permission **Object Read & Write**; **Apply to specific buckets only: `tc-media-prod`**; TTL: forever (or a long expiry you calendar); **do not set client IP filtering**: presigned URLs are used from users' browsers and an IP allow-list on the token would block them. Copy the **Access Key ID** (32 hex) and **Secret Access Key** (64 hex) shown once (the separate "Token value" is not used).
Values: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_MEDIA=tc-media-prod`. `R2_ACCOUNT_ID` and `R2_ENDPOINT` (`https://<account>.r2.cloudflarestorage.com`) are unchanged.

## 3. Hidden-input procedure (nothing secret in chat, argv, history or logs)

`tc-secret` (in this repo, `deploy/oracle/tc-secret`, installed at `/usr/local/sbin/tc-secret` on tc-app and tc-db) reads each value from your terminal with echo off, validates the format of known keys, rejects characters that docker compose would reinterpret (`$`, quotes, whitespace, `#`, backslash, backtick), writes atomically with mode 0600, keeps the previous file as `.bak-<UTC>`, and prints only key names and lengths. It **refuses to run without a terminal**, so a secret can never be piped into it by accident. It was tested for: no value on stdout, owner/mode, other keys preserved, live file untouched, backup creation, unchanged/different detection, format mismatch refused, dangerous characters refused, no-terminal refusal.

Open a terminal and connect with a TTY (`ssh -t`); you type, nothing is echoed:
```bash
ssh -t tc-app
# stage the Resend key and the R2 values (any order; each command only touches the keys it names)
sudo tc-secret env /opt/timelycapsule/.env.production.next --like /opt/timelycapsule/.env.production RESEND_API_KEY
sudo tc-secret env /opt/timelycapsule/.env.production.next --like /opt/timelycapsule/.env.production R2_BUCKET_MEDIA R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY
# make the staged file COMPLETE: add every other variable from the live file (never overwrites what you entered; no prompts, no values shown)
sudo tc-secret complete /opt/timelycapsule/.env.production.next --from /opt/timelycapsule/.env.production --like /opt/timelycapsule/.env.production
# later, after cutover:
sudo tc-secret env /opt/timelycapsule/.env.production.next --like /opt/timelycapsule/.env.production RESEND_WEBHOOK_SECRET
# review: names, lengths, same/different vs the live file (never values)
sudo tc-secret status /opt/timelycapsule/.env.production.next --against /opt/timelycapsule/.env.production
```
Expected `status`: 17 keys; `RESEND_API_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_MEDIA` **different**; the other 13 **same**. A staged file with fewer keys is incomplete and must not be activated (the containers would start without `DATABASE_URL`, the JWT keys, etc.); `complete` fixes that. Then tell me "staged"; I never see the values.

## 4. What happens when you say "staged" (my steps, with rollback)

1. Verify staged values without sending to anyone but you: R2: a throwaway container with the staged values does Put/Head/Get/Delete of one test object in `tc-media-prod` and a CORS preflight against a presigned URL from `Origin: https://timelycapsule.com` (expects the allow-origin and `ETag` exposure); Resend: one test email to an address you name.
2. After release v2026.11.2 is deployed: back up `.env.production`, move the staged file into place, recreate api/worker/scheduler, verify health and the adapters (logs show no `not configured`), keep the previous file for rollback.
3. After cutover: stage and apply the webhook secret, register the endpoint, send a test event.
