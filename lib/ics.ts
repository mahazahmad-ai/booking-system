/**
 * iCalendar generation.
 *
 * Three details decide whether a customer's calendar ends up correct or shows the same
 * appointment twice at two different times (docs/GAP-ANALYSIS.md [B13]):
 *
 *   UID       Stable for the life of the booking, derived from its id. A reschedule must
 *             reuse it — a new UID is a NEW event to every calendar client, so the old one
 *             is left sitting there.
 *   SEQUENCE  Incremented on every change. Clients ignore an update whose sequence is not
 *             higher than the copy they already hold.
 *   METHOD    REQUEST to create or update, CANCEL to withdraw.
 *
 * DTSTART/DTEND are emitted in UTC, which is correct everywhere and avoids shipping a
 * VTIMEZONE block that has to stay in step with the IANA database.
 */

export type IcsInput = {
  bookingId: string
  reference: string
  sequence: number
  method: 'REQUEST' | 'CANCEL'
  startsAt: Date
  endsAt: Date
  summary: string
  description?: string
  location?: string
  organiserName: string
  organiserEmail: string
  attendeeName: string
  attendeeEmail: string
  /** Passed in rather than read from the clock, so output is deterministic and testable. */
  now: Date
}

/** 20260914T040000Z */
function icsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/**
 * Escape per RFC 5545: backslash, semicolon, comma and newline all carry meaning.
 * An unescaped comma in a treatment name silently truncates the field.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Fold lines at 75 octets, as the spec requires. Long descriptions are otherwise silently
 * mangled by strict parsers.
 */
function fold(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = [line.slice(0, 75)]
  let rest = line.slice(75)
  while (rest.length > 74) {
    parts.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  if (rest) parts.push(' ' + rest)
  return parts.join('\r\n')
}

export function buildIcs(input: IcsInput): string {
  const uid = `booking-${input.bookingId}@noorwellness`

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Booking System//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${input.method}`,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SEQUENCE:${input.sequence}`,
    `DTSTAMP:${icsDate(input.now)}`,
    `DTSTART:${icsDate(input.startsAt)}`,
    `DTEND:${icsDate(input.endsAt)}`,
    `SUMMARY:${escapeText(input.summary)}`,
    input.description ? `DESCRIPTION:${escapeText(input.description)}` : null,
    input.location ? `LOCATION:${escapeText(input.location)}` : null,
    `ORGANIZER;CN=${escapeText(input.organiserName)}:mailto:${input.organiserEmail}`,
    `ATTENDEE;CN=${escapeText(input.attendeeName)};RSVP=FALSE:mailto:${input.attendeeEmail}`,
    `STATUS:${input.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    `X-BOOKING-REFERENCE:${escapeText(input.reference)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((l): l is string => l !== null)

  // CRLF line endings are required by RFC 5545, not merely conventional.
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function icsFilename(reference: string): string {
  return `${reference}.ics`
}
