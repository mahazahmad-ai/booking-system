import { PrismaClient } from '../prisma/generated/client.js'
import { PrismaPg } from '@prisma/adapter-pg'

/**
 * Proves the database-level guarantees actually fire.
 *
 * A constraint nobody has seen reject anything is not yet known to work. The entire
 * double-booking design rests on these, so they get exercised once against a real
 * database before anything is built on top of them.
 *
 *   npx tsx scripts/verify-constraints.ts
 *
 * Raw SQL rather than the Prisma client, so the database's own errors surface unwrapped
 * and a future client change cannot quietly mask a missing constraint.
 *
 * Statements run in autocommit, NOT inside one transaction: in Postgres a single failed
 * statement aborts the surrounding transaction, so every later check would report
 * "transaction is aborted" instead of its real result. Fixtures are removed at the end.
 *
 * Must run against a database with no Business row — [C5] caps that table at one, so the
 * fixture business cannot be created alongside a seeded one. Run this before `db:seed`.
 */

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  log: ['error'],
})

/**
 * Dig the Postgres SQLSTATE out of whatever wrapper it arrives in.
 *
 * Prisma wraps raw-query failures in its own P2010 error and reports the real SQLSTATE
 * in the message as "Code: `23514`". P-codes are Prisma's, not Postgres's, so they are
 * skipped — otherwise every check reads as P2010 and the actual constraint is invisible.
 */
function sqlState(error: unknown): string | undefined {
  const text = error instanceof Error ? error.message : String(error)
  const fromMessage = /Code:\s*`?([0-9A-Z]{5})`?/.exec(text)?.[1]
  if (fromMessage && !/^P\d{4}$/.test(fromMessage)) return fromMessage

  const seen = new Set<unknown>()
  let node: unknown = error
  while (node && typeof node === 'object' && !seen.has(node)) {
    seen.add(node)
    const record = node as Record<string, unknown>
    const meta = record.meta as Record<string, unknown> | undefined
    const code = record.code ?? meta?.code
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) && !/^P\d{4}$/.test(code)) {
      return code
    }
    node = record.cause ?? meta?.cause ?? record.originalError
  }
  return /\b(23P01|23505|23514|BK001)\b/.exec(text)?.[1]
}

let passed = 0
let failed = 0

