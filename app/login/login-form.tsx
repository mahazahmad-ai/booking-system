'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Loader2 } from 'lucide-react'
import { loginAction, type LoginState } from './actions'

const initialState: LoginState = {}

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(loginAction, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? '/admin'} />

      {state.error && (
        <div
          role="alert"
          className="flex gap-3 rounded-[var(--radius-slot)] border border-danger/30 bg-danger-soft p-3.5 text-sm"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-ink">{state.error}</p>
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          className="mt-2 h-11 w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3.5 text-sm text-ink focus:border-accent focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-2 h-11 w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3.5 text-sm text-ink focus:border-accent focus:outline-none"
        />
      </div>

      <SubmitButton />
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-slot)] bg-accent text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  )
}
