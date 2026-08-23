import type { ReactElement } from 'react'
import { Resend } from 'resend'
import { db } from '@/lib/db'
import { isUniqueViolation } from '@/lib/pg-error'
import { buildIcs, icsFilename, type IcsInput } from '@/lib/ics'
import { localTimeInZone } from '@/lib/time'
import { formatPrice } from '@/lib/utils'
import { brand } from '@/lib/brand'
import { decryptToken } from '@/lib/token-crypto'
import {
  BookingCancelled,
  BookingConfirmation,
  BookingReminder,
  BookingRescheduled,
  StaffAlert,
  type BookingEmailData,
} from '@/lib/email/templates/booking-emails'

/**
 * Sending mail, and remembering that we did.
 *
 * Two properties matter more than anything else here:
 *
 *   NEVER FATAL (NFR-9).  A booking is a commitment the customer has already made. If the
 *   email provider is down, the booking still stands and the notification is queued for
 *   retry. Nothing in this file throws into the caller.
 *
 *   IDEMPOTENT (B6).  The log row is written FIRST, with a unique (bookingId, dedupeKey).
 *   A duplicate key means "already handled, skip" — which is what makes the reminder cron
 *   safely re-runnable and stops a redeploy mid-run from mailing everyone twice.
 */

const resendKey = process.env.RESEND_API_KEY
const resend = resendKey ? new Resend(resendKey) : null
const FROM = process.env.EMAIL_FROM ?? 'Bookings <onboarding@resend.dev>'
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export type NotifyResult = 'sent' | 'skipped' | 'failed' | 'duplicate'

type NotifyArgs = {
  bookingId: string
  type: string
  dedupeKey: string
  to: string | string[]
  subject: string
  react: ReactElement
  ics?: { filename: string; content: string }
}

/** Backoff for the retry sweep: 1 min, 5, 25, 2 h, then give up at 5 attempts. */
function nextAttemptAt(attempts: number): Date | null {
  const delays = [60, 300, 1500, 7200]
  const delay = delays[attempts - 1]
  return delay ? new Date(Date.now() + delay * 1000) : null
}

export async function notify(args: NotifyArgs): Promise<NotifyResult> {
  // 1. Claim the send. A unique violation here means someone already did it.
  try {
    await db.notificationLog.create({
      data: {
        bookingId: args.bookingId,
        type: args.type,
        dedupeKey: args.dedupeKey,
        channel: 'EMAIL',
        status: 'PENDING',
      },
    })
  } catch (e) {
    if (isUniqueViolation(e)) return 'duplicate'
    // Even the bookkeeping failing must not take the booking down with it.
    console.error('notificationLog.create failed', { bookingId: args.bookingId })
    return 'failed'
  }

  const where = {
    bookingId_dedupeKey: { bookingId: args.bookingId, dedupeKey: args.dedupeKey },
  }

  // 2. No provider configured — record it honestly rather than pretending to send.
  if (!resend) {
    console.warn(
      `[email] RESEND_API_KEY not set — would have sent "${args.subject}" to ${String(args.to)}`,
    )
    await db.notificationLog.update({
      where,
      data: { status: 'SKIPPED', error: 'No email provider configured' },
    })
    return 'skipped'
  }

  // 3. Send.
  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: args.to,
      subject: args.subject,
      react: args.react,
      attachments: args.ics
        ? [{ filename: args.ics.filename, content: Buffer.from(args.ics.content).toString('base64') }]
        : undefined,
    })

    if (error) throw new Error(error.message)

    await db.notificationLog.update({
      where,
      data: { status: 'SENT', sentAt: new Date(), providerId: data?.id ?? null, attempts: 1 },
    })
    return 'sent'
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // Log the booking id, never the customer's address (NFR-7).
    console.error('[email] send failed', { bookingId: args.bookingId, type: args.type })
    await db.notificationLog.update({
      where,
      data: {
        status: 'FAILED',
        attempts: 1,
        error: message.slice(0, 500),
        nextAttemptAt: nextAttemptAt(1),
      },
    })
    return 'failed'
  }
}

// ── shaping booking rows into email props ───────────────────────────────────

type BookingForEmail = {
  id: string
  reference: string
  startsAt: Date
  endsAt: Date
  priceMinor: number
  currency: string
  customerNote: string | null
  icsSequence: number
  service: { name: string }
  staff: { name: string }
  customer: { name: string; email: string; phone: string | null }
  business: { name: string; timezone: string; currencyDecimals: number }
}

