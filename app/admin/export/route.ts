import { requireSession, scopeStaffId } from '@/lib/auth'
import { getBusiness } from '@/lib/repositories/catalogue.repo'
import { listBookingsForExport } from '@/lib/repositories/admin.repo'
import { localMidnightUtc, localTimeInZone, isoDateInZone, shiftIsoDate } from '@/lib/time'
import { audit } from '@/lib/services/audit.service'

/**
 * FR-A12 — GET /admin/export?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * A route handler rather than a Server Action, because a download needs to stream a file
 * with its own Content-Type and Content-Disposition, which an action cannot set.
 *
 * Scoped like every other admin query: a STAFF session exports only its own bookings.
 */

/**
 * Escape a CSV field.
 *
 * The leading apostrophe on +, -, = and @ is deliberate: Excel and Sheets treat a field
 * starting with those as a FORMULA. A phone number like "+92 300 1234567", or a customer
 * note beginning with "=", becomes executable content in the recipient's spreadsheet.
 * That is CSV injection, and an export of customer-supplied data is exactly where it bites.
 */
function csvField(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${guarded.replace(/"/g, '""')}"`
}

export async function GET(request: Request) {
  const session = await requireSession()
  const staffScope = await scopeStaffId()
  const business = await getBusiness()

  const url = new URL(request.url)
  const tz = business.timezone
  const today = isoDateInZone(tz, new Date())

  const isDate = (v: string | null) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v))
  const from = isDate(url.searchParams.get('from'))
    ? url.searchParams.get('from')!
    : shiftIsoDate(today, -30)
  const to = isDate(url.searchParams.get('to')) ? url.searchParams.get('to')! : today

  if (from > to) {
    return Response.json({ error: 'The start date must be before the end date.' }, { status: 400 })
  }

  const bookings = await listBookingsForExport({
    businessId: business.id,
    // `to` is inclusive, so extend the window to the end of that local day.
    window: { start: localMidnightUtc(tz, from), end: localMidnightUtc(tz, shiftIsoDate(to, 1)) },
    staffScope,
  })

  const header = [
    'Reference',
    'Date',
    'Start',
    'End',
    'Treatment',
    'Therapist',
    'Customer',
    'Email',
    'Phone',
    'Status',
    'Duration (mins)',
    `Price (${business.currency})`,
    'Booked at',
    'Note',
  ]

  const rows = bookings.map((b) =>
    [
      b.reference,
      isoDateInZone(tz, b.startsAt),
      localTimeInZone(tz, b.startsAt),
      localTimeInZone(tz, b.endsAt),
      b.service.name,
      b.staff.name,
      b.customer.name,
      b.customer.email,
      b.customer.phone ?? '',
      b.status,
      b.durationMins,
      business.currencyDecimals === 0
        ? b.priceMinor
        : (b.priceMinor / 10 ** business.currencyDecimals).toFixed(business.currencyDecimals),
      isoDateInZone(tz, b.createdAt),
      b.customerNote ?? '',
    ]
      .map(csvField)
      .join(','),
  )

  // A BOM so Excel opens UTF-8 correctly — without it, non-ASCII names are mangled.
  const csv = '﻿' + [header.map(csvField).join(','), ...rows].join('\r\n') + '\r\n'

  await audit({
    businessId: business.id,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? '',
    action: 'bookings.export',
    entityType: 'Booking',
    entityId: `${from}..${to}`,
    summary: `Exported ${bookings.length} booking(s) for ${from} → ${to}`,
  })

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bookings-${from}-to-${to}.csv"`,
      // Contains customer PII — never cacheable by a proxy.
      'Cache-Control': 'no-store, private',
    },
  })
}
