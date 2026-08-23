import Link from 'next/link'
import { requireSession, scopeStaffId } from '@/lib/auth'
import { getBusiness } from '@/lib/repositories/catalogue.repo'
import { listBookings, listStaffForAdmin } from '@/lib/repositories/admin.repo'
import { isoDateInZone, localMidnightUtc, shiftIsoDate, localTimeInZone } from '@/lib/time'
import { formatPrice } from '@/lib/utils'
import { Card, EmptyRow, PageHeading, StatusBadge, TabLink } from '@/components/admin/ui'
import type { BookingStatus } from '@/lib/domain/policy'

export const dynamic = 'force-dynamic'

const RANGES = {
  upcoming: { label: 'Upcoming', from: 0, days: 60 },
  today: { label: 'Today', from: 0, days: 1 },
  week: { label: 'Next 7 days', from: 0, days: 7 },
  past: { label: 'Past', from: -60, days: 60 },
} as const

type RangeKey = keyof typeof RANGES

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; status?: string; staff?: string }>
}) {
  await requireSession()
  const sp = await searchParams
  const staffScope = await scopeStaffId()
  const business = await getBusiness()

  const tz = business.timezone
  const today = isoDateInZone(tz, new Date())
  const rangeKey: RangeKey = (sp.range as RangeKey) in RANGES ? (sp.range as RangeKey) : 'upcoming'
  const range = RANGES[rangeKey]

  const statuses = sp.status ? [sp.status as BookingStatus] : undefined

  const [bookings, staff] = await Promise.all([
    listBookings({
      businessId: business.id,
      window: {
        start: localMidnightUtc(tz, shiftIsoDate(today, range.from)),
        end: localMidnightUtc(tz, shiftIsoDate(today, range.from + range.days)),
      },
      staffScope,
      staffFilter: sp.staff,
      statuses,
    }),
    listStaffForAdmin(business.id, staffScope),
  ])

  const rows = rangeKey === 'past' ? [...bookings].reverse() : bookings

  function href(patch: Record<string, string | undefined>) {
    const q = new URLSearchParams()
    const merged = { range: rangeKey, status: sp.status, staff: sp.staff, ...patch }
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v)
    return `/admin/bookings${q.toString() ? `?${q}` : ''}`
  }

  return (
    <>
      <PageHeading title="Bookings" subtitle={`${rows.length} shown · times in ${tz.replace('_', ' ')}`} />

      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(RANGES) as RangeKey[]).map((key) => (
          <TabLink key={key} href={href({ range: key })} active={rangeKey === key}>
            {RANGES[key].label}
          </TabLink>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <TabLink href={href({ status: undefined })} active={!sp.status}>
          All statuses
        </TabLink>
        {(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const).map((s) => (
          <TabLink key={s} href={href({ status: s })} active={sp.status === s}>
            {s.replace('_', '-').toLowerCase()}
          </TabLink>
        ))}
      </div>

      {/* A STAFF session is already pinned server-side, so this filter is owner-only. */}
      {!staffScope && staff.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <TabLink href={href({ staff: undefined })} active={!sp.staff}>
            Everyone
          </TabLink>
          {staff.map((s) => (
            <TabLink key={s.id} href={href({ staff: s.id })} active={sp.staff === s.id}>
              {s.name}
            </TabLink>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyRow>No bookings match those filters.</EmptyRow>
      ) : (
        <Card className="divide-y divide-line">
          {rows.map((booking) => (
            <Link
              key={booking.id}
              href={`/admin/bookings/${booking.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1.5 p-4 transition-colors hover:bg-surface-2"
            >
              <span className="w-28 shrink-0 text-sm tabular-nums text-ink-muted">
                {new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: tz }).format(booking.startsAt)}
              </span>
              <span className="w-16 shrink-0 font-medium tabular-nums text-ink">
                {localTimeInZone(tz, booking.startsAt)}
              </span>
              <span className="min-w-32 flex-1 text-sm text-ink">{booking.customer.name}</span>
              <span className="text-sm text-ink-muted">{booking.service.name}</span>
              {!staffScope && <span className="text-sm text-ink-subtle">{booking.staff.name}</span>}
              <span className="text-sm tabular-nums text-ink-subtle">
                {formatPrice(booking.priceMinor, booking.currency, business.currencyDecimals)}
              </span>
              <StatusBadge status={booking.status} />
            </Link>
          ))}
        </Card>
      )}
    </>
  )
}
