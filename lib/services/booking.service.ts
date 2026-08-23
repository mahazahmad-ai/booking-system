import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { hashToken, mintManageToken } from '@/lib/token-crypto'
import {
  bookingBounds,
  bookingWindows,
  canSelfCancel,
  canTransition,
  REFERENCE_ALPHABET,
} from '@/lib/domain/policy'
import { getDayAvailability } from '@/lib/services/availability.service'
import {
  sendBookingCancelled,
  sendBookingConfirmation,
  sendBookingRescheduled,
} from '@/lib/services/notification.service'
import { isoDateInZone, localTimeInZone } from '@/lib/time'
import {
  EXCLUSION_VIOLATION,
  TIME_OFF_CONFLICT,
  isSqlState,
  isUniqueViolation,
} from '@/lib/pg-error'
import { NotFoundError, PolicyError, SlotTakenError, TimeOffConflictError } from '@/lib/errors'
import type { CreateBookingInput } from '@/lib/validation/booking'

/**
 * Creating a booking.
 *
 * The one genuinely hard write in the system. Two customers can load the same slot list,
 * both see 14:00 free, and both click. Checking availability in application code and then
 * inserting cannot prevent that — between the check and the insert, the other request
 * commits. The database makes the second insert impossible; this file's job is to turn
 * that rejection into something a human can act on.
 */

export type CreatedBooking = {
  reference: string
  manageToken: string
  startsAt: Date
  endsAt: Date
  staffName: string
  serviceName: string
  requiresApproval: boolean
}

function generateReference(): string {
  const bytes = randomBytes(6)
  let out = ''
  for (const b of bytes) out += REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length]
  return `BK-${out}`
}

// Manage tokens are minted, hashed and encrypted in lib/token-crypto.ts — the hash for
// lookup, the ciphertext so later emails can rebuild the customer's link.

/**
 * Match a customer on normalised email, or create one.
 *
 * The email address IS the identity — there is no customer account. Matching on the
 * lowercased form stops "John@x.com" and "john@x.com" becoming two people with two
 * separate histories. [C2]
 */
async function upsertCustomer(
  tx: Pick<typeof db, 'customer'>,
  businessId: string,
  input: Pick<CreateBookingInput, 'name' | 'email' | 'phone'>,
) {
  const emailNorm = input.email.trim().toLowerCase()

  return tx.customer.upsert({
    where: { businessId_emailNorm: { businessId, emailNorm } },
    // Keep the latest name and phone; never overwrite internal notes.
    update: { name: input.name, phone: input.phone },
    create: {
      businessId,
      name: input.name,
      email: input.email.trim(),
      emailNorm,
      phone: input.phone,
    },
  })
}

/**
 * Create a booking, retrying across qualified staff when "any" was requested.
 *
 * `staff: 'any'` gives us a list of candidates for that instant. If the first collides
 * with a booking that landed a half-second ago, a colleague may still be free at exactly
 * that time — so we try the next candidate before telling the customer it's gone.
 * Reporting "just taken" while someone else is available is a lost booking. [B10]
 */
