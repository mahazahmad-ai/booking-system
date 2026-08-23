import { requireAdmin } from '@/lib/auth'
import { getBusiness } from '@/lib/repositories/catalogue.repo'
import { listServicesForAdmin, listStaffForAdmin } from '@/lib/repositories/admin.repo'
import { formatDuration, formatPrice } from '@/lib/utils'
import { Card, PageHeading } from '@/components/admin/ui'
import { ServiceEditor } from './service-editor'

export const dynamic = 'force-dynamic'

/** FR-A4 — name, duration, buffers, price, active flag, and who performs it. */
export default async function ServicesPage() {
  await requireAdmin()
  const business = await getBusiness()
  const [services, staff] = await Promise.all([
    listServicesForAdmin(business.id),
    listStaffForAdmin(business.id, null),
  ])

  return (
    <>
      <PageHeading
        title="Treatments"
        subtitle="Buffers are blocked either side of the appointment — the customer never sees them."
      />

      <div className="space-y-4">
        {services.map((service) => (
          <Card key={service.id} className="p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2 className="font-display text-xl text-ink">
                  {service.name}
                  {!service.isActive && (
                    <span className="ml-2 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-2xs font-sans font-medium text-ink-subtle">
                      hidden
                    </span>
                  )}
                  {service.requiresApproval && (
                    <span className="ml-2 rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-2xs font-sans font-medium text-warning">
                      needs approval
                    </span>
                  )}
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {formatDuration(service.durationMins)}
                  {service.bufferAfterMins > 0 && ` + ${service.bufferAfterMins}m buffer`} ·{' '}
                  {formatPrice(service.priceMinor, business.currency, business.currencyDecimals)} ·{' '}
                  {service._count.bookings} booking(s)
                </p>
              </div>
            </div>

            <ServiceEditor
              service={{
                ...service,
                assignedStaffIds: service.staff.map((s) => s.staffId),
              }}
              allStaff={staff.map((s) => ({ id: s.id, name: s.name }))}
              currencyDecimals={business.currencyDecimals}
              currency={business.currency}
            />
          </Card>
        ))}
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-display text-xl text-ink">Add a treatment</h2>
        <div className="mt-4">
          <ServiceEditor
            allStaff={staff.map((s) => ({ id: s.id, name: s.name }))}
            currencyDecimals={business.currencyDecimals}
            currency={business.currency}
            startOpen={false}
          />
        </div>
      </Card>
    </>
  )
}
