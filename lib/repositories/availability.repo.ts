import { db } from '@/lib/db'
import type { Interval } from '@/lib/domain/interval'
import { TIME_HOLDING_STATUSES } from '@/lib/domain/policy'

/**
 * Every query the availability path makes. Owns the queries; makes no decisions.
 *
 * Two rules shape this file, and both are about round trips rather than SQL:
 *
 * 1. ONE query per entity for the WHOLE window, never one per day. The obvious way to
 *    build a month picker is to loop over 30 days and query each — 30 round trips, and
 *    the single most likely performance mistake in this app.
 *
 * 2. NEVER await sequentially what can be awaited in parallel. Availability is served
 *    in exactly TWO sequential round trips: one for business+service, one for
 *    staff+timeOff+bookings together. An earlier version used four, which on a 120 ms
 *    link was 480 ms of nothing but waiting.
 *
 * Every time filter is an OVERLAP test (`start < windowEnd AND end > windowStart`), never
 * containment: a booking running 23:30–00:15 must block the next day's opening slot, and
 * a containment query silently misses it. See docs/GAP-ANALYSIS.md [B3].
 */

export type SchedulingData = {
  staff: {
    id: string
    name: string
    rules: { dayOfWeek: number; startMin: number; endMin: number }[]
  }[]
  timeOff: { staffId: string | null; startsAt: Date; endsAt: Date }[]
  bookings: { staffId: string; blockStartsAt: Date; blockEndsAt: Date }[]
}

/** Business and the requested service in a single round trip. */
export async function getBusinessWithService(slug: string) {
  const business = await db.business.findFirst({
    // Without the join strategy this is two sequential queries, not one.
    relationLoadStrategy: 'join',
    include: { services: { where: { slug, isActive: true }, take: 1 } },
  })
  if (!business) throw new Error('No business configured. Run `npm run db:seed`.')

  const service = business.services[0]
  if (!service) throw new Error(`No active service with slug "${slug}"`)

  return { business, service }
}

export async function listActiveServices(businessId: string) {
  return db.service.findMany({
    where: { businessId, isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
}

/**
 * Everything needed to compute availability over `window`.
 *
 * The three queries run concurrently. That is only possible because time off and bookings
 * are filtered through a relation (`staff.services.some`) rather than through a list of
 * ids fetched first — which would force the staff query to complete before the other two
 * could start, costing an extra sequential round trip for nothing.
 */
export async function getSchedulingData(args: {
  businessId: string
  serviceId: string
  staffId?: string
  window: Interval
}): Promise<SchedulingData> {
  const { businessId, serviceId, staffId, window } = args

  const qualifiedStaff = {
    businessId,
    isActive: true,
    services: { some: { serviceId } },
    ...(staffId ? { id: staffId } : {}),
  }

  const [staff, timeOff, bookings] = await Promise.all([
    db.staff.findMany({
      // The nested `rules` select is otherwise a dependent second query, which would put
      // this branch two round trips deep and negate the concurrency below.
      relationLoadStrategy: 'join',
      where: qualifiedStaff,
      select: {
        id: true,
        name: true,
        rules: { select: { dayOfWeek: true, startMin: true, endMin: true } },
      },
      orderBy: { sortOrder: 'asc' },
    }),

    db.timeOff.findMany({
      where: {
        businessId,
        // A null staffId is a business-wide closure and blocks everyone.
        OR: [{ staffId: null }, { staff: qualifiedStaff }],
        startsAt: { lt: window.end },
        endsAt: { gt: window.start },
      },
      select: { staffId: true, startsAt: true, endsAt: true },
    }),

    db.booking.findMany({
      where: {
        staff: qualifiedStaff,
        // The same predicate as the exclusion constraint: only these hold time.
        status: { in: [...TIME_HOLDING_STATUSES] },
        blockStartsAt: { lt: window.end },
        blockEndsAt: { gt: window.start },
      },
      // Buffers are already inside the block range, so nothing else is needed.
      select: { staffId: true, blockStartsAt: true, blockEndsAt: true },
    }),
  ])

  return { staff, timeOff, bookings }
}
