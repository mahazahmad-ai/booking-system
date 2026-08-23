import { describe, it, expect } from 'vitest'
import {
  bookingBounds,
  canSelfCancel,
  canTransition,
  allowedTransitions,
  holdsTime,
  bookingWindows,
  TIME_HOLDING_STATUSES,
  type BookingStatus,
  type SchedulingPolicy,
} from '@/lib/domain/policy'
import { at, KARACHI } from '@/tests/helpers'
import { localTimeInZone } from '@/lib/time'

const DAY = '2026-09-14'

const policy: SchedulingPolicy = {
  slotIntervalMins: 15,
  minLeadTimeMins: 120,
  bookingWindowDays: 60,
  cancelWindowHours: 24,
}

describe('bookingBounds', () => {
  it('opens at now + lead time and closes at now + window', () => {
    const now = at(DAY, '09:00')
    const { start, end } = bookingBounds(now, policy)

    expect(localTimeInZone(KARACHI, start)).toBe('11:00')
    expect(end.getTime() - now.getTime()).toBe(60 * 24 * 60 * 60_000)
  })

  it('reads the clock only from its argument', () => {
    // The same `now` must always give the same answer — that is what makes the engine
    // testable rather than time-dependent.
    const now = at(DAY, '09:00')
    expect(bookingBounds(now, policy)).toEqual(bookingBounds(now, policy))
  })
})

describe('canSelfCancel', () => {
  const appointment = at(DAY, '14:00')

  it('allows cancellation comfortably before the window closes', () => {
    expect(canSelfCancel(at('2026-09-12', '10:00'), appointment, policy)).toBe(true)
  })

  it('refuses inside the cancellation window', () => {
    expect(canSelfCancel(at(DAY, '09:00'), appointment, policy)).toBe(false)
  })

  it('refuses exactly on the boundary', () => {
    // 24 hours before a 14:00 appointment is 14:00 the previous day.
    expect(canSelfCancel(at('2026-09-13', '14:00'), appointment, policy)).toBe(false)
  })

  it('allows one minute before the boundary', () => {
    expect(canSelfCancel(at('2026-09-13', '13:59'), appointment, policy)).toBe(true)
  })

  it('refuses after the appointment has already happened', () => {
    expect(canSelfCancel(at('2026-09-15', '10:00'), appointment, policy)).toBe(false)
  })
})

describe('booking lifecycle (§9)', () => {
  it('lets an approval-required booking be confirmed or cancelled', () => {
    expect(canTransition('PENDING', 'CONFIRMED')).toBe(true)
    expect(canTransition('PENDING', 'CANCELLED')).toBe(true)
  })

  it('lets a confirmed booking complete, cancel or no-show', () => {
    expect(canTransition('CONFIRMED', 'COMPLETED')).toBe(true)
    expect(canTransition('CONFIRMED', 'CANCELLED')).toBe(true)
    expect(canTransition('CONFIRMED', 'NO_SHOW')).toBe(true)
  })

  it('treats the released states as terminal', () => {
    const terminal: BookingStatus[] = ['COMPLETED', 'CANCELLED', 'NO_SHOW']
    for (const from of terminal) {
      expect(allowedTransitions(from)).toEqual([])
    }
  })

  it('refuses to reopen a cancelled booking', () => {
    // Reopening would have to re-validate against the exclusion constraint, and the slot
    // is very likely gone. The customer rebooks instead.
    expect(canTransition('CANCELLED', 'CONFIRMED')).toBe(false)
  })

  it('refuses to skip approval', () => {
    expect(canTransition('PENDING', 'COMPLETED')).toBe(false)
    expect(canTransition('PENDING', 'NO_SHOW')).toBe(false)
  })
})

describe('holdsTime', () => {
  it('matches the exclusion constraint predicate exactly', () => {
    // If these two ever diverge, the engine and the database disagree about what is free.
    expect([...TIME_HOLDING_STATUSES]).toEqual(['PENDING', 'CONFIRMED'])
    expect(holdsTime('PENDING')).toBe(true)
    expect(holdsTime('CONFIRMED')).toBe(true)
    expect(holdsTime('CANCELLED')).toBe(false)
    expect(holdsTime('COMPLETED')).toBe(false)
    expect(holdsTime('NO_SHOW')).toBe(false)
  })
})

describe('bookingWindows (GAP A1)', () => {
  it('puts buffers outside the appointment the customer was promised', () => {
    const w = bookingWindows(at(DAY, '14:00'), 30, 15, 15)

    expect(localTimeInZone(KARACHI, w.startsAt)).toBe('14:00')
    expect(localTimeInZone(KARACHI, w.endsAt)).toBe('14:30')
    expect(localTimeInZone(KARACHI, w.blockStartsAt)).toBe('13:45')
    expect(localTimeInZone(KARACHI, w.blockEndsAt)).toBe('14:45')
  })

  it('collapses to the appointment window when there are no buffers', () => {
    const w = bookingWindows(at(DAY, '14:00'), 60, 0, 0)
    expect(w.blockStartsAt.getTime()).toBe(w.startsAt.getTime())
    expect(w.blockEndsAt.getTime()).toBe(w.endsAt.getTime())
  })

  it('satisfies the relationships the database CHECK constraints assert', () => {
    const w = bookingWindows(at(DAY, '14:00'), 45, 10, 20)
    expect(w.blockStartsAt.getTime()).toBeLessThanOrEqual(w.startsAt.getTime())
    expect(w.blockEndsAt.getTime()).toBeGreaterThanOrEqual(w.endsAt.getTime())
    expect(w.endsAt.getTime()).toBeGreaterThan(w.startsAt.getTime())
  })
})
