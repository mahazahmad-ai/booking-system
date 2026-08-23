# Booking System — Gap Analysis of Spec v1.0

Reviewed: 2026-08-24. Target of review: *Booking System — Requirements & Architecture v1.0*, plus the
stack recommendation given alongside it.

Nothing has been built yet, so every finding here is cheap to fix. Several of them would be
expensive after Phase 3.

Severity key:

| | Meaning |
|---|---|
| **BLOCKER** | The spec as written cannot be implemented, or will ship a correctness bug. Fix before Phase 1. |
| **MAJOR** | Implementable, but a real defect or a missing requirement. Fix before the phase that depends on it. |
| **MINOR** | Worth doing; won't derail anything. |

Fixes are applied in `prisma/schema.prisma` and `prisma/migrations/20260824000000_init_constraints/migration.sql`
in this repo. Findings that are policy rather than schema are resolved in-line below.

---

## A. Blockers

### A1 — `bufferBefore` is never actually blocked. §6 and §7 contradict each other.

§6 says: *"Show the customer `startsAt + durationMins`; block the calendar with `endsAt`."*
That makes `startsAt` the customer's appointment time and `endsAt = startsAt + duration + bufferAfter`.
Under that reading `bufferBeforeMins` is stored, and then never blocks anything.

§7 step 5 says: *"Keep a start only if `start + bufferBefore + duration + bufferAfter` fits."*
That makes the slot start the beginning of the **blocked** period, so the customer's real
appointment time is `start + bufferBefore` — which is not what the API in §10 returns.

With `bufferBefore = 15`, one reading books the customer at 09:00 and the other at 09:15. Both are
defensible; shipping both is not. The overlap constraint in §8 depends on whichever answer you pick,
so this has to be settled before the schema exists.

**Fix — store both windows explicitly.** Four columns on `Booking`:

- `startsAt` / `endsAt` — the customer-facing appointment. This is what emails, the `.ics`, and the
  manage page show. `endsAt = startsAt + durationMins`.
- `blockStartsAt` / `blockEndsAt` — the occupied window including buffers.
  `blockStartsAt = startsAt - bufferBeforeMins`, `blockEndsAt = endsAt + bufferAfterMins`.

The exclusion constraint and every availability query use the **block** range. Everything
human-facing uses the **appointment** range. Buffer minutes are copied onto the booking so a later
service edit can't retroactively change what a past booking occupied.

Why two stored columns rather than computing the block range in the constraint expression: an
exclusion constraint is backed by an index, and index expressions must be `IMMUTABLE`.
`timestamptz - interval` is `STABLE`, not `IMMUTABLE` (interval arithmetic on `timestamptz` can
depend on the session `TimeZone`), so `tstzrange("startsAt" - make_interval(...), ...)` will be
rejected by Postgres. Stored columns, written by the service layer and guarded by `CHECK`
constraints, are the honest way to do this.

### A2 — Reschedule as "cancel + create carrying the reference forward" violates `reference @unique`.

§9 says reschedule is a cancel plus a create in one transaction, *"carrying the reference forward"*.
`Booking.reference` is `@unique`. Two rows cannot hold `BK-7Q4M2X`. The transaction fails on the
second insert, every time.

**Fix — reschedule updates the row in place, and writes a history record.**

