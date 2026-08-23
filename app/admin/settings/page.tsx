import { requireAdmin } from '@/lib/auth'
import { getBusiness } from '@/lib/repositories/catalogue.repo'
import { listAuditLog } from '@/lib/services/audit.service'
import { Card, PageHeading } from '@/components/admin/ui'
import { SettingsForm } from './settings-form'

export const dynamic = 'force-dynamic'

/** FR-A10 — every scheduling policy value the engine reads. */
export default async function SettingsPage() {
  await requireAdmin()
  const business = await getBusiness()
  const log = await listAuditLog(business.id, 15)

  return (
    <>
      <PageHeading
        title="Settings"
        subtitle="These values drive every availability calculation in the system."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card className="p-6">
          <SettingsForm business={business} />
        </Card>

        <Card className="p-6">
          <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            Recent changes
          </h2>
          <p className="mt-1.5 text-xs text-ink-subtle">
            Every admin change is logged with who made it (FR-S4).
          </p>

          {log.length === 0 ? (
            <p className="mt-4 text-sm text-ink-subtle">Nothing yet.</p>
          ) : (
            <ul className="mt-4 space-y-3 text-xs">
              {log.map((entry) => (
                <li key={entry.id} className="border-b border-line pb-3 last:border-0">
                  <p className="text-ink">{entry.summary}</p>
                  <p className="mt-1 text-ink-subtle">
                    {entry.actorEmail} ·{' '}
                    {new Intl.DateTimeFormat('en', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                      timeZone: business.timezone,
                    }).format(entry.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
