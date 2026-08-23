import Link from 'next/link'
import { brand } from '@/lib/brand'

/**
 * Also what an expired or wrong manage token lands on. The copy therefore has to make
 * sense both for "that page doesn't exist" and for "that appointment link no longer
 * works" — without confirming whether a given token was ever valid.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-5 text-center">
      <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
        Not found
      </p>
      <h1 className="mt-4 max-w-md font-display text-4xl leading-tight tracking-tight text-ink">
        We couldn&rsquo;t find that
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-muted">
        The page may have moved, or an appointment link may have expired. Links stop working
        once the appointment has passed.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/book"
          className="inline-flex h-11 items-center rounded-[var(--radius-card)] bg-accent px-5 text-sm font-medium text-accent-ink hover:bg-accent-hover"
        >
          Book an appointment
        </Link>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-[var(--radius-card)] border border-line-strong bg-surface px-5 text-sm font-medium text-ink hover:bg-surface-2"
        >
          Back to the site
        </Link>
      </div>

      <p className="mt-8 text-sm text-ink-subtle">
        Need a hand? Call us on{' '}
        <a href={`tel:${brand.phone.replace(/\s/g, '')}`} className="underline underline-offset-4">
          {brand.phone}
        </a>
      </p>
    </div>
  )
}