`UPDATE` fires exclusion constraints exactly as `INSERT` does, so the new time is validated by the
same mechanism with no extra work. The reference stays stable, the manage token stays valid (so the
link in the customer's original email keeps working), and history stays honest because the previous
times are written to a new `BookingHistory` row. This is strictly simpler than the spec's version and
removes the contradiction rather than working around it.

New model `BookingHistory` added: `bookingId`, `changeType`, `fromStartsAt`, `fromStaffId`,
`toStartsAt`, `toStaffId`, `actor`, `createdAt`.

### A3 — Prisma 7 breaks the `lib/db.ts` and `datasource` setup I gave you earlier.

I gave you a singleton `PrismaClient` importing from `@prisma/client`, with `url` and `directUrl` in
the `datasource` block. **That is Prisma 6 shape and will not run on Prisma 7.** Confirmed against
Prisma's own v7 upgrade guide:

- **The client is no longer generated into `node_modules/@prisma/client`.** The `prisma-client`
  generator with an explicit `output` path is required, and you import from that path.
- **Driver adapters are mandatory** for every database. Postgres uses `@prisma/adapter-pg`.
- **Prisma 7 is ESM-only** — `"type": "module"` in `package.json`, `"module": "ESNext"` and
  `"moduleResolution": "bundler"` in `tsconfig.json`.
- **`url` / `directUrl` / `shadowDatabaseUrl` move out of `schema.prisma`** into a `prisma.config.ts`
  at the project root. **`directUrl` is removed outright in v7.**

That last point changes the pooled/direct story I gave you, so to be explicit about the corrected
split:

| | Connection | Used by |
|---|---|---|
| `prisma.config.ts` → `datasource.url` | **`DIRECT_URL`** (unpooled) | Prisma CLI, migrations. PgBouncer transaction mode cannot run DDL. |
| `lib/db.ts` → `PrismaPg({ connectionString })` | **`DATABASE_URL`** (pooled, `-pooler` host) | The app at runtime. This is what stops connection exhaustion. |

Written out in `prisma.config.ts` in this repo.

Corrected `lib/db.ts`:

```ts
import { PrismaClient } from '../prisma/generated/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
```

The pooled-vs-direct URL split is still correct and still necessary — PgBouncer transaction mode
can't run DDL. It just lives in `prisma.config.ts` now instead of the schema. Nail this down in
Phase 0; discovering it in Phase 1 costs a day.

### A4 — Vercel Hobby cron runs **once per day**. FR-N3 (24h reminder) cannot work on it.

Confirmed against Vercel's cron docs: on Hobby, any expression firing more than once a day
**fails at deploy time**, schedules are UTC only, and Vercel may invoke the job anywhere inside the
specified hour.

A once-daily job that fires at an unpredictable minute inside its hour cannot send "a reminder 24
hours before" with any precision. It also silently breaks FR-S5 close-out granularity.

**Fix — pick one, and decide now because it affects Phase 0 deployment:**

1. **Vercel Pro ($20/mo).** Unblocks minute-level cron. If a paying client exists, this is billed to
   them and the discussion ends here.
2. **Daily digest reminder (Hobby-compatible).** One job at ~08:00 business-time-equivalent UTC that
   reminds everyone with an appointment tomorrow. Change FR-N3 to read *"reminder the morning
   before"*, which is arguably better for customers than an exact-24h ping at 3am.
3. **External scheduler** (GitHub Actions `schedule:`, cron-job.org) hitting your existing
   secret-guarded route. Free, keeps the endpoint design unchanged.

Recommendation: **option 2 for the portfolio build** — it's a spec change, not a workaround, and it
removes a paid dependency from the demo. Switch to option 1 the moment a real client is on it.

### A5 — Availability is not enforced against `TimeOff`. Only booking-vs-booking is.

The §8 exclusion constraint covers `staffId` + overlapping bookings. It says nothing about time off.
So this sequence commits successfully:

1. Customer loads slots for Tuesday 14:00 — free.
2. Admin adds "Tuesday off, family emergency".
3. Customer clicks. App-level check ran at step 1. Insert succeeds. Staff member is booked on their
   day off.

The spec's own design principle — *the constraint can't be forgotten by a future feature, a manual
admin insert, or a seed script* — applies here just as much and was only applied to half the problem.

**Fix — a `BEFORE INSERT OR UPDATE` trigger on `Booking`** that rejects any `PENDING`/`CONFIRMED`
booking overlapping a `TimeOff` row for that staff member or a business-wide closure. In the
migration.

The reverse direction (admin adds time off over an existing booking) is deliberately **not** blocked —
the admin needs to be able to do that and then deal with the affected bookings. The admin UI warns
and lists what's affected; it does not refuse.

---

## B. Major

### B1 — The slot grid is anchored to the wrong origin.

`ceilToStep(gap.start, stepMins)` rounds relative to the Unix epoch. That happens to produce clean
local times only in whole-hour-offset zones. Asia/Karachi is UTC+5, so you'd never notice — but
Asia/Kolkata (+5:30), Asia/Kathmandu (+5:45) and Asia/Tehran (+3:30) would offer slots at 09:15 and
09:45 instead of 09:00 and 09:30. A 20- or 45-minute `slotIntervalMins` breaks in *every* zone.

**Fix — anchor the grid to local midnight of the business day**, passed into the pure function as
`gridAnchor: Date` so the domain layer still touches no clock and no timezone database.

```ts
export type SlotInput = {
  working:      Interval[]
  blocked:      Interval[]
  durationMins: number   // duration + bufferBefore + bufferAfter
  stepMins:     number
  gridAnchor:   Date     // NEW — local midnight of the business day, as a UTC instant
  earliest:     Date
  latest:       Date
}
```

`ceilToStep` becomes `gridAnchor + ceil((t - gridAnchor) / step) * step`.

### B2 — DST policy for nonexistent and ambiguous local times is undefined.

§7 correctly says clock times become UTC per date, and NFR-2 correctly identifies this as the
thing that will bite. But it never states what happens when the local time *doesn't exist* or exists
*twice*.

On spring-forward in Europe/London, 01:00–02:00 does not occur. On autumn-back, 01:00–02:00 occurs
twice. An `AvailabilityRule` of 01:30–09:00 is ambiguous on one date and impossible on the other. A
library will either throw, silently pick one, or return an offset you didn't expect — all three are
wrong to discover in March.

**Fix — write the policy into the domain layer and test it:**

- **Nonexistent local time** → clamp forward to the transition instant. A shift starting at 01:30 on
  spring-forward day starts at 02:00 wall clock (= the same UTC instant 01:00 would have been).
- **Ambiguous local time** → take the **first** (pre-transition, earlier UTC) occurrence. The
  business's 01:30 is the first 01:30.
- **A working block that spans a transition changes real duration.** That is correct and intended:
  09:00–17:00 is 7 real hours on spring-forward and 9 on autumn-back. Slots follow the wall clock,
  which is what the business and the customer both mean.

Add to the NFR-3 test list, alongside the cases already there.

### B3 — Overnight shifts can't be expressed, and cross-midnight bookings will be missed.

`AvailabilityRule.startMin`/`endMin` are minutes from local midnight, and nothing says what happens
when `endMin > 1440`. A 22:00–01:00 shift has no representation.

Separately, §7 step 1 resolves a day to a UTC window and then loads bookings — but a booking running
23:30→00:15 must block the *next* day's 00:00 slot. A `startsAt >= dayStart` filter misses it. (The
month-availability query I wrote earlier gets this right with `startsAt < end AND endsAt > start`;
the algorithm text in §7 does not say so.)

