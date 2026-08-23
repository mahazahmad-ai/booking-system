'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { updateTag } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAdmin, requireSession, scopeStaffId } from '@/lib/auth'
import { canTransition, type BookingStatus } from '@/lib/domain/policy'
import { audit } from '@/lib/services/audit.service'
import { createBooking } from '@/lib/services/booking.service'
import { BookingError } from '@/lib/errors'
import { clientIp } from '@/lib/ratelimit'
import { wallToUtc, parseIsoDate } from '@/lib/time'

/**
 * Admin mutations.
 *
 * Every one of these validates with Zod as its first statement and re-checks the session
 * server-side. A STAFF session is pinned to its own staffId from the signed token — never
 * from a form field — so a therapist cannot act on a colleague's calendar by editing the
 * request. Hiding a button is not a control.
 */

export type ActionState = { error?: string; ok?: string }

async function context() {
  const session = await requireSession()
  const business = await db.business.findFirstOrThrow()
  const ip = clientIp(await headers())
  return { session, business, ip }
}

// ── booking status (FR-A9) ───────────────────────────────────────────────────

const statusSchema = z.object({
  bookingId: z.string().min(1).max(60),
  status: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
  reason: z.string().trim().max(300).optional(),
})

export async function updateBookingStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = statusSchema.safeParse({
    bookingId: formData.get('bookingId'),
    status: formData.get('status'),
    reason: formData.get('reason') || undefined,
  })
  if (!parsed.success) return { error: 'That status change is not valid.' }

  const { session, business, ip } = await context()
  const staffScope = await scopeStaffId()

  const booking = await db.booking.findFirst({
    where: { id: parsed.data.bookingId, ...(staffScope ? { staffId: staffScope } : {}) },
    select: { id: true, status: true, reference: true, staffId: true },
  })
  if (!booking) return { error: 'That appointment could not be found.' }

  // The §9 lifecycle, enforced. Without this a COMPLETED booking could be pushed back to
  // PENDING and silently re-occupy a slot that has already passed.
  if (!canTransition(booking.status, parsed.data.status)) {
    return {
      error: `A ${booking.status.toLowerCase()} appointment can't become ${parsed.data.status.toLowerCase()}.`,
    }
  }

  await db.booking.update({
    where: { id: booking.id },
    data: {
      status: parsed.data.status,
      // The CHECK constraint requires a timestamp whenever status is CANCELLED.
      cancelledAt: parsed.data.status === 'CANCELLED' ? new Date() : null,
      cancelReason: parsed.data.status === 'CANCELLED' ? (parsed.data.reason ?? 'Cancelled by staff') : null,
      icsSequence: { increment: 1 },
    },
  })

  await db.bookingHistory.create({
    data: {
      bookingId: booking.id,
      changeType: 'STATUS_CHANGED',
      fromStatus: booking.status,
      toStatus: parsed.data.status,
      actor: 'ADMIN',
      reason: parsed.data.reason ?? null,
    },
  })

  await audit({
    businessId: business.id,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? '',
    action: 'booking.status',
    entityType: 'Booking',
    entityId: booking.id,
    summary: `${booking.reference}: ${booking.status} → ${parsed.data.status}`,
    ip,
  })

  // Cancelling releases the slot, so availability must reflect it immediately.
  updateTag('availability')
  revalidatePath('/admin')
  revalidatePath(`/admin/bookings/${booking.id}`)

  return { ok: 'Updated.' }
}

// ── internal note ────────────────────────────────────────────────────────────

export async function saveInternalNoteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({ bookingId: z.string().min(1).max(60), note: z.string().trim().max(1000) })
    .safeParse({ bookingId: formData.get('bookingId'), note: formData.get('note') ?? '' })
  if (!parsed.success) return { error: 'Could not save that note.' }

  const staffScope = await scopeStaffId()
  const booking = await db.booking.findFirst({
    where: { id: parsed.data.bookingId, ...(staffScope ? { staffId: staffScope } : {}) },
    select: { id: true },
  })
  if (!booking) return { error: 'That appointment could not be found.' }

  await db.booking.update({
    where: { id: booking.id },
    data: { internalNote: parsed.data.note || null },
  })
  revalidatePath(`/admin/bookings/${booking.id}`)
  return { ok: 'Note saved.' }
}