function labels(booking: BookingForEmail) {
  const tz = booking.business.timezone
  return {
    dateLabel: new Intl.DateTimeFormat('en', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: tz,
    }).format(booking.startsAt),
    timeLabel: `${localTimeInZone(tz, booking.startsAt)} – ${localTimeInZone(tz, booking.endsAt)} (${tz.replace('_', ' ')})`,
  }
}

function emailData(booking: BookingForEmail, manageToken: string): BookingEmailData {
  const { dateLabel, timeLabel } = labels(booking)
  return {
    businessName: booking.business.name,
    businessPhone: brand.phone,
    customerName: booking.customer.name,
    serviceName: booking.service.name,
    staffName: booking.staff.name,
    dateLabel,
    timeLabel,
    reference: booking.reference,
    manageUrl: `${SITE}/booking/${manageToken}`,
    priceLabel: formatPrice(
      booking.priceMinor,
      booking.currency,
      booking.business.currencyDecimals,
    ),
    note: booking.customerNote,
  }
}

function icsFor(
  booking: BookingForEmail,
  method: IcsInput['method'],
): { filename: string; content: string } {
  return {
    filename: icsFilename(booking.reference),
    content: buildIcs({
      bookingId: booking.id,
      reference: booking.reference,
      sequence: booking.icsSequence,
      method,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      summary: `${booking.service.name} — ${booking.business.name}`,
      description: `Reference ${booking.reference}. With ${booking.staff.name}.`,
      location: `${brand.address.line1}, ${brand.address.line2}, ${brand.address.city}`,
      organiserName: booking.business.name,
      organiserEmail: brand.email,
      attendeeName: booking.customer.name,
      attendeeEmail: booking.customer.email,
      now: new Date(),
    }),
  }
}

/** Everyone at the business who should hear about a booking change (FR-N2). */
async function staffRecipients(staffId: string): Promise<string[]> {
  const users = await db.user.findMany({
    where: { isActive: true, OR: [{ role: 'ADMIN' }, { staffId }] },
    select: { email: true },
  })
  return [...new Set(users.map((u) => u.email))]
}

// ── the notifications themselves ────────────────────────────────────────────

export async function sendBookingConfirmation(
  booking: BookingForEmail & { staffId: string; requiresApproval: boolean },
  manageToken: string,
): Promise<void> {
  const data = emailData(booking, manageToken)

  await notify({
    bookingId: booking.id,
    type: booking.requiresApproval ? 'APPROVAL_REQUEST' : 'CONFIRMATION',
    dedupeKey: 'CONFIRMATION',
    to: booking.customer.email,
    subject: booking.requiresApproval
      ? `Request received — ${data.serviceName}, ${data.dateLabel}`
      : `Confirmed — ${data.serviceName}, ${data.dateLabel}`,
    react: BookingConfirmation({ ...data, requiresApproval: booking.requiresApproval }),
    // No invite for an unapproved request — it isn't a commitment yet.
    ics: booking.requiresApproval ? undefined : icsFor(booking, 'REQUEST'),
  })

  const recipients = await staffRecipients(booking.staffId)
  if (recipients.length) {
    await notify({
      bookingId: booking.id,
      type: 'STAFF_ALERT',
      dedupeKey: 'STAFF_ALERT_NEW',
      to: recipients,
      subject: `New booking — ${data.dateLabel}, ${data.timeLabel.split(' ')[0]}`,
      react: StaffAlert({
        ...data,
        kind: 'NEW',
        customerEmail: booking.customer.email,
        customerPhone: booking.customer.phone,
      }),
    })
  }
}

export async function sendBookingCancelled(
  booking: BookingForEmail & { staffId: string },
  manageToken: string,
  reason: string | null,
): Promise<void> {
  const data = emailData(booking, manageToken)

  await notify({
    bookingId: booking.id,
    type: 'CANCELLATION',
    dedupeKey: 'CANCELLATION',
    to: booking.customer.email,
    subject: `Cancelled — ${data.serviceName}, ${data.dateLabel}`,
    react: BookingCancelled({ ...data, reason }),
    // METHOD:CANCEL withdraws the invite from the customer's calendar.
    ics: icsFor(booking, 'CANCEL'),
  })

  const recipients = await staffRecipients(booking.staffId)
  if (recipients.length) {
    await notify({
      bookingId: booking.id,
      type: 'STAFF_ALERT',
      dedupeKey: 'STAFF_ALERT_CANCELLED',
      to: recipients,
      subject: `Cancelled — ${data.dateLabel}`,
      react: StaffAlert({
        ...data,
        kind: 'CANCELLED',
        customerEmail: booking.customer.email,
        customerPhone: booking.customer.phone,
      }),
    })
  }
}