**Fix:**
- Constrain `0 <= startMin < endMin <= 1440` at the DB level, and require overnight shifts to be
  **split across two `dayOfWeek` rows** (Mon 1320–1440 + Tue 0–60). Interval merging already
  reassembles them into one continuous block, so the engine needs no special case.
- State the rule explicitly in §7: **every** load of bookings and time off is an overlap query
  (`blockStartsAt < windowEnd AND blockEndsAt > windowStart`), never a containment query. This is the
  single most commonly gotten-wrong line in the whole engine.

### B4 — `Service.requiresApproval` doesn't exist, so `PENDING` is unreachable.

§9 defines a `PENDING` state entered *"when the service requires approval"*, with its own email and a
`PENDING → CONFIRMED` admin transition. No field anywhere expresses that. The state is in the
lifecycle diagram, in the exclusion constraint predicate, and in the transition table — and cannot
be reached.

**Fix** — `Service.requiresApproval Boolean @default(false)`. Added.

### B5 — FR-S4 requires audit logging. There is no model for it.

*"Every admin mutation audit-logged with actor, action, timestamp"* appears as a system guarantee
with no table in §6.

**Fix** — `AuditLog` model added: `actorUserId`, `action`, `entityType`, `entityId`, `summary`,
`createdAt`, indexed on `[entityType, entityId]` and `[createdAt]`. Deliberately stores a text
summary rather than a full before/after diff — that's a v2 concern and JSON diffs rot.

### B6 — Reminder sending is not idempotent, and NFR-9's retry queue has no storage.

Two related holes:

- If the reminder cron is retried, double-invoked, or a deploy overlaps a run, customers get the same
  reminder twice. `NotificationLog` records that it happened but nothing prevents the second send.
- NFR-9 promises *"notification queued for retry"* on provider downtime. There is no queue, no
  attempt counter, and no next-attempt timestamp.

**Fix** — on `NotificationLog`: add `dedupeKey String` with `@@unique([bookingId, dedupeKey])`, plus
`attempts Int @default(0)` and `nextAttemptAt DateTime?`.

Dedupe keys are stable strings: `CONFIRMATION`, `REMINDER_24H`, `CANCELLATION`, `RESCHEDULE_2`. The
send path writes the log row **first** inside the booking transaction with `status = PENDING`, then
sends outside it. A unique violation on the dedupe key means "already sent, skip" — which makes the
cron safely re-runnable, and makes "queued for retry" a real thing (`status = FAILED`,
`nextAttemptAt` set, picked up by the next pass) rather than an aspiration.

