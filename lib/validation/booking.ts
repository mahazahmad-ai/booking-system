import { z } from 'zod'

/**
 * Input validation. Every Server Action and route handler runs one of these as its FIRST
 * statement — never trust that the client disabled the button.
 */

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date')

export const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/, 'Expected a lowercase slug')

export const availabilityQuerySchema = z.object({
  service: slugSchema,
  date: isoDateSchema,
  /** Omitted or "any" means search across every qualified staff member. */
  staff: z.string().max(60).optional(),
})

export const createBookingSchema = z.object({
  service: slugSchema,
  /** "any" lets the server pick, and retry the next candidate on a collision. */
  staff: z.string().min(1).max(60),
  /** UTC instant of the customer-facing appointment start, as returned by the API. */
  startsAt: z.iso.datetime(),

  name: z.string().trim().min(2, 'Please enter your name').max(80),
  // .max() must come BEFORE .pipe() — a ZodPipe has no string methods.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(160)
    .pipe(z.email('Please enter a valid email address')),
  phone: z
    .string()
    .trim()
    .min(6, 'Please enter a phone number we can reach you on')
    .max(30),
  note: z.string().trim().max(500).optional(),

  /**
   * Honeypot. Real people never see this field, so anything in it is a bot. Named
   * plausibly enough that naive form-fillers take the bait.
   */
  company: z.string().max(0).optional(),
})

export type CreateBookingInput = z.infer<typeof createBookingSchema>

export const manageTokenSchema = z.string().min(20).max(200)

export const cancelBookingSchema = z.object({
  token: manageTokenSchema,
  reason: z.string().trim().max(300).optional(),
})
