import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind classes, letting later classes win over earlier conflicting ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a price held in minor units.
 *
 * Never assumes two decimal places — PKR, JPY, KRW and ISK have zero. The decimal count
 * is a property of the business, not a constant. See docs/GAP-ANALYSIS.md [C1].
 */
export function formatPrice(minor: number, currency: string, decimals: number) {
  const major = decimals === 0 ? minor : minor / 10 ** decimals
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(major)
}

/** "1 hr 30 min", "45 min" — for service cards and confirmation screens. */
export function formatDuration(mins: number) {
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  const h = `${hours} hr`
  return rest === 0 ? h : `${h} ${rest} min`
}
