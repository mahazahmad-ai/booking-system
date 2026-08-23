'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { ChevronDown, Loader2 } from 'lucide-react'
import { upsertStaffAction, type ActionState } from '@/app/admin/actions'

const initial: ActionState = {}

type Staff = {
  id: string
  name: string
  slug: string
  bio: string | null
  isActive: boolean
  sortOrder: number
  assignedServiceIds: string[]
  bookingCount: number
}

/**
 * FR-A5 — add or edit a therapist and set which treatments they perform.
 *
 * No delete. Someone with bookings can't be removed without destroying history;
 * deactivating hides them from the booking flow and leaves the past intact.
 */
export function StaffEditor({
  staff,
  allServices,
  startOpen = false,
}: {
  staff?: Staff
  allServices: { id: string; name: string }[]
  startOpen?: boolean
}) {
  const [state, formAction] = useActionState(upsertStaffAction, initial)
  const [open, setOpen] = useState(startOpen)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        <ChevronDown
          className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
        {open ? 'Close' : staff ? 'Edit details' : 'Add a therapist'}
      </button>

      {open && (
        <form action={formAction} className="mt-5 space-y-4">
          {staff && <input type="hidden" name="id" value={staff.id} />}

          {state.error && (
            <p role="alert" className="rounded-[var(--radius-slot)] bg-danger-soft px-3 py-2 text-sm text-danger">
              {state.error}
            </p>
          )}
          {state.ok && (
            <p role="status" className="rounded-[var(--radius-slot)] bg-accent-soft px-3 py-2 text-sm text-accent">
              {state.ok}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Text label="Name" name="name" defaultValue={staff?.name ?? ''} />
            <Text
              label="URL slug"
              name="slug"
              defaultValue={staff?.slug ?? ''}
              hint="Lowercase, hyphens."
            />
            <Text label="Sort order" name="sortOrder" type="number" defaultValue={String(staff?.sortOrder ?? 0)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink">
              Bio
              <textarea
                name="bio"
                rows={2}
                maxLength={600}
                defaultValue={staff?.bio ?? ''}
                className="mt-2 w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3.5 py-2.5 text-sm font-normal text-ink focus:border-accent focus:outline-none"
              />
            </label>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-ink">Performs</legend>
            <p className="mt-1 text-xs text-ink-subtle">
              Only these treatments search this person&rsquo;s hours.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              {allServices.map((s) => (
                <label key={s.id} className="inline-flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    name="serviceIds"
                    value={s.id}
                    defaultChecked={staff?.assignedServiceIds.includes(s.id) ?? false}
                    className="size-4 rounded border-line-strong accent-[var(--accent)]"
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="inline-flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={staff?.isActive ?? true}
              className="mt-0.5 size-4 rounded border-line-strong accent-[var(--accent)]"
            />
            <span>
              Taking bookings
              {staff && staff.bookingCount > 0 && (
                <span className="mt-0.5 block text-xs text-ink-subtle">
                  Unticking hides them from new bookings. Their {staff.bookingCount} existing
                  appointment(s) are untouched.
                </span>
              )}
            </span>
          </label>

          <Submit />
        </form>
      )}
    </div>
  )
}

function Text({
  label,
  name,
  type = 'text',
  defaultValue,
  hint,
}: {
  label: string
  name: string
  type?: string
  defaultValue: string
  hint?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink">
        {label}
        <input
          name={name}
          type={type}
          defaultValue={defaultValue}
          required
          className="mt-2 h-10 w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3.5 text-sm font-normal text-ink focus:border-accent focus:outline-none"
        />
      </label>
      {hint && <p className="mt-1.5 text-xs text-ink-subtle">{hint}</p>}
    </div>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-slot)] bg-accent px-5 text-sm font-medium text-accent-ink hover:bg-accent-hover disabled:opacity-60"
    >
      {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
      {pending ? 'Saving…' : 'Save therapist'}
    </button>
  )
}
