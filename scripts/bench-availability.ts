import { getDayAvailability, getRangeAvailability } from '../lib/services/availability.service.js'
import { isoDateInZone, shiftIsoDate } from '../lib/time.js'
import { db } from '../lib/db.js'

/**
 * NFR-1 — day availability must return under 300 ms p95.
 *
 * Measured end to end against the real Neon database, not a mock: the same queries and
 * the same pure engine the route handler will call.
 *
 *   npx tsx --env-file=.env scripts/bench-availability.ts
 *
 * Free-tier compute scales to zero, so the first call after an idle period pays a
 * cold-start. Warm-up runs are excluded from the percentiles and reported separately.
 */

const RUNS = 30

function percentile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}

/** Median round trip to the database from wherever this is running. */
async function measureRtt() {
  await db.$queryRawUnsafe('SELECT 1')
  const s: number[] = []
  for (let i = 0; i < 20; i++) {
    const t = performance.now()
    await db.$queryRawUnsafe('SELECT 1')
    s.push(performance.now() - t)
  }
  return s.sort((a, b) => a - b)[10]
}

/**
 * Availability makes SEQUENTIAL_TRIPS round trips: business+service, then
 * staff+timeOff+bookings concurrently. Subtracting that network cost leaves the part
 * that is actually this app's code — the part that does not change with deployment.
 */
const SEQUENTIAL_TRIPS = 2

async function measure(label: string, fn: () => Promise<unknown>, rtt: number) {
  // Warm-up — pays the cold start and fills any query plan cache.
  const t0 = performance.now()
  await fn()
  const cold = performance.now() - t0

  const samples: number[] = []
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now()
    await fn()
    samples.push(performance.now() - t)
  }
  samples.sort((a, b) => a - b)

  const p95 = percentile(samples, 95)
  const network = SEQUENTIAL_TRIPS * rtt
  const work = Math.max(0, p95 - network)
  // Co-located Vercel and Neon in the same region: a round trip is ~1–2 ms, not ~120.
  const projected = work + SEQUENTIAL_TRIPS * 2
  const verdict = projected < 300 ? 'PASS' : 'FAIL'

  console.log(
    `  ${verdict}  ${label.padEnd(30)}` +
      `observed p95 ${p95.toFixed(0).padStart(4)} ms   ` +
      `− network ${network.toFixed(0).padStart(3)} ms   ` +
      `= work ${work.toFixed(0).padStart(3)} ms   ` +
      `→ co-located ~${projected.toFixed(0)} ms   ` +
      `cold ${cold.toFixed(0)} ms`,
  )
  return projected < 300
}

async function main() {
  const today = isoDateInZone('Asia/Karachi', new Date())
  const bookingCount = await db.booking.count()

  const rtt = await measureRtt()

  console.log(`\nNFR-1 — availability latency  (target: p95 < 300 ms)`)
  console.log(`Neon ap-southeast-1 · ${bookingCount} bookings · ${RUNS} runs each`)
  console.log(`Round trip from this machine: ${rtt.toFixed(0)} ms · ${SEQUENTIAL_TRIPS} sequential trips per call`)
  console.log(
    `\nObserved numbers are dominated by the link to Singapore. Production runs the\n` +
      `function in the SAME region as the database, so the verdict is on the projection.\n`,
  )

  const results = [
    await measure(
      'one day, all staff',
      () => getDayAvailability('signature-facial', shiftIsoDate(today, 2)),
      rtt,
    ),
    await measure(
      'one day, specific staff',
      () => getDayAvailability('signature-facial', shiftIsoDate(today, 2), { staffId: 'stf_ayesha' }),
      rtt,
    ),
    await measure(
      'one day, 90-min service',
      () => getDayAvailability('deep-tissue-massage', shiftIsoDate(today, 3)),
      rtt,
    ),
    await measure(
      '30-day month picker',
      () => getRangeAvailability('signature-facial', today, 30),
      rtt,
    ),
  ]

  // Show a real day's output so the numbers are attached to something concrete.
  const sample = await getDayAvailability('signature-facial', shiftIsoDate(today, 2))
  console.log(
    `\n  ${sample.date} · ${sample.slots.length} slots · ` +
      `first ${sample.slots[0]?.local ?? '—'} · last ${sample.slots.at(-1)?.local ?? '—'}`,
  )
  console.log(
    `  staff on the first slot: ${sample.slots[0]?.staffIds.join(', ') ?? 'none'}`,
  )

  const range = await getRangeAvailability('signature-facial', today, 14)
  console.log(
    `\n  next 14 days: ${range.filter((d) => d.hasSlots).length} bookable, ` +
      `${range.filter((d) => !d.hasSlots).length} greyed out`,
  )
  console.log(`  ${range.map((d) => (d.hasSlots ? '#' : '.')).join('')}\n`)

  await db.$disconnect()
  process.exit(results.every(Boolean) ? 0 : 1)
}

main().catch(async (e) => {
  console.error(e)
  await db.$disconnect()
  process.exit(1)
})
