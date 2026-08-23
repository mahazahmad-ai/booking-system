import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Clock, Users } from 'lucide-react'
import { Container } from '@/components/ui/container'
import { formatDuration, formatPrice } from '@/lib/utils'
import { localTimeInZone, isoDateInZone } from '@/lib/time'
import {
  getBusiness,
  listServices,
  getServiceBySlug,
  listStaffForService,
} from '@/lib/repositories/catalogue.repo'
import { getDayAvailability, getRangeAvailability } from '@/lib/services/availability.service'
import { ChoiceLink, EmptyState, StepHeading, Stepper } from './wizard-ui'
import { DetailsForm } from './details-form'

export const metadata: Metadata = {
  title: 'Book an appointment',
  description: 'Choose a treatment, a therapist and a time. No account needed.',
}

// Availability changes on every booking, so this page must never be served stale.
export const dynamic = 'force-dynamic'

type Search = { service?: string; staff?: string; date?: string; slot?: string }

/** Build a wizard URL, dropping empty values so the querystring stays readable. */
function step(params: Search): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `/book?${s}` : '/book'
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const sp = await searchParams
  const business = await getBusiness()
  const today = isoDateInZone(business.timezone, new Date())

  const service = sp.service ? await getServiceBySlug(business.id, sp.service) : null
  const currentStep = !service ? 0 : !sp.staff ? 1 : !sp.slot ? 2 : 3

  return (
    <Container className="py-12 sm:py-16">
      <div className="mb-10">
        <Stepper current={currentStep} />
      </div>

      {currentStep === 0 && <ChooseService businessId={business.id} business={business} />}

      {currentStep === 1 && service && (
        <ChooseStaff businessId={business.id} serviceSlug={service.slug} />
      )}

      {currentStep === 2 && service && (
        <ChooseTime
          serviceSlug={service.slug}
          serviceName={service.name}
          durationMins={service.durationMins}
          staff={sp.staff!}
          date={sp.date ?? today}
          today={today}
          timezone={business.timezone}
          windowDays={business.bookingWindowDays}
        />
      )}

      {currentStep === 3 && service && (
        <ConfirmDetails
          service={service}
          staff={sp.staff!}
          slot={sp.slot!}
          date={sp.date ?? today}
          timezone={business.timezone}
          currency={business.currency}
          decimals={business.currencyDecimals}
          businessId={business.id}
        />
      )}
    </Container>
  )
}

// ── Step 1 ───────────────────────────────────────────────────────────────────

async function ChooseService({
  businessId,
  business,
}: {
  businessId: string
  business: { currency: string; currencyDecimals: number }
}) {
  const services = await listServices(businessId)

  return (
    <>
      <StepHeading
        title="What would you like?"
        hint="Every treatment shows its length and price up front."
      />
      {services.length === 0 ? (
        <EmptyState
          title="Nothing bookable right now"
          body="There are no treatments available online at the moment. Please call us."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {services.map((s) => (
            <ChoiceLink
              key={s.id}
              href={step({ service: s.slug })}
              title={s.name}
              meta={formatPrice(s.priceMinor, business.currency, business.currencyDecimals)}
              body={`${formatDuration(s.durationMins)} · ${s.description ?? ''}`}
            />
          ))}
        </div>
      )}
    </>
  )
}

// ── Step 2 ───────────────────────────────────────────────────────────────────

async function ChooseStaff({
  businessId,
  serviceSlug,
}: {
  businessId: string
  serviceSlug: string
}) {
  const service = await getServiceBySlug(businessId, serviceSlug)
  const staff = service ? await listStaffForService(businessId, service.id) : []

  return (
    <>
      <BackLink href={step({})} label="Change treatment" />
      <StepHeading
        title="Anyone in particular?"
        hint="Pick a therapist, or let us show you every time anyone qualified is free."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <ChoiceLink
          href={step({ service: serviceSlug, staff: 'any' })}
          title="No preference"
          body="See the widest choice of times — we'll assign whoever is free."
        />
        {staff.map((person) => (
          <ChoiceLink
            key={person.id}
            href={step({ service: serviceSlug, staff: person.id })}
            title={person.name}
            body={person.bio}
          />
        ))}
      </div>
    </>
  )
}

// ── Step 3 ───────────────────────────────────────────────────────────────────

