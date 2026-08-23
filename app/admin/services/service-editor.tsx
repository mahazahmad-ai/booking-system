'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { ChevronDown, Loader2 } from 'lucide-react'
import { upsertServiceAction, type ActionState } from '@/app/admin/actions'

const initial: ActionState = {}

type Service = {
  id: string
  name: string
  slug: string
  description: string | null
  durationMins: number
  bufferBeforeMins: number
  bufferAfterMins: number
  priceMinor: number
  isActive: boolean
  requiresApproval: boolean
  sortOrder: number
  assignedStaffIds: string[]
}

export function ServiceEditor({
  service,
  allStaff,
  currency,
  currencyDecimals,
  startOpen = false,
}: {
  service?: Service
  allStaff: { id: string; name: string }[]
  currency: string
  currencyDecimals: number
  startOpen?: boolean
}) {
  const [state, formAction] = useActionState(upsertServiceAction, initial)
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
        {open ? 'Close' : service ? 'Edit' : 'New treatment'}
      </button>

      {open && (
        <form action={formAction} className="mt-5 space-y-4">
          {service && <input type="hidden" name="id" value={service.id} />}

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

          <div className="grid gap-4 sm:grid-cols-2">
            <Text label="Name" name="name" defaultValue={service?.name ?? ''} />
            <Text
              label="URL slug"
              name="slug"
              defaultValue={service?.slug ?? ''}
              hint="Lowercase, hyphens. Used in the booking link."
            />
          </div>

          <div>
            <label htmlFor={`desc-${service?.id ?? 'new'}`} className="block text-sm font-medium text-ink">
              Description
            </label>
            <textarea
              id={`desc-${service?.id ?? 'new'}`}
              name="description"
              rows={2}
              maxLength={600}
              defaultValue={service?.description ?? ''}
              className="mt-2 w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Text label="Minutes" name="durationMins" type="number" defaultValue={String(service?.durationMins ?? 60)} />
            <Text label="Buffer before" name="bufferBeforeMins" type="number" defaultValue={String(service?.bufferBeforeMins ?? 0)} />
            <Text label="Buffer after" name="bufferAfterMins" type="number" defaultValue={String(service?.bufferAfterMins ?? 0)} />
            <Text
              label={`Price (${currency}${currencyDecimals === 0 ? '' : ', minor units'})`}
              name="priceMinor"
              type="number"
              defaultValue={String(service?.priceMinor ?? 0)}
            />
          </div>

          <Text label="Sort order" name="sortOrder" type="number" defaultValue={String(service?.sortOrder ?? 0)} />

          <fieldset>
            <legend className="text-sm font-medium text-ink">Performed by</legend>
            <p className="mt-1 text-xs text-ink-subtle">
              Only these therapists appear as options, and only their hours are searched.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              {allStaff.map((s) => (
                <label key={s.id} className="inline-flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    name="staffIds"
                    value={s.id}
                    defaultChecked={service?.assignedStaffIds.includes(s.id) ?? false}
                    className="size-4 rounded border-line-strong accent-[var(--accent)]"
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-5">
            <label className="inline-flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={service?.isActive ?? true}
                className="size-4 rounded border-line-strong accent-[var(--accent)]"
              />
              Bookable online
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="requiresApproval"
                defaultChecked={service?.requiresApproval ?? false}
                className="size-4 rounded border-line-strong accent-[var(--accent)]"
              />
              Needs my approval
            </label>
          </div>

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
      {pending ? 'Saving…' : 'Save treatment'}
    </button>
  )
}
