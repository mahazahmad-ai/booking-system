import { PrismaClient } from '../prisma/generated/client.js'
import { PrismaPg } from '@prisma/adapter-pg'

/**
 * Counts the SQL statements each availability call actually issues.
 *
 * Round-trip COUNT is the portable performance metric for this app, not milliseconds.
 * Wall-clock timing from a developer laptop measures the link to Singapore (~120 ms each
 * way) and says nothing about production, where the Vercel function sits in the same
 * region as the database and a round trip costs 1–2 ms. Count the trips; the latency
 * follows from wherever the code is deployed.
 *
 *   npx tsx --env-file=.env scripts/count-queries.ts
 */

const client = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  log: [{ emit: 'event', level: 'query' }],
})

/** The query-event overload isn't in the generated types unless log events are declared. */
type QueryLogger = { $on(event: 'query', cb: (e: { query: string }) => void): void }

const seen: string[] = []
;(client as unknown as QueryLogger).$on('query', (e) =>
  seen.push(e.query.replace(/\s+/g, ' ').slice(0, 96)),
)

function report(label: string) {
  console.log(`\n${label} -> ${seen.length} SQL statement(s)`)
  for (const q of seen) console.log('   ' + q)
  seen.length = 0
}

async function main() {
  // Warm the connection so handshake statements don't pollute the count.
  await client.$queryRawUnsafe('SELECT 1')
  seen.length = 0

  const business = await client.business.findFirst({
    relationLoadStrategy: 'join',
    include: { services: { where: { slug: 'signature-facial', isActive: true }, take: 1 } },
  })
  if (!business?.services[0]) throw new Error('Seed the database first: npm run db:seed')
  report('getBusinessWithService')

  const serviceId = business.services[0].id
  const qualified = {
    businessId: business.id,
    isActive: true,
    services: { some: { serviceId } },
  }
  const w = {
    start: new Date('2026-08-25T00:00:00Z'),
    end: new Date('2026-08-28T00:00:00Z'),
  }

  await Promise.all([
    client.staff.findMany({
      where: qualified,
      select: { id: true, name: true, rules: { select: { dayOfWeek: true, startMin: true, endMin: true } } },
    }),
    client.timeOff.findMany({
      where: {
        businessId: business.id,
        OR: [{ staffId: null }, { staff: qualified }],
        startsAt: { lt: w.end },
        endsAt: { gt: w.start },
      },
      select: { staffId: true, startsAt: true, endsAt: true },
    }),
    client.booking.findMany({
      where: {
        staff: qualified,
        status: { in: ['PENDING', 'CONFIRMED'] },
        blockStartsAt: { lt: w.end },
        blockEndsAt: { gt: w.start },
      },
      select: { staffId: true, blockStartsAt: true, blockEndsAt: true },
    }),
  ])
  report('getSchedulingData (3 concurrent)')

  await client.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await client.$disconnect()
  process.exit(1)
})
