'use client'

import Link from 'next/link'
import { RefreshCw } from 'lucide-react'

/**
 * Last-resort error boundary.
 *
 * Never renders the error object: a stack trace tells a customer nothing and can leak
 * internals. The digest is shown because it's what support can correlate with the logs.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-5 text-center">
      <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
        Something went wrong
      </p>
      <h1 className="mt-4 max-w-md font-display text-4xl leading-tight tracking-tight text-ink">
        That didn&rsquo;t work
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-muted">
        Sorry — something failed on our side. Your appointment, if you had one, is safe.
        Try again, and if it keeps happening please give us a call.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          onClick={reset}
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-card)] bg-accent px-5 text-sm font-medium text-accent-ink hover:bg-accent-hover"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-[var(--radius-card)] border border-line-strong bg-surface px-5 text-sm font-medium text-ink hover:bg-surface-2"
        >
          Back to the site
        </Link>
      </div>

      {error.digest && (
        <p className="mt-8 font-mono text-2xs text-ink-subtle">Reference: {error.digest}</p>
      )}
    </div>
  )
}