async function ChooseTime({
  serviceSlug,
  serviceName,
  durationMins,
  staff,
  date,
  today,
  timezone,
  windowDays,
}: {
  serviceSlug: string
  serviceName: string
  durationMins: number
  staff: string
  date: string
  today: string
  timezone: string
  windowDays: number
}) {
  const staffId = staff === 'any' ? undefined : staff
  const DAYS_SHOWN = 14

  // Two calls, both already round-trip-optimised: one for the date strip's availability
  // flags, one for the chosen day's slots. FR-C4 — never let someone click into an
  // empty day.
  const [range, availability] = await Promise.all([
    getRangeAvailability(serviceSlug, today, Math.min(DAYS_SHOWN, windowDays), { staffId }),
    getDayAvailability(serviceSlug, date, { staffId }),
  ])

  return (
    <>
      <BackLink href={step({ service: serviceSlug })} label="Change therapist" />
      <StepHeading title="Pick a time" hint={`${serviceName} · ${formatDuration(durationMins)}`} />

      {/* Date strip */}
      <div className="-mx-5 mb-8 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <ul className="flex gap-2 pb-2">
          {range.map((day) => {
            const selected = day.date === date
            const label = new Intl.DateTimeFormat('en', {
              weekday: 'short',
              timeZone: 'UTC',
            }).format(localMidnightUtcAsUtc(day.date))
            const dayNum = day.date.slice(8)

            return (
              <li key={day.date}>
                {day.hasSlots ? (
                  <Link
                    href={step({ service: serviceSlug, staff, date: day.date })}
                    aria-current={selected ? 'date' : undefined}
                    className={
                      'flex w-16 flex-col items-center rounded-[var(--radius-slot)] border px-2 py-3 transition-colors ' +
                      (selected
                        ? 'border-accent bg-accent text-accent-ink'
                        : 'border-line bg-surface text-ink hover:border-accent-line hover:bg-accent-soft/40')
                    }
                  >
                    <span className="text-2xs uppercase tracking-wide opacity-70">{label}</span>
                    <span className="mt-1 text-lg font-semibold tabular-nums">{dayNum}</span>
                  </Link>
                ) : (
                  <div
                    aria-disabled="true"
                    title="No availability"
                    className="flex w-16 cursor-not-allowed flex-col items-center rounded-[var(--radius-slot)] border border-dashed border-line bg-surface-2 px-2 py-3 text-ink-subtle"
                  >
                    <span className="text-2xs uppercase tracking-wide opacity-70">{label}</span>
                    <span className="mt-1 text-lg font-semibold tabular-nums line-through">
                      {dayNum}
                    </span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {/* Slot grid — real buttons (links), keyboard operable, 44px targets (NFR-4, NFR-5) */}
      {availability.slots.length === 0 ? (
        <EmptyState
          title="Nothing free that day"
          body="Try another date above — days with no availability are crossed out."
        />
      ) : (
        <>
          <p className="mb-4 flex items-center gap-2 text-sm text-ink-subtle">
            <Clock className="size-4" aria-hidden="true" />
            {availability.slots.length} times available · all times {timezone.replace('_', ' ')}
          </p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {availability.slots.map((slot) => (
              <li key={slot.startsAt.toISOString()}>
                <Link
                  href={step({
                    service: serviceSlug,
                    staff,
                    date,
                    slot: slot.startsAt.toISOString(),
                  })}
                  className="flex h-12 items-center justify-center rounded-[var(--radius-slot)] border border-line bg-surface text-sm font-medium tabular-nums text-ink transition-colors hover:border-accent hover:bg-accent hover:text-accent-ink"
                >
                  {slot.local}
                </Link>
              </li>
            ))}
          </ul>
          {staff === 'any' && (
            <p className="mt-6 flex items-center gap-2 text-xs text-ink-subtle">
              <Users className="size-3.5" aria-hidden="true" />
              We&rsquo;ll assign a therapist when you confirm.
            </p>
          )}
        </>
      )}
    </>
  )
}

// ── Step 4 ───────────────────────────────────────────────────────────────────

async function ConfirmDetails({
  service,
  staff,
  slot,
  date,
  timezone,
  currency,
  decimals,
  businessId,
}: {
  service: {
    id: string
    slug: string
    name: string
    durationMins: number
    priceMinor: number
    requiresApproval: boolean
  }
  staff: string
  slot: string
  date: string
  timezone: string
  currency: string
  decimals: number
  businessId: string
}) {
  const startsAt = new Date(slot)
  // listStaffForService takes a service ID, not a slug.
  const staffList = staff === 'any' ? [] : await listStaffForService(businessId, service.id)
  const chosen = staffList.find((s) => s.id === staff)

  const longDate = new Intl.DateTimeFormat('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  }).format(startsAt)

  return (
    <>
      <BackLink href={step({ service: service.slug, staff, date })} label="Change time" />
      <StepHeading title="Almost done" hint="No account, no password. Just how to reach you." />

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem] lg:gap-12">
        <DetailsForm
          service={service.slug}
          staff={staff}
          startsAt={startsAt.toISOString()}
          requiresApproval={service.requiresApproval}
        />

        <aside className="order-first lg:order-last">
          <div className="rounded-[var(--radius-card)] border border-line bg-surface-2 p-6">
            <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              Your appointment
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Row label="Treatment" value={service.name} />
              <Row label="When" value={`${longDate}, ${localTimeInZone(timezone, startsAt)}`} />
              <Row label="Length" value={formatDuration(service.durationMins)} />
              <Row label="With" value={chosen?.name ?? 'Next available therapist'} />
              <Row
                label="Price"
                value={formatPrice(service.priceMinor, currency, decimals)}
              />
            </dl>
            <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-ink-subtle">
              Times shown in {timezone.replace('_', ' ')}. You can change or cancel from your
              confirmation email.
            </p>
          </div>
        </aside>
      </div>
    </>
  )
}

// ── bits ─────────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-ink-subtle">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  )
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  )
}

/**
 * The weekday label only needs the calendar date, so format the date as if it were UTC.
 * Passing the real instant through a zone-aware formatter risks showing the previous day
 * for zones behind UTC.
 */
function localMidnightUtcAsUtc(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`)
}
