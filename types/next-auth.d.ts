import type { DefaultSession } from 'next-auth'

/**
 * Role and staffId on the session.
 *
 * `staffId` is what makes the STAFF role enforceable: every admin query filters on it
 * server-side, so a therapist can only ever see their own calendar. Hiding a button is
 * not a control.
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: 'ADMIN' | 'STAFF'
      staffId: string | null
    } & DefaultSession['user']
  }

  interface User {
    role?: 'ADMIN' | 'STAFF'
    staffId?: string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: 'ADMIN' | 'STAFF'
    staffId?: string | null
  }
}
