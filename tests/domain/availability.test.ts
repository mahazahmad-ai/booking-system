import { describe, it, expect } from 'vitest'
import { computeSlots, mergeStaffSlots, ceilToStep } from '@/lib/domain/availability'
import { localMidnightUtc, localTimeInZone } from '@/lib/time'
import { at, iv, ivAcross, localTimes, slotInput, KARACHI, LONDON } from '@/tests/helpers'

/**
 * The suite that matters (§7).
 *
 * Every case here is one the spec named as a must-pass, plus the gaps found in review.
 * If the availability engine is wrong, every piece of UI built on it gets reworked — and
 * its bugs stay invisible until a real customer arrives at the wrong hour.
 */

const DAY = '2026-09-14'

describe('computeSlots — the ordinary day', () => {
  it('walks the working block on the grid', () => {
    const slots = computeSlots(slotInput(DAY, { working: [iv(DAY, '09:00', '17:00')] }))

    expect(localTimes(slots)[0]).toBe('09:00')
    // 16:30 is the last start whose 30 minutes still fit before 17:00.
    expect(localTimes(slots).at(-1)).toBe('16:30')
    expect(slots).toHaveLength(31)
  })

  it('offers a start only when the whole service fits', () => {
    // 45 minutes of work in a 60-minute block: 09:00 and 09:15 fit, 09:30 does not.
    const slots = computeSlots(
      slotInput(DAY, { working: [iv(DAY, '09:00', '10:00')], durationMins: 45 }),
    )
    expect(localTimes(slots)).toEqual(['09:00', '09:15'])
  })
})

describe('computeSlots — empty and full', () => {
  it('returns no slots when there are no working rules, rather than throwing', () => {
    expect(computeSlots(slotInput(DAY))).toEqual([])
  })

  it('returns an empty array for a fully booked day', () => {
    const slots = computeSlots(
      slotInput(DAY, {
        working: [iv(DAY, '09:00', '17:00')],
        blocked: [iv(DAY, '09:00', '17:00')],
      }),
    )
    expect(slots).toEqual([])
  })
})

describe('computeSlots — bookings at the edges of the working block', () => {
  it('handles a booking starting exactly at the start of the day', () => {
    const slots = computeSlots(
      slotInput(DAY, {
        working: [iv(DAY, '09:00', '17:00')],
        blocked: [iv(DAY, '09:00', '10:00')],
      }),
    )
    expect(localTimes(slots)[0]).toBe('10:00')
  })

  it('handles a booking ending exactly at the end of the day', () => {
    const slots = computeSlots(
      slotInput(DAY, {
        working: [iv(DAY, '09:00', '17:00')],
        blocked: [iv(DAY, '16:00', '17:00')],
      }),
    )
    expect(localTimes(slots).at(-1)).toBe('15:30')
  })

  it('treats touching intervals as not overlapping, so back-to-back works', () => {
    // A booking ending at 10:00 and a slot starting at 10:00 must coexist — the same
    // half-open rule as the '[)' bound on the exclusion constraint.
    const slots = computeSlots(
      slotInput(DAY, {
        working: [iv(DAY, '09:00', '17:00')],
        blocked: [iv(DAY, '09:00', '10:00'), iv(DAY, '10:30', '17:00')],
      }),
    )
    expect(localTimes(slots)).toEqual(['10:00'])
  })
})

describe('computeSlots — gaps that are almost big enough', () => {
  it('rejects a gap one minute too short', () => {
    const slots = computeSlots(
      slotInput(DAY, {
        working: [iv(DAY, '09:00', '17:00')],
        // Leaves exactly 29 minutes free for a 30-minute service.
        blocked: [iv(DAY, '09:00', '10:00'), iv(DAY, '10:29', '17:00')],
      }),
    )
    expect(slots).toEqual([])
  })

  it('accepts a gap that is exactly big enough', () => {
    const slots = computeSlots(
      slotInput(DAY, {
        working: [iv(DAY, '09:00', '17:00')],
        blocked: [iv(DAY, '09:00', '10:00'), iv(DAY, '10:30', '17:00')],
      }),
    )
    expect(localTimes(slots)).toEqual(['10:00'])
  })

  it('does not offer a start whose remaining time is shorter than the service', () => {
    // The 12:45 case from the spec diagram: 15 minutes left, 30 minutes needed.
    const slots = computeSlots(
      slotInput(DAY, {
        working: [iv(DAY, '11:15', '13:00')],
        stepMins: 30,
      }),
    )
    expect(localTimes(slots)).toEqual(['11:30', '12:00', '12:30'])
    expect(localTimes(slots)).not.toContain('12:45')
  })
})

