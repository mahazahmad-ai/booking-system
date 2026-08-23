import type { Interval } from '@/lib/domain/interval'

/**
 * Timezone boundary.
 *
 * The single place where wall-clock time becomes a UTC instant. Everything downstream —
 * the whole availability engine — works in UTC and never thinks about offsets again.
 *
 * Built on Intl, which reads the platform's IANA database, rather than on hand-rolled
 * offset arithmetic. Never add an offset by hand: that is the origin of nearly every
 * timezone bug in booking systems, and it surfaces as real people arriving an hour late.
 *
 * ── DST policy (NFR-2) ────────────────────────────────────────────────────────
 * Two local times a year are pathological, and the rules are stated here rather than
 * left to whatever the library happens to do:
 *
 *   Nonexistent  On spring-forward, 01:00–02:00 never happens. A rule starting at 01:30
 *                is CLAMPED FORWARD to the transition instant — so it begins at 02:00
 *                wall clock, the first moment that actually exists.
 *
 *   Ambiguous    On autumn-back, 01:00–02:00 happens twice. We take the FIRST (earlier
 *                UTC) occurrence. The business's 01:30 is the first 01:30.
 *
 * A working block spanning a transition genuinely changes length — 09:00–17:00 is 7 real
 * hours on spring-forward and 9 on autumn-back. That is correct and intended: slots
 * follow the wall clock, which is what the business and the customer both mean.
 */

export type WallResolution = 'exact' | 'ambiguous-first' | 'nonexistent-clamped'

export type LocalParts = {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  second: number
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23', // so midnight is 00, never 24
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatterCache.set(timeZone, f)
  }
  return f
}

/** The wall-clock fields an instant maps to in `timeZone`. */
export function localParts(timeZone: string, instant: Date): LocalParts {
  const v: Record<string, number> = {}
  for (const part of formatter(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') v[part.type] = Number(part.value)
  }
  return {
    year: v.year,
    month: v.month,
    day: v.day,
    hour: v.hour,
    minute: v.minute,
    second: v.second,
  }
}

/**
 * Offset of `timeZone` at `instant`, in milliseconds east of UTC.
 * Asia/Karachi is +5h year round; Europe/London alternates 0 and +1h.
 */
export function tzOffsetMs(timeZone: string, instant: Date): number {
  const p = localParts(timeZone, instant)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  // The formatter has second resolution, so compare against a second-aligned instant.
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/** First instant at or after `lo` whose offset differs from the offset at `lo`. */
function findTransition(timeZone: string, lo: number, hi: number): number {
  const offsetAtLo = tzOffsetMs(timeZone, new Date(lo))
  let before = lo
  let after = hi
  while (after - before > 1000) {
    const mid = before + Math.floor((after - before) / 2)
    if (tzOffsetMs(timeZone, new Date(mid)) === offsetAtLo) before = mid
    else after = mid
  }
  return after
}

/**
 * Turn a wall-clock time in `timeZone` into a UTC instant.
 *
 * `minutes` is minutes from local midnight, matching AvailabilityRule.startMin — so
 * 09:00 is 540. Values of 1440 and above roll into the following day, which is how a
 * working block ending at "24:00" resolves to the next midnight.
 */
export function wallToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  minutes: number,
): { instant: Date; resolution: WallResolution } {
  // The wall-clock fields read as though they were UTC. Not an instant yet — just a
  // number we solve for.
  const naive = Date.UTC(year, month - 1, day) + minutes * 60_000

  const localMsOf = (t: number) => t + tzOffsetMs(timeZone, new Date(t))

  // Candidates come from the offsets well BEFORE and well AFTER the naive value, not
  // from the naive value itself. Guessing from the naive value collapses both candidates
  // onto the same instant whenever its offset already matches the post-transition one —
  // which silently hides the earlier occurrence of an ambiguous autumn-back time.
  const HALF_DAY = 12 * 60 * 60_000
  const offsetBefore = tzOffsetMs(timeZone, new Date(naive - HALF_DAY))
  const offsetAfter = tzOffsetMs(timeZone, new Date(naive + HALF_DAY))

  const candidates = [...new Set([naive - offsetBefore, naive - offsetAfter])]
  const valid = candidates.filter((t) => localMsOf(t) === naive).sort((a, b) => a - b)

  if (valid.length === 1) {
    return { instant: new Date(valid[0]), resolution: 'exact' }
  }
  if (valid.length > 1) {
    // Autumn-back: this wall time occurs twice. Take the earlier one.
    return { instant: new Date(valid[0]), resolution: 'ambiguous-first' }
  }

  // Spring-forward: this wall time never happens. Clamp to the transition.
  const lo = Math.min(...candidates)
  const hi = Math.max(...candidates)
  return {
    instant: new Date(findTransition(timeZone, lo, hi)),
    resolution: 'nonexistent-clamped',
  }
}

/** Parse "2026-09-14". Throws rather than silently producing an Invalid Date. */
export function parseIsoDate(isoDate: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!m) throw new Error(`Expected a YYYY-MM-DD date, received "${isoDate}"`)
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

/** "2026-09-14" as it reads in `timeZone`. */
export function isoDateInZone(timeZone: string, instant: Date): string {
  const p = localParts(timeZone, instant)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** "09:00" — the pre-formatted local string the API hands the client (§10). */
export function localTimeInZone(timeZone: string, instant: Date): string {
  const p = localParts(timeZone, instant)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

/** 0 = Sunday … 6 = Saturday, as the day reads in `timeZone`. Matches AvailabilityRule. */
export function dayOfWeekInZone(timeZone: string, instant: Date): number {
  const p = localParts(timeZone, instant)
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()
}

/** Shift an ISO date by whole days, without touching timezones. */
export function shiftIsoDate(isoDate: string, days: number): string {
  const { year, month, day } = parseIsoDate(isoDate)
  const d = new Date(Date.UTC(year, month - 1, day + days))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`
}

/**
 * The UTC window covering one local calendar day.
 *
 * On an autumn-back day this is 25 hours wide and on spring-forward 23. That is the
 * point: the window is defined by local midnights, not by adding 24 hours.
 */
export function dayBoundsUtc(timeZone: string, isoDate: string): Interval {
  const { year, month, day } = parseIsoDate(isoDate)
  const next = parseIsoDate(shiftIsoDate(isoDate, 1))
  return {
    start: wallToUtc(timeZone, year, month, day, 0).instant,
    end: wallToUtc(timeZone, next.year, next.month, next.day, 0).instant,
  }
}

/**
 * Local midnight, as a UTC instant.
 *
 * This is the anchor the slot grid steps from. Anchoring to the Unix epoch instead only
 * produces clean local times in whole-hour zones — a 15-minute grid in Asia/Kathmandu
 * (+05:45) would offer 09:15 and 09:45 rather than 09:00 and 09:30, and any step that
 * isn't a divisor of 60 breaks everywhere. See docs/GAP-ANALYSIS.md [B1].
 */
export function localMidnightUtc(timeZone: string, isoDate: string): Date {
  return dayBoundsUtc(timeZone, isoDate).start
}
