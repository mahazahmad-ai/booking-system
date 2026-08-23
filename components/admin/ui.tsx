import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { BookingStatus } from '@/lib/domain/policy'

/** Shared admin primitives. Server components — the admin area ships almost no JS. */

export function PageHeading({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl leading-tight tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-[var(--radius-card)] border border-line bg-surface', className)}
      {...props}
    />
  )
}

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'default' | 'warning'
}) {
  return (
    <Card className="p-5">
      <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
        {label}
      </p>
      <p
        className={cn(
          'mt-2 font-display text-4xl leading-none tabular-nums',
          tone === 'warning' ? 'text-warning' : 'text-ink',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-ink-subtle">{hint}</p>}
    </Card>
  )
}

const STATUS_STYLES: Record<BookingStatus, string> = {
  CONFIRMED: 'bg-accent-soft text-accent border-accent-line',
  PENDING: 'bg-warning-soft text-warning border-warning/30',
  COMPLETED: 'bg-surface-2 text-ink-muted border-line',
  CANCELLED: 'bg-danger-soft text-danger border-danger/30',
  NO_SHOW: 'bg-danger-soft text-danger border-danger/30',
}

const STATUS_LABELS: Record<BookingStatus, string> = {
  CONFIRMED: 'Confirmed',
  PENDING: 'Awaiting approval',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No-show',
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-2xs font-medium',
        STATUS_STYLES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface-2 px-6 py-12 text-center text-sm text-ink-muted">
      {children}
    </div>
  )
}

export function TabLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex h-8 items-center whitespace-nowrap rounded-lg border px-3 text-xs font-medium transition-colors',
        active
          ? 'border-accent bg-accent text-accent-ink'
          : 'border-line bg-surface text-ink-muted hover:border-accent-line hover:text-ink',
      )}
    >
      {children}
    </Link>
  )
}
