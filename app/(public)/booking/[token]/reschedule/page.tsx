import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Clock } from 'lucide-react'
import { Container } from '@/components/ui/container'
import { getBookingByToken } from '@/lib/services/booking.service'
import { canSelfCancel } from '@/lib/domain/policy'
import { getDayAvailability, getRangeAvailability } from '@/lib/services/availability.service'
import { isoDateInZone, localTimeInZone } from '@/lib/time'
import { brand } from '@/lib/brand'
import { RescheduleForm } from './reschedule-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Reschedule appointment',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function ReschedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const { token } = await params
  const { date: requestedDate } = await searchParams

  const booking = await getBookingByToken(token)
  if (!booking) notFound()

  const tz = booking.business.timezone
  const today = isoDateInZone(tz, new Date())
  const date = requestedDate ?? today

  const current = `${new Intl.DateTimeFormat('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: tz,
  }).format(booking.startsAt)}, ${localTimeInZone(tz, booking.startsAt)}`

  const changeable =
    (booking.status === 'CONFIRMED' || booking.status === 'PENDING') &&
    canSelfCancel(new Date(), booking.startsAt, booking.business)

  if (!changeable) {
    return (
      <Container className="max-w-lg py-12 sm:py-16">
        <h1 className="font-display text-4xl leading-tight tracking-tight text-ink">
          Can&rsquo;t change this online
        </h1>
        <p className="mt-5 text-sm leading-relaxed text-ink-muted">
          {booking.status === 'CANCELLED'
            ? 'This appointment is already cancelled. You’re welcome to book a new time.'
            : `Changes need ${booking.business.cancelWindowHours} hours’ notice. Please call us on `}
          {booking.status !== 'CANCELLED' && (
            <a href={`tel:${brand.phone.replace(/\s/g, '')}`} className="underline">
              {brand.phone}
            </a>
          )}
        </p>
        <p className="mt-8 text-sm">
          <Link
            href={`/booking/${token}`}
            className="text-ink-muted underline-offset-4 hover:text-ink hover:underline"
          >
            ← Back to your appointment
          </Link>
        </p>
      </Container>
    )
  }

  // Same service and therapist — only the time moves. Keeping the therapist means the
  // customer sees the times that person actually has, not a wider list they can't have.
  const [range, availability] = await Promise.all([
    getRangeAvailability(booking.service.slug, today, 14, { staffId: booking.staffId }),
    getDayAvailability(booking.service.slug, date, { staffId: booking.staffId }),
  ])

  // The slot the booking currently occupies is blocked by itself, so offer it back.
  const currentIso = booking.startsAt.toISOString()
  const slots =
    isoDateInZone(tz, booking.startsAt) === date &&
    !availability.slots.some((s) => s.startsAt.toISOString() === currentIso)
      ? [
          ...availability.slots,
          { startsAt: booking.startsAt, local: localTimeInZone(tz, booking.startsAt), staffIds: [booking.staffId] },
        ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      : availability.slots

  return (
    <Container className="max-w-2xl py-12 sm:py-16">
      <h1 className="font-display text-4xl leading-tight tracking-tight text-ink">
        Pick a new time
      </h1>
      <p className="mt-3 text-sm text-ink-muted">
        {booking.service.name} with {booking.staff.name} · currently {current}
      </p>

      {/* Date strip */}
      <div className="-mx-5 mt-8 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <ul className="flex gap-2 pb-2">
          {range.map((day) => {
            const selected = day.date === date
            const weekday = new Intl.DateTimeFormat('en', {
              weekday: 'short',
              timeZone: 'UTC',
            }).format(new Date(`${day.date}T00:00:00Z`))

            return (
              <li key={day.date}>
                {day.hasSlots ? (
                  <Link
                    href={`/booking/${token}/reschedule?date=${day.date}`}
                    aria-current={selected ? 'date' : undefined}
                    className={
                      'flex w-16 flex-col items-center rounded-[var(--radius-slot)] border px-2 py-3 transition-colors ' +
                      (selected
                        ? 'border-accent bg-accent text-accent-ink'
                        : 'border-line bg-surface text-ink hover:border-accent-line hover:bg-accent-soft/40')
                    }
                  >
                    <span className="text-2xs uppercase tracking-wide opacity-70">{weekday}</span>
                    <span className="mt-1 text-lg font-semibold tabular-nums">
                      {day.date.slice(8)}
                    </span>
                  </Link>
                ) : (
                  <div
                    aria-disabled="true"
                    className="flex w-16 cursor-not-allowed flex-col items-center rounded-[var(--radius-slot)] border border-dashed border-line bg-surface-2 px-2 py-3 text-ink-subtle"
                  >
                    <span className="text-2xs uppercase tracking-wide opacity-70">{weekday}</span>
                    <span className="mt-1 text-lg font-semibold tabular-nums line-through">
                      {day.date.slice(8)}
                    </span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {slots.length === 0 ? (
        <p className="mt-8 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface-2 px-6 py-10 text-center text-sm text-ink-muted">
          {booking.staff.name} has nothing free that day. Try another date above.
        </p>
      ) : (
        <div className="mt-8">
          <p className="mb-4 flex items-center gap-2 text-sm text-ink-subtle">
            <Clock className="size-4" aria-hidden="true" />
            {slots.length} times available · {tz.replace('_', ' ')}
          </p>
          <RescheduleForm
            token={token}
            slots={slots.map((s) => ({ iso: s.startsAt.toISOString(), local: s.local }))}
            currentIso={currentIso}
          />
        </div>
      )}

      <p className="mt-8 text-sm">
        <Link
          href={`/booking/${token}`}
          className="text-ink-muted underline-offset-4 hover:text-ink hover:underline"
        >
          ← Back to your appointment
        </Link>
      </p>
    </Container>
  )
}
