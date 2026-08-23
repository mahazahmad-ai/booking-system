'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { createManualBookingAction, type ActionState } from '@/app/admin/actions'

const initial: ActionState = {}

type Props = {
  services: { slug: string; name: string; durationMins: number }[]
  staff: { id: string; name: string }[]
  slots: { iso: string; local: string; staffIds: string[] }[]
  selected: { service: string; staff: string; date: string; override: boolean }
  lockedStaffId: string | null
  minLeadTimeMins: number
  today: string
}

export function ManualBookingForm({
  services,
  staff,
  slots,
  selected,
  lockedStaffId,
  minLeadTimeMins,
  today,
}: Props) {
  const [state, formAction] = useActionState(createManualBookingAction, initial)
  const router = useRouter()

  /**
   * Service, staff, date and override change what is available, so they navigate rather
   * than mutate local state — the slot list is recomputed on the server, where the
   * availability engine already lives.
   */
  function navigate(patch: Partial<typeof selected>) {
    const next = { ...selected, ...patch }
    const q = new URLSearchParams({ service: next.service, date: next.date })
    if (next.staff && next.staff !== 'any') q.set('staff', next.staff)
    if (next.override) q.set('override', '1')
    router.push(`/admin/bookings/new?${q}`)
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="service" value={selected.service} />

      {state.error && (
        <p role="alert" className="flex gap-2 rounded-[var(--radius-slot)] bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="flex gap-2 rounded-[var(--radius-slot)] bg-accent-soft px-3.5 py-2.5 text-sm text-accent">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {state.ok}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-medium text-ink">
          Treatment
          <select
            value={selected.service}
            onChange={(e) => navigate({ service: e.target.value })}
            className="mt-2 h-10 w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3 text-sm font-normal text-ink"
          >
            {services.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name} ({s.durationMins}m)
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-ink">
          Therapist
          <select
            name="staff"
            value={selected.staff}
            onChange={(e) => navigate({ staff: e.target.value })}
            disabled={Boolean(lockedStaffId)}
            className="mt-2 h-10 w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3 text-sm font-normal text-ink disabled:opacity-60"
          >
            {!lockedStaffId && <option value="any">Anyone free</option>}
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-ink">
          Date
          <input
            type="date"
            value={selected.date}
            min={today}
            onChange={(e) => navigate({ date: e.target.value })}
            className="mt-2 h-10 w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3 text-sm font-normal text-ink"
          />
        </label>
      </div>

      <div className="rounded-[var(--radius-slot)] border border-line bg-surface-2 p-4">
        <label className="flex items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            name="overrideLeadTime"
            checked={selected.override}
            onChange={(e) => navigate({ override: e.target.checked })}
            className="mt-0.5 size-4 rounded border-line-strong accent-[var(--accent)]"
          />
          <span>
            Ignore the {Math.round(minLeadTimeMins / 60)}-hour minimum notice
            <span className="mt-0.5 block text-xs text-ink-subtle">
              Lets you book someone in right now. Double-booking and time off are still
              blocked — those aren&rsquo;t overridable.
            </span>
          </span>
        </label>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-ink">Time</legend>
        {slots.length === 0 ? (
          <p className="mt-3 rounded-[var(--radius-slot)] border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-muted">
            Nothing free that day.
            {!selected.override && ' Try ticking the notice override, or another date.'}
          </p>
        ) : (
          <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {slots.map((slot) => (
              <li key={slot.iso}>
                <label className="flex h-11 cursor-pointer items-center justify-center rounded-[var(--radius-slot)] border border-line bg-surface text-sm tabular-nums text-ink hover:border-accent-line has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-accent-ink">
                  <input type="radio" name="startsAt" value={slot.iso} required className="sr-only" />
                  {slot.local}
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset className="grid gap-4 border-t border-line pt-6 sm:grid-cols-3">
        <legend className="sr-only">Customer details</legend>
        <Text label="Name" name="name" autoComplete="off" />
        <Text label="Email" name="email" type="email" autoComplete="off" />
        <Text label="Phone" name="phone" type="tel" autoComplete="off" />
      </fieldset>

      <p className="text-xs text-ink-subtle">
        An existing customer is matched on email; a new one is created. They get the same
        confirmation email and manage link as an online booking.
      </p>

      <div>
        <label htmlFor="note" className="block text-sm font-medium text-ink">
          Note <span className="font-normal text-ink-subtle">(optional)</span>
        </label>
        <textarea
          id="note"
          name="note"
          rows={2}
          maxLength={500}
          className="mt-2 w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-accent focus:outline-none"
        />
      </div>

      <Submit disabled={slots.length === 0} />
    </form>
  )
}

function Text({
  label,
  name,
  type = 'text',
  autoComplete,
}: {
  label: string
  name: string
  type?: string
  autoComplete?: string
}) {
  return (
    <label className="block text-sm font-medium text-ink">
      {label}
      <input
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        className="mt-2 h-10 w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3.5 text-sm font-normal text-ink focus:border-accent focus:outline-none"
      />
    </label>
  )
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-card)] bg-accent px-6 text-sm font-medium text-accent-ink hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? 'Booking…' : 'Create booking'}
    </button>
  )
}
