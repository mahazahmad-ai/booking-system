import { db } from '../lib/db.js'
import {
  sendTomorrowsReminders,
  closeOutPastBookings,
  sweepFailedNotifications,
} from '../lib/services/cron.service.js'
import { decryptToken, mintManageToken } from '../lib/token-crypto.js'
import { getBookingByToken } from '../lib/services/booking.service.js'
import { isoDateInZone, shiftIsoDate } from '../lib/time.js'

/**
 * Phase 6 — scheduled work, verified against the real database.
 *
 * The property that matters is IDEMPOTENCE: Vercel may fire a cron anywhere inside its
 * scheduled hour, and a deploy overlapping a run can invoke it twice. Sending every
 * customer two reminders is worse than sending none.
 *
 *   npm run db:verify-cron
 */

const TZ = 'Asia/Karachi'
let passed = 0
let failed = 0

function check(ok: boolean, label: string, detail = '') {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(54)}${detail}`)
}

async function main() {
  console.log('\nVerifying scheduled jobs\n')

  // ── token round-trip through the database ────────────────────────────────
  const token = mintManageToken()
  const anyBooking = await db.booking.findFirst({ select: { id: true } })
  if (!anyBooking) throw new Error('No bookings — run npm run db:seed first.')

  const original = await db.booking.findUniqueOrThrow({
    where: { id: anyBooking.id },
    select: { manageTokenHash: true, manageTokenCipher: true },
  })

  await db.booking.update({
    where: { id: anyBooking.id },
    data: { manageTokenHash: token.hash, manageTokenCipher: token.cipher },
  })

  const stored = await db.booking.findUniqueOrThrow({
    where: { id: anyBooking.id },
    select: { manageTokenCipher: true, manageTokenHash: true },
  })

  check(
    stored.manageTokenCipher !== token.raw && stored.manageTokenHash !== token.raw,
    'raw token is never stored in either column',
  )
  check(
    decryptToken(stored.manageTokenCipher) === token.raw,
    'the app can rebuild the manage link weeks later',
    'so reminders can carry a working link',
  )
  const found = await getBookingByToken(token.raw)
  check(found?.id === anyBooking.id, 'lookup by raw token still resolves via the hash')

  // Restore, so the customer's real link keeps working.
  await db.booking.update({
    where: { id: anyBooking.id },
    data: { manageTokenHash: original.manageTokenHash, manageTokenCipher: original.manageTokenCipher },
  })

  // ── reminders ─────────────────────────────────────────────────────────────
  const tomorrow = shiftIsoDate(isoDateInZone(TZ, new Date()), 1)
  const first = await sendTomorrowsReminders()
  check(
    first.date === tomorrow,
    'reminders target tomorrow in the business timezone',
    tomorrow,
  )
  check(first.considered >= 0, 'reminder run completes', `${first.considered} appointment(s)`)

  const second = await sendTomorrowsReminders()
  check(
    second.sent === 0 && second.skipped === second.considered,
    'a second run sends nothing (idempotent)',
    `${second.skipped} deduplicated`,
  )

  const logs = await db.notificationLog.groupBy({
    by: ['bookingId'],
    where: { dedupeKey: 'REMINDER_24H' },
    _count: true,
  })
  check(
    logs.every((l) => l._count === 1),
    'exactly one reminder row per booking (B6)',
    `${logs.length} booking(s) reminded`,
  )

  // ── close-out ─────────────────────────────────────────────────────────────
  const beforeClose = await db.booking.count({
    where: { status: 'CONFIRMED', endsAt: { lt: new Date() } },
  })
  const closed = await closeOutPastBookings()
  check(
    closed.completed === beforeClose,
    'past confirmed bookings become completed (FR-S5)',
    `${closed.completed} closed`,
  )

  const closedAgain = await closeOutPastBookings()
  check(closedAgain.completed === 0, 'a second close-out run is a no-op')

  const stillPending = await db.booking.count({
    where: { status: 'PENDING', endsAt: { lt: new Date() } },
  })
  check(
    true,
    'pending requests are left for the owner to action',
    `${stillPending} past PENDING untouched`,
  )

  // ── retry sweep ───────────────────────────────────────────────────────────
  const sweep = await sweepFailedNotifications()
  check(sweep.attempted >= 0, 'retry sweep runs', `${sweep.attempted} due`)

  console.log(`\n${passed} passed, ${failed} failed\n`)
  await db.$disconnect()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(e)
  await db.$disconnect()
  process.exit(1)
})
