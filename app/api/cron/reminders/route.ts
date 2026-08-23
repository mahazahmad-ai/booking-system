import { authoriseCron } from '@/lib/cron-auth'
import { sendTomorrowsReminders, sweepFailedNotifications } from '@/lib/services/cron.service'

/**
 * POST/GET /api/cron/reminders
 *
 * Vercel Cron issues a GET, so both verbs are handled. Guarded by a shared secret
 * compared in constant time.
 *
 * Also sweeps failed notifications while it's here — on Hobby there is only one cron slot
 * a day, so the jobs that can share a run should.
 */
async function run(request: Request) {
  const authorised = authoriseCron(request)
  if (!authorised.ok) return authorised.response

  const started = Date.now()
  try {
    const reminders = await sendTomorrowsReminders()
    const retries = await sweepFailedNotifications()

    // Log counts and dates, never customer addresses (NFR-7).
    console.info('[cron] reminders', { ...reminders, ...retries, ms: Date.now() - started })

    return Response.json({ ok: true, reminders, retries, ms: Date.now() - started })
  } catch (e) {
    console.error('[cron] reminders failed', e)
    return Response.json({ ok: false, error: 'Reminder run failed.' }, { status: 500 })
  }
}

export const GET = run
export const POST = run
