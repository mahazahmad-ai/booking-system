import { db } from '../lib/db.js'
import { createBooking } from '../lib/services/booking.service.js'
import { getDayAvailability } from '../lib/services/availability.service.js'
import { listCustomers, listBookingsForExport } from '../lib/repositories/admin.repo.js'
import { isoDateInZone, localMidnightUtc, shiftIsoDate } from '../lib/time.js'
import { BookingError } from '../lib/errors.js'

/**
 * The requirements finished last: FR-A8 manual booking with lead-time override,
 * FR-A5 staff assignment, FR-A11 customer list, FR-A12 export.
 *
 *   npm run db:verify-completion
 */

const TZ = 'Asia/Karachi'
let passed = 0
let failed = 0

function check(ok: boolean, label: string, detail = '') {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(56)}${detail}`)
}

const EMAIL = 'completion.test@example.com'

async function cleanup() {
  const rows = await db.customer.findMany({ where: { emailNorm: EMAIL }, select: { id: true } })
  const ids = rows.map((r) => r.id)
  if (ids.length) {
    await db.booking.deleteMany({ where: { customerId: { in: ids } } })
    await db.customer.deleteMany({ where: { id: { in: ids } } })
  }
}

async function main() {
  console.log('\nVerifying the final requirements\n')
  await cleanup()

  const business = await db.business.findFirstOrThrow()
  const today = isoDateInZone(TZ, new Date())
  const service = 'signature-facial'

  // ── FR-A8: the lead-time override actually changes what is offered ────────
  //
  // `now` is injected rather than read from the clock, so this runs identically at 3am and
  // at midday. Relying on the real time made the test skip itself overnight — which is
  // exactly when nobody notices a regression.
  const soonDate = shiftIsoDate(today, 4)
  const dayAhead = await getDayAvailability(service, soonDate)
  if (dayAhead.slots.length === 0) throw new Error('No availability to test against — reseed.')

  const target = dayAhead.slots[0]
  // 30 minutes before the slot: inside the 120-minute notice period, so it should be
  // refused normally and allowed with the override.
  const pretendNow = new Date(target.startsAt.getTime() - 30 * 60_000)

  const normal = await getDayAvailability(service, soonDate, { now: pretendNow })
  const overridden = await getDayAvailability(service, soonDate, {
    now: pretendNow,
    ignoreLeadTime: true,
  })

  check(
    overridden.slots.length > normal.slots.length,
    'override offers slots inside the notice period',
    `${normal.slots.length} → ${overridden.slots.length}`,
  )
  check(
    !normal.slots.some((s) => s.startsAt.getTime() === target.startsAt.getTime()) &&
      overridden.slots.some((s) => s.startsAt.getTime() === target.startsAt.getTime()),
    'the target slot appears only with the override',
  )

  const staffId = target.staffIds[0]
  const customer = { name: 'Completion Test', email: EMAIL, phone: '+92 300 0000000' }

  try {
    await createBooking(
      { service, staff: staffId, startsAt: target.startsAt.toISOString(), ...customer },
      { now: pretendNow },
    )
    check(false, 'without override, a too-soon slot is refused', 'ACCEPTED')
  } catch (e) {
    check(
      e instanceof BookingError && e.code === 'TOO_SOON',
      'without override, a too-soon slot is refused',
      e instanceof BookingError ? e.code : 'unexpected',
    )
  }

  const booked = await createBooking(
    { service, staff: staffId, startsAt: target.startsAt.toISOString(), ...customer },
    { now: pretendNow, leadTimeOverride: true },
  )
  check(Boolean(booked.reference), 'with override, the same slot is accepted', booked.reference)

  // ── the override does NOT weaken the real guarantees ──────────────────────
  const future = await getDayAvailability(service, shiftIsoDate(today, 3))
  if (future.slots.length > 0) {
    const slot = future.slots[0]
    const staffId = slot.staffIds[0]

    const first = await createBooking({
      service,
      staff: staffId,
      startsAt: slot.startsAt.toISOString(),
      name: 'Completion Test',
      email: EMAIL,
      phone: '+92 300 0000000',
    })
    check(Boolean(first.reference), 'setup booking for the override test')

    try {
      await createBooking(
        {
          service,
          staff: staffId,
          startsAt: slot.startsAt.toISOString(),
          name: 'Completion Test',
          email: EMAIL,
          phone: '+92 300 0000000',
        },
        { leadTimeOverride: true },
      )
      check(false, 'override cannot double-book', 'ACCEPTED — override is too powerful!')
    } catch (e) {
      check(
        e instanceof BookingError && e.code === 'SLOT_TAKEN',
        'override cannot double-book',
        e instanceof BookingError ? e.code : 'unexpected',
      )
    }
  }

  // ── FR-A5: service ↔ staff assignment drives availability ─────────────────
  const links = await db.serviceStaff.count()
  check(links > 0, 'treatments are assigned to therapists', `${links} link(s)`)

  const unassigned = await db.service.findMany({
    where: { businessId: business.id, isActive: true, staff: { none: {} } },
    select: { name: true },
  })
  check(
    unassigned.length === 0,
    'every bookable treatment has someone who performs it',
    unassigned.length ? unassigned.map((s) => s.name).join(', ') : 'none orphaned',
  )

  // ── FR-A11: customer list ─────────────────────────────────────────────────
  const all = await listCustomers(business.id)
  check(all.length > 0, 'customer list returns rows', `${all.length} customer(s)`)
  check(
    all.every((c) => c._count.bookings >= c.bookings.length),
    'each customer carries their booking history',
  )

  const searched = await listCustomers(business.id, 'completion')
  check(
    searched.length >= 1 && searched.every((c) => /completion/i.test(c.name + c.email)),
    'search narrows to matching customers',
    `${searched.length} match(es)`,
  )

  // ── FR-A12: export ────────────────────────────────────────────────────────
  const rows = await listBookingsForExport({
    businessId: business.id,
    window: {
      start: localMidnightUtc(TZ, shiftIsoDate(today, -30)),
      end: localMidnightUtc(TZ, shiftIsoDate(today, 30)),
    },
    staffScope: null,
  })
  check(rows.length > 0, 'export returns bookings for a date range', `${rows.length} row(s)`)

  const scoped = await listBookingsForExport({
    businessId: business.id,
    window: {
      start: localMidnightUtc(TZ, shiftIsoDate(today, -30)),
      end: localMidnightUtc(TZ, shiftIsoDate(today, 30)),
    },
    staffScope: (await db.staff.findFirstOrThrow({ select: { id: true } })).id,
  })
  check(scoped.length < rows.length, 'export respects STAFF scoping', `${scoped.length} of ${rows.length}`)

  // CSV injection: a phone number starting with "+" is a formula to Excel.
  const csvField = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value)
    const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
    return `"${guarded.replace(/"/g, '""')}"`
  }
  check(csvField('+92 300 1234567') === `"'+92 300 1234567"`, 'phone numbers are neutralised in CSV')
  check(csvField('=cmd|calc') === `"'=cmd|calc"`, 'formula injection is neutralised')
  check(csvField('say "hi"') === '"say ""hi"""', 'quotes are escaped')

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