/**
 * FR-N3 — the reminder for tomorrow's appointments.
 *
 * The manage link is rebuilt by decrypting the stored token. If that fails — a booking
 * seeded before the cipher column existed, or a rotated AUTH_SECRET — the reminder still
 * goes out, just without the button. A missing link is a worse email; a thrown exception
 * is a missing email.
 */
export async function sendBookingReminder(
  booking: BookingForEmail & { manageTokenCipher: string | null },
): Promise<NotifyResult> {
  const rawToken = decryptToken(booking.manageTokenCipher)
  const data = emailData(booking, rawToken ?? '')

  return notify({
    bookingId: booking.id,
    type: 'REMINDER',
    // Stable key: re-running the cron, or a deploy overlapping a run, must not send twice.
    dedupeKey: 'REMINDER_24H',
    to: booking.customer.email,
    subject: `Tomorrow — ${data.serviceName} at ${data.timeLabel.split(' ')[0]}`,
    react: BookingReminder({
      ...data,
      manageUrl: rawToken ? data.manageUrl : `${SITE}/`,
    }),
  })
}

/**
 * NFR-9 — retry sends that failed while the provider was down.
 *
 * The booking already committed; this is the "queued for retry" half of that promise.
 * Gives up after 5 attempts rather than retrying a permanently bad address forever.
 */
export async function retryFailedNotifications(now = new Date()) {
  const due = await db.notificationLog.findMany({
    where: { status: 'FAILED', nextAttemptAt: { not: null, lte: now }, attempts: { lt: 5 } },
    select: { id: true, bookingId: true, type: true, dedupeKey: true, attempts: true },
    take: 50,
  })

  let recovered = 0
  let stillFailing = 0

  for (const row of due) {
    const booking = await db.booking.findUnique({
      where: { id: row.bookingId },
      relationLoadStrategy: 'join',
      include: {
        service: { select: { name: true } },
        staff: { select: { name: true } },
        customer: { select: { name: true, email: true, phone: true } },
        business: { select: { name: true, timezone: true, currencyDecimals: true } },
      },
    })
    if (!booking) continue

    // Clear the claim so notify() can re-create it, then re-send through the normal path.
    await db.notificationLog.delete({ where: { id: row.id } })

    const rawToken = decryptToken(booking.manageTokenCipher)
    const data = emailData(booking, rawToken ?? '')

    const result = await notify({
      bookingId: booking.id,
      type: row.type,
      dedupeKey: row.dedupeKey,
      to: booking.customer.email,
      subject: `${data.serviceName} — ${data.dateLabel}`,
      react: BookingConfirmation(data),
    }).catch(() => 'failed' as const)

    if (result === 'sent') recovered++
    else stillFailing++
  }

  return { attempted: due.length, recovered, stillFailing }
}

export async function sendBookingRescheduled(
  booking: BookingForEmail & { staffId: string },
  manageToken: string,
  previousLabel: string,
): Promise<void> {
  const data = emailData(booking, manageToken)

  await notify({
    bookingId: booking.id,
    type: 'RESCHEDULE',
    // Sequence-scoped, so a second reschedule sends a second email rather than
    // being silently swallowed as a duplicate.
    dedupeKey: `RESCHEDULE_${booking.icsSequence}`,
    to: booking.customer.email,
    subject: `Moved — ${data.serviceName} is now ${data.dateLabel}`,
    react: BookingRescheduled({ ...data, previousLabel }),
    ics: icsFor(booking, 'REQUEST'),
  })

  const recipients = await staffRecipients(booking.staffId)
  if (recipients.length) {
    await notify({
      bookingId: booking.id,
      type: 'STAFF_ALERT',
      dedupeKey: `STAFF_ALERT_RESCHEDULED_${booking.icsSequence}`,
      to: recipients,
      subject: `Moved — now ${data.dateLabel}`,
      react: StaffAlert({
        ...data,
        kind: 'RESCHEDULED',
        customerEmail: booking.customer.email,
        customerPhone: booking.customer.phone,
      }),
    })
  }
}
