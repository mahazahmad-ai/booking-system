import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'

/**
 * Route guard for /admin.
 *
 * Next 16 renamed `middleware.ts` to `proxy.ts` and requires a plain default function
 * export — a destructured `export const { auth: middleware }` is not statically
 * detectable and fails the build.
 *
 * Imports lib/auth.config (edge-safe) and NOT lib/auth: pulling the full config in here
 * would drag Prisma and argon2 into the Edge runtime. See docs/GAP-ANALYSIS.md [B11].
 *
 * A first line of defence only. Every admin page and Server Action re-checks the session
 * server-side — one misconfigured matcher must not expose the whole area.
 */
const { auth } = NextAuth(authConfig)

export default auth

export const config = {
  matcher: ['/admin/:path*'],
}
