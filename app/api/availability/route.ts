import { availabilityQuerySchema } from '@/lib/validation/booking'
import { getDayAvailability } from '@/lib/services/availability.service'
import { availabilityLimit, clientIp } from '@/lib/ratelimit'

/**
 * GET /api/availability?service=<slug>&date=<YYYY-MM-DD>&staff=<id|any>
 *
 * Public and read-only. The wizard itself doesn't call this — its slot grid is server
 * rendered — but the spec's §10 surface exists so the calendar can be embedded elsewhere
 * without re-implementing any of the rules.
 *
 * Returns BOTH the UTC instant and a pre-formatted local string, so no client ever does
 * timezone arithmetic. That is where client-side booking bugs come from.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)

  const parsed = availabilityQuerySchema.safeParse({
    service: url.searchParams.get('service') ?? undefined,
    date: url.searchParams.get('date') ?? undefined,
    staff: url.searchParams.get('staff') ?? undefined,
  })

  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid query', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const { success, retryAfterSeconds } = await availabilityLimit(
    `ip:${clientIp(request.headers)}`,
  )
  if (!success) {
    return Response.json(
      { error: 'Too many requests.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
    )
  }

  try {
    const { staff } = parsed.data
    const availability = await getDayAvailability(parsed.data.service, parsed.data.date, {
      staffId: staff && staff !== 'any' ? staff : undefined,
    })

    return Response.json(
      {
        date: availability.date,
        timezone: availability.timezone,
        serviceId: availability.serviceId,
        durationMins: availability.durationMins,
        slots: availability.slots.map((s) => ({
          startsAt: s.startsAt.toISOString(),
          local: s.local,
          staffIds: s.staffIds,
        })),
      },
      {
        // Short and public: availability is read constantly and a stale minute is
        // acceptable for a read-only view. The exclusion constraint, not this cache, is
        // what guarantees correctness at the moment of booking.
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
      },
    )
  } catch {
    // Never leak the reason — an unknown slug and an internal fault look the same here.
    return Response.json({ error: 'Unable to load availability.' }, { status: 404 })
  }
}
