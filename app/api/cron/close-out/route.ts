import { authoriseCron } from '@/lib/cron-auth'
import { closeOutPastBookings } from '@/lib/services/cron.service'

/**
 * POST/GET /api/cron/close-out
 *
 * FR-S5 — move past CONFIRMED appointments to COMPLETED. Idempotent: a second run finds
 * nothing left to change.
 */
async function run(request: Request) {
  const authorised = authoriseCron(request)
  if (!authorised.ok) return authorised.response

  try {
    const result = await closeOutPastBookings()
    console.info('[cron] close-out', result)
    return Response.json({ ok: true, ...result })
  } catch (e) {
    console.error('[cron] close-out failed', e)
    return Response.json({ ok: false, error: 'Close-out run failed.' }, { status: 500 })
  }
}

export const GET = run
export const POST = run