describe('computeSlots — buffers', () => {
  it('consumes the leading buffer from the start of the free interval', () => {
    // 15 before + 30 service + 15 after = 60 minutes, in a 60-minute block. The single
    // slot sits at 09:15, not 09:00 — the customer is booked at 09:15 and the therapist
    // is occupied from 09:00.
    const slots = computeSlots(
      slotInput(DAY, {
        working: [iv(DAY, '09:00', '10:00')],
        bufferBeforeMins: 15,
        bufferAfterMins: 15,
      }),
    )
    expect(localTimes(slots)).toEqual(['09:15'])
  })

  it('drops slots whose trailing buffer would run past the working day', () => {
    // Without the buffer, 16:30 is a valid start. With 15 minutes of cleanup it is not.
    const withoutBuffer = computeSlots(
      slotInput(DAY, { working: [iv(DAY, '09:00', '17:00')] }),
    )
    const withBuffer = computeSlots(
      slotInput(DAY, { working: [iv(DAY, '09:00', '17:00')], bufferAfterMins: 15 }),
    )

    expect(localTimes(withoutBuffer).at(-1)).toBe('16:30')
    expect(localTimes(withBuffer).at(-1)).toBe('16:15')
  })

  it('returns nothing when the buffers alone exceed the working block', () => {
    const slots = computeSlots(
      slotInput(DAY, {
        working: [iv(DAY, '09:00', '10:00')],
        durationMins: 30,
        bufferBeforeMins: 30,
        bufferAfterMins: 30,
      }),
    )
    expect(slots).toEqual([])
  })
})

describe('computeSlots — split shifts', () => {
  it('handles two rules on one day with a lunch break between', () => {
    const slots = computeSlots(
      slotInput(DAY, {
        working: [iv(DAY, '09:00', '12:00'), iv(DAY, '14:00', '17:00')],
        durationMins: 60,
        stepMins: 60,
      }),
    )
    expect(localTimes(slots)).toEqual([
      '09:00',
      '10:00',
      '11:00',
      '14:00',
      '15:00',
      '16:00',
    ])
  })

  it('merges touching rules into one continuous block', () => {
    // 09:00–12:00 and 12:00–15:00 must behave as 09:00–15:00, not as two blocks that
    // each reject a service straddling noon.
    const slots = computeSlots(
      slotInput(DAY, {
        working: [iv(DAY, '09:00', '12:00'), iv(DAY, '12:00', '15:00')],
        durationMins: 120,
        stepMins: 60,
      }),
    )
    expect(localTimes(slots)).toEqual(['09:00', '10:00', '11:00', '12:00', '13:00'])
  })
})

describe('computeSlots — crossing midnight', () => {
  it('treats an overnight shift split across two weekday rows as continuous', () => {
    // The schema requires 22:00–01:00 be stored as Mon 22:00–24:00 + Tue 00:00–01:00.
    const nextDay = '2026-09-15'
    const slots = computeSlots(
      slotInput(DAY, {
        working: [iv(DAY, '22:00', '24:00'), iv(nextDay, '00:00', '01:00')],
        blocked: [ivAcross(DAY, '23:30', nextDay, '00:15')],
        stepMins: 30,
      }),
    )
    expect(localTimes(slots)).toEqual(['22:00', '22:30', '23:00', '00:30'])
  })

  it('blocks the next day’s early slot with a booking that started yesterday', () => {
    const nextDay = '2026-09-15'
    const slots = computeSlots(
      slotInput(nextDay, {
        working: [iv(nextDay, '00:00', '03:00')],
        blocked: [ivAcross(DAY, '23:30', nextDay, '01:00')],
        stepMins: 60,
        durationMins: 60,
      }),
    )
    // 00:00 is gone; the day opens at 01:00.
    expect(localTimes(slots)).toEqual(['01:00', '02:00'])
  })
})

describe('computeSlots — policy bounds', () => {
  it('drops slots inside the minimum lead time', () => {
    const slots = computeSlots(
      slotInput(DAY, {
        working: [iv(DAY, '09:00', '17:00')],
        earliest: at(DAY, '15:00'),
        stepMins: 60,
      }),
    )
    expect(localTimes(slots)).toEqual(['15:00', '16:00'])
  })

  it('returns nothing when the lead time eliminates the rest of the day', () => {
    const slots = computeSlots(
      slotInput(DAY, {
        working: [iv(DAY, '09:00', '17:00')],
        earliest: at(DAY, '18:00'),
      }),
    )
    expect(slots).toEqual([])
  })

  it('drops slots beyond the booking window', () => {
    const slots = computeSlots(
      slotInput(DAY, {
        working: [iv(DAY, '09:00', '17:00')],
        latest: at(DAY, '10:00'),
        stepMins: 30,
      }),
    )
    expect(localTimes(slots)).toEqual(['09:00', '09:30', '10:00'])
  })
})

