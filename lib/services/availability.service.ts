import { computeSlots, mergeStaffSlots, type SlotInput } from '@/lib/domain/availability'
import { bookingBounds } from '@/lib/domain/policy'
import type { Interval } from '@/lib/domain/interval'
import {
  localMidnightUtc,
  localTimeInZone,
  shiftIsoDate,
  wallToUtc,
  parseIsoDate,
  dayOfWeekInZone,
} from '@/lib/time'
import {
  getBusinessWithService,
  getSchedulingData,
  type SchedulingData,
} from '@/lib/repositories/availability.repo'

/**
 * Orchestration: load data, call the pure domain, shape the response.
 *
 * No business rules live here — those are in lib/domain. No queries live here — those are
 * in lib/repositories. This layer only joins the two.
 */

export type Slot = {
  /** UTC instant, for the client to send back verbatim. */
  startsAt: Date
  /** Pre-formatted local time, so the client never does timezone maths. */
  local: string
  /** Everyone who could serve this slot — lets "any available" retry on a 409. */
  staffIds: string[]
}

export type DayAvailability = {
  date: string
  timezone: string
  serviceId: string
  durationMins: number
  slots: Slot[]
}

/** Working intervals for one staff member on one local date, resolved to UTC. */
function workingIntervalsFor(
  rules: { dayOfWeek: number; startMin: number; endMin: number }[],
  timezone: string,
  isoDate: string,
): Interval[] {
  const { year, month, day } = parseIsoDate(isoDate)
  const dow = dayOfWeekInZone(timezone, localMidnightUtc(timezone, isoDate))

  return rules
    .filter((r) => r.dayOfWeek === dow)
    .map((r) => ({
      start: wallToUtc(timezone, year, month, day, r.startMin).instant,
      end: wallToUtc(timezone, year, month, day, r.endMin).instant,
    }))
}

/** Blocked intervals for one staff member: time off, closures, and existing bookings. */
function blockedFor(data: SchedulingData, staffId: string): Interval[] {
  const blocked: Interval[] = []

  for (const t of data.timeOff) {
    if (t.staffId === null || t.staffId === staffId) {
      blocked.push({ start: t.startsAt, end: t.endsAt })
    }
  }
  for (const b of data.bookings) {
    if (b.staffId === staffId) {
      blocked.push({ start: b.blockStartsAt, end: b.blockEndsAt })
    }
  }
  return blocked
}

type Policy = {
  timezone: string
  slotIntervalMins: number
  minLeadTimeMins: number
  bookingWindowDays: number
  cancelWindowHours: number
}

type ServiceShape = {
  id: string
  durationMins: number
  bufferBeforeMins: number
  bufferAfterMins: number
}

function slotInputFor(
  isoDate: string,
  policy: Policy,
  service: ServiceShape,
  working: Interval[],
  blocked: Interval[],
  bounds: Interval,
): SlotInput {
  return {
    working,
    blocked,
    durationMins: service.durationMins,
    bufferBeforeMins: service.bufferBeforeMins,
    bufferAfterMins: service.bufferAfterMins,
    stepMins: policy.slotIntervalMins,
    gridAnchor: localMidnightUtc(policy.timezone, isoDate),
    earliest: bounds.start,
    latest: bounds.end,
  }
}

/**
 * Bookable start times for one local date.
 *
 * `now` is a parameter so this stays deterministic and testable. Callers pass the real
 * clock; a test passes a fixed instant.
 */
export async function getDayAvailability(
  serviceSlug: string,
  isoDate: string,
  options: { staffId?: string; now?: Date } = {},
): Promise<DayAvailability> {
  const now = options.now ?? new Date()
  const { business, service } = await getBusinessWithService(serviceSlug)

  const bounds = bookingBounds(now, business)
  // Widen the load window by a day either side so a booking that started yesterday and
  // runs past midnight still blocks this morning.
  const window: Interval = {
    start: localMidnightUtc(business.timezone, shiftIsoDate(isoDate, -1)),
    end: localMidnightUtc(business.timezone, shiftIsoDate(isoDate, 2)),
  }

  const data = await getSchedulingData({
    businessId: business.id,
    serviceId: service.id,
    staffId: options.staffId,
    window,
  })

  const perStaff = data.staff.map((staff) => ({
    staffId: staff.id,
    slots: computeSlots(
      slotInputFor(
        isoDate,
        business,
        service,
        workingIntervalsFor(staff.rules, business.timezone, isoDate),
        blockedFor(data, staff.id),
        bounds,
      ),
    ),
  }))

  return {
    date: isoDate,
    timezone: business.timezone,
    serviceId: service.id,
    durationMins: service.durationMins,
    slots: mergeStaffSlots(perStaff).map((s) => ({
      startsAt: s.startsAt,
      local: localTimeInZone(business.timezone, s.startsAt),
      staffIds: s.staffIds,
    })),
  }
}

export type DayFlag = { date: string; hasSlots: boolean }

/**
 * Which dates in a range have any availability at all (FR-C4 — grey out empty days).
 *
 * ONE set of queries for the whole range, then every day computed in memory. Looping
 * `getDayAvailability` per day would be 30 round trips for a month view.
 */
export async function getRangeAvailability(
  serviceSlug: string,
  startIsoDate: string,
  days: number,
  options: { staffId?: string; now?: Date } = {},
): Promise<DayFlag[]> {
  const now = options.now ?? new Date()
  const { business, service } = await getBusinessWithService(serviceSlug)

  const bounds = bookingBounds(now, business)
  const dates = Array.from({ length: days }, (_, i) => shiftIsoDate(startIsoDate, i))

  const window: Interval = {
    start: localMidnightUtc(business.timezone, shiftIsoDate(startIsoDate, -1)),
    end: localMidnightUtc(business.timezone, shiftIsoDate(startIsoDate, days + 1)),
  }

  const data = await getSchedulingData({
    businessId: business.id,
    serviceId: service.id,
    staffId: options.staffId,
    window,
  })

  return dates.map((date) => ({
    date,
    hasSlots: data.staff.some(
      (staff) =>
        computeSlots(
          slotInputFor(
            date,
            business,
            service,
            workingIntervalsFor(staff.rules, business.timezone, date),
            blockedFor(data, staff.id),
            bounds,
          ),
        ).length > 0,
    ),
  }))
}
