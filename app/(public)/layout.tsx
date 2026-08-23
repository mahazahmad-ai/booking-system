import Link from 'next/link'
import { Container } from '@/components/ui/container'
import { ButtonLink } from '@/components/ui/button'
import { brand } from '@/lib/brand'

const nav = [
  { href: '/services', label: 'Treatments' },
  { href: '/team', label: 'Our team' },
  { href: '/visit', label: 'Visit' },
]

/**
 * Deliberately no client components in this shell. There is no mobile drawer — the nav
 * collapses to the one action that matters, and the full list is repeated in the footer.
 * A hamburger menu here would mean shipping JS and a focus trap to a page that otherwise
 * needs neither.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:text-accent-ink"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
        <Container className="flex h-16 items-center justify-between gap-6 sm:h-18">
          <Link
            href="/"
            className="font-display text-2xl leading-none tracking-tight text-ink sm:text-[1.75rem]"
          >
            {brand.name}
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <ButtonLink href="/book" size="sm" className="shrink-0">
            Book now
          </ButtonLink>
        </Container>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="mt-auto border-t border-line bg-surface-2">
        <Container className="grid gap-12 py-16 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <p className="font-display text-2xl leading-none text-ink">{brand.name}</p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-muted">
              {brand.tagline}
            </p>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-ink">Opening hours</h2>
            <dl className="mt-4 space-y-2 text-sm">
              {brand.openingHours.map((row) => (
                <div key={row.days} className="flex justify-between gap-4">
                  <dt className="text-ink-muted">{row.days}</dt>
                  <dd className="tabular-nums text-ink">{row.hours}</dd>
                </div>
              ))}
            </dl>
            {/* FR-C3 — the operating timezone is always stated, never assumed. */}
            <p className="mt-4 text-xs text-ink-subtle">
              All times {brand.timezoneLabel}.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-ink">Visit</h2>
            <address className="mt-4 space-y-1 text-sm not-italic leading-relaxed text-ink-muted">
              <p>{brand.address.line1}</p>
              <p>{brand.address.line2}</p>
              <p>{brand.address.city}</p>
            </address>
            <div className="mt-4 space-y-1 text-sm">
              <p>
                <a
                  href={`tel:${brand.phone.replace(/\s/g, '')}`}
                  className="text-ink-muted underline-offset-4 hover:text-ink hover:underline"
                >
                  {brand.phone}
                </a>
              </p>
              <p>
                <a
                  href={`mailto:${brand.email}`}
                  className="text-ink-muted underline-offset-4 hover:text-ink hover:underline"
                >
                  {brand.email}
                </a>
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-ink">Pages</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-ink-muted underline-offset-4 hover:text-ink hover:underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/book"
                  className="text-ink-muted underline-offset-4 hover:text-ink hover:underline"
                >
                  Book an appointment
                </Link>
              </li>
            </ul>
          </div>
        </Container>

        <div className="border-t border-line">
          <Container className="flex flex-col gap-2 py-6 text-xs text-ink-subtle sm:flex-row sm:items-center sm:justify-between">
            <p>
              © {new Date().getFullYear()} {brand.name}. All rights reserved.
            </p>
            <p>{brand.city}, Pakistan</p>
          </Container>
        </div>
      </footer>
    </div>
  )
}
