import Link from 'next/link'
import { ArrowRight, Hourglass } from 'lucide-react'
import { requireSession, scopeStaffId } from '@/lib/auth'
import { getBusiness } from '@/lib/repositories/catalogue.repo'
import { getDashboardCounts } from '@/lib/repositories/admin.repo'
import { dayBoundsUtc, isoDateInZone, localTimeInZone, shiftIsoDate, localMidnightUtc } from '@/lib/time'
import { formatPrice } from '@/lib/utils'
import { Card, EmptyRow, PageHeading, Stat, StatusBadge } from '@/components/admin/ui'

export const dynamic = 'force-dynamic'

/** FR-A2 — today's appointments in order, week counts, and what's next. */
export default async function AdminDashboard() {
  const session = await requireSession()
  const staffScope = await scopeStaffId()
  const business = await getBusiness()

  const now = new Date()
  const tz = business.timezone
  const today = isoDateInZone(tz, now)

  const { todayBookings, weekCount, weekCancelled, nextUp, pendingCount } =
    await getDashboardCounts({
      businessId: business.id,
      today: dayBoundsUtc(tz, today),
      week: {
        start: localMidnightUtc(tz, today),
        end: localMidnightUtc(tz, shiftIsoDate(today, 7)),
      },
      staffScope,
      now,
    })

  const longToday = new Intl.DateTimeFormat('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: tz,
  }).format(now)

  const revenue = todayBookings
    .filter((b) => b.status !== 'CANCELLED')
    .reduce((sum, b) => sum + b.priceMinor, 0)

  return (
    <>
      <PageHeading
        title={`Good day, ${session.user.name?.split(' ')[0] ?? 'there'}`}
        subtitle={`${longToday} · all times ${tz.replace('_', ' ')}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Today"
          value={todayBookings.filter((b) => b.status !== 'CANCELLED').length}
          hint={`${formatPrice(revenue, business.currency, business.currencyDecimals)} booked`}
        />
        <Stat label="Next 7 days" value={weekCount} hint="confirmed and pending" />
        <Stat
          label="Cancelled this week"
          value={weekCancelled}
          hint={weekCancelled === 0 ? 'none — good week' : 'slots reopened automatically'}
        />
        <Stat
          label="Awaiting approval"
          value={pendingCount}
          tone={pendingCount > 0 ? 'warning' : 'default'}
          hint={pendingCount > 0 ? 'holding time until you confirm' : 'nothing waiting'}
        />
      </div>

      {pendingCount > 0 && (
        <Card className="mt-6 flex items-center gap-4 border-warning/30 bg-warning-soft p-5">
          <Hourglass className="size-5 shrink-0 text-warning" aria-hidden="true" />
          <p className="flex-1 text-sm text-ink">
            {pendingCount} {pendingCount === 1 ? 'request is' : 'requests are'} holding time
            until approved.
          </p>
          <Link
            href="/admin/bookings?status=PENDING"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            Review
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </Card>
      )}

      {nextUp && (
        <Card className="mt-6 p-5">
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            Next up
          </p>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-2xl tabular-nums text-ink">
              {localTimeInZone(tz, nextUp.startsAt)}
            </span>
            <span className="text-sm text-ink">{nextUp.customer.name}</span>
            <span className="text-sm text-ink-muted">· {nextUp.service.name}</span>
            {!staffScope && (
              <span className="text-sm text-ink-subtle">with {nextUp.staff.name}</span>
            )}
          </div>
          {nextUp.customerNote && (
            <p className="mt-3 rounded-[var(--radius-slot)] bg-surface-2 p-3 text-sm text-ink-muted">
              {nextUp.customerNote}
            </p>
          )}
        </Card>
      )}

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl leading-tight text-ink">Today&rsquo;s schedule</h2>
          <Link
            href="/admin/calendar"
            className="text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Week view →
          </Link>
        </div>

        {todayBookings.length === 0 ? (
          <EmptyRow>Nothing booked today.</EmptyRow>
        ) : (
          <Card className="divide-y divide-line">
            {todayBookings.map((booking) => (
              <Link
                key={booking.id}
                href={`/admin/bookings/${booking.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 transition-colors hover:bg-surface-2"
              >
                <span className="w-24 shrink-0 font-medium tabular-nums text-ink">
                  {localTimeInZone(tz, booking.startsAt)}–
                  {localTimeInZone(tz, booking.endsAt)}
                </span>
                <span className="min-w-32 flex-1 text-sm text-ink">{booking.customer.name}</span>
                <span className="text-sm text-ink-muted">{booking.service.name}</span>
                {!staffScope && (
                  <span className="text-sm text-ink-subtle">{booking.staff.name}</span>
                )}
                <StatusBadge status={booking.status} />
              </Link>
            ))}
          </Card>
        )}
      </section>
    </>
  )
}
