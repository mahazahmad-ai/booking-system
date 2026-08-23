/**
 * Postgres SQLSTATE extraction.
 *
 * Prisma wraps database errors in its own envelope and reports the real SQLSTATE in the
 * message as "Code: `23P01`". Prisma's own P-codes (P2002, P2010…) are NOT SQLSTATEs, so
 * they are skipped — otherwise an exclusion violation reads as P2010 and the code that
 * turns it into a friendly 409 never fires.
 *
 * Shared by the booking service and scripts/verify-constraints.ts so both agree on what
 * a given failure means.
 */

/** Two active bookings would overlap for one staff member. */
export const EXCLUSION_VIOLATION = '23P01'
/** A unique index was violated. */
export const UNIQUE_VIOLATION = '23505'
/** A CHECK constraint was violated. */
export const CHECK_VIOLATION = '23514'
/** Our own code, raised by the booking_timeoff_guard trigger. */
export const TIME_OFF_CONFLICT = 'BK001'

export function sqlState(error: unknown): string | undefined {
  const text = error instanceof Error ? error.message : String(error)

  const fromMessage = /Code:\s*`?([0-9A-Z]{5})`?/.exec(text)?.[1]
  if (fromMessage && !isPrismaCode(fromMessage)) return fromMessage

  const seen = new Set<unknown>()
  let node: unknown = error
  while (node && typeof node === 'object' && !seen.has(node)) {
    seen.add(node)
    const record = node as Record<string, unknown>
    const meta = record.meta as Record<string, unknown> | undefined
    const code = record.code ?? meta?.code
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) && !isPrismaCode(code)) {
      return code
    }
    node = record.cause ?? meta?.cause ?? record.originalError
  }

  return new RegExp(
    `\\b(${EXCLUSION_VIOLATION}|${UNIQUE_VIOLATION}|${CHECK_VIOLATION}|${TIME_OFF_CONFLICT})\\b`,
  ).exec(text)?.[1]
}

function isPrismaCode(code: string): boolean {
  return /^P\d{4}$/.test(code)
}

export function isSqlState(error: unknown, code: string): boolean {
  return sqlState(error) === code
}

/**
 * Unique violations need their own check.
 *
 * Prisma maps them to its OWN error code P2002 for typed client operations, and P-codes
 * are skipped by sqlState() above — so `isSqlState(e, '23505')` is false for exactly the
 * errors it is meant to catch. The exclusion constraint has no P-code mapping, which is
 * why 23P01 comes through unmasked and this asymmetry is easy to miss.
 *
 * Getting this wrong made every deduplicated reminder count as a failed send.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (isSqlState(error, UNIQUE_VIOLATION)) return true

  const seen = new Set<unknown>()
  let node: unknown = error
  while (node && typeof node === 'object' && !seen.has(node)) {
    seen.add(node)
    const record = node as Record<string, unknown>
    if (record.code === 'P2002') return true
    node = record.cause ?? record.originalError
  }
  return /\bP2002\b/.test(error instanceof Error ? error.message : String(error))
}