// ── settings (FR-A10) ────────────────────────────────────────────────────────

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(60),
  currency: z.string().trim().length(3).toUpperCase(),
  currencyDecimals: z.coerce.number().int().min(0).max(4),
  slotIntervalMins: z.coerce.number().int().min(5).max(120),
  minLeadTimeMins: z.coerce.number().int().min(0).max(60 * 24 * 30),
  bookingWindowDays: z.coerce.number().int().min(1).max(365),
  cancelWindowHours: z.coerce.number().int().min(0).max(24 * 30),
})

export async function updateSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { error: `${first.path.join('.')}: ${first.message}` }
  }

  // A bad IANA name would silently break every time calculation in the system, so it is
  // validated against the platform's own timezone database rather than a regex.
  try {
    new Intl.DateTimeFormat('en', { timeZone: parsed.data.timezone })
  } catch {
    return { error: `"${parsed.data.timezone}" is not a recognised IANA timezone.` }
  }

  const { session, business, ip } = await context()
  await requireAdmin()

  await db.business.update({ where: { id: business.id }, data: parsed.data })

  await audit({
    businessId: business.id,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? '',
    action: 'settings.update',
    entityType: 'Business',
    entityId: business.id,
    summary: `Settings updated (${parsed.data.timezone}, ${parsed.data.currency}, lead ${parsed.data.minLeadTimeMins}m)`,
    ip,
  })

  updateTag('availability')
  revalidatePath('/admin/settings')
  return { ok: 'Settings saved.' }
}

// ── services (FR-A4) ─────────────────────────────────────────────────────────

const serviceSchema = z.object({
  id: z.string().max(60).optional(),
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only'),
  description: z.string().trim().max(600).optional(),
  durationMins: z.coerce.number().int().min(5).max(600),
  bufferBeforeMins: z.coerce.number().int().min(0).max(240),
  bufferAfterMins: z.coerce.number().int().min(0).max(240),
  priceMinor: z.coerce.number().int().min(0),
  isActive: z.coerce.boolean(),
  requiresApproval: z.coerce.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(999),
  staffIds: z.string().optional(),
})

export async function upsertServiceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = Object.fromEntries(formData)
  const parsed = serviceSchema.safeParse({
    ...raw,
    isActive: formData.get('isActive') === 'on',
    requiresApproval: formData.get('requiresApproval') === 'on',
    staffIds: formData.getAll('staffIds').join(','),
  })
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { error: `${first.path.join('.')}: ${first.message}` }
  }

  const { session, business, ip } = await context()
  await requireAdmin()

  const { id, staffIds, description, ...fields } = parsed.data
  const assigned = (staffIds ?? '').split(',').filter(Boolean)

  const service = id
    ? await db.service.update({
        where: { id },
        data: { ...fields, description: description || null },
      })
    : await db.service.create({
        data: { ...fields, description: description || null, businessId: business.id },
      })

  // Replace the assignment set wholesale — simpler than diffing, and the table is tiny.
  await db.serviceStaff.deleteMany({ where: { serviceId: service.id } })
  if (assigned.length) {
    await db.serviceStaff.createMany({
      data: assigned.map((staffId) => ({ serviceId: service.id, staffId })),
    })
  }

  await audit({
    businessId: business.id,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? '',
    action: id ? 'service.update' : 'service.create',
    entityType: 'Service',
    entityId: service.id,
    summary: `${service.name} — ${fields.durationMins}m, ${assigned.length} staff${fields.isActive ? '' : ', inactive'}`,
    ip,
  })

  updateTag('availability')
  revalidatePath('/admin/services')
  return { ok: `Saved ${service.name}.` }
}

// ── weekly hours (FR-A6) ─────────────────────────────────────────────────────

const hoursSchema = z.object({
  staffId: z.string().min(1).max(60),
  /** "dayOfWeek:startMin-endMin" per block, comma separated. */
  blocks: z.string().max(2000),
})

