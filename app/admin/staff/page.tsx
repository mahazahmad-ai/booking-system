import { requireSession, scopeStaffId } from '@/lib/auth'
import { getBusiness } from '@/lib/repositories/catalogue.repo'
import { listStaffForAdmin, listServicesForAdmin, listTimeOff } from '@/lib/repositories/admin.repo'
import { StaffEditor } from './staff-editor'
import { localTimeInZone, isoDateInZone } from '@/lib/time'
import { Card, PageHeading } from '@/components/admin/ui'
import { HoursEditor, TimeOffForm, DeleteTimeOffButton } from './forms'

export const dynamic = 'force-dynamic'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function mins(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

/** FR-A5, A6, A7 — staff, their weekly hours, and time off. */
export default async function StaffPage() {
  const session = await requireSession()
  const staffScope = await scopeStaffId()
  const business = await getBusiness()
  const isAdmin = session.user.role === 'ADMIN'

  const [staff, timeOff, services] = await Promise.all([
    listStaffForAdmin(business.id, staffScope),
    listTimeOff(business.id, staffScope, new Date()),
    isAdmin ? listServicesForAdmin(business.id) : Promise.resolve([]),
  ])

  const tz = business.timezone

  return (
    <>
      <PageHeading
        title={isAdmin ? 'Staff & hours' : 'My hours'}
        subtitle="Hours are wall-clock and stay put across daylight saving. An overnight shift is two blocks."
      />

      <div className="space-y-6">
        {staff.map((person) => (
          <Card key={person.id} className="p-6">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2 className="font-display text-xl text-ink">
                  {person.name}
                  {!person.isActive && (
                    <span className="ml-2 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-2xs font-sans text-ink-subtle">
                      inactive
                    </span>
                  )}
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {person.rules.length} weekly block(s) · {person._count.bookings} booking(s)
                </p>
              </div>
            </div>

            {person.rules.length > 0 && (
              <ul className="mb-5 grid gap-1.5 text-sm sm:grid-cols-2">
                {person.rules.map((rule) => (
                  <li key={rule.id} className="flex gap-3 text-ink-muted">
                    <span className="w-20 shrink-0 text-ink">{DAY_NAMES[rule.dayOfWeek]}</span>
                    <span className="tabular-nums">
                      {mins(rule.startMin)} – {mins(rule.endMin)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {isAdmin && (
              <div className="mb-5">
                <StaffEditor
                  staff={{
                    id: person.id,
                    name: person.name,
                    slug: person.slug,
                    bio: person.bio,
                    isActive: person.isActive,
                    sortOrder: person.sortOrder,
                    assignedServiceIds: person.services.map((s) => s.serviceId),
                    bookingCount: person._count.bookings,
                  }}
                  allServices={services.map((s) => ({ id: s.id, name: s.name }))}
                />
              </div>
            )}

            {isAdmin && (
              <HoursEditor
                staffId={person.id}
                initial={person.rules.map((r) => `${r.dayOfWeek}:${r.startMin}-${r.endMin}`).join(',')}
              />
            )}
          </Card>
        ))}
      </div>

      {isAdmin && (
        <Card className="mt-6 p-6">
          <h2 className="font-display text-xl text-ink">Add a therapist</h2>
          <p className="mt-1 text-sm text-ink-muted">
            They&rsquo;ll need weekly hours before they appear in the booking flow.
          </p>
          <div className="mt-4">
            <StaffEditor allServices={services.map((s) => ({ id: s.id, name: s.name }))} />
          </div>
        </Card>
      )}

      <Card className="mt-8 p-6">
        <h2 className="font-display text-xl text-ink">Time off</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Blocks availability immediately. Existing bookings are not cancelled — you&rsquo;ll be
          told how many are affected so you can move them.
        </p>

        {timeOff.length > 0 && (
          <ul className="mt-5 divide-y divide-line border-y border-line">
            {timeOff.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
                <span className="w-40 shrink-0 font-medium text-ink">
                  {t.staff?.name ?? 'Whole business'}
                </span>
                <span className="flex-1 tabular-nums text-ink-muted">
                  {isoDateInZone(tz, t.startsAt)} {localTimeInZone(tz, t.startsAt)} →{' '}
                  {isoDateInZone(tz, t.endsAt)} {localTimeInZone(tz, t.endsAt)}
                </span>
                {t.reason && <span className="text-ink-subtle">{t.reason}</span>}
                <DeleteTimeOffButton id={t.id} />
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6">
          <TimeOffForm
            staff={staff.map((s) => ({ id: s.id, name: s.name }))}
            canCloseBusiness={isAdmin}
            today={isoDateInZone(tz, new Date())}
          />
        </div>
      </Card>
    </>
  )
}
