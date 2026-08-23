'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Loader2 } from 'lucide-react'
import { rescheduleBookingAction, type ManageFormState } from '../actions'

const initialState: ManageFormState = {}

/**
 * Radio-based slot grid.
 *
 * Real radio inputs rather than divs with click handlers: arrow keys move between times,
 * the group is announced correctly, and it still submits if JavaScript never loads
 * (NFR-4). The visual treatment is CSS on :checked.
 */
export function RescheduleForm({
  token,
  slots,
  currentIso,
}: {
  token: string
  slots: { iso: string; local: string }[]
  currentIso: string
}) {
  const [state, formAction] = useActionState(rescheduleBookingAction, initialState)
  const [selected, setSelected] = useState<string>('')

  return (
    <form action={formAction} className="space-y-6">
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

      <fieldset>
        <legend className="sr-only">Choose a new time</legend>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {slots.map((slot) => {
            const isCurrent = slot.iso === currentIso
            return (
              <li key={slot.iso}>
                <label
                  className={
                    'flex h-12 cursor-pointer items-center justify-center rounded-[var(--radius-slot)] border text-sm font-medium tabular-nums transition-colors ' +
                    (selected === slot.iso
                      ? 'border-accent bg-accent text-accent-ink'
                      : isCurrent
                        ? 'border-accent-line bg-accent-soft text-accent'
                        : 'border-line bg-surface text-ink hover:border-accent-line hover:bg-accent-soft/40')
                  }
                >
                  <input
                    type="radio"
                    name="startsAt"
                    value={slot.iso}
                    checked={selected === slot.iso}
                    onChange={(e) => setSelected(e.target.value)}
                    disabled={isCurrent}
                    className="sr-only"
                  />
                  {slot.local}
                  {isCurrent && <span className="sr-only"> (your current time)</span>}
                </label>
              </li>
            )
          })}
        </ul>
      </fieldset>

      <SubmitButton disabled={!selected} />
    </form>
  )
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-card)] bg-accent px-6 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? 'Moving…' : 'Move my appointment'}
    </button>
  )
}