export async function setWeeklyHoursAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = hoursSchema.safeParse({
    staffId: formData.get('staffId'),
    blocks: formData.get('blocks') ?? '',
  })
  if (!parsed.success) return { error: 'Those hours are not valid.' }

  const { session, business, ip } = await context()
  await requireAdmin()

  const blocks: { dayOfWeek: number; startMin: number; endMin: number }[] = []
  for (const raw of parsed.data.blocks.split(',').filter(Boolean)) {
    const m = /^(\d):(\d{1,4})-(\d{1,4})$/.exec(raw.trim())
    if (!m) return { error: `Could not read "${raw}".` }

    const block = { dayOfWeek: +m[1], startMin: +m[2], endMin: +m[3] }
    // The same invariants the database enforces — checked here so the admin gets a
    // sentence instead of a constraint violation. An overnight shift is two rows.
    if (block.dayOfWeek < 0 || block.dayOfWeek > 6) return { error: 'Day must be 0–6.' }
    if (block.startMin < 0 || block.endMin > 1440 || block.startMin >= block.endMin) {
      return { error: 'Each block must start before it ends, within one day (0–1440).' }
    }
    blocks.push(block)
  }

  await db.$transaction([
    db.availabilityRule.deleteMany({ where: { staffId: parsed.data.staffId } }),
    ...(blocks.length
      ? [db.availabilityRule.createMany({ data: blocks.map((b) => ({ ...b, staffId: parsed.data.staffId })) })]
      : []),
  ])

  await audit({
    businessId: business.id,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? '',
    action: 'hours.set',
    entityType: 'Staff',
    entityId: parsed.data.staffId,
    summary: `Weekly hours set to ${blocks.length} block(s)`,
    ip,
  })

  updateTag('availability')
  revalidatePath('/admin/staff')
  return { ok: 'Hours saved.' }
}

// ── time off (FR-A7) ─────────────────────────────────────────────────────────

const timeOffSchema = z.object({
  staffId: z.string().max(60).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startMin: z.coerce.number().int().min(0).max(1440),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endMin: z.coerce.number().int().min(0).max(1440),
  reason: z.string().trim().max(200).optional(),
})

export async function addTimeOffAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = timeOffSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'Please check the dates and times.' }

  const { session, business, ip } = await context()
  const staffScope = await scopeStaffId()

  // A therapist may only book their own time off; only an owner can close the business.
  const staffId = staffScope ?? (parsed.data.staffId || null)
  if (staffScope && parsed.data.staffId && parsed.data.staffId !== staffScope) {
    return { error: 'You can only add time off for yourself.' }
  }

  const s = parseIsoDate(parsed.data.startDate)
  const e = parseIsoDate(parsed.data.endDate)
  const startsAt = wallToUtc(business.timezone, s.year, s.month, s.day, parsed.data.startMin).instant
  const endsAt = wallToUtc(business.timezone, e.year, e.month, e.day, parsed.data.endMin).instant

  if (endsAt <= startsAt) return { error: 'The end must be after the start.' }

  // Existing bookings are NOT blocked or deleted — the owner needs to be able to close a
  // day and then deal with who was booked. Report the conflict; don't refuse. [C9]
  const affected = await db.booking.count({
    where: {
      businessId: business.id,
      ...(staffId ? { staffId } : {}),
      status: { in: ['PENDING', 'CONFIRMED'] },
      blockStartsAt: { lt: endsAt },
      blockEndsAt: { gt: startsAt },
    },
  })

  const created = await db.timeOff.create({
    data: { businessId: business.id, staffId, startsAt, endsAt, reason: parsed.data.reason || null },
  })

  await audit({
    businessId: business.id,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? '',
    action: 'timeoff.create',
    entityType: 'TimeOff',
    entityId: created.id,
    summary: `${staffId ? 'Staff' : 'Business-wide'} time off ${parsed.data.startDate} → ${parsed.data.endDate}${affected ? ` (${affected} existing booking(s) affected)` : ''}`,
    ip,
  })

  updateTag('availability')
  revalidatePath('/admin/staff')

  return {
    ok: affected
      ? `Time off added — but ${affected} existing booking(s) fall inside it. Please move or cancel them.`
      : 'Time off added.',
  }
}

export async function deleteTimeOffAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = z.string().min(1).max(60).safeParse(formData.get('id'))
  if (!id.success) return { error: 'Not found.' }

  const { session, business, ip } = await context()
  const staffScope = await scopeStaffId()

  const row = await db.timeOff.findFirst({
    where: { id: id.data, businessId: business.id, ...(staffScope ? { staffId: staffScope } : {}) },
  })
  if (!row) return { error: 'Not found.' }

  await db.timeOff.delete({ where: { id: row.id } })
  await audit({
    businessId: business.id,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? '',
    action: 'timeoff.delete',
    entityType: 'TimeOff',
    entityId: row.id,
    summary: `Time off removed (${row.startsAt.toISOString()})`,
    ip,
  })

  updateTag('availability')
  revalidatePath('/admin/staff')
  return { ok: 'Time off removed.' }
}

