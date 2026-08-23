import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Container } from '@/components/ui/container'
import { getBookingByToken } from '@/lib/services/booking.service'
import { canSelfCancel } from '@/lib/domain/policy'
import { localTimeInZone } from '@/lib/time'
import { brand } from '@/lib/brand'
import { CancelForm } from './cancel-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Cancel appointment',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function CancelPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const booking = await getBookingByToken(token)
  if (!booking) notFound()

  const tz = booking.business.timezone
  const when = `${new Intl.DateTimeFormat('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: tz,
  }).format(booking.startsAt)}, ${localTimeInZone(tz, booking.startsAt)}`

  const alreadyCancelled = booking.status === 'CANCELLED'
  const inWindow = canSelfCancel(new Date(), booking.startsAt, booking.business)

  return (
    <Container className="max-w-lg py-12 sm:py-16">
      <h1 className="font-display text-4xl leading-tight tracking-tight text-ink">
        Cancel this appointment?
      </h1>

      <div className="mt-7 rounded-[var(--radius-card)] border border-line bg-surface p-6">
        <p className="font-display text-2xl text-ink">{booking.service.name}</p>
        <p className="mt-1.5 text-sm text-ink-muted">
          {when} · with {booking.staff.name}
        </p>
        <p className="mt-4 border-t border-line pt-4 text-sm text-ink-subtle">
          Reference {booking.reference}
        </p>
      </div>

      {alreadyCancelled ? (
        <p className="mt-6 text-sm text-ink-muted">
          This appointment is already cancelled. Nothing more to do.
        </p>
      ) : !inWindow ? (
        <p className="mt-6 text-sm leading-relaxed text-ink-muted">
          It&rsquo;s now less than {booking.business.cancelWindowHours} hours before your
          appointment, so we can&rsquo;t cancel it online. Please call us on{' '}
          <a href={`tel:${brand.phone.replace(/\s/g, '')}`} className="underline">
            {brand.phone}
          </a>{' '}
          and we&rsquo;ll sort it out.
        </p>
      ) : (
        <div className="mt-8">
          <CancelForm token={token} />
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
