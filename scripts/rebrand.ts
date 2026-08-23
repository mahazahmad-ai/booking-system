import { db } from '../lib/db.js'

/**
 * Rename the business in the database.
 *
 *   npx tsx --env-file=.env scripts/rebrand.ts "Glow & Grace" glowandgrace
 *
 * The display name and the slug are separate on purpose. The name is what customers read
 * and can contain anything — ampersands, accents, punctuation. The slug is what goes into
 * email addresses and calendar UIDs, where those characters are invalid.
 *
 * This handles the database half of a rebrand. The other half is lib/brand.ts (marketing
 * copy, address, phone) and the token block in app/globals.css (colours). Those three
 * things are the whole of what changes between one client and the next.
 *
 * ⚠️ Staff login emails change with the slug. The passwords do not — everyone signs in
 * with their existing password at the new address.
 */

async function main() {
  const [name, slug] = process.argv.slice(2)

  if (!name || !slug) {
    console.error('\nUsage: npx tsx --env-file=.env scripts/rebrand.ts "<Display Name>" <slug>\n')
    console.error('  slug: lowercase letters and digits only — used in email addresses\n')
    process.exit(1)
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    console.error(`\n"${slug}" is not a valid slug. Lowercase letters, digits and hyphens only.\n`)
    process.exit(1)
  }

  const business = await db.business.findFirst({ select: { id: true, name: true } })
  if (!business) {
    console.error('\nNo business row found. Run npm run db:seed first.\n')
    await db.$disconnect()
    process.exit(1)
  }

  console.log(`\nRenaming "${business.name}" to "${name}"\n`)

  await db.business.update({ where: { id: business.id }, data: { name } })
  console.log(`  business name  → ${name}`)

  // Move every login to the new domain, keeping the local part and the password.
  const users = await db.user.findMany({ select: { id: true, email: true } })
  for (const user of users) {
    const local = user.email.split('@')[0]
    const updated = `${local}@${slug}.example`
    if (updated === user.email) continue
    await db.user.update({ where: { id: user.id }, data: { email: updated } })
    console.log(`  login          → ${updated}`)
  }

  console.log(
    `\nDone. Passwords are unchanged — sign in at the new address with the same password.\n` +
      `Remember to update lib/brand.ts to match, and the colours in app/globals.css.\n`,
  )

  await db.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await db.$disconnect()
  process.exit(1)
})
