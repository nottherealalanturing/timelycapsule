# TimelyCapsule — Session Instructions

This folder contains the TimelyCapsule project. The complete product/technical plan lives in `plan/` and is the single source of truth — do not re-litigate its decisions.

## On every session start
1. Read `plan/PROGRESS.md` — it says which ticket is next and what's blocked.
2. Read `plan/00-INDEX.md` for orientation, then the sections of `plan/02-UX-DESIGN.md` / `plan/03-ARCHITECTURE.md` / `plan/04-ZERO-COST-PLAN.md` / `plan/06-FEATURE-ADDENDUM.md` relevant to the current ticket.
3. Execute the current ticket from `plan/05-BUILD-PLAYBOOK.md` exactly. Do not build ahead of the ticket. If a 🧑 HUMAN SETUP block is unmet, tell the user what to do and pause that part.

## On every session end (or after completing a ticket)
- Update `plan/PROGRESS.md`: ticket status, decisions made, blockers, setup checklist.
- Record any implementation choice the plan didn't specify in the Decisions log.

## Hard rules (from plan/00-INDEX.md — never violate)
- Capsule contents never reach servers in plaintext (zero-access E2E via packages/crypto).
- Sealed-content immutability enforced server-side.
- Postgres `scheduled_actions` is the only source of truth for future work.
- Recipient reveal works with no account/app on old phone browsers.
- Delivery of sealed capsules is never gated by payment state.
- Old code predating the plan (in timely-capsule-api/, timelycapsule/, timelycapsule-mobile/) is legacy — ignore it; the build starts fresh per T-01.
