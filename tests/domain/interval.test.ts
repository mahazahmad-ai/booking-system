import { describe, it, expect } from 'vitest'
import {
  mergeIntervals,
  subtract,
  subtractAll,
  overlaps,
  clampAll,
  addMins,
  minutesBetween,
  isEmpty,
} from '@/lib/domain/interval'
import { iv, at, KARACHI } from '@/tests/helpers'
import { localTimeInZone } from '@/lib/time'

const DAY = '2026-09-14'

/** Intervals as ['09:00–10:00', …] so failures are readable. */
function show(intervals: { start: Date; end: Date }[]): string[] {
  return intervals.map(
    (i) => `${localTimeInZone(KARACHI, i.start)}–${localTimeInZone(KARACHI, i.end)}`,
  )
}

describe('overlaps', () => {
  it('is false for touching intervals', () => {
    // The half-open rule that makes back-to-back appointments legal, and that must match
    // the '[)' bound on the exclusion constraint.
    expect(overlaps(iv(DAY, '09:00', '10:00'), iv(DAY, '10:00', '11:00'))).toBe(false)
  })

  it('is true for a one-minute intersection', () => {
    expect(overlaps(iv(DAY, '09:00', '10:00'), iv(DAY, '09:59', '11:00'))).toBe(true)
  })

  it('is true when one contains the other', () => {
    expect(overlaps(iv(DAY, '09:00', '17:00'), iv(DAY, '12:00', '13:00'))).toBe(true)
  })
})

describe('mergeIntervals', () => {
  it('sorts and coalesces overlapping intervals', () => {
    expect(
      show(mergeIntervals([iv(DAY, '10:00', '12:00'), iv(DAY, '09:00', '11:00')])),
    ).toEqual(['09:00–12:00'])
  })

  it('coalesces touching intervals, so a split overnight shift reads as one block', () => {
    expect(
      show(mergeIntervals([iv(DAY, '09:00', '12:00'), iv(DAY, '12:00', '15:00')])),
    ).toEqual(['09:00–15:00'])
  })

  it('leaves a genuine gap alone', () => {
    expect(
      show(mergeIntervals([iv(DAY, '09:00', '12:00'), iv(DAY, '14:00', '17:00')])),
    ).toEqual(['09:00–12:00', '14:00–17:00'])
  })

  it('absorbs a fully contained interval', () => {
    expect(
      show(mergeIntervals([iv(DAY, '09:00', '17:00'), iv(DAY, '11:00', '12:00')])),
    ).toEqual(['09:00–17:00'])
  })

  it('drops empty and inverted intervals', () => {
    expect(mergeIntervals([iv(DAY, '10:00', '10:00'), iv(DAY, '12:00', '11:00')])).toEqual([])
  })

  it('returns an empty array for no input', () => {
    expect(mergeIntervals([])).toEqual([])
  })
})

describe('subtract', () => {
  it('splits an interval when the cut is in the middle', () => {
    expect(show(subtract(iv(DAY, '09:00', '17:00'), iv(DAY, '12:00', '13:00')))).toEqual([
      '09:00–12:00',
      '13:00–17:00',
    ])
  })

  it('trims from the front', () => {
    expect(show(subtract(iv(DAY, '09:00', '17:00'), iv(DAY, '09:00', '10:00')))).toEqual([
      '10:00–17:00',
    ])
  })

  it('trims from the back', () => {
    expect(show(subtract(iv(DAY, '09:00', '17:00'), iv(DAY, '16:00', '17:00')))).toEqual([
      '09:00–16:00',
    ])
  })

  it('removes the interval entirely when the cut covers it', () => {
    expect(subtract(iv(DAY, '09:00', '17:00'), iv(DAY, '08:00', '18:00'))).toEqual([])
  })

  it('leaves the interval untouched when the cut only touches it', () => {
    expect(show(subtract(iv(DAY, '09:00', '17:00'), iv(DAY, '17:00', '18:00')))).toEqual([
      '09:00–17:00',
    ])
  })
})

describe('subtractAll', () => {
  it('removes time off and bookings from working hours', () => {
    const free = subtractAll(
      [iv(DAY, '09:00', '17:00')],
      [iv(DAY, '12:00', '13:00'), iv(DAY, '10:00', '10:30')],
    )
    expect(show(free)).toEqual(['09:00–10:00', '10:30–12:00', '13:00–17:00'])
  })

  it('merges overlapping cuts so the result is not fragmented into slivers', () => {
    // A booking inside a half-day of leave must not produce three pieces.
    const free = subtractAll(
      [iv(DAY, '09:00', '17:00')],
      [iv(DAY, '12:00', '15:00'), iv(DAY, '13:00', '14:00')],
    )
    expect(show(free)).toEqual(['09:00–12:00', '15:00–17:00'])
  })

  it('returns nothing when the cuts cover everything', () => {
    expect(subtractAll([iv(DAY, '09:00', '17:00')], [iv(DAY, '09:00', '17:00')])).toEqual([])
  })

  it('returns the bases unchanged when there is nothing to cut', () => {
    expect(show(subtractAll([iv(DAY, '09:00', '17:00')], []))).toEqual(['09:00–17:00'])
  })
})

describe('clampAll', () => {
  it('clips intervals to a window and drops those outside it', () => {
    const clipped = clampAll(
      [iv(DAY, '08:00', '10:00'), iv(DAY, '16:00', '18:00'), iv(DAY, '20:00', '21:00')],
      iv(DAY, '09:00', '17:00'),
    )
    expect(show(clipped)).toEqual(['09:00–10:00', '16:00–17:00'])
  })
})

describe('small helpers', () => {
  it('addMins moves forward and backward without mutating', () => {
    const start = at(DAY, '09:00')
    const later = addMins(start, 90)
    expect(localTimeInZone(KARACHI, later)).toBe('10:30')
    expect(localTimeInZone(KARACHI, addMins(start, -60))).toBe('08:00')
    expect(localTimeInZone(KARACHI, start)).toBe('09:00')
  })

  it('minutesBetween measures the gap', () => {
    expect(minutesBetween(at(DAY, '09:00'), at(DAY, '10:30'))).toBe(90)
  })

  it('isEmpty catches zero-length and inverted intervals', () => {
    expect(isEmpty(iv(DAY, '10:00', '10:00'))).toBe(true)
    expect(isEmpty(iv(DAY, '11:00', '10:00'))).toBe(true)
    expect(isEmpty(iv(DAY, '10:00', '11:00'))).toBe(false)
  })
})
