import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Clock } from 'lucide-react'
import { Container, Section, Eyebrow } from '@/components/ui/container'
import { brand } from '@/lib/brand'
import { getBusiness, listServices, listStaff } from '@/lib/repositories/catalogue.repo'
import { formatDuration, formatPrice } from '@/lib/utils'

// NFR-8 — unique metadata per page, server-rendered.
export const metadata: Metadata = {
  title: 'Treatments',
  description: `Facials, massage and skin therapy at ${brand.name} in ${brand.city}. Every treatment lists its length and price up front.`,
}

// The catalogue changes rarely; let the CDN hold it and regenerate hourly.
export const revalidate = 3600

export default async function ServicesPage() {
  const business = await getBusiness()
  const [services, staff] = await Promise.all([
    listServices(business.id),
    listStaff(business.id),
  ])

  return (
    <>
      <section className="border-b border-line">
        <Container className="py-16 sm:py-20">
          <Eyebrow>Treatments</Eyebrow>
          <h1 className="mt-5 max-w-2xl font-display text-5xl leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Everything we offer, with the price on it
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">
            No consultation fee to find out what something costs. Pick a treatment and the
            next screen shows you real times, not a request form.
          </p>
        </Container>
      </section>

      <Section>
        <Container>
          <ul className="grid gap-5 md:grid-cols-2">
            {services.map((service) => {
              const performedBy = staff.filter((person) =>
                person.services.some((s) => s.service.slug === service.slug),
              )

              return (
                <li key={service.id}>
                  <article className="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-7">
                    <div className="flex items-baseline justify-between gap-4">
                      <h2 className="font-display text-3xl leading-tight text-ink">
                        {service.name}
                      </h2>
                      <span className="shrink-0 text-base font-semibold tabular-nums text-ink">
                        {formatPrice(
                          service.priceMinor,
                          business.currency,
                          business.currencyDecimals,
                        )}
                      </span>
                    </div>

                    <p className="mt-4 flex-1 text-sm leading-relaxed text-ink-muted">
                      {service.description}
                    </p>

                    <dl className="mt-6 space-y-2 border-t border-line pt-5 text-sm">
                      <div className="flex gap-3">
                        <dt className="text-ink-subtle">Length</dt>
                        <dd className="inline-flex items-center gap-1.5 text-ink">
                          <Clock className="size-3.5" aria-hidden="true" />
                          {formatDuration(service.durationMins)}
                        </dd>
                      </div>
                      <div className="flex gap-3">
                        <dt className="shrink-0 text-ink-subtle">With</dt>
                        <dd className="text-ink">
                          {performedBy.map((s) => s.name.split(' ')[0]).join(', ') || '—'}
                        </dd>
                      </div>
                      {service.requiresApproval && (
                        <div className="flex gap-3">
                          <dt className="shrink-0 text-ink-subtle">Note</dt>
                          <dd className="text-ink-muted">Confirmed by us before it&rsquo;s final</dd>
                        </div>
                      )}
                    </dl>

                    <Link
                      href={`/book?service=${service.slug}`}
                      className="group mt-6 inline-flex items-center gap-2 text-sm font-medium text-accent underline-offset-4 hover:underline"
                    >
                      Book {service.name}
                      <ArrowRight
                        className="size-4 transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </Link>
                  </article>
                </li>
              )
            })}
          </ul>

          <p className="mt-10 text-sm text-ink-subtle">
            Prices include tax. All appointment times are {brand.timezoneLabel}.
          </p>
        </Container>
      </Section>
    </>
  )
}
