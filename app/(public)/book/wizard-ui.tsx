import Link from 'next/link'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Shared chrome for the booking wizard. Server components — no client JS. */

export const STEPS = ['Treatment', 'Therapist', 'Time', 'Details'] as const

export function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="Booking progress">
      {STEPS.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo'
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full text-xs font-semibold',
                state === 'done' && 'bg-accent text-accent-ink',
                state === 'current' && 'bg-accent-soft text-accent ring-1 ring-accent-line',
                state === 'todo' && 'bg-surface-2 text-ink-subtle',
              )}
            >
              {state === 'done' ? <Check className="size-3.5" aria-hidden="true" /> : i + 1}
            </span>
            <span
              className={cn(
                'text-sm',
                state === 'current' ? 'font-medium text-ink' : 'text-ink-subtle',
              )}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="ml-1 hidden h-px w-6 bg-line sm:block" aria-hidden="true" />
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** A large, keyboard-operable choice card. Real links, so back/forward work. */
export function ChoiceLink({
  href,
  title,
  meta,
  body,
  selected,
}: {
  href: string
  title: string
  meta?: string
  body?: string | null
  selected?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex flex-col rounded-[var(--radius-card)] border bg-surface p-5 text-left transition-colors',
        selected
          ? 'border-accent bg-accent-soft/50'
          : 'border-line hover:border-accent-line hover:bg-accent-soft/30',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-xl leading-tight text-ink">{title}</span>
        {meta && <span className="shrink-0 text-sm font-medium tabular-nums text-ink">{meta}</span>}
      </div>
      {body && <span className="mt-2 text-sm leading-relaxed text-ink-muted">{body}</span>}
    </Link>
  )
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface-2 px-6 py-12 text-center">
      <p className="font-display text-xl text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">{body}</p>
    </div>
  )
}

export function StepHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-4xl leading-tight tracking-tight text-ink sm:text-5xl">
        {title}
      </h1>
      {hint && <p className="mt-3 max-w-lg text-base leading-relaxed text-ink-muted">{hint}</p>}
    </div>
  )
}
