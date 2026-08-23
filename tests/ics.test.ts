import { describe, it, expect } from 'vitest'
import { buildIcs, icsFilename, type IcsInput } from '@/lib/ics'

/**
 * The calendar-invite rules that decide whether a rescheduled appointment replaces the
 * old entry or sits alongside it. See docs/GAP-ANALYSIS.md [B13].
 */

const base: IcsInput = {
  bookingId: 'ckl123abc',
  reference: 'BK-7Q4M2X',
  sequence: 0,
  method: 'REQUEST',
  startsAt: new Date('2026-09-14T06:30:00Z'),
  endsAt: new Date('2026-09-14T07:30:00Z'),
  summary: 'Signature Facial — Glow & Grace',
  description: 'Reference BK-7Q4M2X. With Ayesha Mirza.',
  location: '14-C Khayaban-e-Bukhari, Phase VI, Karachi',
  organiserName: 'Glow & Grace',
  organiserEmail: 'hello@glowandgrace.example',
  attendeeName: 'Fatima Sheikh',
  attendeeEmail: 'fatima@example.com',
  uidDomain: 'glowandgrace',
  now: new Date('2026-08-24T10:00:00Z'),
}

function lines(ics: string) {
  return ics.split('\r\n')
}

describe('buildIcs — structure', () => {
  it('emits a well-formed VCALENDAR/VEVENT', () => {
    const l = lines(buildIcs(base))
    expect(l[0]).toBe('BEGIN:VCALENDAR')
    expect(l).toContain('BEGIN:VEVENT')
    expect(l).toContain('END:VEVENT')
    expect(l.filter(Boolean).at(-1)).toBe('END:VCALENDAR')
  })

  it('uses CRLF line endings, as RFC 5545 requires', () => {
    const ics = buildIcs(base)
    expect(ics).toContain('\r\n')
    // No bare LF anywhere.
    expect(/[^\r]\n/.test(ics)).toBe(false)
  })

  it('formats instants as UTC, avoiding a VTIMEZONE block entirely', () => {
    const l = lines(buildIcs(base))
    expect(l).toContain('DTSTART:20260914T063000Z')
    expect(l).toContain('DTEND:20260914T073000Z')
    expect(l).toContain('DTSTAMP:20260824T100000Z')
  })
})

describe('buildIcs — the reschedule contract', () => {
  it('derives the UID from the booking id, so it survives a reschedule', () => {
    const first = lines(buildIcs(base)).find((l) => l.startsWith('UID:'))
    const moved = lines(
      buildIcs({ ...base, sequence: 1, startsAt: new Date('2026-09-15T06:30:00Z') }),
    ).find((l) => l.startsWith('UID:'))

    expect(first).toBe('UID:booking-ckl123abc@glowandgrace')
    // Same UID means the calendar UPDATES the event rather than adding a second one.
    expect(moved).toBe(first)
  })

  it('gives different bookings different UIDs', () => {
    const a = lines(buildIcs(base)).find((l) => l.startsWith('UID:'))
    const b = lines(buildIcs({ ...base, bookingId: 'other' })).find((l) => l.startsWith('UID:'))
    expect(a).not.toBe(b)
  })

  it('takes the UID domain as input rather than hardcoding a business name', () => {
    // The engine is resold: the same code runs for a salon, a clinic and a tutor. A
    // hardcoded domain would mean renaming the business silently changed every UID,
    // orphaning the calendar entry of every existing booking.
    const other = lines(buildIcs({ ...base, uidDomain: 'someotherclinic' })).find((l) =>
      l.startsWith('UID:'),
    )
    expect(other).toBe('UID:booking-ckl123abc@someotherclinic')
  })

  it('raises SEQUENCE on each change, or clients ignore the update', () => {
    expect(lines(buildIcs(base))).toContain('SEQUENCE:0')
    expect(lines(buildIcs({ ...base, sequence: 3 }))).toContain('SEQUENCE:3')
  })

  it('uses METHOD:CANCEL and STATUS:CANCELLED to withdraw an invite', () => {
    const l = lines(buildIcs({ ...base, method: 'CANCEL', sequence: 2 }))
    expect(l).toContain('METHOD:CANCEL')
    expect(l).toContain('STATUS:CANCELLED')
  })

  it('uses METHOD:REQUEST and STATUS:CONFIRMED to create or move', () => {
    const l = lines(buildIcs(base))
    expect(l).toContain('METHOD:REQUEST')
    expect(l).toContain('STATUS:CONFIRMED')
  })
})

describe('buildIcs — escaping and folding', () => {
  it('escapes commas, semicolons, backslashes and newlines', () => {
    const ics = buildIcs({
      ...base,
      summary: 'Facial, deluxe; with extras\\ok',
      description: 'Line one\nLine two',
    })
    expect(ics).toContain('SUMMARY:Facial\\, deluxe\\; with extras\\\\ok')
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two')
  })

  it('an unescaped comma would truncate the field — verify it does not', () => {
    const summaryLine = lines(buildIcs({ ...base, summary: 'A, B, C' })).find((l) =>
      l.startsWith('SUMMARY:'),
    )
    expect(summaryLine).toBe('SUMMARY:A\\, B\\, C')
  })

  it('folds lines longer than 75 octets with a leading space', () => {
    const long = 'x'.repeat(300)
    const ics = buildIcs({ ...base, description: long })
    const folded = ics.split('\r\n').filter((l) => l.startsWith(' ') || l.startsWith('DESCRIPTION:'))

    expect(folded.length).toBeGreaterThan(1)
    for (const line of ics.split('\r\n')) expect(line.length).toBeLessThanOrEqual(75)
  })

  it('leaves short lines unfolded', () => {
    expect(lines(buildIcs(base))).toContain('SEQUENCE:0')
  })
})

describe('buildIcs — participants', () => {
  it('names the organiser and the attendee', () => {
    const ics = buildIcs(base)
    expect(ics).toContain('ORGANIZER;CN=Glow & Grace:mailto:hello@glowandgrace.example')
    expect(ics).toContain('ATTENDEE;CN=Fatima Sheikh;RSVP=FALSE:mailto:fatima@example.com')
  })

  it('carries the human reference for support questions', () => {
    expect(buildIcs(base)).toContain('X-BOOKING-REFERENCE:BK-7Q4M2X')
  })

  it('omits optional fields rather than emitting empty ones', () => {
    const l = lines(buildIcs({ ...base, description: undefined, location: undefined }))
    expect(l.some((x) => x.startsWith('DESCRIPTION:'))).toBe(false)
    expect(l.some((x) => x.startsWith('LOCATION:'))).toBe(false)
  })
})

describe('icsFilename', () => {
  it('names the file after the reference', () => {
    expect(icsFilename('BK-7Q4M2X')).toBe('BK-7Q4M2X.ics')
  })
})
