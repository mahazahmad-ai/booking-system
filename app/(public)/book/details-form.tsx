'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Loader2 } from 'lucide-react'
import { createBookingAction, type BookingFormState } from './actions'

/**
 * The only client component in the booking flow.
 *
 * Steps 1–3 are plain links and server-rendered markup, so this form is where the wizard's
 * JavaScript budget goes. It exists for two things a link cannot do: disable the button
 * during submission, and show field errors without losing what was typed.
 */

const initialState: BookingFormState = {}

export function DetailsForm({
  service,
  staff,
  startsAt,
  requiresApproval,
}: {
  service: string
  staff: string
  startsAt: string
  requiresApproval: boolean
}) {
  const [state, formAction] = useActionState(createBookingAction, initialState)

  return (
    <form action={formAction} className="space-y-5">
      {/* The server re-reads price, duration and staff from the database; these only
          carry the customer's choices. */}
      <input type="hidden" name="service" value={service} />
      <input type="hidden" name="staff" value={staff} />
      <input type="hidden" name="startsAt" value={startsAt} />

      {state.error && (
        <div
          role="alert"
          className="flex gap-3 rounded-[var(--radius-slot)] border border-danger/30 bg-danger-soft p-4"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-medium text-ink">{state.error}</p>
            {state.code === 'SLOT_TAKEN' && (
              <p className="mt-1 text-ink-muted">
                Someone booked it moments ago.{' '}
                <a href={`/book?service=${service}&staff=${staff}`} className="underline">
                  Pick another time
                </a>
                .
              </p>
            )}
          </div>
        </div>
      )}

      <Field
        label="Your name"
        name="name"
        autoComplete="name"
        required
        errors={state.fieldErrors?.name}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        hint="Your confirmation and the link to change or cancel go here."
        errors={state.fieldErrors?.email}
      />
      <Field
        label="Phone"
        name="phone"
        type="tel"
        autoComplete="tel"
        required
        hint="Only used if we need to reach you about this appointment."
        errors={state.fieldErrors?.phone}
      />

      <div>
        <label htmlFor="note" className="block text-sm font-medium text-ink">
          Anything we should know?{' '}
          <span className="font-normal text-ink-subtle">(optional)</span>
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={500}
          placeholder="Allergies, sensitivities, or what you'd like to focus on."
          className="mt-2 w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none"
        />
      </div>

      {/*
        Honeypot. Hidden from people and from screen readers; bots fill it in and the
        server rejects them with the same generic message. tabIndex -1 so keyboard users
        never land here.
      */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <SubmitButton requiresApproval={requiresApproval} />

      <p className="text-xs leading-relaxed text-ink-subtle">
        By booking you agree we may contact you about this appointment. We don&rsquo;t send
        marketing.
      </p>
    </form>
  )
}

function SubmitButton({ requiresApproval }: { requiresApproval: boolean }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-card)] bg-accent px-6 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending
        ? 'Confirming…'
        : requiresApproval
          ? 'Request this appointment'
          : 'Confirm booking'}
    </button>
  )
}

function Field({
  label,
  name,
  type = 'text',
  hint,
  required,
  autoComplete,
  errors,
}: {
  label: string
  name: string
  type?: string
  hint?: string
  required?: boolean
  autoComplete?: string
  errors?: string[]
}) {
  const hintId = hint ? `${name}-hint` : undefined
  const errorId = errors?.length ? `${name}-error` : undefined

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-ink">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        aria-invalid={errors?.length ? true : undefined}
        className={
          'mt-2 h-11 w-full rounded-[var(--radius-slot)] border bg-surface px-3.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none ' +
          (errors?.length ? 'border-danger' : 'border-line focus:border-accent')
        }
      />
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-ink-subtle">
          {hint}
        </p>
      )}
      {errors?.length ? (
        <p id={errorId} className="mt-1.5 text-xs text-danger">
          {errors[0]}
        </p>
      ) : null}
    </div>
  )
}
