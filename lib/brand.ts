/**
 * Brand + marketing copy for the deployed instance.
 *
 * This file and the `@layer base` token block in app/globals.css are the two things a
 * new client changes. Everything else — the availability engine, the wizard, the admin
 * area — is identical between deployments. Scheduling data (services, staff, hours,
 * prices) lives in the database, not here; this is only what the marketing pages say.
 */

export const brand = {
  name: 'Noor Wellness',
  nameShort: 'Noor',
  tagline: 'Considered treatments, unhurried appointments.',
  description:
    'A small wellness studio in Karachi. Facials, massage and skin therapy, booked in under a minute — no account, no phone tag.',

  city: 'Karachi',
  timezoneLabel: 'Pakistan Standard Time',

  phone: '+92 21 3456 7890',
  email: 'hello@noorwellness.example',
  address: {
    line1: '2nd Floor, 14-C Khayaban-e-Bukhari',
    line2: 'Phase VI, DHA',
    city: 'Karachi 75500',
  },

  /** Rendered in the footer. Real hours live on Staff.rules and drive availability. */
  openingHours: [
    { days: 'Monday – Friday', hours: '10:00 – 19:00' },
    { days: 'Saturday', hours: '10:00 – 16:00' },
    { days: 'Sunday', hours: 'Closed' },
  ],

  social: {
    instagram: 'https://instagram.com',
  },
} as const

/** Three claims under the hero. Keep them concrete — vague trust badges read as filler. */
export const trustPoints = [
  {
    title: 'Real availability',
    body: 'Times shown are times you can actually have. The calendar is computed live from each therapist’s hours, not a list someone remembered to update.',
  },
  {
    title: 'No account needed',
    body: 'Name, email, phone. That’s the whole form. Your confirmation arrives with a link to change or cancel whenever you like.',
  },
  {
    title: 'Change it yourself',
    body: 'Reschedule or cancel up to 24 hours before from your confirmation email. No calling during opening hours to reach someone.',
  },
] as const

export const howItWorks = [
  {
    step: '01',
    title: 'Pick a treatment',
    body: 'Each one lists its length and price up front, so there are no surprises at the counter.',
  },
  {
    step: '02',
    title: 'Choose your time',
    body: 'Pick a therapist or leave it to us. Only genuinely free slots appear — never a request you wait on.',
  },
  {
    step: '03',
    title: 'Confirm and go',
    body: 'Your details, one tap, done. The confirmation lands straight in your inbox with a calendar invite.',
  },
] as const
