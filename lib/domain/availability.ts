import {
  addMins,
  mergeIntervals,
  subtractAll,
  MINUTE_MS,
  type Interval,
} from '@/lib/domain/interval'

/**
 * The availability engine.
 *
 * Pure: no Prisma, no network, no Date.now(). The current time arrives as `earliest`,
 * already offset by the business's minimum lead time. That is what makes "what does this
 * return during a DST transition?" a test you write rather than a bug you discover in
 * March.
 *
 * Availability is DERIVED, never stored. There is no table of free slots — free time is
 * computed on demand from working hours − time off − existing bookings. Stored slots have
 * to be kept in sync forever, and they drift.
 */

export type SlotInput = {
  /** Working hours for one staff member on one day, already resolved to UTC. */
  working: Interval[]

  /**
   * Everything that blocks time: time off, business closures, and existing bookings.
   * Booking intervals must be the BLOCK range (buffers included), not the appointment
   * range — `blockStartsAt`/`blockEndsAt`, not `startsAt`/`endsAt`.
   */
  blocked: Interval[]

  /** The customer-facing treatment length. Buffers are separate. */
  durationMins: number

  /** Occupied before the appointment starts (setup, travel). */
  bufferBeforeMins: number

  /** Occupied after it ends (cleanup, notes). */
  bufferAfterMins: number

  /** Grid step for offered start times — Business.slotIntervalMins. */
  stepMins: number

  /**
   * Local midnight of the day being computed, as a UTC instant. The grid steps from here
   * so offered times land on clean local values in every zone, including the half-hour
   * and three-quarter-hour ones. See lib/time.ts → localMidnightUtc.
   */
  gridAnchor: Date

  /** now + minLeadTimeMins. Slots before this are not offered. */
  earliest: Date

  /** End of the booking window — now + bookingWindowDays. */
  latest: Date
}

/** Round `instant` up onto the grid defined by `anchor` and `stepMins`. */
export function ceilToStep(instant: Date, anchor: Date, stepMins: number): Date {
  const step = stepMins * MINUTE_MS
  const delta = instant.getTime() - anchor.getTime()
  return new Date(anchor.getTime() + Math.ceil(delta / step) * step)
}

/**
 * Bookable start times, as customer-facing instants.
 *
 * A start is offered only when the ENTIRE blocked window — buffer before, treatment,
 * buffer after — fits inside one continuous free interval. Stepping the grid every 15
 * minutes is not the same as offering every 15-minute mark, and that is the rule that
 * catches people out: with 30 minutes of work and only 15 minutes left before the next
 * booking, 12:45 is not a slot.
 */
export function computeSlots(input: SlotInput): Date[] {
  const {
    durationMins,
    bufferBeforeMins,
    bufferAfterMins,
    stepMins,
    gridAnchor,
    earliest,
    latest,
  } = input

  if (stepMins <= 0) throw new Error('stepMins must be positive')
  if (durationMins <= 0) throw new Error('durationMins must be positive')
  if (bufferBeforeMins < 0 || bufferAfterMins < 0) {
    throw new Error('buffers must not be negative')
  }

  const free = subtractAll(mergeIntervals(input.working), input.blocked)
  const tailMins = durationMins + bufferAfterMins
  const out: Date[] = []

  for (const gap of free) {
    // The earliest customer-facing start whose leading buffer still fits in this gap,
    // then rounded up onto the grid.
    const firstPossible = addMins(gap.start, bufferBeforeMins)
    let cursor = ceilToStep(firstPossible, gridAnchor, stepMins)

    // The trailing buffer must fit too, or the staff member runs over into whatever
    // blocked this gap.
    while (addMins(cursor, tailMins).getTime() <= gap.end.getTime()) {
      if (cursor.getTime() >= earliest.getTime() && cursor.getTime() <= latest.getTime()) {
        out.push(cursor)
      }
      cursor = addMins(cursor, stepMins)
    }
  }

  return out
}

/** True if any slot exists — the month picker only needs this much (FR-C4). */
export function hasAnySlot(input: SlotInput): boolean {
  return computeSlots(input).length > 0
}

export type StaffSlots = { staffId: string; slots: Date[] }

/** One offered start time, and everyone who could serve it. */
export type MergedSlot = { startsAt: Date; staffIds: string[] }

/**
 * Union slots across qualified staff for "any available" (FR-C2).
 *
 * Carrying every candidate staff id — rather than picking one here — is what lets the
 * booking service retry against the next candidate when the exclusion constraint rejects
 * the first. Without it, a customer is told "just taken" while a colleague is still free
 * at that exact time. See docs/GAP-ANALYSIS.md [B10].
 */
export function mergeStaffSlots(perStaff: StaffSlots[]): MergedSlot[] {
  const byInstant = new Map<number, string[]>()

  for (const { staffId, slots } of perStaff) {
    for (const slot of slots) {
      const key = slot.getTime()
      const ids = byInstant.get(key)
      if (ids) {
        if (!ids.includes(staffId)) ids.push(staffId)
      } else {
        byInstant.set(key, [staffId])
      }
    }
  }

  return [...byInstant.entries()]
    .sort(([a], [b]) => a - b)
    .map(([time, staffIds]) => ({ startsAt: new Date(time), staffIds }))
}