### B7 — `x-forwarded-for` is client-controllable. The rate limit I gave you is bypassable.

```ts
const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'anon'
```

Taking the leftmost value of a header the client can send means an attacker rotates a header value
and the limit never triggers. That's FR-S3 present in the code and absent in effect.

**Fix** — on Vercel, prefer `x-real-ip` (set by the platform), and fall back to the **rightmost**
trusted entry of `x-forwarded-for`, never the leftmost:

```ts
function clientIp(req: Request): string {
  const real = req.headers.get('x-real-ip')
  if (real) return real
  const xff = req.headers.get('x-forwarded-for')
  if (!xff) return 'anon'
  const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
  return parts[parts.length - 1] ?? 'anon'   // rightmost = added by the trusted proxy
}
```

Also add a **second limit keyed on the submitted email address**, not just IP — one IP behind a
corporate NAT is many legitimate customers, and one attacker is many IPs. Email + IP together is the
pair that actually works.

### B8 — Manage token: raw at rest, and leaked by the `Referer` header.

Two separate problems with `/booking/[token]`:

- The token is stored in plaintext. A read-only leak of the `Booking` table hands over live
  cancel/reschedule access to every upcoming appointment.
- A secret in a **URL path** is sent in the `Referer` header of any outbound request the page makes,
  lands in server access logs, and is copy-pasteable out of a shared screenshot. NFR-7 says *"No PII
  in ... query strings"* but never addresses the secret that is in the path.

**Fix:**
- Store `manageTokenHash` (SHA-256 of the token) with `@unique`; look up by hash. The raw token
  exists only in the confirmation email. A 256-bit random token doesn't need a slow KDF — it isn't
  guessable — so a plain SHA-256 is correct here and stays fast.
- Send `Referrer-Policy: no-referrer` on the manage route, and load zero third-party assets on that
  page (no analytics, no external fonts, no map embeds).
- Add `manageTokenExpiresAt` so "dead after the appointment" is enforced by data rather than by
  remembering to write the check.

### B9 — `unstable_cache` is deprecated in Next 16; the caching code I gave you is the old model.

Confirmed: Next 16 promotes `cacheTag` and `cacheLife` to stable (no `unstable_` prefix) and replaces
`unstable_cache` with the `'use cache'` directive. The compiler derives the cache key from the
function's arguments and closure, so the manual key array disappears.

Corrected:

```ts
// lib/services/availability.service.ts
import { cacheTag, cacheLife } from 'next/cache'

export async function getDayAvailability(serviceId: string, date: string) {
  'use cache'
  cacheTag('availability', `availability:${serviceId}:${date}`)
  cacheLife({ revalidate: 60 })
  return computeDayAvailability(serviceId, date)
}
```

Two corrections beyond the API change:

- **Tag narrowly.** A single global `'availability'` tag means one booking invalidates every cached
  day for every service. Tag per service+date and invalidate only what the write touched.
- **Cached availability goes stale against `now`, not just against writes.** `earliest = now + leadTime`
  moves every second; a 60-second cache can keep offering a slot that has just fallen inside the
  minimum lead time. Fix by applying the lead-time filter **after** the cache, on the cached slot
  list, rather than baking `now` into the cached computation. Cache the expensive part (the interval
  maths); apply the cheap time-dependent filter fresh on every request.

### B10 — `requiresApproval` aside, "any available" gives up too early on a 409.

When a customer books "any available", the server picks one staff member at commit time. If that
person was taken a half-second ago, the exclusion constraint fires and — per the spec's service code —
the customer gets `SlotTakenError` and a refreshed list. But another qualified staff member may well
still be free at that exact time. The customer is told "gone" when it wasn't.

**Fix** — for `staffId: 'any'`, the service retries the insert against the remaining candidate
`staffIds` for that slot (bounded, in a stable order — least-loaded first) before surfacing a 409.
Only when every candidate collides is the slot genuinely gone. Small amount of code, meaningfully
better booking completion.

### B11 — `argon2` on Vercel, and the middleware/edge trap.

NFR-6 mandates argon2id. The common `argon2` package is a native addon: it inflates the serverless
bundle and cannot run in the Edge runtime. If Auth.js middleware ends up importing your auth config,
and that config imports the hasher, the build fails or the middleware crashes — a genuinely
confusing failure to debug.

