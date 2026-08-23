import { createBookingSchema } from '@/lib/validation/booking'
import { createBooking } from '@/lib/services/booking.service'
import { BookingError } from '@/lib/errors'
import { bookingLimit, clientIp } from '@/lib/ratelimit'

/**
 * POST /api/bookings
 *
 * 201 with the reference and manage link, or 409 when the slot went between the
 * customer's read and their write. Rate limited on IP and email (FR-S3).
 *
 * The browser flow uses the Server Action instead; this exists for anything outside the
 * app that needs to book — and both go through the same service, so neither can drift
 * into its own set of rules.
 */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const parsed = createBookingSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid booking.', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  for (const key of [`ip:${clientIp(request.headers)}`, `email:${parsed.data.email}`]) {
    const { success, retryAfterSeconds } = await bookingLimit(key)
    if (!success) {
      return Response.json(
        { error: 'Too many attempts. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
      )
    }
  }

  try {
    const booking = await createBooking(parsed.data)

    return Response.json(
      {
        reference: booking.reference,
        startsAt: booking.startsAt.toISOString(),
        endsAt: booking.endsAt.toISOString(),
        staff: booking.staffName,
        service: booking.serviceName,
        status: booking.requiresApproval ? 'PENDING' : 'CONFIRMED',
        manageUrl: `/booking/${booking.manageToken}`,
      },
      { status: 201 },
    )
  } catch (e) {
    if (e instanceof BookingError) {
      return Response.json({ error: e.message, code: e.code }, { status: e.status })
    }
    // Log the id, never the customer's details (NFR-7).
    console.error('POST /api/bookings failed', e)
    return Response.json({ error: 'Unable to create the booking.' }, { status: 500 })
  }
}