export async function createBooking(
  input: CreateBookingInput,
  options: { now?: Date; leadTimeOverride?: boolean } = {},
): Promise<CreatedBooking> {
  const now = options.now ?? new Date()
  const startsAt = new Date(input.startsAt)

  const business = await db.business.findFirst()
  if (!business) throw new Error('No business configured.')

  const service = await db.service.findFirst({
    where: { businessId: business.id, slug: input.service, isActive: true },
  })
  if (!service) throw new PolicyError('INVALID', 'That treatment is no longer offered.')

  // ── policy, before touching the database ─────────────────────────────────
  if (startsAt.getTime() <= now.getTime()) {
    throw new PolicyError('IN_PAST', 'That time has already passed. Please pick another.')
  }
  const bounds = bookingBounds(now, business)
  if (!options.leadTimeOverride && startsAt.getTime() < bounds.start.getTime()) {
    throw new PolicyError(
      'TOO_SOON',
      `Please book at least ${Math.round(business.minLeadTimeMins / 60)} hours ahead, or call us.`,
    )
  }
  if (startsAt.getTime() > bounds.end.getTime()) {
    throw new PolicyError(
      'TOO_FAR',
      `We only take bookings up to ${business.bookingWindowDays} days ahead.`,
    )
  }

  // ── which staff could serve this exact instant ───────────────────────────
  const date = isoDateInZone(business.timezone, startsAt)
  const availability = await getDayAvailability(input.service, date, {
    staffId: input.staff === 'any' ? undefined : input.staff,
    now,
  })

  const slot = availability.slots.find((s) => s.startsAt.getTime() === startsAt.getTime())
  if (!slot || slot.staffIds.length === 0) {
    // Not a collision — the slot was never on offer. Same message either way.
    throw new SlotTakenError()
  }

  const candidates =
    input.staff === 'any' ? slot.staffIds : slot.staffIds.filter((id) => id === input.staff)
  if (candidates.length === 0) throw new SlotTakenError()

  const windows = bookingWindows(
    startsAt,
    service.durationMins,
    service.bufferBeforeMins,
    service.bufferAfterMins,
  )

  // ── insert, letting the database arbitrate ───────────────────────────────
  let lastConflict: unknown = null

  for (const staffId of candidates) {
    const token = mintManageToken()

    try {
      const booking = await db.$transaction(async (tx) => {
        const customer = await upsertCustomer(tx, business.id, input)

        return tx.booking.create({
          data: {
            businessId: business.id,
            serviceId: service.id,
            staffId,
            customerId: customer.id,
            reference: generateReference(),
            manageTokenHash: token.hash,
            manageTokenCipher: token.cipher,
            // Dies 30 days after the appointment, so a leaked link cannot live forever.
            manageTokenExpiresAt: new Date(windows.endsAt.getTime() + 30 * 864e5),
            ...windows,
            durationMins: service.durationMins,
            bufferBeforeMins: service.bufferBeforeMins,
            bufferAfterMins: service.bufferAfterMins,
            priceMinor: service.priceMinor,
            currency: business.currency,
            customerNote: input.note || null,
            // PENDING holds the slot while the owner approves. [B4]
            status: service.requiresApproval ? 'PENDING' : 'CONFIRMED',
          },
          include: { staff: { select: { name: true } } },
        })
      })

      // The booking is committed. Notifying is best-effort from here: a provider outage
      // must never undo an appointment the customer has already been told about (NFR-9).
      await sendConfirmationSafely(booking.id, token.raw, service.requiresApproval)

      return {
        reference: booking.reference,
        manageToken: token.raw,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        staffName: booking.staff.name,
        serviceName: service.name,
        requiresApproval: service.requiresApproval,
      }
    } catch (e) {
      // 23P01 — this staff member was taken between our read and our write. Try the next.
      if (isSqlState(e, EXCLUSION_VIOLATION)) {
        lastConflict = e
        continue
      }
      // BK001 — time off was added for this person while the customer was typing.
      if (isSqlState(e, TIME_OFF_CONFLICT)) {
        lastConflict = e
        continue
      }
      // Astronomically unlikely reference collision; a retry gets a fresh one.
      // isUniqueViolation, not isSqlState — Prisma reports these as P2002.
      if (isUniqueViolation(e)) {
        lastConflict = e
        continue
      }
      throw e
    }
  }

  if (lastConflict && isSqlState(lastConflict, TIME_OFF_CONFLICT)) {
    throw new TimeOffConflictError()
  }
  throw new SlotTakenError()
}

/** Everything the emails and the manage page need about a booking. */
const FULL_INCLUDE = {
  service: { select: { name: true, durationMins: true, slug: true } },
  staff: { select: { name: true } },
  customer: { select: { name: true, email: true, phone: true } },
  business: {
    select: {
      name: true,
      timezone: true,
      currency: true,
      currencyDecimals: true,
      // The full scheduling policy — reschedule re-checks lead time and booking window.
      slotIntervalMins: true,
      minLeadTimeMins: true,
      bookingWindowDays: true,
      cancelWindowHours: true,
    },
  },
} as const

const tokenHash = hashToken

/** Look a booking up by the raw token from the customer's email. */
export async function getBookingByToken(rawToken: string) {
  return db.booking.findUnique({
    where: { manageTokenHash: tokenHash(rawToken) },
    include: FULL_INCLUDE,
  })
}

/** Fire-and-forget notification. Errors are logged, never propagated. */
async function sendConfirmationSafely(
  bookingId: string,
  manageToken: string,
  requiresApproval: boolean,
) {
  try {
    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      include: FULL_INCLUDE,
    })
    if (!booking) return
    await sendBookingConfirmation({ ...booking, requiresApproval }, manageToken)
  } catch (e) {
    console.error('confirmation notification failed', { bookingId, error: String(e) })
  }
}

// ── self-service: cancel ─────────────────────────────────────────────────────

/**
 * Cancel via the manage link (FR-C8).
 *
 * Cancelling is a status change, not a delete. The row stays for history, and because the
 * exclusion constraint only covers PENDING and CONFIRMED, the slot reopens the instant
 * this commits — no cleanup job, no separate availability table to update.
 */
