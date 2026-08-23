/**
 * Interval arithmetic over UTC instants.
 *
 * Pure. No I/O, no Prisma, no Date.now(). Every function here takes plain values and
 * returns plain values, which is what makes the availability engine testable without a
 * database, a network or a running clock.
 *
 * All intervals are HALF-OPEN: [start, end). An interval ending at 14:00 and one starting
 * at 14:00 do not overlap. This matches the '[)' bound on the Postgres exclusion
 * constraint exactly — the two must agree, or the engine will offer slots the database
 * then rejects.
 */

export type Interval = { start: Date; end: Date }

export const MINUTE_MS = 60_000

export function addMins(date: Date, mins: number): Date {
  return new Date(date.getTime() + mins * MINUTE_MS)
}

export function minutesBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / MINUTE_MS
}

export function isEmpty(interval: Interval): boolean {
  return interval.end.getTime() <= interval.start.getTime()
}

/** Half-open overlap. Touching intervals do NOT overlap. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime()
}

/**
 * Sort, drop empties, and coalesce.
 *
 * Touching intervals are merged, not just overlapping ones. That matters for overnight
 * shifts: the schema requires them split across two weekday rows (Mon 22:00–24:00 +
 * Tue 00:00–01:00), and those two arrive here as touching intervals. Merging them means
 * a booking can straddle midnight without the engine needing a special case for it.
 */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((i) => !isEmpty(i))
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const out: Interval[] = []
  for (const current of sorted) {
    const last = out[out.length - 1]
    if (last && current.start.getTime() <= last.end.getTime()) {
      if (current.end.getTime() > last.end.getTime()) last.end = current.end
    } else {
      out.push({ start: current.start, end: current.end })
    }
  }
  return out
}

/** Remove `cut` from `base`. Returns 0, 1 or 2 intervals — 2 when the cut splits it. */
export function subtract(base: Interval, cut: Interval): Interval[] {
  if (isEmpty(base)) return []
  if (!overlaps(base, cut)) return [{ start: base.start, end: base.end }]

  const out: Interval[] = []
  if (cut.start.getTime() > base.start.getTime()) {
    out.push({ start: base.start, end: cut.start })
  }
  if (cut.end.getTime() < base.end.getTime()) {
    out.push({ start: cut.end, end: base.end })
  }
  return out
}

/**
 * Remove every `cut` from every `base`.
 *
 * This is the whole of "working hours minus time off minus existing bookings". Cuts are
 * merged first so overlapping blocks (a booking inside a half-day of leave) don't
 * fragment the result into slivers.
 */
export function subtractAll(bases: Interval[], cuts: Interval[]): Interval[] {
  const merged = mergeIntervals(cuts)
  let remaining = mergeIntervals(bases)

  for (const cut of merged) {
    const next: Interval[] = []
    for (const base of remaining) next.push(...subtract(base, cut))
    remaining = next
  }
  return remaining
}

/**
 * Clip intervals to a window. Used to keep a day's computation from being polluted by
 * the tail of a booking that started the previous day.
 */
export function clampAll(intervals: Interval[], window: Interval): Interval[] {
  const out: Interval[] = []
  for (const i of intervals) {
    if (!overlaps(i, window)) continue
    out.push({
      start: i.start.getTime() < window.start.getTime() ? window.start : i.start,
      end: i.end.getTime() > window.end.getTime() ? window.end : i.end,
    })
  }
  return out
}
