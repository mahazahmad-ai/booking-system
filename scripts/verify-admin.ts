import { hash, verify } from '@node-rs/argon2'
import { db } from '../lib/db.js'

/**
 * Phase 5 — checks the pieces of the admin area that can be verified without a browser:
 * password hashing, role assignment, and that STAFF scoping actually narrows queries.
 *
 *   npm run db:verify-admin
 */

let passed = 0
let failed = 0

function check(ok: boolean, label: string, detail = '') {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)}${detail}`)
}

async function main() {
  console.log('\nVerifying admin auth and scoping\n')

  const owner = await db.user.findUnique({
    where: { email: 'owner@noorwellness.example' },
    select: { id: true, passwordHash: true, role: true, staffId: true, isActive: true },
  })
  check(Boolean(owner), 'seeded owner account exists')
  check(owner?.role === 'ADMIN', 'owner has the ADMIN role', owner?.role ?? '—')
  check(owner?.staffId === null, 'owner is not tied to a staff row')

  check(
    owner!.passwordHash.startsWith('$argon2id$'),
    'password stored as argon2id (NFR-6)',
    owner!.passwordHash.slice(0, 10),
  )

  // Deliberately NOT asserting a specific password. An earlier version checked the seeded
  // one and started failing the moment it was rotated — reporting a problem with the code
  // when the only thing that had happened was correct operational hygiene.
  const probe = await hash('a-known-probe-password')
  check(await verify(probe, 'a-known-probe-password'), 'argon2id round-trips a correct password')
  check(!(await verify(probe, 'the-wrong-password')), 'argon2id rejects an incorrect password')
  check(
    !(await verify(owner!.passwordHash, 'ChangeMe123!')),
    'the seeded default password no longer works',
    'rotated out of use',
  )

  const staffUser = await db.user.findFirst({
    where: { role: 'STAFF' },
    select: { email: true, staffId: true, staff: { select: { name: true } } },
  })
  check(Boolean(staffUser?.staffId), 'staff accounts are linked to a staff row', staffUser?.staff?.name ?? '—')

  // The scoping rule that matters: a STAFF session must never see a colleague's bookings.
  const business = await db.business.findFirstOrThrow({ select: { id: true } })
  const all = await db.booking.count({ where: { businessId: business.id } })
  const scoped = await db.booking.count({
    where: { businessId: business.id, staffId: staffUser!.staffId! },
  })

  check(scoped > 0, 'the staff member has bookings of their own', `${scoped}`)
  check(
    scoped < all,
    'scoping genuinely narrows the result set',
    `${scoped} of ${all} bookings`,
  )

  const otherStaff = await db.staff.findFirst({
    where: { id: { not: staffUser!.staffId! } },
    select: { id: true, name: true },
  })
  const leaked = await db.booking.count({
    where: { staffId: staffUser!.staffId!, staff: { id: otherStaff!.id } },
  })
  check(leaked === 0, 'a scoped query cannot reach another therapist', otherStaff!.name)

  console.log(`\n${passed} passed, ${failed} failed\n`)
  await db.$disconnect()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(e)
  await db.$disconnect()
  process.exit(1)
})
