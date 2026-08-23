import { db } from '../lib/db.js'
import { createBooking } from '../lib/services/booking.service.js'
import { getDayAvailability } from '../lib/services/availability.service.js'
import { isoDateInZone, shiftIsoDate, localTimeInZone } from '../lib/time.js'
import { BookingError } from '../lib/errors.js'

/**
 * End-to-end proof of the booking write path against the real database.
 *
 * The §8 race is the thing this system exists to get right, so it gets exercised for
 * real: book a slot, then try to book the same slot again and confirm the customer gets a
 * clean 409 rather than a second booking or a stack trace.
 *
 *   npm run db:verify-flow
 *
 * Every booking it creates is deleted at the end.
 */

const TZ = 'Asia/Karachi'
const created: string[] = []

let passed = 0
let failed = 0

function check(ok: boolean, label: string, detail = '') {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)}${detail}`)
}

function customer(n: number) {
  return {
    name: `Test Customer ${n}`,
    email: `test.customer.${n}@example.com`,
    phone: '+92 300 0000000',
  }
}

/**
 * Delete bookings BEFORE the customers they point at, and find them by customer rather
 * than by the ids we happened to track — a booking created by a path we didn't record
 * would otherwise block the customer delete with a foreign-key violation.
 */
async function cleanup() {
  const testCustomers = await db.customer.findMany({
    where: { emailNorm: { startsWith: 'test.customer.' } },
    select: { id: true },
  })
  const ids = testCustomers.map((c) => c.id)

  if (ids.length) await db.booking.deleteMany({ where: { customerId: { in: ids } } })
  if (created.length) await db.booking.deleteMany({ where: { id: { in: created } } })
  if (ids.length) await db.customer.deleteMany({ where: { id: { in: ids } } })
  created.length = 0
}

async function main() {
  console.log('\nVerifying the booking write path\n')
  await cleanup()

  const today = isoDateInZone(TZ, new Date())
  const service = 'signature-facial'

  // Find a day that actually has free slots.
  let date = ''
  let slots: Awaited<ReturnType<typeof getDayAvailability>>['slots'] = []
  for (let i = 2; i <= 12; i++) {
    const candidate = shiftIsoDate(today, i)
    const a = await getDayAvailability(service, candidate)
    if (a.slots.length >= 2) {
      date = candidate
      slots = a.slots
      break
    }
  }
  if (!date) throw new Error('No availability found in the next 12 days — reseed first.')

  console.log(`  using ${date} · ${slots.length} slots offered\n`)

  // ── the happy path ────────────────────────────────────────────────────────
  const target = slots.find((s) => s.staffIds.length === 1) ?? slots[0]
  const staffId = target.staffIds[0]
  const startsAt = target.startsAt.toISOString()

  const booking = await createBooking({
    service,
    staff: staffId,
    startsAt,
    ...customer(1),
  })
  const row = await db.booking.findUnique({ where: { reference: booking.reference } })
  if (row) created.push(row.id)

  check(Boolean(row), 'booking created', `${booking.reference} @ ${localTimeInZone(TZ, target.startsAt)}`)
  check(booking.manageToken.length >= 40, 'manage token issued', `${booking.manageToken.length} chars`)
  check(
    row?.blockEndsAt.getTime() === row!.endsAt.getTime() + 15 * 60_000,
    'buffer sits outside the appointment',
    'blockEndsAt = endsAt + 15 min',
  )

  // The raw token must NOT be what is stored.
  const stored = await db.booking.findUnique({
    where: { reference: booking.reference },
    select: { manageTokenHash: true },
  })
  check(
    stored?.manageTokenHash !== booking.manageToken,
    'only the token hash is stored',
    'raw token never persisted',
  )

  // ── §8: the same slot, again ──────────────────────────────────────────────
  try {
    await createBooking({ service, staff: staffId, startsAt, ...customer(2) })
    check(false, 'second booking for the same slot', 'ACCEPTED — double booking!')
  } catch (e) {
    check(
      e instanceof BookingError && e.code === 'SLOT_TAKEN' && e.status === 409,
      'second booking for the same slot',
      e instanceof BookingError ? `${e.code} / HTTP ${e.status}` : 'unexpected error',
    )
  }

  // ── the slot disappears from availability ─────────────────────────────────
  const after = await getDayAvailability(service, date, { staffId })
  check(
    !after.slots.some((s) => s.startsAt.getTime() === target.startsAt.getTime()),
    'slot no longer offered for that therapist',
    `${after.slots.length} slots remain`,
  )

  // ── cancelling releases the time ──────────────────────────────────────────
  await db.booking.update({
    where: { reference: booking.reference },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  })
  const afterCancel = await getDayAvailability(service, date, { staffId })
  check(
    afterCancel.slots.some((s) => s.startsAt.getTime() === target.startsAt.getTime()),
    'cancelling reopens the slot',
    'no cleanup job needed',
  )
  await db.booking.update({
    where: { reference: booking.reference },
    data: { status: 'CONFIRMED', cancelledAt: null },
  })

  // ── "any available" falls through to a free colleague ─────────────────────
  const shared = slots.find((s) => s.staffIds.length > 1)
  if (shared) {
    const anyBooking = await createBooking({
      service,
      staff: 'any',
      startsAt: shared.startsAt.toISOString(),
      ...customer(3),
    })
    const anyRow = await db.booking.findUnique({ where: { reference: anyBooking.reference } })
    if (anyRow) created.push(anyRow.id)
    check(Boolean(anyRow), '"any available" assigns a therapist', anyBooking.staffName)

    const second = await createBooking({
      service,
      staff: 'any',
      startsAt: shared.startsAt.toISOString(),
      ...customer(4),
    })
    const secondRow = await db.booking.findUnique({ where: { reference: second.reference } })
    if (secondRow) created.push(secondRow.id)
    check(
      secondRow !== null && secondRow.staffId !== anyRow?.staffId,
      'same instant falls through to a colleague',
      `${anyBooking.staffName} then ${second.staffName}`,
    )
  } else {
    console.log('  SKIP  no slot shared by two therapists on this day')
  }

  // ── policy is enforced server-side ────────────────────────────────────────
  // Policy is checked before availability, so these need no free slot — only an instant.
  // The lead-time case must be genuinely soon: "today at 09:00" can be half a day away.
  const now = Date.now()
  for (const [label, when, code] of [
    ['a time in the past', new Date(now - 864e5), 'IN_PAST'],
    ['inside the minimum lead time', new Date(now + 30 * 60_000), 'TOO_SOON'],
    ['beyond the booking window', new Date(now + 400 * 864e5), 'TOO_FAR'],
  ] as const) {
    try {
      await createBooking({
        service,
        staff: staffId,
        startsAt: when.toISOString(),
        ...customer(5),
      })
      check(false, `rejects ${label}`, 'ACCEPTED')
    } catch (e) {
      check(
        e instanceof BookingError && e.code === code,
        `rejects ${label}`,
        e instanceof BookingError ? e.code : 'unexpected error',
      )
    }
  }

  await cleanup()
  console.log(`\n${passed} passed, ${failed} failed   (test bookings removed)\n`)
  await db.$disconnect()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(e)
  await cleanup().catch(() => {})
  await db.$disconnect()
  process.exit(1)
})