**Fix** — use `@node-rs/argon2`, and **split the auth config**: `auth.config.ts` (edge-safe, providers
declared without the verify callback) for middleware, and `auth.ts` (Node runtime, imports the
hasher) for route handlers and server actions. This is the standard Auth.js v5 split and it exists
precisely for this reason.

### B12 — Credentials provider + Prisma adapter is a dead end.

Confirmed: **the Auth.js Credentials provider does not support database sessions.** It is JWT-only
without a hand-rolled workaround in the `jwt` callback.

Since FR-A1 is email+password, this means `@auth/prisma-adapter` buys you nothing — and the
`Account` / `Session` / `VerificationToken` models it requires are absent from §6 anyway, so the spec
was already implicitly assuming JWT without saying so.

**Fix** — state it: `session: { strategy: 'jwt' }`, no adapter, no adapter models. Fewer
dependencies and one less thing to get subtly wrong. Revisit only if you add OAuth staff login in v2.

### B13 — `.ics` on reschedule and cancel will create duplicate calendar entries.

FR-N1 attaches a `.ics`. FR-N4 requires reschedule and cancellation notices. Nothing specifies `UID`,
`SEQUENCE`, or `METHOD` — so the reschedule email's attachment is a *new* event to every calendar
client, and the customer ends up with the appointment twice, at two different times, with no
indication which is real.

**Fix:**
- `UID` = a value derived from `booking.id` and stable for the life of the booking. Never regenerate
  it. (This is a second, independent reason A2's update-in-place beats cancel-and-recreate — the row
  survives, so the UID naturally does too.)
- Increment a stored `icsSequence` on the booking for every change and emit it as `SEQUENCE`.
- `METHOD:REQUEST` for confirm and reschedule, `METHOD:CANCEL` for cancellation.
- `DTSTART`/`DTEND` in UTC (`...Z`). Correct everywhere, and sidesteps shipping a `VTIMEZONE` block.

### B14 — Email deliverability is unlisted work that can fail the whole product.

Resend on its default sending domain will land confirmations in spam for a meaningful share of
recipients. For a booking system, a confirmation that isn't read is indistinguishable from a booking
that didn't happen — it's a product failure, not an infrastructure detail. This appears nowhere in
the roadmap.

**Fix** — move domain verification (SPF, DKIM, DMARC on the sending subdomain) into **Phase 0**,
next to the deploy. DNS propagation is measured in hours, so starting it on day one costs nothing
and starting it in Phase 4 blocks Phase 4.

---

## C. Minor

### C1 — `priceCents` is the wrong name for the default currency.

Default currency is `PKR`, which has no circulating minor unit. "Cents" is misleading for PKR and
outright wrong for JPY, KRW, VND and ISK (zero-decimal currencies).

**Fix** — `priceMinor Int` + `currency String` + `currencyDecimals Int @default(2)` on `Business`,
with the seed setting `0` for PKR. Formatting reads the decimals; it never assumes 2.

### C2 — `Customer.email` is case-sensitive, so one person becomes two customers.

`@@unique([businessId, email])` treats `John@Example.com` and `john@example.com` as different people.
FR-A11 (customer history) then shows a split history, and the "match or create silently" behaviour
in §2 quietly creates duplicates.

**Fix** — store `emailNormalized` (lowercased, trimmed) and put the unique constraint on that. Keep
the original `email` for display, so their capitalisation is preserved in emails to them.

### C3 — §13 claims `businessId` is on every table. It isn't.

*"`businessId` is already on every table, so the model is ready [for multi-tenant]."* It's missing
from `TimeOff`, `AvailabilityRule`, `ServiceStaff`, `NotificationLog`, `AuditLog` and `User`. More
immediately: a business-wide closure is `TimeOff` with `staffId = null` and **no** `businessId`, so
in v1 it isn't scoped to anything at all.

**Fix** — `businessId` added to `TimeOff` (required — it's what makes a business-wide closure
meaningful) and to `AuditLog`. The rest reach a business through their parent, which is genuinely
fine; the claim in §13 just needs softening to "reachable from `businessId`".

### C4 — `Customer.businessId` has no foreign key.

It's declared as a bare scalar with no `business` relation field, so Prisma generates no FK and
nothing stops an orphaned customer. Same for the missing back-relations on `Business`.

**Fix** — relation fields added on both sides for `Customer` and `TimeOff`.

### C5 — Nothing enforces "one `Business` row in v1".

**Fix** — the seed writes a fixed, known id (`biz_default`), and a partial unique index caps the
table at one row. Cheap, and it means every query can safely assume the singleton until v2 removes
the index.

