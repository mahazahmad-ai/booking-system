import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarCheck, Clock, Hourglass, MapPin, User, XCircle } from 'lucide-react'
import { Container } from '@/components/ui/container'
import { ButtonLink } from '@/components/ui/button'
import { getBookingByToken } from '@/lib/services/booking.service'
import { canSelfCancel } from '@/lib/domain/policy'
import { localTimeInZone } from '@/lib/time'
import { formatDuration, formatPrice } from '@/lib/utils'
import { brand } from '@/lib/brand'

/**
 * Confirmation and self-service management, reached by the signed link in the customer's
 * email. The token is 32 random bytes and is never the row id, so bookings are not
 * addressable by a guessable path.
 */

export const dynamic = 'force-dynamic'

// NFR-7 — the token is a secret sitting in the URL path. Suppressing the referrer stops
// it leaking to any third party, and this page deliberately loads no external assets.
export const metadata: Metadata = {
  title: 'Your appointment',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function ManageBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ new?: string; cancelled?: string; moved?: string }>
}) {
  const { token } = await params
  const { new: isNew, moved } = await searchParams

  const booking = await getBookingByToken(token)
  if (!booking) notFound()

  // Dead once the appointment is well past, so a leaked link cannot live forever.
  if (booking.manageTokenExpiresAt && booking.manageTokenExpiresAt < new Date()) notFound()

  const { business, service, staff, customer } = booking
  const tz = business.timezone

  const longDate = new Intl.DateTimeFormat('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: tz,
  }).format(booking.startsAt)

  const cancellable =
    (booking.status === 'CONFIRMED' || booking.status === 'PENDING') &&
    canSelfCancel(new Date(), booking.startsAt, business)

  const cancelled = booking.status === 'CANCELLED'
  const pending = booking.status === 'PENDING'

  return (
    <Container className="max-w-2xl py-12 sm:py-16">
      {/* Status banner */}
      {cancelled ? (
        <Banner
          tone="danger"
          icon={<XCircle className="size-5" aria-hidden="true" />}
          title="This appointment is cancelled"
          body="If that wasn't intentional, you're welcome to book a new time."
        />
      ) : pending ? (
        <Banner
          tone="warning"
          icon={<Hourglass className="size-5" aria-hidden="true" />}
          title="Awaiting confirmation"
          body="We're holding this time for you. You'll get an email as soon as it's approved."
        />
      ) : moved ? (
        <Banner
          tone="accent"
          icon={<CalendarCheck className="size-5" aria-hidden="true" />}
          title="Your appointment has moved"
          body={`The new time is below, and an updated calendar invite is on its way to ${customer.email}.`}
        />
      ) : isNew ? (
        <Banner
          tone="accent"
          icon={<CalendarCheck className="size-5" aria-hidden="true" />}
          title="You're booked in"
          body={`A confirmation is on its way to ${customer.email}.`}
        />
      ) : null}

      <div className="mt-8 rounded-[var(--radius-card)] border border-line bg-surface p-7 sm:p-9">
        <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
          Reference
        </p>
        <p className="mt-1 font-display text-3xl tracking-tight text-ink">{booking.reference}</p>

        <h1 className="mt-8 font-display text-4xl leading-tight tracking-tight text-ink">
          {service.name}
        </h1>

        <dl className="mt-7 space-y-4 border-t border-line pt-7 text-sm">
          <Row icon={<CalendarCheck className="size-4" />} label="When">
            {longDate}
            <br />
            <span className="tabular-nums">
              {localTimeInZone(tz, booking.startsAt)} – {localTimeInZone(tz, booking.endsAt)}
            </span>{' '}
            <span className="text-ink-subtle">({tz.replace('_', ' ')})</span>
          </Row>
          <Row icon={<Clock className="size-4" />} label="Length">
            {formatDuration(booking.durationMins)}
          </Row>
          <Row icon={<User className="size-4" />} label="With">
            {staff.name}
          </Row>
          <Row icon={<MapPin className="size-4" />} label="Where">
            {brand.address.line1}, {brand.address.line2}
            <br />
            {brand.address.city}
          </Row>
        </dl>

        <div className="mt-7 flex items-baseline justify-between border-t border-line pt-5">
          <span className="text-sm text-ink-subtle">Price</span>
          <span className="text-lg font-semibold tabular-nums text-ink">
            {formatPrice(booking.priceMinor, booking.currency, business.currencyDecimals)}
          </span>
        </div>

        {booking.customerNote && (
          <div className="mt-6 rounded-[var(--radius-slot)] bg-surface-2 p-4">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              Your note
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              {booking.customerNote}
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-6 rounded-[var(--radius-card)] border border-line bg-surface-2 p-6">
        {cancelled ? (
          <ButtonLink href="/book">Book a new appointment</ButtonLink>
        ) : cancellable ? (
          <>
            <h2 className="text-base font-semibold text-ink">Need to change something?</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              You can reschedule or cancel yourself up to {business.cancelWindowHours} hours
              before your appointment.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {/* Phase 4 wires these to the cancel and reschedule actions. */}
              <ButtonLink href={`/booking/${token}/reschedule`} variant="secondary">
                Reschedule
              </ButtonLink>
              <ButtonLink href={`/booking/${token}/cancel`} variant="ghost">
                Cancel appointment
              </ButtonLink>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-ink">Inside the change window</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              It&rsquo;s now less than {business.cancelWindowHours} hours before your
              appointment, so changes need a quick call. Ring us on{' '}
              <a href={`tel:${brand.phone.replace(/\s/g, '')}`} className="underline">
                {brand.phone}
              </a>
              .
            </p>
          </>
        )}
      </div>

      <p className="mt-8 text-center text-sm text-ink-subtle">
        <Link href="/" className="underline-offset-4 hover:text-ink hover:underline">
          Back to {business.name}
        </Link>
      </p>
    </Container>
  )
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-4">
      <dt className="flex w-24 shrink-0 items-start gap-2 text-ink-subtle">
        <span className="mt-0.5 text-accent">{icon}</span>
        {label}
      </dt>
      <dd className="leading-relaxed text-ink">{children}</dd>
    </div>
  )
}

function Banner({
  tone,
  icon,
  title,
  body,
}: {
  tone: 'accent' | 'warning' | 'danger'
  icon: React.ReactNode
  title: string
  body: string
}) {
  const tones = {
    accent: 'border-accent-line bg-accent-soft text-accent',
    warning: 'border-warning/30 bg-warning-soft text-warning',
    danger: 'border-danger/30 bg-danger-soft text-danger',
  } as const

  return (
    <div className={`flex gap-4 rounded-[var(--radius-card)] border p-5 ${tones[tone]}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="font-semibold text-ink">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{body}</p>
      </div>
    </div>
  )
}
