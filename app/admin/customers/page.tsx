import Link from 'next/link'
import { Mail, Phone, Search } from 'lucide-react'
import { requireAdmin } from '@/lib/auth'
import { getBusiness } from '@/lib/repositories/catalogue.repo'
import { listCustomers } from '@/lib/repositories/admin.repo'
import { isoDateInZone } from '@/lib/time'
import { Card, EmptyRow, PageHeading, StatusBadge } from '@/components/admin/ui'

export const dynamic = 'force-dynamic'

/** FR-A11 — customer list with contact details and booking history. */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  // Owner only: this is the whole customer database in one place.
  await requireAdmin()
  const { q } = await searchParams
  const business = await getBusiness()
  const customers = await listCustomers(business.id, q)

  return (
    <>
      <PageHeading
        title="Customers"
        subtitle={`${customers.length} shown · matched on email, so one person is one row`}
        action={
          <Link
            href="/admin/export"
            className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-sm text-ink-muted hover:text-ink"
          >
            Export bookings
          </Link>
        }
      />

      <form className="mb-6 flex max-w-md gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden="true"
          />
          <input
            name="q"
            defaultValue={q ?? ''}
            placeholder="Name, email or phone"
            aria-label="Search customers"
            className="h-10 w-full rounded-[var(--radius-slot)] border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="h-10 rounded-[var(--radius-slot)] bg-accent px-4 text-sm font-medium text-accent-ink hover:bg-accent-hover"
        >
          Search
        </button>
      </form>

      {customers.length === 0 ? (
        <EmptyRow>{q ? `Nobody matches “${q}”.` : 'No customers yet.'}</EmptyRow>
      ) : (
        <div className="space-y-3">
          {customers.map((customer) => (
            <Card key={customer.id} className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <h2 className="font-medium text-ink">{customer.name}</h2>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <a
                      href={`mailto:${customer.email}`}
                      className="inline-flex items-center gap-1.5 text-ink-muted underline-offset-4 hover:text-ink hover:underline"
                    >
                      <Mail className="size-3.5 text-accent" aria-hidden="true" />
                      {customer.email}
                    </a>
                    {customer.phone && (
                      <a
                        href={`tel:${customer.phone.replace(/\s/g, '')}`}
                        className="inline-flex items-center gap-1.5 text-ink-muted underline-offset-4 hover:text-ink hover:underline"
                      >
                        <Phone className="size-3.5 text-accent" aria-hidden="true" />
                        {customer.phone}
                      </a>
                    )}
                  </div>
                </div>
                <span className="text-sm text-ink-subtle">
                  {customer._count.bookings} booking{customer._count.bookings === 1 ? '' : 's'}
                  {' · since '}
                  {isoDateInZone(business.timezone, customer.createdAt)}
                </span>
              </div>

              {customer.bookings.length > 0 && (
                <ul className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
                  {customer.bookings.map((booking, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="w-24 shrink-0 tabular-nums text-ink-subtle">
                        {isoDateInZone(business.timezone, booking.startsAt)}
                      </span>
                      <span className="flex-1 text-ink-muted">{booking.service.name}</span>
                      <StatusBadge status={booking.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      <p className="mt-8 text-xs text-ink-subtle">
        Showing at most 200. Customers are matched on the lowercased email address, so
        different capitalisations are one person rather than two.
      </p>
    </>
  )
}
