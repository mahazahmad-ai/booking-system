'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2, Trash2 } from 'lucide-react'
import {
  setWeeklyHoursAction,
  addTimeOffAction,
  deleteTimeOffAction,
  type ActionState,
} from '@/app/admin/actions'

const initial: ActionState = {}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type Block = { dayOfWeek: number; startMin: number; endMin: number }

function parse(value: string): Block[] {
  return value
    .split(',')
    .filter(Boolean)
    .map((raw) => {
      const [d, range] = raw.split(':')
      const [s, e] = range.split('-')
      return { dayOfWeek: +d, startMin: +s, endMin: +e }
    })
}

function toTime(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function toMins(value: string) {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}

/**
 * FR-A6 — several blocks per day, which is what makes a lunch break expressible.
 * An overnight shift is entered as two blocks (Mon 22:00–24:00, Tue 00:00–01:00); the
 * database rejects endMin beyond 1440, and interval merging reassembles them.
 */
export function HoursEditor({ staffId, initial: initialValue }: { staffId: string; initial: string }) {
  const [state, formAction] = useActionState(setWeeklyHoursAction, initial)
  const [blocks, setBlocks] = useState<Block[]>(() => parse(initialValue))

  function update(i: number, patch: Partial<Block>) {
    setBlocks((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)))
  }

  return (
    <form action={formAction} className="border-t border-line pt-5">
      <input type="hidden" name="staffId" value={staffId} />
      <input
        type="hidden"
        name="blocks"
        value={blocks.map((b) => `${b.dayOfWeek}:${b.startMin}-${b.endMin}`).join(',')}
      />

      {state.error && (
        <p role="alert" className="mb-3 rounded-[var(--radius-slot)] bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="mb-3 rounded-[var(--radius-slot)] bg-accent-soft px-3 py-2 text-sm text-accent">
          {state.ok}
        </p>
      )}

      <ul className="space-y-2">
        {blocks.map((block, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <select
              value={block.dayOfWeek}
              onChange={(e) => update(i, { dayOfWeek: +e.target.value })}
              aria-label="Day"
              className="h-9 rounded-[var(--radius-slot)] border border-line bg-surface px-2 text-sm text-ink"
            >
              {DAYS.map((d, idx) => (
                <option key={d} value={idx}>
                  {d}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={toTime(block.startMin)}
              onChange={(e) => update(i, { startMin: toMins(e.target.value) })}
              aria-label="Start"
              className="h-9 rounded-[var(--radius-slot)] border border-line bg-surface px-2 text-sm tabular-nums text-ink"
            />
            <span className="text-ink-subtle">–</span>
            <input
              type="time"
              value={toTime(block.endMin === 1440 ? 1439 : block.endMin)}
              onChange={(e) => update(i, { endMin: toMins(e.target.value) })}
              aria-label="End"
              className="h-9 rounded-[var(--radius-slot)] border border-line bg-surface px-2 text-sm tabular-nums text-ink"
            />
            <button
              type="button"
              onClick={() => setBlocks((prev) => prev.filter((_, idx) => idx !== i))}
              aria-label={`Remove ${DAYS[block.dayOfWeek]} block`}
              className="inline-flex size-9 items-center justify-center rounded-[var(--radius-slot)] text-ink-subtle hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setBlocks((prev) => [...prev, { dayOfWeek: 1, startMin: 600, endMin: 1080 }])}
          className="inline-flex h-9 items-center rounded-[var(--radius-slot)] border border-line bg-surface px-3 text-sm text-ink-muted hover:text-ink"
        >
          Add block
        </button>
        <Submit label="Save hours" />
      </div>
    </form>
  )
}

/** FR-A7 — an afternoon, a week of leave, or a business-wide closure. */
export function TimeOffForm({
  staff,
  canCloseBusiness,
  today,
}: {
  staff: { id: string; name: string }[]
  canCloseBusiness: boolean
  today: string
}) {
  const [state, formAction] = useActionState(addTimeOffAction, initial)

  return (
    <form action={formAction} className="space-y-4">
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
        <label className="block text-sm font-medium text-ink">
          Who
          <select
            name="staffId"
            className="mt-2 h-10 w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3 text-sm font-normal text-ink"
          >
            {canCloseBusiness && <option value="">Whole business (closed)</option>}
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Reason
          <input
            name="reason"
            maxLength={200}
            placeholder="Annual leave, training…"
            className="mt-2 h-10 w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3 text-sm font-normal text-ink placeholder:text-ink-subtle"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <label className="block text-sm font-medium text-ink">
          From
          <input
            type="date"
            name="startDate"
            defaultValue={today}
            required
            className="mt-2 h-10 w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3 text-sm font-normal text-ink"
          />
        </label>
        <label className="block text-sm font-medium text-ink">
          At
          <input
            type="time"
            name="startMinTime"
            defaultValue="00:00"
            onChange={(e) => {
              const hidden = e.currentTarget.form?.elements.namedItem('startMin') as HTMLInputElement
              if (hidden) hidden.value = String(toMins(e.target.value))
            }}
            className="mt-2 h-10 w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3 text-sm font-normal tabular-nums text-ink"
          />
          <input type="hidden" name="startMin" defaultValue="0" />
        </label>
        <label className="block text-sm font-medium text-ink">
          Until
          <input
            type="date"
            name="endDate"
            defaultValue={today}
            required
            className="mt-2 h-10 w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3 text-sm font-normal text-ink"
          />
        </label>
        <label className="block text-sm font-medium text-ink">
          At
          <input
            type="time"
            name="endMinTime"
            defaultValue="23:59"
            onChange={(e) => {
              const hidden = e.currentTarget.form?.elements.namedItem('endMin') as HTMLInputElement
              if (hidden) hidden.value = String(toMins(e.target.value))
            }}
            className="mt-2 h-10 w-full rounded-[var(--radius-slot)] border border-line bg-surface px-3 text-sm font-normal tabular-nums text-ink"
          />
          <input type="hidden" name="endMin" defaultValue="1439" />
        </label>
      </div>

      <Submit label="Add time off" />
    </form>
  )
}

export function DeleteTimeOffButton({ id }: { id: string }) {
  const [, formAction] = useActionState(deleteTimeOffAction, initial)

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-label="Remove this time off"
        className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle hover:bg-danger-soft hover:text-danger"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </button>
    </form>
  )
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-slot)] bg-accent px-4 text-sm font-medium text-accent-ink hover:bg-accent-hover disabled:opacity-60"
    >
      {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
      {pending ? 'Saving…' : label}
    </button>
  )
}
