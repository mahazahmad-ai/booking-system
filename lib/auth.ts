import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { verify } from '@node-rs/argon2'
import { z } from 'zod'
import { authConfig } from '@/lib/auth.config'
import { db } from '@/lib/db'

/**
 * NODE-RUNTIME auth. Imports Prisma and argon2, so it must never be pulled into
 * middleware — that is what lib/auth.config.ts exists for.
 */

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().max(160).pipe(z.email()),
  password: z.string().min(1).max(200),
})

/**
 * A hash of a throwaway password, used to burn roughly the same CPU when no user exists
 * as when one does. Without it, "unknown email" returns noticeably faster than "wrong
 * password" and the login form becomes an account-enumeration oracle.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Xf7BQNwJ8bnRLKZ0dQZ9lJhQmXwqYQeVJqzMxUZQxJk'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  providers: [
    Credentials({
      credentials: { email: {}, password: {} },

      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw)
        if (!parsed.success) return null

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
          select: {
            id: true,
            email: true,
            passwordHash: true,
            role: true,
            staffId: true,
            isActive: true,
            staff: { select: { name: true } },
          },
        })

        // Always verify something, even when the account is missing or disabled, so the
        // response time doesn't reveal which.
        const hash = user?.isActive ? user.passwordHash : DUMMY_HASH
        let ok = false
        try {
          ok = await verify(hash, parsed.data.password)
        } catch {
          ok = false
        }

        if (!user || !user.isActive || !ok) return null

        // Fire-and-forget; a failed timestamp write must not block a valid login.
        db.user
          .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
          .catch(() => {})

        return {
          id: user.id,
          email: user.email,
          name: user.staff?.name ?? user.email,
          role: user.role,
          staffId: user.staffId,
        }
      },
    }),
  ],
})

/**
 * The session, or throw. Every admin page and Server Action calls this — the session is
 * re-checked server-side on every request, never inferred from the client.
 */
export async function requireSession() {
  const session = await auth()
  if (!session?.user) throw new Error('UNAUTHENTICATED')
  return session
}

/** The session, or throw unless the user is an ADMIN. */
export async function requireAdmin() {
  const session = await requireSession()
  if (session.user.role !== 'ADMIN') throw new Error('FORBIDDEN')
  return session
}

/**
 * The staff id an admin query must be scoped to.
 *
 * ADMIN sees everything (null = no filter). STAFF is pinned to their own row — the value
 * comes from the signed session, never from a query parameter, so it cannot be tampered
 * with by changing a URL.
 */
export async function scopeStaffId(): Promise<string | null> {
  const session = await requireSession()
  return session.user.role === 'ADMIN' ? null : session.user.staffId
}
