import { db } from '../lib/db.js'

/** Quick read-only snapshot of what the database actually contains. */
async function main() {
  const business = await db.business.findFirstOrThrow({
    select: { id: true, name: true, timezone: true, currency: true },
  })
  const users = await db.user.findMany({
    select: { email: true, role: true },
    orderBy: { role: 'asc' },
  })
  const counts = await Promise.all([
    db.service.count(),
    db.staff.count(),
    db.customer.count(),
    db.booking.count(),
  ])

  console.log(`\nbusiness   ${business.name}   (id ${business.id})`)
  console.log(`timezone   ${business.timezone} · ${business.currency}`)
  console.log(`\nlogins`)
  for (const u of users) console.log(`  ${u.role.padEnd(6)} ${u.email}`)
  console.log(
    `\nservices ${counts[0]} · staff ${counts[1]} · customers ${counts[2]} · bookings ${counts[3]}\n`,
  )

  await db.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await db.$disconnect()
  process.exit(1)
})
