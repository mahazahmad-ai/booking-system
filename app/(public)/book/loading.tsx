import { Container } from '@/components/ui/container'

/**
 * Skeleton for the slot grid.
 *
 * The wizard's third step queries availability, so it is the one page with a visible
 * wait. Matching the real layout's dimensions keeps the page from jumping when the
 * content arrives.
 */
export default function BookLoading() {
  return (
    <Container className="py-12 sm:py-16">
      <div className="animate-pulse space-y-10" aria-hidden="true">
        <div className="flex gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-6 w-24 rounded-full bg-surface-2" />
          ))}
        </div>

        <div className="space-y-3">
          <div className="h-12 w-2/3 rounded-lg bg-surface-2" />
          <div className="h-5 w-1/3 rounded bg-surface-2" />
        </div>

        <div className="flex gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-16 w-16 rounded-[var(--radius-slot)] bg-surface-2" />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-12 rounded-[var(--radius-slot)] bg-surface-2" />
          ))}
        </div>
      </div>

      <p className="sr-only" role="status">
        Loading available times…
      </p>
    </Container>
  )
}
