'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import {
  updateBookingStatusAction,
  saveInternalNoteAction,
  type ActionState,
} from '@/app/admin/actions'
import type { BookingStatus } from '@/lib/domain/policy'

const initial: ActionState = {}

const LABELS: Record<BookingStatus, string> = {
  PENDING: 'Awaiting approval',
  CONFIRMED: 'Confirm',
  COMPLETED: 'Mark completed',
  CANCELLED: 'Cancel',
  NO_SHOW: 'Mark no-show',
}

/**
 * Only the transitions the §9 lifecycle allows are offered — and the server re-checks
 * with the same `canTransition` guard, because a disabled option in the DOM is not a
 * control.
 */
export function StatusForm({
  bookingId,
  options,
}: {
  bookingId: string
  options: BookingStatus[]
}) {
  const [state, formAction] = useActionState(updateBookingStatusAction, initial)
  const [status, setStatus] = useState<string>('')

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />

      <Feedback state={state} />

      <select
        name="status"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        required
        aria-label="New status"
        className="h-10 w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
      >
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {LABELS[o]}
          </option>
        ))}
      </select>

      {status === 'CANCELLED' && (
        <input
          name="reason"
          maxLength={300}
          placeholder="Reason (optional)"
          className="h-10 w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none"
        />
      )}

      <Submit disabled={!status} label="Apply" />
    </form>
  )
}

export function InternalNoteForm({ bookingId, value }: { bookingId: string; value: string }) {
  const [state, formAction] = useActionState(saveInternalNoteAction, initial)

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Feedback state={state} />
      <textarea
        name="note"
        rows={3}
        maxLength={1000}
        defaultValue={value}
        placeholder="Anything the team should know."
        className="w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none"
      />
      <Submit label="Save note" />
    </form>
  )
}

function Feedback({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-[var(--radius-slot)] bg-danger-soft px-3 py-2 text-xs text-danger">
        {state.error}
      </p>
    )
  }
  if (state.ok) {
    return (
      <p role="status" className="rounded-[var(--radius-slot)] bg-accent-soft px-3 py-2 text-xs text-accent">
        {state.ok}
      </p>
    )
  }
  return null
}

function Submit({ label, disabled }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-slot)] bg-accent px-4 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
      {pending ? 'Saving…' : label}
    </button>
  )
}
