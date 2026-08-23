'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { updateTag } from 'next/cache'
import { createBookingSchema } from '@/lib/validation/booking'
import { createBooking } from '@/lib/services/booking.service'
import { BookingError } from '@/lib/errors'
import { bookingLimit, clientIp } from '@/lib/ratelimit'

/**
 * The one write the public site can make.
 *
 * Validates first, always. Never trusts that the client disabled the button, and never
 * trusts a price, duration or staff assignment sent from the browser — those are read
 * from the database inside the service.
 */

export type BookingFormState = {
  error?: string
  code?: string
  fieldErrors?: Record<string, string[]>
}

export async function createBookingAction(
  _prev: BookingFormState,
  formData: FormData,
): Promise<BookingFormState> {
  const parsed = createBookingSchema.safeParse({
    service: formData.get('service'),
    staff: formData.get('staff'),
    startsAt: formData.get('startsAt'),
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    note: formData.get('note') || undefined,
    company: formData.get('company') || undefined,
  })

  if (!parsed.success) {
    const flat = parsed.error.flatten()
    // The honeypot is invisible to real people, so a value in it means a bot. Give the
    // same generic failure rather than telling it which check it tripped.
    if (flat.fieldErrors.company) {
      return { error: 'Something went wrong. Please try again.', code: 'INVALID' }
    }
    return {
      error: 'Please check the highlighted fields.',
      code: 'INVALID',
      fieldErrors: flat.fieldErrors as Record<string, string[]>,
    }
  }

  // Rate limit on IP *and* email: one office IP is many legitimate customers, and one
  // determined abuser is many IPs. Neither key works alone. [B7]
  const ip = clientIp(await headers())
  for (const key of [`ip:${ip}`, `email:${parsed.data.email}`]) {
    const { success, retryAfterSeconds } = await bookingLimit(key)
    if (!success) {
      return {
        error: `Too many attempts. Please try again in about ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
        code: 'RATE_LIMITED',
      }
    }
  }

  let manageToken: string
  try {
    const booking = await createBooking(parsed.data)
    manageToken = booking.manageToken
  } catch (e) {
    if (e instanceof BookingError) {
      return { error: e.message, code: e.code }
    }
    console.error('createBooking failed', e)
    return { error: 'Something went wrong on our side. Please try again.', code: 'UNKNOWN' }
  }

  // A new booking changes what is free. updateTag (not revalidateTag) because this is a
  // Server Action and the customer must immediately see a slot list without their slot —
  // read-your-own-writes, not eventual expiry.
  updateTag('availability')

  // redirect() throws by design, so it must sit OUTSIDE the try — inside, the catch above
  // would swallow it and the customer would never reach the confirmation page.
  redirect(`/booking/${manageToken}?new=1`)
}
