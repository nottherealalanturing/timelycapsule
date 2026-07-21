# TimelyCapsule — UX Specification & Design System

> Part 2 of 4. Covers §5 (screens), §6 (design system), §7 (flows), §15 (mobile), §16 (web), plus interaction details.

---

## 6. Design System — "Meridian"

Defined first because every screen below references these tokens.

### Brand feel
Premium, warm, calm, ceremonial. Think **Day One's warmth × Linear's precision × Apple's restraint**. Not playful-cartoonish, not funeral-solemn. Time is the motif: subtle gradients that shift with time of day, circular/orbital shapes, wax-seal iconography for the seal moment.

### Color palette
Semantic tokens only in code (`--color-bg-primary`, never raw hex in components).

**Core**
- `midnight` #0F1222 — primary dark surface / dark-mode bg
- `parchment` #FAF7F2 — light-mode bg (warm off-white, not clinical #FFF)
- `ink` #1C1E2E — light-mode primary text
- `mist` #8A8FA3 — secondary text
- **Accent: `amber-gold` #D4A24E** — the "seal" color; CTAs, sealed states, wax-seal motif. Chosen over the obvious blue/purple: gold reads as precious, archival, timeless; nobody in the comparison set owns it.
- `dusk-violet` #6C5CE7 — secondary accent: links, countdown glow, in-progress states.
- Success `#2F9E6E` · Warning `#E0A63A` · Danger `#D95656` · Info `#4A7FD4`

**Capsule-state colors** (used consistently everywhere — chips, timeline dots, icons):
- Draft: mist gray dashed
- Sealed/waiting: amber-gold
- Unlocked (unopened): dusk-violet, gently pulsing
- Opened: soft green-tinted neutral
- Legacy: deep bronze #8C6A3F
- Withdrawn/expired: desaturated

**Dark mode:** true first-class theme (system default / manual override). Surfaces: #0F1222 base, #171A2E raised, #1E2238 overlay. Gold shifts to #E3B865 for contrast. All tokens have paired dark values; contrast re-validated per pair.

### Typography
- **Display/serif: "Fraunces"** (variable) — headlines, capsule titles, letter content rendering. A serif for the emotional/archival register.
- **UI/sans: "Inter"** (variable) — everything functional.
- Mobile: SF Pro / Roboto for UI, Fraunces for display (bundled).
- Scale (rem): display-xl 3.0/1.1, display 2.25/1.15, h1 1.75/1.2, h2 1.375/1.3, h3 1.125/1.4, body 1.0/1.6, small 0.875/1.5, caption 0.75/1.4. Letter content renders at 1.125 body in Fraunces with 1.7 line-height (reading experience).
- Weights: 400/500/600 only (+ Fraunces 300 italic for quotes).

### Spacing, radius, elevation
- 4-pt grid: 4, 8, 12, 16, 24, 32, 48, 64. Page gutters: 16 mobile, 24 tablet, max-width 1200 desktop content, 720 reading column.
- Radius: inputs/buttons 10, cards 16, modals/sheets 20, capsule cover art 16 with 1px inner hairline, full-round pills/avatars.
- Shadows (light): `sm` 0 1 2 rgba(28,30,46,.06); `md` 0 4 12 rgba(28,30,46,.08); `lg` 0 12 32 rgba(28,30,46,.12). Dark mode uses borders + surface steps instead of shadows.

### Iconography & illustration
- Icons: Phosphor (duotone for feature/empty states, regular 1.5px stroke for UI). Custom set: wax seal, hourglass, orbit, capsule (rounded cylinder), trustee shield.
- Illustration: minimal line + soft gradient fills in brand colors; celestial/temporal motifs (orbits, moons, horizons). Used in empty states, onboarding, achievement art. No mascots.

### Motion
- Standard durations: micro 120ms, standard 200ms, expressive 400–600ms (ceremonies only). Easing: `cubic-bezier(0.2, 0, 0, 1)` standard; spring (mass 1, stiffness 260, damping 24) for sheets/cards.
- **Signature moments** (the only places allowed >600ms):
  1. **Seal ceremony** (~2.5s, skippable): capsule card folds closed → wax seal stamps down with a soft thud haptic → gold ripple → card flies onto the timeline at its future date.
  2. **Unlock reveal**: locked capsule vibrates gently → seal cracks (light burst) → cover unfolds → content fades in section-by-section as the recipient scrolls. Legacy variant: slow dissolve, no burst, warm quiet tones.
  3. **Countdown flip** on final 10 seconds (public/live openings).
