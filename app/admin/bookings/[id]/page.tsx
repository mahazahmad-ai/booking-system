import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Mail, Phone } from 'lucide-react'
import { requireSession, scopeStaffId } from '@/lib/auth'
import { getBusiness } from '@/lib/repositories/catalogue.repo'
import { getBookingById } from '@/lib/repositories/admin.repo'
import { db } from '@/lib/db'
import { allowedTransitions } from '@/lib/domain/policy'
import { localTimeInZone } from '@/lib/time'
import { formatDuration, formatPrice } from '@/lib/utils'
import { Card, PageHeading, StatusBadge } from '@/components/admin/ui'
import { StatusForm, InternalNoteForm } from './forms'

export const dynamic = 'force-dynamic'

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireSession()
  const { id } = await params
  const staffScope = await scopeStaffId()
  const business = await getBusiness()

  const booking = await getBookingById(id, staffScope)
  if (!booking) notFound()

  const tz = business.timezone
  const [history, notifications] = await Promise.all([
    db.bookingHistory.findMany({
      where: { bookingId: booking.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    db.notificationLog.findMany({
      where: { bookingId: booking.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  const longDate = new Intl.DateTimeFormat('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: tz,
  }).format(booking.startsAt)

  return (
    <>
      <Link
        href="/admin/bookings"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All bookings
      </Link>

      <PageHeading
        title={booking.reference}
        subtitle={`${longDate} · ${localTimeInZone(tz, booking.startsAt)}–${localTimeInZone(tz, booking.endsAt)}`}
        action={<StatusBadge status={booking.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              Appointment
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Treatment" value={booking.service.name} />
              <Field label="Length" value={formatDuration(booking.durationMins)} />
              <Field label="Therapist" value={booking.staff.name} />
              <Field
                label="Price"
                value={formatPrice(booking.priceMinor, booking.currency, business.currencyDecimals)}
              />
            </dl>

            {booking.customerNote && (
              <div className="mt-5 rounded-[var(--radius-slot)] bg-surface-2 p-4">
                <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                  Customer note
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink">{booking.customerNote}</p>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              Internal note
            </h2>
            <p className="mt-1.5 text-xs text-ink-subtle">
              Staff only — never shown to the customer.
            </p>
            <div className="mt-4">
              <InternalNoteForm bookingId={booking.id} value={booking.internalNote ?? ''} />
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              History
            </h2>
            {history.length === 0 ? (
              <p className="mt-4 text-sm text-ink-subtle">No changes since it was booked.</p>
            ) : (
              <ul className="mt-4 space-y-3 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex flex-wrap gap-x-2 text-ink-muted">
                    <span className="tabular-nums text-ink-subtle">
                      {new Intl.DateTimeFormat('en', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                        timeZone: tz,
                      }).format(h.createdAt)}
                    </span>
                    <span className="text-ink">
                      {h.changeType === 'RESCHEDULED' && h.fromStartsAt && h.toStartsAt
                        ? `Moved from ${localTimeInZone(tz, h.fromStartsAt)} to ${localTimeInZone(tz, h.toStartsAt)}`
                        : `${h.fromStatus} → ${h.toStatus}`}
                    </span>
                    <span className="text-ink-subtle">by {h.actor.toLowerCase()}</span>
                    {h.reason && <span className="w-full text-xs text-ink-subtle">“{h.reason}”</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className="p-6">
            <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              Customer
            </h2>
            <p className="mt-3 font-medium text-ink">{booking.customer.name}</p>
            <div className="mt-3 space-y-2 text-sm">
              <a
                href={`mailto:${booking.customer.email}`}
                className="flex items-center gap-2 text-ink-muted underline-offset-4 hover:text-ink hover:underline"
              >
                <Mail className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
                {booking.customer.email}
              </a>
              {booking.customer.phone && (
                <a
                  href={`tel:${booking.customer.phone.replace(/\s/g, '')}`}
                  className="flex items-center gap-2 text-ink-muted underline-offset-4 hover:text-ink hover:underline"
                >
                  <Phone className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
                  {booking.customer.phone}
                </a>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              Change status
            </h2>
            {allowedTransitions(booking.status).length === 0 ? (
              <p className="mt-3 text-sm text-ink-subtle">
                This appointment is in a final state and can&rsquo;t be changed.
              </p>
            ) : (
              <div className="mt-4">
                <StatusForm
                  bookingId={booking.id}
                  options={[...allowedTransitions(booking.status)]}
                />
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              Emails
            </h2>
            {notifications.length === 0 ? (
              <p className="mt-3 text-sm text-ink-subtle">Nothing sent yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-xs">
                {notifications.map((n) => (
                  <li key={n.id} className="flex items-center justify-between gap-2">
                    <span className="text-ink-muted">{n.type.toLowerCase()}</span>
                    <span
                      className={
                        n.status === 'SENT'
                          ? 'text-accent'
                          : n.status === 'FAILED'
                            ? 'text-danger'
                            : 'text-ink-subtle'
                      }
                    >
                      {n.status.toLowerCase()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 border-t border-line pt-3 text-2xs leading-relaxed text-ink-subtle">
              &ldquo;Did they get the email?&rdquo; is answerable here. A failed send never
              affects the booking.
            </p>
          </Card>
        </aside>
      </div>
    </>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink">{value}</dd>
    </div>
  )
}
