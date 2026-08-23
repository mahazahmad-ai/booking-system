import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

/**
 * Rate limiting for the public booking endpoint (FR-S3).
 *
 * Uses Upstash when configured. When it isn't — local development, or a deploy where the
 * env vars are missing — it falls back to an in-process limiter so the code path is still
 * exercised and the app still runs. The fallback is NOT a production control: serverless
 * instances don't share memory, so each one keeps its own counter.
 */

const hasUpstash = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
)

export type LimitResult = { success: boolean; retryAfterSeconds: number }

type Limiter = (key: string) => Promise<LimitResult>

function upstashLimiter(tokens: number, window: `${number} ${'s' | 'm' | 'h'}`, prefix: string): Limiter {
  const limiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(tokens, window),
    analytics: true,
    prefix,
  })
  return async (key) => {
    const { success, reset } = await limiter.limit(key)
    return { success, retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) }
  }
}

function memoryLimiter(tokens: number, windowMs: number): Limiter {
  const hits = new Map<string, number[]>()
  return async (key) => {
    const now = Date.now()
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
    if (recent.length >= tokens) {
      const retryAfterSeconds = Math.ceil((windowMs - (now - recent[0])) / 1000)
      hits.set(key, recent)
      return { success: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) }
    }
    recent.push(now)
    hits.set(key, recent)
    return { success: true, retryAfterSeconds: 0 }
  }
}

/** Creating bookings is expensive and abuse-prone: 5 per 10 minutes. */
export const bookingLimit: Limiter = hasUpstash
  ? upstashLimiter(5, '10 m', 'rl:booking')
  : memoryLimiter(5, 10 * 60_000)

/** Browsing availability is cheap; be generous: 60 per minute. */
export const availabilityLimit: Limiter = hasUpstash
  ? upstashLimiter(60, '1 m', 'rl:avail')
  : memoryLimiter(60, 60_000)

/**
 * The client IP, as reported by the platform.
 *
 * NEVER the leftmost value of x-forwarded-for — the client controls that header, so
 * taking the first entry means an attacker rotates a string and the limit never fires.
 * Prefer x-real-ip, which the proxy sets, and otherwise take the RIGHTMOST entry, which
 * is the one appended by the trusted hop. See docs/GAP-ANALYSIS.md [B7].
 */
export function clientIp(headers: Headers): string {
  const real = headers.get('x-real-ip')
  if (real) return real.trim()

  const forwarded = headers.get('x-forwarded-for')
  if (!forwarded) return 'unknown'

  const parts = forwarded.split(',').map((s) => s.trim()).filter(Boolean)
  return parts[parts.length - 1] ?? 'unknown'
}
