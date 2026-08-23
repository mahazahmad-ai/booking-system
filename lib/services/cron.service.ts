import { db } from '@/lib/db'
import { isoDateInZone, localMidnightUtc, shiftIsoDate } from '@/lib/time'
import { sendBookingReminder, retryFailedNotifications } from '@/lib/services/notification.service'

/**
 * Scheduled work.
 *
 * All three jobs are IDEMPOTENT by construction, because Vercel may invoke a cron at any
 * point inside its scheduled hour and a deploy mid-run can cause an overlap. Reminders are
 * deduplicated by (bookingId, dedupeKey); close-out only ever moves CONFIRMED → COMPLETED,
 * so running it twice is a no-op.
 */

/**
 * FR-N3 — remind everyone with an appointment tomorrow.
 *
 * A morning digest rather than an exact 24-hour ping. Vercel's Hobby plan runs cron at
 * most once a day and may fire anywhere inside the scheduled hour, so "exactly 24 hours
 * before" is not achievable there — and arguably a morning reminder is better for the
 * customer than one at 3am. See docs/GAP-ANALYSIS.md [A4].
 */
export async function sendTomorrowsReminders(now = new Date()) {
  const business = await db.business.findFirst()
  if (!business) return { sent: 0, skipped: 0, failed: 0, considered: 0 }

  const tz = business.timezone
  const tomorrow = shiftIsoDate(isoDateInZone(tz, now), 1)

  const bookings = await db.booking.findMany({
    where: {
      businessId: business.id,
      status: 'CONFIRMED',
      startsAt: {
        gte: localMidnightUtc(tz, tomorrow),
        lt: localMidnightUtc(tz, shiftIsoDate(tomorrow, 1)),
      },
    },
    relationLoadStrategy: 'join',
    include: {
      service: { select: { name: true } },
      staff: { select: { name: true } },
      customer: { select: { name: true, email: true, phone: true } },
      business: { select: { name: true, timezone: true, currencyDecimals: true } },
    },
    orderBy: { startsAt: 'asc' },
  })

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const booking of bookings) {
    // One failing send must not abandon the rest of the run.
    const result = await sendBookingReminder(booking).catch(() => 'failed' as const)
    if (result === 'sent') sent++
    else if (result === 'duplicate' || result === 'skipped') skipped++
    else failed++
  }

  return { considered: bookings.length, sent, skipped, failed, date: tomorrow }
}

/**
 * FR-S5 — mark past confirmed appointments completed.
 *
 * Only CONFIRMED moves; PENDING is left alone because an unapproved request that was never
 * actioned is a thing the owner still needs to see, not something to quietly complete.
 */
export async function closeOutPastBookings(now = new Date()) {
  const result = await db.booking.updateMany({
    where: { status: 'CONFIRMED', endsAt: { lt: now } },
    data: { status: 'COMPLETED' },
  })
  return { completed: result.count }
}

/**
 * NFR-9 — retry notifications that failed while the provider was down.
 *
 * The booking already committed; this is the "queued for retry" half of that promise.
 */
export async function sweepFailedNotifications(now = new Date()) {
  return retryFailedNotifications(now)
}
