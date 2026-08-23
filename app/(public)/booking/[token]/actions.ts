'use server'

import { redirect } from 'next/navigation'
import { updateTag } from 'next/cache'
import { cancelBooking, rescheduleBooking } from '@/lib/services/booking.service'
import { BookingError } from '@/lib/errors'
import { cancelBookingSchema } from '@/lib/validation/booking'
import { z } from 'zod'

/**
 * Self-service actions, authorised entirely by the manage token.
 *
 * The token IS the credential — 32 random bytes, never the row id — so possession of the
 * link is what grants access. Every action re-reads the booking from the token rather than
 * trusting an id from the form.
 */

export type ManageFormState = { error?: string; code?: string }

export async function cancelBookingAction(
  _prev: ManageFormState,
  formData: FormData,
): Promise<ManageFormState> {
  const parsed = cancelBookingSchema.safeParse({
    token: formData.get('token'),
    reason: formData.get('reason') || undefined,
  })
  if (!parsed.success) return { error: 'That link is not valid.', code: 'INVALID' }

  try {
    await cancelBooking(parsed.data.token, parsed.data.reason ?? null)
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message, code: e.code }
    console.error('cancelBooking failed', e)
    return { error: 'Something went wrong. Please call us instead.', code: 'UNKNOWN' }
  }

  // Cancelling frees the slot immediately — the next visitor must see it.
  updateTag('availability')
  redirect(`/booking/${parsed.data.token}?cancelled=1`)
}

const rescheduleSchema = z.object({
  token: z.string().min(20).max(200),
  startsAt: z.iso.datetime(),
})

export async function rescheduleBookingAction(
  _prev: ManageFormState,
  formData: FormData,
): Promise<ManageFormState> {
  const parsed = rescheduleSchema.safeParse({
    token: formData.get('token'),
    startsAt: formData.get('startsAt'),
  })
  if (!parsed.success) return { error: 'Please pick a time.', code: 'INVALID' }

  try {
    await rescheduleBooking(parsed.data.token, new Date(parsed.data.startsAt))
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message, code: e.code }
    console.error('rescheduleBooking failed', e)
    return { error: 'Something went wrong. Please call us instead.', code: 'UNKNOWN' }
  }

  updateTag('availability')
  redirect(`/booking/${parsed.data.token}?moved=1`)
}