function report(ok: boolean, label: string, detail: string) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(54)}${detail}`)
}

async function expectOk(label: string, sql: string) {
  try {
    await db.$executeRawUnsafe(sql)
    report(true, label, 'accepted')
  } catch (e) {
    report(false, label, `rejected with ${sqlState(e) ?? (e as Error).message.slice(0, 60)}`)
  }
}

async function expectReject(label: string, sql: string, code: string) {
  try {
    await db.$executeRawUnsafe(sql)
    report(false, label, 'ACCEPTED — constraint missing!')
  } catch (e) {
    const actual = sqlState(e)
    report(actual === code, label, `rejected ${actual ?? 'unknown'} (wanted ${code})`)
  }
}

const BIZ = 'biz_verify'
const SVC = 'svc_verify'
const STF = 'stf_verify'
const STF2 = 'stf_verify_2'
const CUS = 'cus_verify'

/** A booking insert whose four time columns agree, unless deliberately broken. */
function booking(
  id: string,
  staffId: string,
  startHour: string,
  endHour: string,
  status = 'CONFIRMED',
  durationMins = 60,
) {
  const cancelled = status === 'CANCELLED' ? `'2026-11-01T00:00:00Z'` : 'NULL'
  return `
    INSERT INTO "Booking" (
      "id","businessId","serviceId","staffId","customerId","reference","manageTokenHash",
      "startsAt","endsAt","blockStartsAt","blockEndsAt",
      "durationMins","bufferBeforeMins","bufferAfterMins","priceMinor","currency",
      "status","cancelledAt","updatedAt"
    ) VALUES (
      '${id}','${BIZ}','${SVC}','${staffId}','${CUS}','BK-${id.toUpperCase()}','hash_${id}',
      '2026-11-10T${startHour}:00:00Z','2026-11-10T${endHour}:00:00Z',
      '2026-11-10T${startHour}:00:00Z','2026-11-10T${endHour}:00:00Z',
      ${durationMins},0,0,5000,'PKR','${status}',${cancelled},NOW()
    )`
}

async function cleanup() {
  for (const sql of [
    `DELETE FROM "Booking" WHERE "businessId" = '${BIZ}'`,
    `DELETE FROM "TimeOff" WHERE "businessId" = '${BIZ}'`,
    `DELETE FROM "AvailabilityRule" WHERE "staffId" IN ('${STF}','${STF2}')`,
    `DELETE FROM "Customer" WHERE "businessId" = '${BIZ}'`,
    `DELETE FROM "Service" WHERE "businessId" = '${BIZ}'`,
    `DELETE FROM "Staff" WHERE "businessId" = '${BIZ}'`,
    `DELETE FROM "Business" WHERE "id" IN ('${BIZ}','biz_second')`,
  ]) {
    await db.$executeRawUnsafe(sql).catch(() => {})
  }
}

async function main() {
  const existing = await db.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM "Business" WHERE "id" <> '${BIZ}'`,
  )
  if (Number(existing[0].count) > 0) {
    console.error(
      '\nA Business row already exists. [C5] allows only one, so the fixture cannot be\n' +
        'created. Run this against an unseeded database.\n',
    )
    await db.$disconnect()
    process.exit(1)
  }

  await cleanup()
  console.log('\nVerifying database guarantees against Neon (ap-southeast-1)\n')

  await db.$executeRawUnsafe(`
    INSERT INTO "Business" ("id","name","timezone","currency","currencyDecimals","updatedAt")
    VALUES ('${BIZ}','Verify Co','Asia/Karachi','PKR',0,NOW())`)
  await db.$executeRawUnsafe(`
    INSERT INTO "Service" ("id","businessId","name","slug","durationMins","priceMinor","updatedAt")
    VALUES ('${SVC}','${BIZ}','Verify Service','verify',60,5000,NOW())`)
  await db.$executeRawUnsafe(`
    INSERT INTO "Staff" ("id","businessId","name","slug","updatedAt")
    VALUES ('${STF}','${BIZ}','Verify Staff','verify',NOW()),
           ('${STF2}','${BIZ}','Other Staff','verify-2',NOW())`)
  await db.$executeRawUnsafe(`
    INSERT INTO "Customer" ("id","businessId","name","email","emailNorm","updatedAt")
    VALUES ('${CUS}','${BIZ}','Verify Customer','A@Example.com','a@example.com',NOW())`)

  console.log('§8  Double-booking — the exclusion constraint')
  await expectOk('first booking 14:00–15:00', booking('b1', STF, '14', '15'))
  await expectReject('identical overlap, same staff', booking('b2', STF, '14', '15'), '23P01')
  await expectReject(
    'partial overlap, same staff',
    booking('b3', STF, '14', '16', 'CONFIRMED', 120),
    '23P01',
  )
  await expectOk('back-to-back 15:00–16:00 (touching)', booking('b4', STF, '15', '16'))
  await expectOk('same time, different staff', booking('b5', STF2, '14', '15'))
  await expectOk('overlapping but CANCELLED', booking('b6', STF, '14', '15', 'CANCELLED'))
  await expectOk('overlapping but COMPLETED', booking('b7', STF, '14', '15', 'COMPLETED'))
  await expectReject('PENDING still holds time', booking('b8', STF, '14', '15', 'PENDING'), '23P01')

  console.log('\n[A5] Bookings must not land on time off — the trigger')
  await db.$executeRawUnsafe(`
    INSERT INTO "TimeOff" ("id","businessId","staffId","startsAt","endsAt","reason")
    VALUES ('to_1','${BIZ}','${STF}','2026-11-10T09:00:00Z','2026-11-10T12:00:00Z','Leave')`)
  await expectReject('booking inside staff time off', booking('b9', STF, '10', '11'), 'BK001')
  await expectOk('booking just outside it', booking('b10', STF, '12', '13'))

  await db.$executeRawUnsafe(`
    INSERT INTO "TimeOff" ("id","businessId","staffId","startsAt","endsAt","reason")
    VALUES ('to_2','${BIZ}',NULL,'2026-11-10T18:00:00Z','2026-11-10T20:00:00Z','Closed')`)
  await expectReject(
    'booking inside a business-wide closure',
    booking('b11', STF2, '18', '19'),
    'BK001',
  )

  console.log('\n[A1] The four time columns must agree')
  await expectReject(
    'endsAt disagreeing with durationMins',
    booking('bad1', STF2, '05', '06', 'CONFIRMED', 30),
    '23514',
  )
  await expectReject(
    'block window ignoring declared buffers',
    `INSERT INTO "Booking" (
       "id","businessId","serviceId","staffId","customerId","reference","manageTokenHash",
       "startsAt","endsAt","blockStartsAt","blockEndsAt",
       "durationMins","bufferBeforeMins","bufferAfterMins","priceMinor","currency","status","updatedAt"
     ) VALUES (
       'bad2','${BIZ}','${SVC}','${STF2}','${CUS}','BK-BAD2','hash_bad2',
       '2026-11-12T09:00:00Z','2026-11-12T10:00:00Z',
       '2026-11-12T09:00:00Z','2026-11-12T10:00:00Z',
       60,15,15,5000,'PKR','CONFIRMED',NOW())`,
    '23514',
  )
  await expectReject(
    'CANCELLED with no cancelledAt',
    `INSERT INTO "Booking" (
       "id","businessId","serviceId","staffId","customerId","reference","manageTokenHash",
       "startsAt","endsAt","blockStartsAt","blockEndsAt",
       "durationMins","bufferBeforeMins","bufferAfterMins","priceMinor","currency","status","updatedAt"
     ) VALUES (
       'bad3','${BIZ}','${SVC}','${STF2}','${CUS}','BK-BAD3','hash_bad3',
       '2026-11-12T22:00:00Z','2026-11-12T23:00:00Z',
       '2026-11-12T22:00:00Z','2026-11-12T23:00:00Z',
       60,0,0,5000,'PKR','CANCELLED',NOW())`,
    '23514',
  )

  console.log('\n[B3] Working-hours invariants')
  await expectReject(
    'rule with endMin past midnight (1500)',
    `INSERT INTO "AvailabilityRule" ("id","staffId","dayOfWeek","startMin","endMin")
     VALUES ('ar1','${STF}',1,1320,1500)`,
    '23514',
  )
  await expectReject(
    'rule ending before it starts',
    `INSERT INTO "AvailabilityRule" ("id","staffId","dayOfWeek","startMin","endMin")
     VALUES ('ar2','${STF}',1,1020,540)`,
    '23514',
  )
  await expectReject(
    'rule with dayOfWeek 7',
    `INSERT INTO "AvailabilityRule" ("id","staffId","dayOfWeek","startMin","endMin")
     VALUES ('ar3','${STF}',7,540,1020)`,
    '23514',
  )
  await expectOk(
    'overnight shift split across two rows',
    `INSERT INTO "AvailabilityRule" ("id","staffId","dayOfWeek","startMin","endMin")
     VALUES ('ar4','${STF}',1,1320,1440), ('ar5','${STF}',2,0,60)`,
  )

  console.log('\n[C5] Singleton business · [C2] customer identity')
  await expectReject(
    'a second Business row',
    `INSERT INTO "Business" ("id","name","timezone","updatedAt")
     VALUES ('biz_second','Second Co','Asia/Karachi',NOW())`,
    '23505',
  )
  await expectReject(
    'duplicate customer email in one business',
    `INSERT INTO "Customer" ("id","businessId","name","email","emailNorm","updatedAt")
     VALUES ('cus_dup','${BIZ}','Dup','a@example.com','a@example.com',NOW())`,
    '23505',
  )

  console.log('\n[B6] Notification idempotency')
  await expectOk(
    'first REMINDER log row',
    `INSERT INTO "NotificationLog" ("id","bookingId","type","dedupeKey")
     VALUES ('nl1','b1','REMINDER','REMINDER_24H')`,
  )
  await expectReject(
    'duplicate REMINDER for the same booking',
    `INSERT INTO "NotificationLog" ("id","bookingId","type","dedupeKey")
     VALUES ('nl2','b1','REMINDER','REMINDER_24H')`,
    '23505',
  )

  await cleanup()
  console.log(`\n${passed} passed, ${failed} failed   (fixtures removed)\n`)
  await db.$disconnect()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(e)
  await cleanup().catch(() => {})
  await db.$disconnect()
  process.exit(1)
})
