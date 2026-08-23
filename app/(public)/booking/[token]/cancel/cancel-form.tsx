'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Loader2 } from 'lucide-react'
import { cancelBookingAction, type ManageFormState } from '../actions'

const initialState: ManageFormState = {}

export function CancelForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(cancelBookingAction, initialState)

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="token" value={token} />

      {state.error && (
        <div
          role="alert"
          className="flex gap-3 rounded-[var(--radius-slot)] border border-danger/30 bg-danger-soft p-4 text-sm"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-ink">{state.error}</p>
        </div>
      )}

      <div>
        <label htmlFor="reason" className="block text-sm font-medium text-ink">
          Anything you&rsquo;d like us to know?{' '}
          <span className="font-normal text-ink-subtle">(optional)</span>
        </label>
        <textarea
          id="reason"
          name="reason"
          rows={3}
          maxLength={300}
          placeholder="Not required — but it helps us improve."
          className="mt-2 w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none"
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
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-card)] bg-danger px-6 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? 'Cancelling…' : 'Yes, cancel my appointment'}
    </button>
  )
}
