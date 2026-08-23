import { addMins, type Interval } from '@/lib/domain/interval'

/**
 * Scheduling policy — lead time, booking window, cancellation cutoff, and the booking
 * lifecycle.
 *
 * Pure, like the rest of lib/domain. The status union is declared locally rather than
 * imported from the generated Prisma client, so the domain layer stays free of any
 * database dependency and the tests need no schema.
 */

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'

export type SchedulingPolicy = {
  slotIntervalMins: number
  minLeadTimeMins: number
  bookingWindowDays: number
  cancelWindowHours: number
}

/**
 * The two statuses that occupy a staff member's time.
 *
 * This must stay identical to the WHERE predicate on the booking_no_overlap exclusion
 * constraint. If they ever diverge, the engine and the database disagree about what is
 * free — and the database wins, at the worst possible moment.
 */
export const TIME_HOLDING_STATUSES: readonly BookingStatus[] = ['PENDING', 'CONFIRMED']

export function holdsTime(status: BookingStatus): boolean {
  return TIME_HOLDING_STATUSES.includes(status)
}

/**
 * The window a customer may book inside, given the current time.
 *
 * `now` is passed in, never read. Callers hand it the real clock; tests hand it a fixed
 * instant.
 */
export function bookingBounds(now: Date, policy: SchedulingPolicy): Interval {
  return {
    start: addMins(now, policy.minLeadTimeMins),
    end: addMins(now, policy.bookingWindowDays * 24 * 60),
  }
}

/**
 * May the customer still cancel or reschedule themselves?
 *
 * Measured against the appointment start, not the blocked window — the customer's
 * deadline is relative to the time they were given, not to the staff member's prep.
 */
export function canSelfCancel(
  now: Date,
  appointmentStartsAt: Date,
  // Only the cancellation window matters here, so callers need not load the whole policy.
  policy: Pick<SchedulingPolicy, 'cancelWindowHours'>,
): boolean {
  const cutoff = addMins(appointmentStartsAt, -policy.cancelWindowHours * 60)
  return now.getTime() < cutoff.getTime()
}

/** Legal status transitions, exactly as drawn in §9 of the spec. */
const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
  // Terminal. Reopening a released booking would have to re-validate against the
  // exclusion constraint, and the slot may well be gone — the customer rebooks instead.
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
}

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export function allowedTransitions(from: BookingStatus): readonly BookingStatus[] {
  return TRANSITIONS[from]
}

export type BookingWindows = {
  startsAt: Date
  endsAt: Date
  blockStartsAt: Date
  blockEndsAt: Date
}

/**
 * Derive the four time columns on Booking from a chosen start.
 *
 * The ONLY place these are computed. The database has CHECK constraints asserting exactly
 * these relationships, so anything that writes a booking must come through here or it
 * will be rejected — which is the intent. See docs/GAP-ANALYSIS.md [A1].
 *
 *   startsAt / endsAt            what the customer was promised
 *   blockStartsAt / blockEndsAt  what the staff member's calendar actually loses
 */
export function bookingWindows(
  startsAt: Date,
  durationMins: number,
  bufferBeforeMins: number,
  bufferAfterMins: number,
): BookingWindows {
  const endsAt = addMins(startsAt, durationMins)
  return {
    startsAt,
    endsAt,
    blockStartsAt: addMins(startsAt, -bufferBeforeMins),
    blockEndsAt: addMins(endsAt, bufferAfterMins),
  }
}

/** Human-facing booking reference, e.g. "BK-7Q4M2X". */
export function formatReference(raw: string): string {
  return `BK-${raw.toUpperCase()}`
}

/**
 * Unambiguous alphabet for references: no I, O, 0, 1 — so a reference read aloud over
 * the phone or copied off a screen can't be mistyped.
 */
export const REFERENCE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