export async function cancelBooking(
  rawToken: string,
  reason: string | null,
  options: { now?: Date; byAdmin?: boolean } = {},
): Promise<{ reference: string }> {
  const now = options.now ?? new Date()
  const booking = await db.booking.findUnique({
    where: { manageTokenHash: tokenHash(rawToken) },
    include: FULL_INCLUDE,
  })
  if (!booking) throw new NotFoundError('We couldn’t find that appointment.')

  if (booking.status === 'CANCELLED') return { reference: booking.reference }
  if (!canTransition(booking.status, 'CANCELLED')) {
    throw new PolicyError('INVALID', 'This appointment can no longer be cancelled online.')
  }
  if (!options.byAdmin && !canSelfCancel(now, booking.startsAt, booking.business)) {
    throw new PolicyError(
      'CANCEL_WINDOW_CLOSED',
      `Cancellations need ${booking.business.cancelWindowHours} hours' notice. Please call us.`,
    )
  }

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        cancelReason: reason,
        icsSequence: { increment: 1 },
      },
      include: FULL_INCLUDE,
    })

    await tx.bookingHistory.create({
      data: {
        bookingId: booking.id,
        changeType: 'STATUS_CHANGED',
        fromStatus: booking.status,
        toStatus: 'CANCELLED',
        actor: options.byAdmin ? 'ADMIN' : 'CUSTOMER',
        reason,
      },
    })

    return row
  })

  try {
    await sendBookingCancelled(updated, rawToken, reason)
  } catch (e) {
    console.error('cancellation notification failed', { bookingId: booking.id, error: String(e) })
  }

  return { reference: updated.reference }
}

// ── self-service: reschedule ─────────────────────────────────────────────────

/**
 * Move an appointment (FR-C9).
 *
 * Updated IN PLACE, not cancelled and recreated. The spec's original "carry the reference
 * forward" would have violated the unique index on `reference`; updating avoids that
 * entirely, keeps the manage link working, and lets the same exclusion constraint validate
 * the new time — UPDATE fires it exactly as INSERT does. History goes to BookingHistory
 * so the original slot is still visible. See docs/GAP-ANALYSIS.md [A2].
 */
export async function rescheduleBooking(
  rawToken: string,
  newStartsAt: Date,
  options: { now?: Date; byAdmin?: boolean } = {},
): Promise<{ reference: string }> {
  const now = options.now ?? new Date()
  const booking = await db.booking.findUnique({
    where: { manageTokenHash: tokenHash(rawToken) },
    include: FULL_INCLUDE,
  })
  if (!booking) throw new NotFoundError('We couldn’t find that appointment.')

  if (booking.status !== 'CONFIRMED' && booking.status !== 'PENDING') {
    throw new PolicyError('INVALID', 'This appointment can no longer be changed online.')
  }
  if (!options.byAdmin && !canSelfCancel(now, booking.startsAt, booking.business)) {
    throw new PolicyError(
      'CANCEL_WINDOW_CLOSED',
      `Changes need ${booking.business.cancelWindowHours} hours' notice. Please call us.`,
    )
  }

  const bounds = bookingBounds(now, booking.business)
  if (newStartsAt.getTime() < bounds.start.getTime()) {
    throw new PolicyError('TOO_SOON', 'That time is too soon. Please choose another.')
  }
  if (newStartsAt.getTime() > bounds.end.getTime()) {
    throw new PolicyError('TOO_FAR', 'That time is beyond how far ahead we take bookings.')
  }

  const previousLabel = `${new Intl.DateTimeFormat('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: booking.business.timezone,
  }).format(booking.startsAt)}, ${localTimeInZone(booking.business.timezone, booking.startsAt)}`

  const windows = bookingWindows(
    newStartsAt,
    booking.durationMins,
    booking.bufferBeforeMins,
    booking.bufferAfterMins,
  )

  let updated
  try {
    updated = await db.$transaction(async (tx) => {
      const row = await tx.booking.update({
        where: { id: booking.id },
        data: {
          ...windows,
          icsSequence: { increment: 1 },
          rescheduleCount: { increment: 1 },
        },
        include: FULL_INCLUDE,
      })

      await tx.bookingHistory.create({
        data: {
          bookingId: booking.id,
          changeType: 'RESCHEDULED',
          fromStartsAt: booking.startsAt,
          fromEndsAt: booking.endsAt,
          fromStaffId: booking.staffId,
          toStartsAt: row.startsAt,
          toEndsAt: row.endsAt,
          toStaffId: row.staffId,
          actor: options.byAdmin ? 'ADMIN' : 'CUSTOMER',
        },
      })

      return row
    })
  } catch (e) {
    if (isSqlState(e, EXCLUSION_VIOLATION)) throw new SlotTakenError()
    if (isSqlState(e, TIME_OFF_CONFLICT)) throw new TimeOffConflictError()
    throw e
  }

  try {
    await sendBookingRescheduled(updated, rawToken, previousLabel)
  } catch (e) {
    console.error('reschedule notification failed', { bookingId: booking.id, error: String(e) })
  }

  return { reference: updated.reference }
}
