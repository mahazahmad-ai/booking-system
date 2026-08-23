import Link from 'next/link'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap ' +
  'transition-colors duration-150 ease-[var(--ease-out-soft)] ' +
  'disabled:pointer-events-none disabled:opacity-50'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2',
  ghost: 'text-ink-muted hover:text-ink hover:bg-surface-2',
}

// Every size clears 44px of touch target at md and above — over half of booking
// traffic is mobile and a slot you keep mis-tapping is a lost booking (NFR-5).
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm rounded-[var(--radius-slot)]',
  md: 'h-11 px-5 text-sm rounded-[var(--radius-slot)]',
  lg: 'h-13 px-7 text-base rounded-[var(--radius-card)]',
}

function styles(variant: Variant, size: Size, className?: string) {
  return cn(base, variants[variant], sizes[size], className)
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: Size }) {
  return <button className={styles(variant, size, className)} {...props} />
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={styles(variant, size, className)} {...props} />
}
