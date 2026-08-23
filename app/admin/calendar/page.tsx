import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { requireSession, scopeStaffId } from '@/lib/auth'
import { getBusiness } from '@/lib/repositories/catalogue.repo'
import { listBookings, listStaffForAdmin, listTimeOff } from '@/lib/repositories/admin.repo'
import { isoDateInZone, localMidnightUtc, shiftIsoDate, localTimeInZone } from '@/lib/time'
import { Card, PageHeading, TabLink } from '@/components/admin/ui'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/**
 * FR-A3 — week view, filterable by staff.
 *
 * Rendered as seven day columns rather than a pixel-positioned time grid. A real calendar
 * grid is a lot of code for a business with a handful of appointments a day, and a list
 * per day is easier to read on a phone — which is where the owner actually checks it.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; staff?: string }>
}) {
  await requireSession()
  const sp = await searchParams
  const staffScope = await scopeStaffId()
  const business = await getBusiness()

  const tz = business.timezone
  const today = isoDateInZone(tz, new Date())
  const start = sp.start && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) ? sp.start : today
  const days = Array.from({ length: 7 }, (_, i) => shiftIsoDate(start, i))

  const window = {
    start: localMidnightUtc(tz, start),
    end: localMidnightUtc(tz, shiftIsoDate(start, 7)),
  }

  const [bookings, staff, timeOff] = await Promise.all([
    listBookings({
      businessId: business.id,
      window,
      staffScope,
      staffFilter: sp.staff,
      statuses: ['PENDING', 'CONFIRMED', 'COMPLETED', 'NO_SHOW'],
    }),
    listStaffForAdmin(business.id, staffScope),
    listTimeOff(business.id, staffScope, window.start),
  ])

  const byDay = new Map<string, typeof bookings>()
  for (const b of bookings) {
    const key = isoDateInZone(tz, b.startsAt)
    byDay.set(key, [...(byDay.get(key) ?? []), b])
  }

  function href(patch: Record<string, string | undefined>) {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries({ start, staff: sp.staff, ...patch })) if (v) q.set(k, v)
    return `/admin/calendar?${q}`
  }

  const monthLabel = new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${start}T00:00:00Z`))

  return (
    <>
      <PageHeading
        title="Calendar"
        subtitle={`${monthLabel} · ${bookings.length} appointments this week`}
        action={
          <div className="flex gap-2">
            <Link
              href={href({ start: shiftIsoDate(start, -7) })}
              aria-label="Previous week"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted hover:text-ink"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href={href({ start: today })}
              className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-sm text-ink-muted hover:text-ink"
            >
              Today
            </Link>
            <Link
              href={href({ start: shiftIsoDate(start, 7) })}
              aria-label="Next week"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted hover:text-ink"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        }
      />

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

      <div className="grid gap-3 lg:grid-cols-7">
        {days.map((day) => {
          const dayBookings = byDay.get(day) ?? []
          const isToday = day === today
          const closures = timeOff.filter(
            (t) =>
              t.startsAt < localMidnightUtc(tz, shiftIsoDate(day, 1)) &&
              t.endsAt > localMidnightUtc(tz, day),
          )

          return (
            <Card key={day} className={cn('p-3', isToday && 'border-accent')}>
              <div className="mb-3 flex items-baseline justify-between">
                <span className={cn('text-sm font-medium', isToday ? 'text-accent' : 'text-ink')}>
                  {new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(
                    new Date(`${day}T00:00:00Z`),
                  )}
                </span>
                <span className="text-sm tabular-nums text-ink-subtle">{day.slice(8)}</span>
              </div>

              {closures.map((t) => (
                <p
                  key={t.id}
                  className="mb-2 rounded-[var(--radius-slot)] bg-warning-soft px-2 py-1.5 text-2xs text-warning"
                >
                  {t.staff?.name ?? 'Closed'}: {t.reason ?? 'time off'}
                </p>
              ))}

              {dayBookings.length === 0 && closures.length === 0 ? (
                <p className="py-4 text-center text-2xs text-ink-subtle">—</p>
              ) : (
                <ul className="space-y-1.5">
                  {dayBookings.map((b) => (
                    <li key={b.id}>
                      <Link
                        href={`/admin/bookings/${b.id}`}
                        className={cn(
                          'block rounded-[var(--radius-slot)] border p-2 transition-colors',
                          b.status === 'PENDING'
                            ? 'border-warning/30 bg-warning-soft hover:border-warning'
                            : b.status === 'NO_SHOW'
                              ? 'border-danger/30 bg-danger-soft'
                              : 'border-line bg-surface-2 hover:border-accent-line',
                        )}
                      >
                        <span className="block text-2xs font-semibold tabular-nums text-ink">
                          {localTimeInZone(tz, b.startsAt)}
                        </span>
                        <span className="mt-0.5 block truncate text-2xs text-ink-muted">
                          {b.customer.name}
                        </span>
                        {!staffScope && (
                          <span className="mt-0.5 block truncate text-2xs text-ink-subtle">
                            {b.staff.name}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )
        })}
      </div>
    </>
  )
}
