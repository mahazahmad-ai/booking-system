import Link from 'next/link'
import { ArrowRight, Check, Clock } from 'lucide-react'
import { Container, Section, Eyebrow } from '@/components/ui/container'
import { ButtonLink } from '@/components/ui/button'
import { brand, trustPoints, howItWorks } from '@/lib/brand'
import { getBusiness, listServices } from '@/lib/repositories/catalogue.repo'
import { formatDuration, formatPrice } from '@/lib/utils'

// Marketing content, not availability — safe to cache and regenerate hourly.
export const revalidate = 3600

/**
 * Fully static. No client components, so this page ships effectively zero application
 * JavaScript — which is most of how the sub-100kB target in the plan gets met.
 *
 * The treatment list reads from lib/placeholder-data.ts until Phase 3 replaces it with
 * a real query. Component props already match the `Service` model, so that swap touches
 * only the two lines marked below.
 */
export default async function HomePage() {
  const business = await getBusiness()
  const services = await listServices(business.id)

  const currency = business.currency
  const decimals = business.currencyDecimals
  const featured = services.slice(0, 3)

  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="texture-grain absolute inset-0 opacity-60" aria-hidden="true" />
        <div
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-line to-transparent"
          aria-hidden="true"
        />

        <Container className="relative pb-20 pt-16 sm:pb-28 sm:pt-24">
          <div className="max-w-3xl">
            <Eyebrow>{brand.city} · Wellness studio</Eyebrow>

            <h1 className="mt-5 font-display text-[2.75rem] leading-[1.05] tracking-tight text-ink sm:text-6xl lg:text-7xl">
              {brand.tagline}
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">
              {brand.description}
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <ButtonLink href="/book" size="lg" className="w-full sm:w-auto">
                Book an appointment
                <ArrowRight className="size-4" aria-hidden="true" />
              </ButtonLink>
              <ButtonLink
                href="/services"
                size="lg"
                variant="secondary"
                className="w-full sm:w-auto"
              >
                See treatments
              </ButtonLink>
            </div>

            <p className="mt-6 flex items-center gap-2 text-sm text-ink-subtle">
              <Clock className="size-4 shrink-0" aria-hidden="true" />
              Takes about a minute. All times {brand.timezoneLabel}.
            </p>
          </div>
        </Container>
      </section>

      {/* ── Why book here ──────────────────────────────────────────────────── */}
      <Section>
        <Container>
          <ul className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-3">
            {trustPoints.map((point) => (
              <li key={point.title} className="bg-surface p-7">
                <div className="flex size-8 items-center justify-center rounded-full bg-accent-soft">
                  <Check className="size-4 text-accent" aria-hidden="true" />
                </div>
                <h2 className="mt-5 text-base font-semibold text-ink">{point.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{point.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* ── Treatments ─────────────────────────────────────────────────────── */}
      <Section className="border-y border-line bg-surface-2">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-xl">
              <Eyebrow>Treatments</Eyebrow>
              <h2 className="mt-4 font-display text-4xl leading-tight tracking-tight text-ink sm:text-5xl">
                A short list, done properly
              </h2>
              <p className="mt-4 text-base leading-relaxed text-ink-muted">
                Every treatment shows its length and price before you book, and the time you
                pick is time a therapist actually has free.
              </p>
            </div>
            <Link
              href="/services"
              className="group inline-flex items-center gap-2 text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              All treatments
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>

          <ul className="mt-12 grid gap-5 md:grid-cols-3">
            {featured.map((service) => (
              <li key={service.id}>
                <Link
                  href={`/book?service=${service.slug}`}
                  className="group flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-7 transition-colors hover:border-accent-line hover:bg-accent-soft/40"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="font-display text-2xl leading-tight text-ink">
                      {service.name}
                    </h3>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                      {formatPrice(service.priceMinor, currency, decimals)}
                    </span>
                  </div>

                  <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-muted">
                    {service.description}
                  </p>

                  <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
                    <span className="inline-flex items-center gap-1.5 text-xs text-ink-subtle">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {formatDuration(service.durationMins)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent">
                      Book
                      <ArrowRight
                        className="size-3.5 transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <Section>
        <Container>
          <div className="max-w-xl">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-4 font-display text-4xl leading-tight tracking-tight text-ink sm:text-5xl">
              Three steps, no phone call
            </h2>
          </div>

          <ol className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-8">
            {howItWorks.map((item) => (
              <li key={item.step} className="relative">
                <span
                  className="font-display text-5xl leading-none text-accent-line"
                  aria-hidden="true"
                >
                  {item.step}
                </span>
                <h3 className="mt-4 text-base font-semibold text-ink">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      {/* ── Closing CTA ────────────────────────────────────────────────────── */}
      <Section className="pt-0">
        <Container>
          <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-accent px-8 py-16 text-center sm:px-16 sm:py-20">
            <div className="texture-grain absolute inset-0 opacity-25" aria-hidden="true" />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="font-display text-4xl leading-tight tracking-tight text-accent-ink sm:text-5xl">
                Find a time that suits you
              </h2>
              <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-accent-ink/75">
                Live availability for every therapist. No account, no waiting on a reply.
              </p>
              <ButtonLink
                href="/book"
                size="lg"
                className="mt-9 bg-accent-ink text-accent hover:bg-accent-ink/90"
              >
                Book an appointment
                <ArrowRight className="size-4" aria-hidden="true" />
              </ButtonLink>
            </div>
          </div>
        </Container>
      </Section>

      {/* NFR-8 — schema.org so the studio can surface as a local business in search. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'HealthAndBeautyBusiness',
            name: brand.name,
            description: brand.description,
            telephone: brand.phone,
            email: brand.email,
            address: {
              '@type': 'PostalAddress',
              streetAddress: `${brand.address.line1}, ${brand.address.line2}`,
              addressLocality: brand.city,
              addressCountry: 'PK',
            },
            makesOffer: services.map((s) => ({
              '@type': 'Offer',
              itemOffered: { '@type': 'Service', name: s.name, description: s.description },
              priceCurrency: currency,
              price: s.priceMinor,
            })),
          }),
        }}
      />
    </>
  )
}
