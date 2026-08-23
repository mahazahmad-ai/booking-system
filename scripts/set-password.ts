import { randomBytes } from 'node:crypto'
import { hash } from '@node-rs/argon2'
import { db } from '../lib/db.js'

/**
 * Change an admin or staff password.
 *
 *   npx tsx --env-file=.env scripts/set-password.ts owner@glowandgrace.example
 *   npx tsx --env-file=.env scripts/set-password.ts owner@example.com "my new password"
 *
 * With no password given, a strong one is generated and printed once. That is the safer
 * default: a password typed on a command line ends up in shell history.
 *
 * The seeded password is in this repo's git history and README, so it must be changed
 * before anyone real uses the system.
 */

/** Unambiguous alphabet — no I, l, O, 0, 1 to misread when reading it aloud. */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_'

function generatePassword(length = 20): string {
  const bytes = randomBytes(length)
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return out
}

async function main() {
  const args = process.argv.slice(2)
  // --force accepts a password below the minimum length. It exists for local development
  // convenience and is deliberately explicit, so a weak password is always a choice
  // somebody made rather than something that slipped through.
  const force = args.includes('--force')
  const [email, provided] = args.filter((a) => a !== '--force')

  if (!email) {
    console.error(
      '\nUsage: npx tsx --env-file=.env scripts/set-password.ts <email> [password] [--force]\n',
    )
    process.exit(1)
  }

  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, role: true },
  })

  if (!user) {
    // List the accounts that do exist — a typo is the likeliest cause.
    const all = await db.user.findMany({ select: { email: true, role: true } })
    console.error(`\nNo account for "${email}".\n\nAccounts that exist:`)
    for (const u of all) console.error(`  ${u.email}  (${u.role})`)
    console.error('')
    await db.$disconnect()
    process.exit(1)
  }

  if (provided && provided.length < 12 && !force) {
    console.error(
      '\nThat password is under 12 characters. Choose a longer one, or pass --force if\n' +
        'this is a local development account that will never be publicly reachable.\n',
    )
    await db.$disconnect()
    process.exit(1)
  }

  const password = provided ?? generatePassword()

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hash(password) },
  })

  console.log(`\nPassword updated for ${user.email} (${user.role}).`)
  if (provided && provided.length < 12) {
    console.log(
      '\n  WARNING: this password is short and must not survive to production.\n' +
        '  Rotate it before the site is publicly reachable.',
    )
  }
  if (!provided) {
    console.log(`\n  ${password}\n`)
    console.log('Shown once. Store it in a password manager now — it is not recoverable.\n')
  } else {
    console.log('\nNote: it is in your shell history. Clear it if that matters.\n')
  }

  await db.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await db.$disconnect()
  process.exit(1)
})