### C6 — Status transitions are unconstrained.

Any status can become any other. A `COMPLETED` booking can go back to `PENDING`, silently
re-occupying a past slot via the constraint predicate.

**Fix** — a `canTransition(from, to)` guard in `lib/domain/policy.ts` (pure, unit-testable, matching
the §9 diagram exactly), called by `updateBookingStatus`. Not a DB constraint — transition rules
change more often than schemas should.

### C7 — `Booking` has no `updatedAt`; `Customer` has no timestamps.

**Fix** — added.

### C8 — Missing index for the reminder query.

The cron selects by `status` + `startsAt` window across the business. `@@index([businessId, startsAt])`
covers it adequately at this scale — noting it here only so it isn't "fixed" away later.

### C9 — Changing a staff member's hours can orphan existing bookings.

Shrinking Tuesday from 09:00–17:00 to 09:00–13:00 leaves any 15:00 booking valid in the database and
invisible on the availability view.

**Fix** — not a constraint. `setWeeklyHours` computes the affected bookings and the admin UI
requires an explicit acknowledgement listing them. Blocking the edit would be worse; the admin
usually knows exactly what they're doing and will move the bookings next.

### C10 — Operational: never run `prisma db push` on this project.

The exclusion constraint, the time-off trigger and the `CHECK` constraints live only in hand-written
migration SQL. `db push` diffs the schema against the database and will drop all of them without
comment — silently removing the one guarantee the entire design rests on.

**Fix** — documented at the top of the migration, and `db push` kept out of every npm script.
`prisma migrate dev` / `migrate deploy` only.

---

## D. Things the spec got right and should not be "improved"

Worth recording, because these are the parts most likely to be second-guessed later:

- **Availability derived, never stored.** Correct, and the reason cancellation needs no cleanup job.
- **The exclusion constraint over an application-level check.** Correct, and correctly justified
  against `SELECT … FOR UPDATE`.
- **`'[)'` bounds.** Correct — back-to-back appointments must not collide.
- **Clock times for recurring rules, instants for bookings.** This is the single most important
  modelling decision in the document and it is right.
- **Price copied onto the booking.** Right.
- **Phase 2 (engine) before any UI.** Right, and the justification given is the real one.
- **Skipping TanStack Query.** Still right with Server Components.
- **Guest booking.** Right, and the drop-off argument is the correct reason.

---

## E. Revised build order

Only two changes from §12, both consequences of the above:

- **Phase 0 gains:** Prisma 7 setup proven end-to-end (ESM + `prisma-client` generator + `@prisma/adapter-pg`
  + `prisma.config.ts`), Resend domain DNS submitted, and the cron decision from A4 made.
- **Phase 1 gains:** the trigger from A5 and the `CHECK` constraints, with a test that each one
  actually rejects what it should. A constraint nobody has seen fire is not yet known to work.

Phases 2–6 are unchanged.

**Not yet verified.** No dependencies are installed in this repo, so `prisma/schema.prisma`,
`prisma.config.ts` and the migration SQL have been written but not executed. The first three
commands of Phase 0, in order:

```bash
npx prisma validate                 # schema parses under the v7 prisma-client generator
npx prisma migrate dev --name init  # generated tables
psql "$DIRECT_URL" -f prisma/migrations/20260824000000_booking_constraints/migration.sql
```

Then prove the guarantees actually fire, because a constraint nobody has seen reject anything is
not yet known to work:

- two overlapping `CONFIRMED` bookings for one staff member → `23P01`
- back-to-back (one ends 14:00, next starts 14:00) → **accepted**
- a booking landing inside a `TimeOff` row → `BK001`
- the same, but a business-wide closure (`staffId = null`) → `BK001`
- cancelling the first booking, then re-inserting the overlapping one → **accepted**
- a second `Business` row → unique violation

---

## F. Open decisions for you

Everything above is fixed or has a stated recommendation, except these three, which are product
choices rather than engineering ones:

1. **A4 — cron.** Vercel Pro, daily-digest reminders, or an external scheduler.
   *Recommended: daily digest for the portfolio build.*
2. **A1 — buffer semantics.** Confirm the customer is booked at `startsAt` and buffers sit outside
   the appointment window. *Recommended: yes — it's what customers expect and what the emails say.*
3. **B8 — token lifetime.** After the appointment passes, is the manage page fully dead, or readable
   (receipt / rebook) but not mutable? *Recommended: readable for 30 days, mutations rejected.*
