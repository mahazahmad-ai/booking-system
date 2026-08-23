import { db } from '../lib/db.js'
import { createBooking, cancelBooking } from '../lib/services/booking.service.js'
import { getDayAvailability } from '../lib/services/availability.service.js'
import { isoDateInZone, shiftIsoDate, localTimeInZone } from '../lib/time.js'

/**
 * Proves email actually leaves the building.
 *
 *   npx tsx --env-file=.env scripts/send-test-email.ts you@example.com
 *
 * Everything up to now verified the notification code path — that a row is written, that
 * duplicates are refused, that a failure never rolls back a booking. None of it proved a
 * message reaches an inbox. This does.
 *
 * Creates a real booking, waits for the send, reports what the provider said, then
 * cancels it (which sends a second email and frees the slot again).
 */

const TZ = 'Asia/Karachi'

async function cleanup(email: string) {
  const rows = await db.customer.findMany({
    where: { emailNorm: email.toLowerCase() },
    select: { id: true },
  })
  const ids = rows.map((r) => r.id)
  if (ids.length) {
    await db.booking.deleteMany({ where: { customerId: { in: ids } } })
    await db.customer.deleteMany({ where: { id: { in: ids } } })
  }
}

async function main() {
  const to = process.argv[2]
  if (!to || !to.includes('@')) {
    console.error('\nUsage: npx tsx --env-file=.env scripts/send-test-email.ts you@example.com\n')
    process.exit(1)
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('\nRESEND_API_KEY is not set in .env — nothing would be sent.\n')
    process.exit(1)
  }

  console.log(`\nSending a real booking confirmation to ${to}\n`)
  await cleanup(to)

  const today = isoDateInZone(TZ, new Date())
  const service = 'signature-facial'

  let date = ''
  let slot: Awaited<ReturnType<typeof getDayAvailability>>['slots'][number] | undefined
  for (let i = 2; i <= 14 && !slot; i++) {
    const candidate = shiftIsoDate(today, i)
    const availability = await getDayAvailability(service, candidate)
    if (availability.slots.length) {
      date = candidate
      slot = availability.slots[0]
    }
  }
  if (!slot) throw new Error('No availability in the next 14 days — reseed first.')

  const booking = await createBooking({
    service,
    staff: slot.staffIds[0],
    startsAt: slot.startsAt.toISOString(),
    name: 'Email Test',
    email: to,
    phone: '+92 300 0000000',
    note: 'This booking was created to test that email delivery works.',
  })

  console.log(`  booking   ${booking.reference}`)
  console.log(`  when      ${date} at ${localTimeInZone(TZ, booking.startsAt)}`)
  console.log(`  therapist ${booking.staffName}\n`)

  const row = await db.booking.findUniqueOrThrow({
    where: { reference: booking.reference },
    select: { id: true },
  })

  const logs = await db.notificationLog.findMany({
    where: { bookingId: row.id },
    select: { type: true, status: true, error: true, providerId: true },
  })

  console.log('  Notification log:')
  for (const log of logs) {
    const detail =
      log.status === 'SENT'
        ? `provider id ${log.providerId}`
        : log.status === 'FAILED'
          ? log.error?.slice(0, 120)
          : 'no provider configured'
    console.log(`    ${log.type.padEnd(18)} ${log.status.padEnd(8)} ${detail ?? ''}`)
  }

  const confirmation = logs.find((l) => l.type === 'CONFIRMATION')
  const ok = confirmation?.status === 'SENT'

  console.log(
    ok
      ? `\n  SENT. Check ${to} — including spam. The .ics invite is attached.\n`
      : `\n  NOT SENT. See the status above.\n`,
  )

  // Cancel, which sends a second email and releases the slot.
  if (ok) {
    console.log('  Cancelling, which should send a second email…')
    await cancelBooking(booking.manageToken, 'Test complete')
    const after = await db.notificationLog.findFirst({
      where: { bookingId: row.id, dedupeKey: 'CANCELLATION' },
      select: { status: true },
    })
    console.log(`    CANCELLATION       ${after?.status ?? 'missing'}\n`)
  }

  await cleanup(to)
  console.log('  Test booking removed from the database.\n')

  await db.$disconnect()
  process.exit(ok ? 0 : 1)
}

main().catch(async (e) => {
  console.error(e)
  await db.$disconnect()
  process.exit(1)
})
