import { verify } from '@node-rs/argon2'
import { db } from '../lib/db.js'

/**
 * Warns if any account still uses a password that appeared during development.
 *
 *   npx tsx --env-file=.env scripts/check-password-strength.ts
 *
 * The site is public now, so the admin login guards real customer names, emails and phone
 * numbers. Anything on this list is in credential-stuffing wordlists, in this repo's git
 * history, or both.
 */

const KNOWN_WEAK = ['ChangeMe123!', 'admin123@.', 'admin123', 'password', 'Password123!']

async function main() {
  const users = await db.user.findMany({
    select: { email: true, role: true, passwordHash: true },
  })

  let weak = 0
  console.log('')

  for (const user of users) {
    let found: string | null = null
    for (const candidate of KNOWN_WEAK) {
      // verify() is intentionally slow, but there are only a handful of accounts.
      if (await verify(user.passwordHash, candidate).catch(() => false)) {
        found = candidate
        break
      }
    }

    if (found) {
      weak++
      console.log(`  WEAK  ${user.email.padEnd(34)} ${user.role}  — still "${found}"`)
    } else {
      console.log(`  OK    ${user.email.padEnd(34)} ${user.role}`)
    }
  }

  if (weak > 0) {
    console.log(
      `\n  ${weak} account(s) use a password from development.\n` +
        `  Rotate with: npm run set-password <email>\n`,
    )
  } else {
    console.log('\n  No account uses a known development password.\n')
  }

  await db.$disconnect()
  process.exit(weak > 0 ? 1 : 0)
}

main().catch(async (e) => {
  console.error(e)
  await db.$disconnect()
  process.exit(1)
})
