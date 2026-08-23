import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * Manage-token storage.
 *
 * Two columns, doing two different jobs:
 *
 *   manageTokenHash    SHA-256, UNIQUE. What lookups match on. A plain hash is correct
 *                      here: the token is 256 bits of randomness, so it is not guessable
 *                      and needs no slow KDF.
 *
 *   manageTokenCipher  AES-256-GCM of the raw token. What lets the reminder and
 *                      reschedule emails rebuild the customer's link weeks later.
 *
 * Storing only the hash — the original design in docs/GAP-ANALYSIS.md [B8] — makes the
 * raw token unrecoverable, which quietly breaks FR-N3: a reminder cannot contain a manage
 * link it has no way to reconstruct. Storing it in plaintext would mean a read-only
 * database leak hands over live cancel access to every upcoming appointment.
 *
 * Encryption keeps both properties. The key is derived from AUTH_SECRET, which lives in
 * the environment and not in the database, so a dump of Postgres alone reveals nothing.
 */

function key(): Buffer {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set — cannot encrypt manage tokens.')
  // A 32-byte key from an arbitrary-length secret.
  return createHash('sha256').update(secret).digest()
}

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

/** iv(12) ‖ authTag(16) ‖ ciphertext, base64url. */
export function encryptToken(rawToken: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(rawToken, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
}

/**
 * Returns null rather than throwing on anything unreadable — a booking seeded before this
 * column existed, or a value written under a rotated AUTH_SECRET. Callers degrade to an
 * email without a manage button instead of failing the whole send.
 */
export function decryptToken(cipherText: string | null): string | null {
  if (!cipherText) return null
  try {
    const raw = Buffer.from(cipherText, 'base64url')
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const body = raw.subarray(28)

    const decipher = createDecipheriv('aes-256-gcm', key(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** A fresh manage token: the raw value for the email, plus both stored forms. */
export function mintManageToken() {
  const raw = randomBytes(32).toString('base64url')
  return { raw, hash: hashToken(raw), cipher: encryptToken(raw) }
}
