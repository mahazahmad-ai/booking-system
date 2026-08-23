import { timingSafeEqual } from 'node:crypto'

/**
 * Shared-secret guard for /api/cron/*.
 *
 * Compared with a timing-safe check: a plain `===` leaks how many leading characters were
 * correct, which turns a 32-character secret into a few hundred guesses.
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically.
 */

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  // timingSafeEqual throws on length mismatch, which would itself be a timing signal —
  // so compare lengths first and still run the constant-time check on equal-length input.
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export type CronAuthResult = { ok: true } | { ok: false; response: Response }

export function authoriseCron(request: Request): CronAuthResult {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    // Failing closed: an unset secret must never mean "let everyone in".
    console.error('[cron] CRON_SECRET is not set — refusing to run')
    return {
      ok: false,
      response: Response.json({ error: 'Cron is not configured.' }, { status: 503 }),
    }
  }

  const header = request.headers.get('authorization') ?? ''
  const provided = header.startsWith('Bearer ') ? header.slice(7) : ''

  if (!safeEqual(provided, secret)) {
    return { ok: false, response: Response.json({ error: 'Unauthorised.' }, { status: 401 }) }
  }

  return { ok: true }
}
