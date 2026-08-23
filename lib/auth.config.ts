import type { NextAuthConfig } from 'next-auth'

/**
 * EDGE-SAFE auth configuration.
 *
 * This file is imported by middleware.ts, which runs in the Edge runtime. It must
 * therefore import NOTHING that needs Node: no Prisma, no @node-rs/argon2, no crypto.
 * The provider list here is deliberately empty — the real Credentials provider, with the
 * password check that needs argon2, lives in lib/auth.ts on the Node runtime.
 *
 * Getting this wrong produces a genuinely baffling failure: the build succeeds and the
 * middleware crashes at request time complaining about a missing native binding.
 * See docs/GAP-ANALYSIS.md [B11].
 */

export const authConfig = {
  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: {
    // Credentials sign-in does not support database sessions in Auth.js — JWT only.
    // That is also why there is no adapter and no Account/Session tables. [B12]
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // an 8-hour shift; sessions expire (FR-A1)
  },

  providers: [],

  callbacks: {
    /** Gate every /admin route. Runs in middleware, so it must stay dependency-free. */
    authorized({ auth, request }) {
      const isAdminRoute = request.nextUrl.pathname.startsWith('/admin')
      if (!isAdminRoute) return true
      return Boolean(auth?.user)
    },

    /** Carry role and staffId into the token so pages can scope without a query. */
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role
        token.staffId = (user as { staffId?: string | null }).staffId ?? null
      }
      return token
    },

    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? ''
        session.user.role = (token.role as 'ADMIN' | 'STAFF') ?? 'STAFF'
        session.user.staffId = (token.staffId as string | null) ?? null
      }
      return session
    },
  },
} satisfies NextAuthConfig
