import { db } from '@/lib/db'
import type { Interval } from '@/lib/domain/interval'
import { TIME_HOLDING_STATUSES } from '@/lib/domain/policy'

/**
 * Admin queries.
 *
 * Every function takes `staffScope`: null for an ADMIN (no filter) or a staff id for a
 * STAFF session. It comes from the signed session, never from a URL — a therapist
 * changing `?staff=` in the address bar must not see a colleague's calendar.
 */

export type BookingRow = Awaited<ReturnType<typeof listBookings>>[number]

function scopeWhere(staffScope: string | null) {
  return staffScope ? { staffId: staffScope } : {}
}

const BOOKING_SELECT = {
  id: true,
  reference: true,
  startsAt: true,
  endsAt: true,
  status: true,
  priceMinor: true,
  currency: true,
  customerNote: true,
  internalNote: true,
  durationMins: true,
  service: { select: { name: true } },
  staff: { select: { id: true, name: true } },
  customer: { select: { name: true, email: true, phone: true } },
} as const

/** Bookings overlapping a window — the calendar and the day view. */
export async function listBookings(args: {
  businessId: string
  window: Interval
  staffScope: string | null
  staffFilter?: string
  statuses?: ('PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW')[]
}) {
  const { businessId, window, staffScope, staffFilter, statuses } = args

  return db.booking.findMany({
    where: {
      businessId,
      ...scopeWhere(staffScope),
      // An explicit filter can only ever narrow further, never widen past the scope.
      ...(staffFilter && !staffScope ? { staffId: staffFilter } : {}),
      ...(statuses?.length ? { status: { in: statuses } } : {}),
      startsAt: { lt: window.end },
      endsAt: { gt: window.start },
    },
    relationLoadStrategy: 'join',
    select: BOOKING_SELECT,
    orderBy: { startsAt: 'asc' },
  })
}

export async function getBookingById(id: string, staffScope: string | null) {
  return db.booking.findFirst({
    where: { id, ...scopeWhere(staffScope) },
    relationLoadStrategy: 'join',
    select: { ...BOOKING_SELECT, manageTokenHash: true, businessId: true },
  })
}

/** Dashboard counters: today, this week, and what's next (FR-A2). */
export async function getDashboardCounts(args: {
  businessId: string
  today: Interval
  week: Interval
  staffScope: string | null
  now: Date
}) {
  const { businessId, today, week, staffScope, now } = args
  const scope = scopeWhere(staffScope)

  const [todayBookings, weekCount, weekCancelled, nextUp, pendingCount] = await Promise.all([
    db.booking.findMany({
      where: {
        businessId,
        ...scope,
        status: { in: ['PENDING', 'CONFIRMED', 'COMPLETED', 'NO_SHOW'] },
        startsAt: { lt: today.end },
        endsAt: { gt: today.start },
      },
      relationLoadStrategy: 'join',
      select: BOOKING_SELECT,
      orderBy: { startsAt: 'asc' },
    }),

    db.booking.count({
      where: {
        businessId,
        ...scope,
        status: { in: [...TIME_HOLDING_STATUSES] },
        startsAt: { gte: week.start, lt: week.end },
      },
    }),

    db.booking.count({
      where: {
        businessId,
        ...scope,
        status: 'CANCELLED',
        startsAt: { gte: week.start, lt: week.end },
      },
    }),

    db.booking.findFirst({
      where: {
        businessId,
        ...scope,
        status: { in: [...TIME_HOLDING_STATUSES] },
        startsAt: { gt: now },
      },
      relationLoadStrategy: 'join',
      select: BOOKING_SELECT,
      orderBy: { startsAt: 'asc' },
    }),

    db.booking.count({
      where: { businessId, ...scope, status: 'PENDING', startsAt: { gt: now } },
    }),
  ])

  return { todayBookings, weekCount, weekCancelled, nextUp, pendingCount }
}

export async function listStaffForAdmin(businessId: string, staffScope: string | null) {
  return db.staff.findMany({
    where: { businessId, ...(staffScope ? { id: staffScope } : {}) },
    relationLoadStrategy: 'join',
    select: {
      id: true,
      name: true,
      slug: true,
      bio: true,
      isActive: true,
      sortOrder: true,
      rules: {
        select: { id: true, dayOfWeek: true, startMin: true, endMin: true },
        orderBy: [{ dayOfWeek: 'asc' }, { startMin: 'asc' }],
      },
      services: { select: { serviceId: true } },
      _count: { select: { bookings: true } },
    },
    orderBy: { sortOrder: 'asc' },
  })
}

export async function listServicesForAdmin(businessId: string) {
  return db.service.findMany({
    where: { businessId },
    relationLoadStrategy: 'join',
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      durationMins: true,
      bufferBeforeMins: true,
      bufferAfterMins: true,
      priceMinor: true,
      isActive: true,
      requiresApproval: true,
      sortOrder: true,
      staff: { select: { staffId: true } },
      _count: { select: { bookings: true } },
    },
    orderBy: { sortOrder: 'asc' },
  })
}

/** FR-A11 — customers with contact details and booking history. */
export async function listCustomers(businessId: string, search?: string) {
  const term = search?.trim()

  return db.customer.findMany({
    where: {
      businessId,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { emailNorm: { contains: term.toLowerCase() } },
              { phone: { contains: term } },
            ],
          }
        : {}),
    },
    relationLoadStrategy: 'join',
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      notes: true,
      createdAt: true,
      _count: { select: { bookings: true } },
      bookings: {
        select: { startsAt: true, status: true, service: { select: { name: true } } },
        orderBy: { startsAt: 'desc' },
        take: 3,
      },
    },
    orderBy: { name: 'asc' },
    take: 200,
  })
}

/** FR-A12 — every booking in a date range, for export. */
export async function listBookingsForExport(args: {
  businessId: string
  window: Interval
  staffScope: string | null
}) {
  return db.booking.findMany({
    where: {
      businessId: args.businessId,
      ...scopeWhere(args.staffScope),
      startsAt: { gte: args.window.start, lt: args.window.end },
    },
    relationLoadStrategy: 'join',
    select: {
      reference: true,
      startsAt: true,
      endsAt: true,
      status: true,
      durationMins: true,
      priceMinor: true,
      currency: true,
      createdAt: true,
      customerNote: true,
      service: { select: { name: true } },
      staff: { select: { name: true } },
      customer: { select: { name: true, email: true, phone: true } },
    },
    orderBy: { startsAt: 'asc' },
  })
}

export async function listTimeOff(businessId: string, staffScope: string | null, from: Date) {
  return db.timeOff.findMany({
    where: {
      businessId,
      ...(staffScope ? { OR: [{ staffId: null }, { staffId: staffScope }] } : {}),
      endsAt: { gt: from },
    },
    relationLoadStrategy: 'join',
    select: {
      id: true,
      staffId: true,
      startsAt: true,
      endsAt: true,
      reason: true,
      staff: { select: { name: true } },
    },
    orderBy: { startsAt: 'asc' },
  })
}
