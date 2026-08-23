import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarDays, Clock, LayoutDashboard, LogOut, Scissors, Settings, Users } from 'lucide-react'
import { auth, signOut } from '@/lib/auth'
import { brand } from '@/lib/brand'

export const dynamic = 'force-dynamic'

/**
 * Session guard for the whole admin area.
 *
 * Middleware already blocks unauthenticated requests, but this re-checks server-side on
 * every render. Middleware alone is not an authorisation model — one misconfigured
 * matcher and the entire area is public.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login?next=/admin')

  const isAdmin = session.user.role === 'ADMIN'

  // A therapist gets their own calendar and time off. Catalogue, staff and settings are
  // the owner's alone — and the pages enforce that too, not just this nav.
  const nav = [
    { href: '/admin', label: 'Today', icon: LayoutDashboard, adminOnly: false },
    { href: '/admin/calendar', label: 'Calendar', icon: CalendarDays, adminOnly: false },
    { href: '/admin/bookings', label: 'Bookings', icon: Clock, adminOnly: false },
    { href: '/admin/services', label: 'Treatments', icon: Scissors, adminOnly: true },
    { href: '/admin/staff', label: 'Staff & hours', icon: Users, adminOnly: true },
    { href: '/admin/settings', label: 'Settings', icon: Settings, adminOnly: true },
  ].filter((item) => isAdmin || !item.adminOnly)

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-40 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-5">
          <Link href="/admin" className="font-display text-lg leading-none text-ink">
            {brand.nameShort}
            <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-2xs font-sans font-semibold uppercase tracking-wide text-ink-subtle">
              Admin
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-ink-subtle sm:block">
              {session.user.name ?? session.user.email}
              {!isAdmin && ' · staff'}
            </span>
            <form
              action={async () => {
                'use server'
                await signOut({ redirectTo: '/login' })
              }}
            >
              <button
                type="submit"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <LogOut className="size-3.5" aria-hidden="true" />
                Sign out
              </button>
            </form>
          </div>
        </div>

        <nav aria-label="Admin" className="mx-auto max-w-7xl overflow-x-auto px-5">
          <ul className="flex gap-1 pb-2">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <item.icon className="size-3.5" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8">{children}</main>
    </div>
  )
}
