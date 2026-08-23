import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** Page gutter. 20px at 360px wide, opening up on larger screens. */
export function Container({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mx-auto w-full max-w-6xl px-5 sm:px-8', className)} {...props} />
}

/** Vertical rhythm for marketing sections. Tighter on mobile so the page isn't all scroll. */
export function Section({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('py-20 sm:py-28', className)} {...props} />
}

/** Small uppercase label above a section heading. */
export function Eyebrow({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      className={cn(
        'text-2xs font-semibold uppercase tracking-[0.14em] text-ink-subtle',
        className,
      )}
      {...props}
    />
  )
}