describe('computeSlots — the grid', () => {
  it('anchors the grid to local midnight, not the Unix epoch', () => {
    // Asia/Kathmandu is UTC+05:45. Anchoring to the epoch would offer 09:15 and 09:45;
    // anchoring to local midnight gives the clean local times a business expects.
    const tz = 'Asia/Kathmandu'
    const slots = computeSlots(
      slotInput(
        DAY,
        {
          working: [iv(DAY, '09:00', '11:00', tz)],
          stepMins: 30,
          gridAnchor: localMidnightUtc(tz, DAY),
        },
        tz,
      ),
    )
    expect(localTimes(slots, tz)).toEqual(['09:00', '09:30', '10:00', '10:30'])
  })

  it('rounds a mid-grid free interval up to the next step', () => {
    const slots = computeSlots(
      slotInput(DAY, {
        working: [iv(DAY, '09:07', '11:00')],
        stepMins: 30,
      }),
    )
    expect(localTimes(slots)[0]).toBe('09:30')
  })

  it('ceilToStep leaves an instant already on the grid alone', () => {
    const anchor = localMidnightUtc(KARACHI, DAY)
    const onGrid = at(DAY, '09:30')
    expect(ceilToStep(onGrid, anchor, 30).getTime()).toBe(onGrid.getTime())
  })
})

describe('computeSlots — DST (NFR-2)', () => {
  it('keeps 09:00 local at 09:00 local across the spring-forward boundary', () => {
    const before = '2026-03-28' // GMT
    const after = '2026-03-30' // BST

    for (const day of [before, after]) {
      const slots = computeSlots(
        slotInput(
          day,
          {
            working: [iv(day, '09:00', '17:00', LONDON)],
            durationMins: 60,
            stepMins: 60,
            gridAnchor: localMidnightUtc(LONDON, day),
          },
          LONDON,
        ),
      )
      expect(localTimes(slots, LONDON)[0]).toBe('09:00')
      expect(localTimes(slots, LONDON).at(-1)).toBe('16:00')
    }
  })

  it('shifts the underlying UTC instant across the transition, as it must', () => {
    const gmtDay = '2026-03-28'
    const bstDay = '2026-03-30'
    // Same wall clock, one hour apart in real time. This is the bug that makes people
    // arrive an hour late when the offset is added by hand instead.
    expect(at(gmtDay, '09:00', LONDON).getUTCHours()).toBe(9)
    expect(at(bstDay, '09:00', LONDON).getUTCHours()).toBe(8)
  })

  it('handles a working block on the autumn-back day, when the day is 25 hours long', () => {
    const day = '2026-10-25'
    const slots = computeSlots(
      slotInput(
        day,
        {
          working: [iv(day, '09:00', '17:00', LONDON)],
          durationMins: 60,
          stepMins: 60,
          gridAnchor: localMidnightUtc(LONDON, day),
        },
        LONDON,
      ),
    )
    expect(localTimes(slots, LONDON)).toEqual([
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
    ])
  })

  it('is unaffected in a zone without DST', () => {
    // Asia/Karachi is +05:00 all year. 09:00 local is 04:00 UTC in March and October.
    expect(at('2026-03-29', '09:00', KARACHI).toISOString()).toBe('2026-03-29T04:00:00.000Z')
    expect(at('2026-10-25', '09:00', KARACHI).toISOString()).toBe('2026-10-25T04:00:00.000Z')
  })

  it('spans the autumn-back transition with a real extra hour of working time', () => {
    // A 00:00–06:00 shift on autumn-back day contains 7 real hours, so a 60-minute
    // service fits seven times rather than six. Slots follow the wall clock.
    const day = '2026-10-25'
    const slots = computeSlots(
      slotInput(
        day,
        {
          working: [iv(day, '00:00', '06:00', LONDON)],
          durationMins: 60,
          stepMins: 60,
          gridAnchor: localMidnightUtc(LONDON, day),
        },
        LONDON,
      ),
    )
    expect(slots).toHaveLength(7)
  })
})

describe('mergeStaffSlots — "any available"', () => {
  it('unions slots and records every staff member who can serve each', () => {
    const merged = mergeStaffSlots([
      { staffId: 'stf_a', slots: [at(DAY, '09:00'), at(DAY, '09:30')] },
      { staffId: 'stf_b', slots: [at(DAY, '09:00'), at(DAY, '10:00')] },
    ])

    expect(merged.map((m) => localTimeInZone(KARACHI, m.startsAt))).toEqual([
      '09:00',
      '09:30',
      '10:00',
    ])
    expect(merged[0].staffIds).toEqual(['stf_a', 'stf_b'])
    expect(merged[1].staffIds).toEqual(['stf_a'])
    expect(merged[2].staffIds).toEqual(['stf_b'])
  })

  it('returns an empty list when nobody is free', () => {
    expect(mergeStaffSlots([{ staffId: 'stf_a', slots: [] }])).toEqual([])
  })
})

describe('computeSlots — input guards', () => {
  it('rejects a non-positive step', () => {
    expect(() => computeSlots(slotInput(DAY, { stepMins: 0 }))).toThrow(/stepMins/)
  })

  it('rejects a non-positive duration', () => {
    expect(() => computeSlots(slotInput(DAY, { durationMins: 0 }))).toThrow(/durationMins/)
  })

  it('rejects negative buffers', () => {
    expect(() => computeSlots(slotInput(DAY, { bufferAfterMins: -5 }))).toThrow(/buffers/)
  })
})
