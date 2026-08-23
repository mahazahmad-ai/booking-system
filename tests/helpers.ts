import { wallToUtc, parseIsoDate, localTimeInZone, localMidnightUtc } from '@/lib/time'
import type { Interval } from '@/lib/domain/interval'
import type { SlotInput } from '@/lib/domain/availability'

/**
 * Test helpers that let the specs read in wall-clock terms.
 *
 * Availability bugs are reasoned about as "the 14:00 slot should be gone", never as
 * "the instant 1789..." — so the helpers convert, and the assertions stay legible.
 */

export const KARACHI = 'Asia/Karachi' // no DST, +05:00 year round
export const LONDON = 'Europe/London' // GMT/BST — the DST cases

/** A UTC instant from a local date and wall time. "24:00" rolls into the next day. */
export function at(isoDate: string, hhmm: string, tz: string = KARACHI): Date {
  const { year, month, day } = parseIsoDate(isoDate)
  const [h, m] = hhmm.split(':').map(Number)
  return wallToUtc(tz, year, month, day, h * 60 + m).instant
}

/** An interval from two wall times on the same local date. */
export function iv(isoDate: string, from: string, to: string, tz: string = KARACHI): Interval {
  return { start: at(isoDate, from, tz), end: at(isoDate, to, tz) }
}

/** An interval spanning two local dates — for the midnight-crossing cases. */
export function ivAcross(
  fromDate: string,
  from: string,
  toDate: string,
  to: string,
  tz: string = KARACHI,
): Interval {
  return { start: at(fromDate, from, tz), end: at(toDate, to, tz) }
}

/** Slots as readable local times: ['09:00', '09:15', …]. */
export function localTimes(slots: Date[], tz: string = KARACHI): string[] {
  return slots.map((s) => localTimeInZone(tz, s))
}

/**
 * A SlotInput with sensible defaults, overridable per test.
 *
 * `earliest` and `latest` default to wide open so a test that isn't about policy doesn't
 * have to think about it.
 */
export function slotInput(
  isoDate: string,
  over: Partial<SlotInput> = {},
  tz: string = KARACHI,
): SlotInput {
  return {
    working: [],
    blocked: [],
    durationMins: 30,
    bufferBeforeMins: 0,
    bufferAfterMins: 0,
    stepMins: 15,
    gridAnchor: localMidnightUtc(tz, isoDate),
    earliest: new Date('1970-01-01T00:00:00Z'),
    latest: new Date('2100-01-01T00:00:00Z'),
    ...over,
  }
}
