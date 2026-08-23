import { describe, it, expect } from 'vitest'
import {
  tzOffsetMs,
  wallToUtc,
  dayBoundsUtc,
  localTimeInZone,
  isoDateInZone,
  dayOfWeekInZone,
  shiftIsoDate,
  parseIsoDate,
  localMidnightUtc,
} from '@/lib/time'
import { KARACHI, LONDON } from '@/tests/helpers'

const HOUR = 3_600_000

describe('tzOffsetMs', () => {
  it('is +5h year round in Asia/Karachi, which observes no DST', () => {
    expect(tzOffsetMs(KARACHI, new Date('2026-01-15T12:00:00Z'))).toBe(5 * HOUR)
    expect(tzOffsetMs(KARACHI, new Date('2026-07-15T12:00:00Z'))).toBe(5 * HOUR)
  })

  it('alternates between GMT and BST in Europe/London', () => {
    expect(tzOffsetMs(LONDON, new Date('2026-01-15T12:00:00Z'))).toBe(0)
    expect(tzOffsetMs(LONDON, new Date('2026-07-15T12:00:00Z'))).toBe(1 * HOUR)
  })

  it('is zero for UTC itself', () => {
    expect(tzOffsetMs('UTC', new Date('2026-06-01T00:00:00Z'))).toBe(0)
  })
})

describe('wallToUtc — ordinary times', () => {
  it('resolves a Karachi wall time exactly', () => {
    const { instant, resolution } = wallToUtc(KARACHI, 2026, 9, 14, 9 * 60)
    expect(instant.toISOString()).toBe('2026-09-14T04:00:00.000Z')
    expect(resolution).toBe('exact')
  })

  it('rolls minutes of 1440 or more into the next day', () => {
    // How a working block ending at "24:00" resolves — the schema caps endMin at 1440.
    const { instant } = wallToUtc(KARACHI, 2026, 9, 14, 1440)
    expect(instant.toISOString()).toBe('2026-09-14T19:00:00.000Z')
    expect(localTimeInZone(KARACHI, instant)).toBe('00:00')
    expect(isoDateInZone(KARACHI, instant)).toBe('2026-09-15')
  })
})

describe('wallToUtc — DST edges (GAP B2)', () => {
  // Europe/London 2026: clocks go forward 29 March, back 25 October.

  it('clamps a nonexistent spring-forward time to the transition instant', () => {
    // 01:30 on 29 March never happens — the clock jumps 01:00 GMT to 02:00 BST.
    const { instant, resolution } = wallToUtc(LONDON, 2026, 3, 29, 90)

    expect(resolution).toBe('nonexistent-clamped')
    expect(instant.toISOString()).toBe('2026-03-29T01:00:00.000Z')
    // Which reads as 02:00 local — the first wall time that actually exists.
    expect(localTimeInZone(LONDON, instant)).toBe('02:00')
  })

  it('takes the first occurrence of an ambiguous autumn-back time', () => {
    // 01:30 on 25 October happens twice: once in BST, once an hour later in GMT.
    const { instant, resolution } = wallToUtc(LONDON, 2026, 10, 25, 90)

    expect(resolution).toBe('ambiguous-first')
    expect(instant.toISOString()).toBe('2026-10-25T00:30:00.000Z')
    expect(localTimeInZone(LONDON, instant)).toBe('01:30')
    // The second occurrence would have been 01:30Z. We deliberately chose the earlier.
    expect(instant.getTime()).toBeLessThan(new Date('2026-10-25T01:30:00.000Z').getTime())
  })

  it('resolves times either side of a transition exactly', () => {
    expect(wallToUtc(LONDON, 2026, 3, 29, 0).resolution).toBe('exact')
    expect(wallToUtc(LONDON, 2026, 3, 29, 3 * 60).resolution).toBe('exact')
    expect(wallToUtc(LONDON, 2026, 10, 25, 5 * 60).resolution).toBe('exact')
  })
})

describe('dayBoundsUtc', () => {
  it('spans 24 hours on an ordinary day', () => {
    const { start, end } = dayBoundsUtc(KARACHI, '2026-09-14')
    expect(end.getTime() - start.getTime()).toBe(24 * HOUR)
    expect(start.toISOString()).toBe('2026-09-13T19:00:00.000Z')
  })

  it('spans 23 hours on the spring-forward day', () => {
    const { start, end } = dayBoundsUtc(LONDON, '2026-03-29')
    expect(end.getTime() - start.getTime()).toBe(23 * HOUR)
  })

  it('spans 25 hours on the autumn-back day', () => {
    const { start, end } = dayBoundsUtc(LONDON, '2026-10-25')
    expect(end.getTime() - start.getTime()).toBe(25 * HOUR)
  })

  it('localMidnightUtc is the start of those bounds', () => {
    expect(localMidnightUtc(KARACHI, '2026-09-14').toISOString()).toBe(
      '2026-09-13T19:00:00.000Z',
    )
  })
})

describe('calendar helpers', () => {
  it('reports the weekday as it reads in the zone', () => {
    // 2026-09-14 is a Monday.
    expect(dayOfWeekInZone(KARACHI, new Date('2026-09-14T06:00:00Z'))).toBe(1)
  })

  it('uses the local date, not the UTC one, at the day boundary', () => {
    // 2026-09-13T19:30Z is already Monday 00:30 in Karachi.
    const instant = new Date('2026-09-13T19:30:00Z')
    expect(isoDateInZone(KARACHI, instant)).toBe('2026-09-14')
    expect(dayOfWeekInZone(KARACHI, instant)).toBe(1)
  })

  it('shifts ISO dates across month and year boundaries', () => {
    expect(shiftIsoDate('2026-09-30', 1)).toBe('2026-10-01')
    expect(shiftIsoDate('2026-01-01', -1)).toBe('2025-12-31')
    expect(shiftIsoDate('2028-02-28', 1)).toBe('2028-02-29') // leap year
  })

  it('rejects a malformed date rather than producing an Invalid Date', () => {
    expect(() => parseIsoDate('14-09-2026')).toThrow(/YYYY-MM-DD/)
    expect(() => parseIsoDate('not a date')).toThrow()
  })

  it('formats local times zero-padded', () => {
    expect(localTimeInZone(KARACHI, new Date('2026-09-14T04:05:00Z'))).toBe('09:05')
  })
})