// ── manual booking (FR-A8) ───────────────────────────────────────────────────

const manualBookingSchema = z.object({
  service: z.string().min(1).max(80),
  staff: z.string().min(1).max(60),
  startsAt: z.iso.datetime(),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().max(160).pipe(z.email()),
  phone: z.string().trim().min(3).max(30),
  note: z.string().trim().max(500).optional(),
  overrideLeadTime: z.coerce.boolean(),
})

/**
 * Book on someone's behalf — the phone and walk-in path.
 *
 * Goes through the SAME createBooking as the public wizard, so the exclusion constraint,
 * the time-off trigger and the booking window all still apply. The single thing an admin
 * may bypass is the customer-facing minimum notice: someone standing at the counter can
 * be booked into the next half-hour.
 */
export async function createManualBookingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = manualBookingSchema.safeParse({
    ...Object.fromEntries(formData),
    overrideLeadTime: formData.get('overrideLeadTime') === 'on',
  })
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { error: `${first.path.join('.')}: ${first.message}` }
  }

  const { session, business, ip } = await context()
  const staffScope = await scopeStaffId()

  // A therapist can only fill their own diary.
  if (staffScope && parsed.data.staff !== staffScope) {
    return { error: 'You can only add bookings to your own calendar.' }
  }

  const { overrideLeadTime, ...input } = parsed.data

  try {
    const booking = await createBooking(input, { leadTimeOverride: overrideLeadTime })

    await audit({
      businessId: business.id,
      actorUserId: session.user.id,
      actorEmail: session.user.email ?? '',
      action: 'booking.create.manual',
      entityType: 'Booking',
      entityId: booking.reference,
      summary: `Manual booking ${booking.reference} for ${input.name}${overrideLeadTime ? ' (lead time overridden)' : ''}`,
      ip,
    })

    updateTag('availability')
    revalidatePath('/admin')
    revalidatePath('/admin/bookings')

    return { ok: `Booked — ${booking.reference} with ${booking.staffName}.` }
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message }
    console.error('manual booking failed', e)
    return { error: 'Could not create that booking.' }
  }
}

// ── staff (FR-A5) ────────────────────────────────────────────────────────────

const staffSchema = z.object({
  id: z.string().max(60).optional(),
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only'),
  bio: z.string().trim().max(600).optional(),
  isActive: z.coerce.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(999),
  serviceIds: z.string().optional(),
})

/**
 * Add or edit a therapist, and set which treatments they perform.
 *
 * There is no delete. A therapist with bookings cannot be removed without destroying
 * history — deactivating hides them from the booking flow while leaving every past
 * appointment intact, which is what a business actually wants when someone leaves.
 */
export async function upsertStaffAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = staffSchema.safeParse({
    ...Object.fromEntries(formData),
    isActive: formData.get('isActive') === 'on',
    serviceIds: formData.getAll('serviceIds').join(','),
  })
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { error: `${first.path.join('.')}: ${first.message}` }
  }

  const { session, business, ip } = await context()
  await requireAdmin()

  const { id, serviceIds, bio, ...fields } = parsed.data
  const assigned = (serviceIds ?? '').split(',').filter(Boolean)

  const staff = id
    ? await db.staff.update({ where: { id }, data: { ...fields, bio: bio || null } })
    : await db.staff.create({
        data: { ...fields, bio: bio || null, businessId: business.id },
      })

  await db.serviceStaff.deleteMany({ where: { staffId: staff.id } })
  if (assigned.length) {
    await db.serviceStaff.createMany({
      data: assigned.map((serviceId) => ({ serviceId, staffId: staff.id })),
    })
  }

  await audit({
    businessId: business.id,
    actorUserId: session.user.id,
    actorEmail: session.user.email ?? '',
    action: id ? 'staff.update' : 'staff.create',
    entityType: 'Staff',
    entityId: staff.id,
    summary: `${staff.name} — ${assigned.length} treatment(s)${fields.isActive ? '' : ', inactive'}`,
    ip,
  })

  updateTag('availability')
  revalidatePath('/admin/staff')
  return { ok: `Saved ${staff.name}.` }
}

export type { BookingStatus }
