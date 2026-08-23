import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { brand } from '@/lib/brand'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const session = await auth()
  if (session?.user) redirect('/admin')

  const { next } = await searchParams

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display text-2xl leading-none text-ink">
          {brand.name}
        </Link>

        <h1 className="mt-8 font-display text-3xl leading-tight tracking-tight text-ink">
          Sign in
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          For staff and the owner. Customers don&rsquo;t need an account.
        </p>

        <div className="mt-8">
          <LoginForm next={next} />
        </div>

        <p className="mt-8 text-center text-sm">
          <Link
            href="/"
            className="text-ink-subtle underline-offset-4 hover:text-ink hover:underline"
          >
            ← Back to the site
          </Link>
        </p>
      </div>
    </div>
  )
}
