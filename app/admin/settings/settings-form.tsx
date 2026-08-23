'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { updateSettingsAction, type ActionState } from '@/app/admin/actions'

const initial: ActionState = {}

type Business = {
  name: string
  timezone: string
  currency: string
  currencyDecimals: number
  slotIntervalMins: number
  minLeadTimeMins: number
  bookingWindowDays: number
  cancelWindowHours: number
}

export function SettingsForm({ business }: { business: Business }) {
  const [state, formAction] = useActionState(updateSettingsAction, initial)

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <p role="alert" className="rounded-[var(--radius-slot)] bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="rounded-[var(--radius-slot)] bg-accent-soft px-3.5 py-2.5 text-sm text-accent">
          {state.ok}
        </p>
      )}

      <fieldset className="space-y-4">
        <legend className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
          Business
        </legend>
        <Field label="Name" name="name" defaultValue={business.name} />
        <Field
          label="Timezone"
          name="timezone"
          defaultValue={business.timezone}
          hint="IANA name, e.g. Asia/Karachi. Never an offset — offsets break across daylight saving."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Currency" name="currency" defaultValue={business.currency} maxLength={3} />
          <Field
            label="Decimal places"
            name="currencyDecimals"
            type="number"
            defaultValue={String(business.currencyDecimals)}
            hint="PKR, JPY and KRW use 0. USD and EUR use 2."
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-line pt-6">
        <legend className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
          Booking rules
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Slot interval (minutes)"
            name="slotIntervalMins"
            type="number"
            defaultValue={String(business.slotIntervalMins)}
            hint="The grid of offered start times."
          />
          <Field
            label="Minimum notice (minutes)"
            name="minLeadTimeMins"
            type="number"
            defaultValue={String(business.minLeadTimeMins)}
            hint="No online bookings sooner than this."
          />
          <Field
            label="Booking window (days)"
            name="bookingWindowDays"
            type="number"
            defaultValue={String(business.bookingWindowDays)}
            hint="How far ahead customers can book."
          />
          <Field
            label="Cancellation window (hours)"
            name="cancelWindowHours"
            type="number"
            defaultValue={String(business.cancelWindowHours)}
            hint="Self-service cancelling closes this far before."
          />
        </div>
      </fieldset>

      <Submit />
    </form>
  )
}

function Field({
  label,
  name,
  hint,
  type = 'text',
  defaultValue,
  maxLength,
}: {
  label: string
  name: string
  hint?: string
  type?: string
  defaultValue: string
  maxLength?: number
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        maxLength={maxLength}
        required
        aria-describedby={hint ? `${name}-hint` : undefined}
        className="mt-2 h-10 w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3.5 text-sm text-ink focus:border-accent focus:outline-none"
      />
      {hint && (
        <p id={`${name}-hint`} className="mt-1.5 text-xs leading-relaxed text-ink-subtle">
          {hint}
        </p>
      )}
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
      {pending ? 'Saving…' : 'Save settings'}
    </button>
  )
}
