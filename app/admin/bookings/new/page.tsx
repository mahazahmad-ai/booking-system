import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireSession, scopeStaffId } from '@/lib/auth'
import { getBusiness, listServices } from '@/lib/repositories/catalogue.repo'
import { listStaffForAdmin } from '@/lib/repositories/admin.repo'
import { getDayAvailability } from '@/lib/services/availability.service'
import { isoDateInZone } from '@/lib/time'
import { Card, PageHeading } from '@/components/admin/ui'
import { ManualBookingForm } from './manual-booking-form'

export const dynamic = 'force-dynamic'

/**
 * FR-A8 — take a booking over the phone or at the counter.
 *
 * Service, date and override are driven by the URL so the slot list can be recomputed
 * server-side without shipping the availability engine to the browser.
 */
export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; staff?: string; date?: string; override?: string }>
}) {
  await requireSession()
  const sp = await searchParams
  const staffScope = await scopeStaffId()
  const business = await getBusiness()

  const tz = business.timezone
  const today = isoDateInZone(tz, new Date())
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today
  const override = sp.override === '1'

  const [services, staff] = await Promise.all([
    listServices(business.id),
    listStaffForAdmin(business.id, staffScope),
  ])

  const serviceSlug = sp.service ?? services[0]?.slug
  const selectedStaff = staffScope ?? sp.staff

  let slots: { iso: string; local: string; staffIds: string[] }[] = []
  if (serviceSlug) {
    const availability = await getDayAvailability(serviceSlug, date, {
      staffId: selectedStaff && selectedStaff !== 'any' ? selectedStaff : undefined,
      ignoreLeadTime: override,
    })
    slots = availability.slots.map((s) => ({
      iso: s.startsAt.toISOString(),
      local: s.local,
      staffIds: s.staffIds,
    }))
  }

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
        title="New booking"
        subtitle={`For phone and walk-in customers · times in ${tz.replace('_', ' ')}`}
      />

      <Card className="max-w-3xl p-6">
        <ManualBookingForm
          services={services.map((s) => ({
            slug: s.slug,
            name: s.name,
            durationMins: s.durationMins,
          }))}
          staff={staff.map((s) => ({ id: s.id, name: s.name }))}
          slots={slots}
          selected={{ service: serviceSlug ?? '', staff: selectedStaff ?? 'any', date, override }}
          lockedStaffId={staffScope}
          minLeadTimeMins={business.minLeadTimeMins}
          today={today}
        />
      </Card>
    </>
  )
}
