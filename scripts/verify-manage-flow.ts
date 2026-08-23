import { db } from '../lib/db.js'
import {
  createBooking,
  cancelBooking,
  rescheduleBooking,
  getBookingByToken,
} from '../lib/services/booking.service.js'
import { getDayAvailability } from '../lib/services/availability.service.js'
import { isoDateInZone, shiftIsoDate, localTimeInZone } from '../lib/time.js'
import { BookingError } from '../lib/errors.js'

/**
 * Phase 4 — self-service management, verified against the real database.
 *
 * The interesting claim is [A2]: reschedule updates the row IN PLACE, so the reference and
 * the manage link survive, the exclusion constraint validates the new time on UPDATE, and
 * the previous slot is released without a cleanup job.
 *
 *   npm run db:verify-manage
 */

const TZ = 'Asia/Karachi'
let passed = 0
let failed = 0

function check(ok: boolean, label: string, detail = '') {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(54)}${detail}`)
}

const customer = { name: 'Manage Test', email: 'manage.test@example.com', phone: '+92 300 1111111' }

async function cleanup() {
  const rows = await db.customer.findMany({
    where: { emailNorm: 'manage.test@example.com' },
    select: { id: true },
  })
  const ids = rows.map((r) => r.id)
  if (ids.length) {
    await db.booking.deleteMany({ where: { customerId: { in: ids } } })
    await db.customer.deleteMany({ where: { id: { in: ids } } })
  }
}

async function main() {
  console.log('\nVerifying self-service cancel and reschedule\n')
  await cleanup()

  const today = isoDateInZone(TZ, new Date())
  const service = 'signature-facial'

  // Two slots for ONE therapist, far enough apart that occupying one leaves the other
  // genuinely free. A 60-minute treatment with a 15-minute buffer occupies 75 minutes, so
  // adjacent 15-minute slots would block each other and the "old slot is free again"
  // assertion would fail for entirely correct reasons.
  const SEPARATION_MS = 120 * 60_000

  let date = ''
  let staffId = ''
  let first: Awaited<ReturnType<typeof getDayAvailability>>['slots'][number] | undefined
  let second: typeof first

  for (let i = 3; i <= 12 && !date; i++) {
    const candidate = shiftIsoDate(today, i)
    const all = await getDayAvailability(service, candidate)

    for (const id of new Set(all.slots.flatMap((s) => s.staffIds))) {
      const mine = all.slots.filter((s) => s.staffIds.includes(id))
      const a = mine[0]
      const b = mine.find((s) => s.startsAt.getTime() - a?.startsAt.getTime() >= SEPARATION_MS)
      if (a && b) {
        date = candidate
        staffId = id
        first = a
        second = b
        break
      }
    }
  }
  if (!date || !first || !second) {
    throw new Error('No day with two well-separated slots for one therapist — reseed first.')
  }
  console.log(
    `  ${date} · ${localTimeInZone(TZ, first.startsAt)} -> ${localTimeInZone(TZ, second.startsAt)}\n`,
  )

  // ── create ────────────────────────────────────────────────────────────────
  const booked = await createBooking({
    service,
    staff: staffId,
    startsAt: first.startsAt.toISOString(),
    ...customer,
  })
  const token = booked.manageToken
  check(Boolean(booked.reference), 'booking created', booked.reference)

  const fetched = await getBookingByToken(token)
  check(fetched?.reference === booked.reference, 'manage token resolves the booking')
  check((await getBookingByToken('not-a-real-token')) === null, 'a wrong token resolves to nothing')

  // ── confirmation notification (no provider configured) ────────────────────
  const confirmLog = await db.notificationLog.findFirst({
    where: { bookingId: fetched!.id, dedupeKey: 'CONFIRMATION' },
  })
  check(Boolean(confirmLog), 'confirmation logged', confirmLog?.status ?? '—')
  check(
    confirmLog?.status === 'SKIPPED' || confirmLog?.status === 'SENT',
    'email outcome recorded, booking unaffected (NFR-9)',
    'no provider key set',
  )

  // ── reschedule ────────────────────────────────────────────────────────────
  const before = fetched!
  await rescheduleBooking(token, second.startsAt)
  const moved = await getBookingByToken(token)

  check(moved?.reference === before.reference, 'reference survives the move (A2)', before.reference)
  check(moved?.manageTokenHash === before.manageTokenHash, 'manage link keeps working')
  check(
    moved?.startsAt.getTime() === second.startsAt.getTime(),
    'appointment moved',
    `${localTimeInZone(TZ, before.startsAt)} -> ${localTimeInZone(TZ, moved!.startsAt)}`,
  )
  check(moved!.icsSequence > before.icsSequence, 'icsSequence incremented (B13)', `${before.icsSequence} -> ${moved!.icsSequence}`)
  check(moved!.rescheduleCount === 1, 'reschedule counted')

  const history = await db.bookingHistory.findMany({ where: { bookingId: before.id } })
  const moveRow = history.find((h) => h.changeType === 'RESCHEDULED')
  check(
    moveRow?.fromStartsAt?.getTime() === first.startsAt.getTime(),
    'history keeps the original slot',
    'BookingHistory row written',
  )

  const afterMove = await getDayAvailability(service, date, { staffId })
  check(
    afterMove.slots.some((s) => s.startsAt.getTime() === first.startsAt.getTime()),
    'the old slot is free again',
  )
  check(
    !afterMove.slots.some((s) => s.startsAt.getTime() === second.startsAt.getTime()),
    'the new slot is now taken',
  )

  // ── reschedule onto an occupied slot ──────────────────────────────────────
  const blocker = await createBooking({
    service,
    staff: staffId,
    startsAt: first.startsAt.toISOString(),
    name: 'Blocker',
    email: 'manage.test@example.com',
    phone: '+92 300 2222222',
  })
  try {
    await rescheduleBooking(token, first.startsAt)
    check(false, 'moving onto a taken slot', 'ACCEPTED — double booking!')
  } catch (e) {
    check(
      e instanceof BookingError && e.code === 'SLOT_TAKEN',
      'moving onto a taken slot is refused',
      e instanceof BookingError ? `${e.code} / ${e.status}` : 'unexpected',
    )
  }
  void blocker

  // ── cancel ────────────────────────────────────────────────────────────────
  await cancelBooking(token, 'Testing')
  const cancelled = await getBookingByToken(token)

  check(cancelled?.status === 'CANCELLED', 'cancelled')
  check(Boolean(cancelled?.cancelledAt), 'cancelledAt recorded (CHECK constraint)')
  check(cancelled?.cancelReason === 'Testing', 'reason stored')

  const afterCancel = await getDayAvailability(service, date, { staffId })
  check(
    afterCancel.slots.some((s) => s.startsAt.getTime() === second.startsAt.getTime()),
    'cancelling frees the slot with no cleanup job',
  )

  const cancelLog = await db.notificationLog.findFirst({
    where: { bookingId: before.id, dedupeKey: 'CANCELLATION' },
  })
  check(Boolean(cancelLog), 'cancellation notification logged', cancelLog?.status ?? '—')

  // ── idempotency ───────────────────────────────────────────────────────────
  const again = await cancelBooking(token, 'Again')
  check(again.reference === before.reference, 'cancelling twice is harmless')

  const logCount = await db.notificationLog.count({
    where: { bookingId: before.id, dedupeKey: 'CANCELLATION' },
  })
  check(logCount === 1, 'no duplicate notification row (B6)', `${logCount} row`)

  await cleanup()
  console.log(`\n${passed} passed, ${failed} failed   (test data removed)\n`)
  await db.$disconnect()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(e)
  await cleanup().catch(() => {})
  await db.$disconnect()
  process.exit(1)
})
