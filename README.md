# Booking System

A booking engine for a single business with multiple staff and services. Customers book as
guests — no account — and see only genuinely free times. The owner runs the schedule from an
admin area.

Built so the same engine resells: a new client is new seed data plus a new token block in
`app/globals.css`. Nothing in the domain or the components changes.

**Status: Phases 0–6 complete. Feature-complete against the v1 spec.** Live database on
Neon (Singapore) with all constraints proven to fire, the availability engine unit-tested
including DST, a booking wizard that handles the 409 race, self-service cancel/reschedule
with email and calendar invites, a role-scoped admin area, and idempotent scheduled jobs.
Not yet deployed to Vercel.

```
npm test                 116 passed, 0 failed   — engine, .ics and token crypto, DST included
npm run db:verify         22 passed, 0 failed   — every DB guarantee exercised †
npm run db:verify-flow    12 passed, 0 failed   — booking write path, incl. the 409 race
npm run db:verify-manage  21 passed, 0 failed   — cancel + reschedule, incl. in-place move
npm run db:verify-admin   10 passed, 0 failed   — argon2id, roles, STAFF scoping
npm run db:verify-cron    11 passed, 0 failed   — reminders, close-out, idempotence
npm run db:bench          NFR-1 met             — 2 round trips, ~86 ms co-located p95
```

† `db:verify` requires an **unseeded** database — [C5] caps `Business` at one row, so its
fixture can't coexist with seed data. It refuses with a clear message rather than failing
obscurely.

**Admin:** `/login` · `owner@noorwellness.example` / `ChangeMe123!` (change before deploying)

## Before deploying

1. **Set `AUTH_SECRET`** to a real value (`npx auth secret`). Manage-token encryption is
   keyed from it — rotating it makes existing tokens undecryptable, so links in already-sent
   emails lose their manage button.
2. **Set `CRON_SECRET`.** The cron routes fail closed without it (503, not 200).
3. **Set `RESEND_API_KEY`** and start SPF/DKIM/DMARC DNS early — propagation takes hours.
4. **Pin the Vercel function region to `sin1`** (already in `vercel.json`) so functions sit
   beside the database. Leaving the `iad1` default turns a 4 ms round trip into 240 ms.
5. **Change the seeded admin password.**

> Email currently logs and records `SKIPPED` because `RESEND_API_KEY` is unset. That is the
> NFR-9 path working as designed: a missing or failing provider never rolls back a booking.

---

## Stack

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js (App Router, Turbopack) | 16.3.2 |
| UI | React | 19.2.8 |
| Language | TypeScript | 5.x |
| ORM | Prisma (ESM + driver adapters) | 7.9.1 |
| Database | PostgreSQL 17 on Neon | — |
| Styling | Tailwind CSS (CSS-first config) | 4.x |
| Validation | Zod | 4.x |
| Auth | Auth.js, JWT sessions | 5.0.0-beta.32 (pinned) |
| Email | Resend + React Email | 6.x |
| Rate limiting | Upstash Redis | 2.x |
| Tests | Vitest | 4.x |

---

## Getting started

```bash
npm install
cp .env.example .env      # then fill in the Neon connection strings
npm run db:generate
npm run dev
```

Two Neon connection strings are required and they are **not** interchangeable:

- `DATABASE_URL` — the **pooled** string (host contains `-pooler`). Used by the app at
  runtime. This is what prevents connection exhaustion when serverless functions cold-start.
- `DIRECT_URL` — the **unpooled** string. Used by the Prisma CLI for migrations, because
  PgBouncer's transaction mode cannot execute DDL.

Prisma 7 removed `directUrl` from the schema, so the split lives in `prisma.config.ts`.

### ⚠️ Never run `prisma db push`

The exclusion constraint that prevents double-booking, the trigger that keeps bookings off
time off, and every `CHECK` constraint exist **only** in hand-written migration SQL. `db push`
diffs the schema against the database and will drop all of them without comment.

Use `npm run db:migrate` and `npm run db:deploy`. There is deliberately no `db:push` script.

---

## Architecture

Layered so business rules never live inside a React component.

```
app/          routes — parse input, check session, render. No business rules, no Prisma.
lib/services/ orchestration — load data, call domain, open transactions, fire notifications.
lib/domain/   pure functions over plain values. No DB, no network, no Date.now().
lib/repositories/ every query and transaction boundary.
```

The payoff is `lib/domain/availability.ts`: because `computeSlots()` takes plain intervals and
returns plain intervals — with the current time passed in as an argument — the hardest logic in
the system is testable with no database, no network and no running clock. "What does this
return during a DST transition?" becomes a test you write, not a bug you discover in March.

### The two hard problems

1. **Computing real availability.** Derived on demand from working hours − time off − existing
   bookings. There is no table of free slots; stored slots drift.
2. **Preventing double-booking.** A Postgres `EXCLUDE` constraint over `(staffId, tstzrange)`
   makes the second concurrent insert impossible at the database level. Application-level
   checking cannot prevent it — between the check and the insert, the other request commits.

---

## Design tokens

Every colour in the app is semantic — `bg-canvas`, `text-ink-muted`, `border-line` — never
literal. The full palette is one `@layer base` block at the top of `app/globals.css`, in light
and dark. Re-theming for a new client means editing that block and nothing else.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest, once |
| `npm run coverage` | Vitest with coverage |
| `npm run db:migrate` | Create + apply a migration (dev) |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Prisma Studio |

---

## Roadmap

| Phase | What | Status |
|---|---|---|
| 0 | Toolchain, schema validated, deploy | **done locally** — not yet on Vercel |
| 1 | Migrations applied, constraints proven to fire, seed data | **done** — 22/22 constraint checks |
| 2 | Availability engine — pure domain, tests before implementation | **done** — 88 tests green |
| 3 | Public booking wizard, real booking creation, 409 handling | **done** — 12/12 flow checks |
| 4 | Email, `.ics`, self-service cancel/reschedule | **done** — 21/21 manage checks |
| 5 | Admin: auth, calendar, CRUD, settings | **done** — 10/10 auth + scoping checks |
| 6 | Cron, error states, SEO, polish | **done** — 11/11 cron checks |

Phase 2 comes before any booking UI on purpose. If the availability engine is wrong, every
piece of UI built on it gets reworked — and its bugs stay invisible until a real customer
arrives at the wrong hour.

---

## Documentation

- [`docs/GAP-ANALYSIS.md`](docs/GAP-ANALYSIS.md) — review of the v1.0 spec: 5 blockers,
  14 major and 10 minor findings, each with the fix applied. Worth reading before changing
  the schema or the availability engine.