- `prefers-reduced-motion`: all three become ≤300ms cross-fades; haptics preserved (they're not motion), confetti removed.

### Core components (build as shared packages: `@tc/ui-web`, `@tc/ui-native`)
- **Button:** primary (gold fill, ink text), secondary (outline), ghost, destructive, sizes sm/md/lg, loading spinner replaces label (width-locked), icon-leading/trailing, full-width variant. Disabled = 40% opacity + no shadow.
- **Input/TextArea:** filled surface, 1px border, focus = 2px dusk-violet ring; inline error below in danger + icon; label always visible (no placeholder-as-label); character counters where limits exist.
- **CapsuleCard:** cover (image/gradient) + state chip + title (Fraunces) + meta row (unlock date, recipients avatars stack) + countdown (live for <24h, static otherwise). Sizes: grid tile, timeline row, mini (widget/search).
- **CountdownDisplay:** adaptive granularity — ">1 yr: '2 years, 3 months'", "<30 d: days+hours", "<1 h: mm:ss live". Never shows scary precision at long ranges.
- **DateTimeSchedulePicker** (custom, critical component): calendar month grid + year fast-jump (type a year), time wheel/dropdown (15-min steps + custom), timezone selector with search + "recipient's local time" option, natural-language input parsed live ("in 18 months" → highlights date), summary sentence always rendered: *"Unlocks Saturday, June 1, 2027 at 9:00 AM (recipient's local time)."* Validation inline: min +5 min, max +50 yr.
- **MediaUploader:** drag-drop zone (web) / source sheet (mobile: camera, library, record voice, record video, files, scan document). Per-file progress ring, pause/resume, retry, error chip; grid preview with drag reorder; caption field per item.
- **MediaViewer:** full-screen gallery, pinch-zoom, swipe, video player (custom controls, captions track), audio player with waveform + 15s skip, PDF pager, download button (if permitted).
- **Toast:** bottom-center web / top mobile, 4s auto-dismiss, action slot ("Undo"), max 1 visible, queued.
- **Dialog/Modal:** center web (480/640/800 widths), full-screen takeover mobile for complex flows; destructive dialogs require typed confirmation only for account deletion.
- **BottomSheet (mobile) / Popover (web):** standard pattern for pickers, share menus, item actions.
- **EmptyState:** illustration + one-line headline + one CTA. Every list screen has a designed empty state (specified per screen below).
- **Skeletons:** shimmer placeholders matching real layout; never spinners for content areas (spinners only for actions).
- **SegmentedControl, Chips (filter/tag), AvatarStack, StateChip, ProgressMeter (storage), Stepper (wizard), Banner (grace period, verification), NavigationBar/TabBar/Sidebar** per platform conventions.

---

## 5. Screen-by-Screen UX

### 5.1 Marketing / Landing (web, `/`)
- **Hero:** headline "Send it to the future." Sub: "Messages, memories, and media — sealed today, delivered at exactly the right moment." Live demo capsule on the right: an interactive sealed capsule the visitor can tap to see a sample reveal. CTA: "Create your first capsule — free" + "See how it works".
- Sections: How it works (3 steps: Create → Seal → It arrives), use-case carousel (Future self / Parents / Couples / Legacy — each with a real-feel example capsule), trust section (delivery guarantee, encryption, export promise, "your capsules outlive our roadmap" commitment), pricing teaser, FAQ, footer (legal, status, help).
- Sticky header → transparent over hero, solid on scroll. Dark-mode aware.
- **Occasion landing pages** (`/for/new-parents`, `/for/letters-to-my-future-self`, …) same skeleton, swapped copy + template deep-link — the SEO engine.

### 5.2 Auth screens (`/signup`, `/login`, `/reset`, `/verify`)
- Single centered card (max 400), logo, warm gradient bg. Signup: Apple + Google buttons first, divider, email+password. Inline zxcvbn strength meter. Legal checkboxes: single ToS/Privacy consent line.
- Login: email/password, magic-link option ("email me a link"), forgot password. 2FA step: 6-digit code input (auto-advance boxes), "use recovery code" link.
- Verify email: 6-digit OTP (not link-only — works when mail app is on another device), resend with 60s cooldown, change-email escape hatch.
- Errors: field-level; generic "invalid credentials" (no user enumeration); rate-limit state shows countdown.
- Recipient magic-link landing: skips all of this — see 5.10.

### 5.3 Onboarding (first run, ≤ 3 steps, skippable)
1. "What brings you here?" — chips (Letters to myself / Messages to loved ones / Family memories / Legacy / Just exploring) → personalizes template suggestions + home empty state.
2. Notifications permission (pre-permission explainer screen before OS prompt: "We'll only notify you when time matters").
3. Drop user directly **into the composer with a starter template** matching step 1. First-seal is the activation event; everything routes there.

### 5.4 Home / Dashboard (`/home`, mobile tab 1)
- **Layout web:** left sidebar (nav), center content (max 1200), right rail (upcoming unlocks mini-timeline, ≥1280px only).
- **Header row:** greeting with temporal flavor ("Good evening, Maya — 2 capsules are waiting for the future"), search bar (web), + New Capsule button (gold, persistent).
- **Section: "Opening soon"** — horizontal cards of next unlocks (own + incoming known), live countdowns. Empty → hidden.
- **Section: "Waiting for you"** — unlocked-but-unopened capsules addressed to me: large glowing cards, top priority placement. This is the money moment; nothing outranks it.
- **Section: Timeline** — vertical, grouped by time buckets (This month / 2026 / 2027 / … / 2040s), sealed capsules as rows with state chips + countdowns; toggle: Timeline ↔ Grid view. Filters bar: state, type, tag, ownership (mine/received).
- **Empty state (new user):** illustration of an open capsule + "Your future is unwritten. Seal your first capsule." CTA + 3 template shortcuts.
- Mobile: same sections stacked; pull-to-refresh; FAB (gold, wax-seal icon) bottom-right for New Capsule.
- Loading: skeleton cards. Error: inline retry banner, cached content still shown (stale-while-revalidate).

### 5.5 Capsule Composer (`/capsule/new`, full-screen takeover both platforms)
The most important creation surface. **Single scrolling document, not a wizard** (wizards kill emotional flow), with a persistent footer bar advancing through completeness.

- **Top bar:** Close (autosaves → toast "Draft saved"), draft status ("Saved just now"), overflow menu (Save as template, Preview as recipient, Delete draft).
- **Cover block:** tap to set cover — color gradients, seasonal themes, or upload image; capsule title (Fraunces, large, placeholder "Name this capsule…"); type selector chip row (Self / Someone else / Group / Legacy) — switching adjusts subsequent sections.
- **Letter block:** rich text editor (bold, italic, lists, headings, quote, divider — deliberately minimal; markdown shortcuts supported; slash menu web). Writing prompts drawer (contextual to type/occasion): tapping a prompt inserts it as a styled question the user answers beneath.
- **Media block:** MediaUploader (above). Voice recorder inline: hold-or-tap to record, live waveform, pause/resume, review before attach.
- **Recipients block** (hidden for Self): recipient chips + add field (email/phone/contacts autocomplete from saved contacts); per-recipient row → options popover (verify identity toggle, remove); global options: shared vs private recipient list, allow downloads, announce now vs surprise.
- **Schedule block:** DateTimeSchedulePicker + occasion shortcuts (Next New Year / birthday auto-detected / +1 year / +5 / +10 / custom). Recurrence toggle (yearly series) where applicable. Seal-deadline sub-option for group capsules.
- **Seals & Expiry block (collapsed accordion, per 06 §B–C):** stacked "Seal" chips — Time (always, from Schedule block), + add Place Seal (map pin picker, radius slider 100 m–50 km, place nickname), + Passphrase Seal (passphrase + required hint field, strength meter), + Identity Seal (OTP toggle). Max 3 beyond Time; each added seal renders as a wax stamp on the capsule preview. Expiry selector: forever (default) / 1 yr / 30 d / 7 d / 24 h / ephemeral ("self-destructs after one viewing" — strict mode implied, confirmation sheet). Also here: break-glass allowance (self capsules), reply-requested prompt, fallback recipient, location attach.
- **Footer bar:** completeness hints ("Add an unlock date to seal") → when valid, gold **"Seal capsule"** button.
- **Seal confirmation sheet:** summary card (title, recipients, unlock date sentence, storage size), immutability warning ("After sealing you can't edit the contents. You can still withdraw it before it unlocks."), checkbox-free single confirm → **Seal ceremony animation** → lands on timeline with toast "Sealed. See you on June 1, 2027."
- Autosave every 3s of idle + on blur; drafts recoverable from crash (local persistence + server sync).
- Upload-in-progress at seal time: seal button becomes "Sealing when uploads finish (2 remaining)…" — capsule enters `sealing` interim state, completes automatically, push confirms.
- Validation errors surface inline at the offending block and the footer hint names the first blocker.
- Accessibility: every block a labeled region; editor fully keyboard-driven; recorder has non-hold tap mode.

### 5.6 Capsule Detail — Owner view (`/capsule/:id`)
- Header: cover art large, title, state chip, countdown hero (sealed) or "Opened by 3 of 4" (post-unlock).
- Tabs/sections: **Overview** (schedule sentence, type, size, options set), **Recipients** (status table: per-recipient chip added/invited/notified/viewed/opened/reacted + resend + edit-address pre-unlock), **Activity** (audit feed), **Contents** — *hidden while sealed for self-capsules without break-glass; visible for own sealed capsules to others* (creator can always view what they sealed — they wrote it; immutability ≠ amnesia. Exception: self-capsules, where the wait IS the product → contents hidden behind break-glass rules).
- Actions bar: Share link, Duplicate, Extend unlock (once, ≤30d, sealed only), Withdraw (danger, confirm dialog explains recipient messaging), Archive/Trash (state-dependent), Export (opened), Transfer ownership (overflow).
- Break-glass (self): "Open early" ghost button → sheet explains 48-hour delay + confirmation email → scheduled early-open with cancel window.

### 5.7 Reveal / Recipient open experience (`/c/:token`, in-app for account holders)
Stages by state:
- **Locked (pre-unlock):** full-screen cover, sender line ("From Marcus, sealed March 3, 2026"), short Capsule ID (`TC-84KZQM3P`, per 06 §D), teaser note if set, big countdown (viewer's locale + timezone, adaptive granularity), **Seal stamps row** — each remaining Seal (Time/Place/Passphrase/Identity) as a wax stamp that visibly cracks when satisfied — "Notify me when it opens" (email/push), add-to-calendar, subtle "What is TimelyCapsule?" footer. At T-0 the page flips live into the reveal (no refresh). If surprise-mode: this page 404s until unlock (link only sent at unlock). Post-time gates as needed: Place gate (distance/bearing + blurred map teaser), Passphrase gate (hint + input), Identity gate (OTP) — copy per 06 §D.
- **Unlocked, first open:** identity check if required (OTP) → **Reveal ceremony** → paced content: cover → letter (Fraunces reading column, comfortable measure) → media gallery (each item full-bleed as scrolled) → location map if present → sender sign-off card.
- **Post-content actions:** reaction bar (❤️ 🥹 🎉 😂 🙏 + custom), "Write back" (thank-you note inline OR "Reply with a capsule" → composer pre-addressed), Download all (if allowed), **"Keep this forever — save to your TimelyCapsule"** (account-create CTA, non-modal, tasteful).
- **Return visits:** straight to content, no ceremony replay (replay available via "Relive the opening" button).
- Legacy variant: muted palette, no reaction emojis (only 🤍 and written response), grief-mode pacing controls if part of a deceased-sender series.
- Anonymous visitors: no app-install interstitials ever. Mobile web is fully capable. (Trust > conversion.)

### 5.8 Inbox / Received (`/received`, mobile tab 2)
- List of capsules addressed to me: Waiting-to-open (glowing) → Upcoming (locked, with countdowns, if announced) → Opened history. Sender avatars, block/report in row overflow. Empty state: "Nothing yet — but the future is long." + "Invite someone to exchange capsules" CTA.

### 5.9 Contacts & Recipients manager (`/people`)
- Saved contacts list (name, email/phone, birthday, capsules exchanged count), groups, add/edit sheet, birthday-upcoming section ("Amara turns 30 in 3 weeks — start a capsule"), import from device contacts (mobile, permissioned) / CSV (business).

### 5.10 Collections, Tags, Archive, Trash (`/collections`, `/archive`, `/trash`)
- Collections: grid of collection covers → collection detail = filtered timeline; create/rename/reorder/delete (delete keeps capsules).
- Trash: rows with "deleted N days ago · purges in M days", Restore + Delete forever (confirm), Empty trash (typed-confirm not required; double confirm).

### 5.11 Search (`/search`, web ⌘K overlay + full page)
- ⌘K modal: instant results grouped (Capsules / People / Collections / Actions like "New capsule", "Billing") — Linear-style command palette doubling as nav.
- Full page: query + filter chips (state, type, tag, date range, person), result rows with highlight snippets (opened/draft content only), empty state explains sealed content isn't searchable ("Sealed capsules keep their secrets until they open").

### 5.12 Notifications center (`/notifications`, bell icon / mobile tab 4)
- Grouped by day; icon-coded by category; unread dot; tap → deep link; swipe-dismiss (mobile); "Mark all read"; settings gear → notification preferences.

### 5.13 Profile & Settings (`/settings/*`)
- Web: two-pane (settings nav left, panel right). Mobile: stacked lists.
- Panels per §4.14. Notable UX: Storage panel has a visual meter + "largest capsules" list; Legacy panel is a guided setup (trustees → check-in cadence → preview) with a completion progress ring; Danger zone separated and red-bordered.

### 5.14 Billing & Paywall
- Pricing page (web `/pricing` + in-app sheet): plan cards, monthly/annual toggle (annual pre-selected, savings badge), feature comparison accordion, FAQ. 
- **Contextual paywalls:** hitting a limit shows a bottom sheet naming the exact limit ("This video is 4 minutes — free plan supports 1") with single relevant upsell + "Trim video instead" alternative where honest ones exist. Composer state always preserved through upgrade.
- Checkout: Stripe Elements embedded (web), native IAP sheets (mobile). Success → celebratory but brief; entitlements apply instantly.

### 5.15 System Pages & Voice states (per 06 §D — all use the "warm time-travel" voice with its rules)
Every one is a designed page, not a default error: **Loading** ("Retrieving your capsule from the timestream…" + orbiting-capsule spinner; reduced-motion variant); **404/Missing** ("Lost in time." + "Return to the present" CTA); **Withdrawn** variant (sender-called-back copy, zero content leakage); **Expired** ("This capsule has completed its journey." — or the viewer's retained copy with a completed-journey badge); **Place gate**, **Passphrase gate**, **Identity gate**; **Rotated link**; **Rate-limited**; **Paradox guard** toasts on forbidden sealed-capsule actions. Legacy/grief surfaces use the quiet plain voice throughout — never the playful register.

### 5.16 Admin panel (separate app, `admin.timelycapsule.com`)
Layout: dark sidebar (Dashboard, Users, Capsules, Reports, Legacy queue, Billing, Campaigns, Flags, Audit, System). Detail specs in `03-ARCHITECTURE.md §Admin`.

---

## 7. Key User Flows (step-by-step)

**F1 First capsule (activation):** Signup → onboarding intent → composer w/ template → write ≥50 chars or add media → schedule via shortcut → Seal → ceremony → timeline. Target: < 4 min median. Instrument every step.

**F2 Send to non-user:** Compose → add recipient email → announce-now ON → seal → recipient gets "Something is waiting" email (sender name, cover, countdown link) → recipient opts into reminder → unlock day: email + (if subscribed) push → magic link → reveal → reaction → sender push "Amara opened your capsule ❤️" → recipient sees save-CTA → converts (F2b: signup with same email auto-claims ghost identity, capsule now in Inbox).

**F3 Break-glass early open:** Detail → Open early → sheet (48h delay explained) → confirm → email sent "Your capsule opens early on {date+48h} — cancel anytime" → banner on capsule with cancel → after 48h, capsule unlocks (self only).

**F4 Withdraw sealed capsule:** Detail → Withdraw → dialog: "Recipients who knew about this capsule will be told it was withdrawn. Its contents will never be shown." → confirm → state `withdrawn`, recipients (announced ones only) get a gentle email; unannounced recipients never learn it existed.

**F5 Legacy setup:** Settings → Legacy → intro screen (tone: calm, practical) → add trustees (email + relationship) → trustees receive invite → accept (creates light account) → choose check-in cadence (30/60/90d) + confirmation threshold (1-of-N / 2-of-N) → assign existing/new capsules as Legacy → preview each trustee's exact future experience → done-state with progress ring full.

**F6 Trustee trigger:** Trustee opens solemn flow → attests (typed statement + optional document upload) → if threshold needs more trustees, they're notified → threshold met → **14-day waiting period**: owner bombarded on all channels ("If this is in error, just log in") → any owner login cancels + alerts all trustees → after 14 quiet days, legacy capsules unlock to their designated recipients with identity verification → full audit trail visible to all parties.

**F7 Payment failure:** Charge fails → retry schedule (1d, 3d, 7d) → emails + banner ("Grace period: 7 days") → still failing → downgrade to free *entitlements* (creation limits) but **all sealed capsules untouched and delivered** → win-back email at 14d.

**F8 Account deletion:** Settings → Delete → password/2FA re-auth → consequences screen lists undelivered capsules to others, each with radio: "Deliver as scheduled (anonymized sender name retained)" vs "Withdraw" → 30-day pending window (login cancels) → purge; deliver-anyway capsules move to an escrowed system owner; legal audit stubs retained.

**F9 Group capsule:** Organizer creates Group type → sets seal deadline + unlock date → invites contributors (link/email) → contributors add entries (each sees own + optionally others', organizer setting) → reminder cadence to non-contributors → seal deadline: auto-seals with whatever's in (organizer warned 48h/24h before if pending invites) → unlocks to recipient(s).

**F10 Timezone-sensitive delivery:** Sender picks "recipient's local 9:00 AM" → recipient tz unknown until they first open the locked link or have an account → fallback chain: recipient profile tz → tz inferred at first link-visit (stored) → sender's tz (sender told: "We'll use your timezone unless Amara visits the capsule page first").

---

## 15. Mobile Apps (React Native, iOS + Android)

- **Framework:** React Native (Expo, custom dev client) — see Part 4 for rationale.
- **Navigation:** bottom tabs — **Home · Received · [FAB: New] · Notifications · Profile**. Stack navigators per tab; composer/reveal are full-screen modals; universal links `timelycapsule.com/c/*` deep-link to reveal.
- **Offline mode:** local-first drafts (SQLite via WatermelonDB or expo-sqlite + custom sync); compose, attach, and "seal" offline → capsule enters `pending_sync`, seals server-side on reconnect (schedule validated then; if unlock time passed while offline → prompt to adjust). Opened-capsule content cached for offline re-reading (own + received, LRU cap 500 MB configurable).
- **Uploads:** background resumable (iOS `URLSession` background config / Android WorkManager via expo-task-manager or a native module); per-item retry with exponential backoff; cellular-data toggle ("upload large media on Wi-Fi only", default ON >50 MB).
- **Push:** FCM + APNs via unified provider; notification categories with action buttons ("Open capsule", "Remind me tonight"); rich pushes with cover thumbnails (never content); provisional auth on iOS for gentle start.
- **Widgets:** iOS WidgetKit + Android Glance — small: next unlock countdown; medium: next 3 unlocks; lock-screen circular countdown (iOS). Tapping deep-links.
- **Share extension:** share photos/text from any app → "Add to draft capsule" sheet (choose existing draft or new).
- **Biometrics:** optional app lock (Face ID/Touch ID/BiometricPrompt) with PIN fallback; auto-lock after background timeout; separately required for Vault-Locked capsule viewing and Legacy settings.
- **Camera/recorder:** in-app capture (photo/video/voice) with quality presets tied to plan; HEIC/HEVC transcode server-side.
- **Haptics:** seal thud (heavy), unlock crack (rigid then light), reaction pop (light). Respect system settings.
- **Platform conventions:** iOS swipe-back everywhere, context menus (long-press capsule card → Preview/Share/Archive); Android predictive back, Material You dynamic color OFF (brand palette fixed), edge-to-edge.
- **Performance budgets:** cold start < 2s p90 on mid-tier Android; timeline scroll 60fps (FlashList); image pipeline with progressive thumbs (blurhash placeholders shipped in API payloads).

## 16. Web Experience (Next.js)

- Responsive: sidebar collapses to icons < 1024, to hamburger+bottom-bar-less mobile web < 768; composer single-column always (it's a document).
- **Keyboard shortcuts:** ⌘K palette; `n` new capsule; `/` focus search; `g h / g r / g s` go-to nav; `e` archive; `#` trash; `⌘Enter` seal (with confirm sheet); `?` shortcut overlay. All registered through a central map, disabled inside text inputs.
- **Drag-and-drop:** files anywhere onto composer → attach; onto dashboard → new draft with files; capsule cards onto collections in sidebar.
- **Multi-select & bulk:** checkbox on hover in grid view; shift-click ranges; bulk bar (tag, add to collection, archive, trash — never bulk-withdraw; that stays deliberate and singular).
- **Upload manager:** persistent bottom-right dock listing active uploads across the session, survives navigation (uploads run in a shared worker/service context), collapse/expand, per-item cancel/retry.
- **Context menus:** right-click on cards/rows mirrors overflow menus.
- Rendering strategy: marketing pages SSG; app shell CSR with React Query cache; reveal pages SSR (fast first paint for recipients on slow devices, OG tags server-rendered).

---

*End of Part 2.*
