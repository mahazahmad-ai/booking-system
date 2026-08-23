import { describe, it, expect, beforeAll } from 'vitest'
import { encryptToken, decryptToken, hashToken, mintManageToken } from '@/lib/token-crypto'

/**
 * The manage token has to satisfy two things at once: unrecoverable from a database dump
 * alone, but recoverable by the app weeks later so a reminder email can carry a working
 * link. See docs/GAP-ANALYSIS.md [B8].
 */

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-for-token-crypto-only'
})

describe('hashToken', () => {
  it('is deterministic, so lookups match', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'))
  })

  it('differs for different tokens', () => {
    expect(hashToken('abc')).not.toBe(hashToken('abd'))
  })

  it('produces a 64-character hex digest', () => {
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('encryptToken / decryptToken', () => {
  it('round-trips', () => {
    const token = 'kM3xQz9-abcDEF_1234567890abcdefghijklmnop'
    expect(decryptToken(encryptToken(token))).toBe(token)
  })

  it('produces different ciphertext each time, from the random IV', () => {
    const token = 'same-token-every-time'
    const a = encryptToken(token)
    const b = encryptToken(token)

    expect(a).not.toBe(b)
    // …but both still decrypt to the same value.
    expect(decryptToken(a)).toBe(token)
    expect(decryptToken(b)).toBe(token)
  })

  it('does not leak the plaintext into the ciphertext', () => {
    const token = 'recognisable-plaintext-value'
    expect(encryptToken(token)).not.toContain('recognisable')
  })

  it('returns null for a tampered ciphertext rather than garbage', () => {
    // GCM authenticates: flipping a byte must fail the tag check, not silently decrypt.
    const encrypted = encryptToken('a-real-token')
    const tampered = encrypted.slice(0, -4) + 'AAAA'
    expect(decryptToken(tampered)).toBeNull()
  })

  it('returns null for null, empty and malformed input', () => {
    expect(decryptToken(null)).toBeNull()
    expect(decryptToken('')).toBeNull()
    expect(decryptToken('not-base64url-at-all!!!')).toBeNull()
  })

  it('returns null under a different key, instead of throwing', () => {
    // The degradation path: a rotated AUTH_SECRET must produce an email without a manage
    // button, never an exception that loses the whole send.
    const encrypted = encryptToken('token-under-original-key')
    process.env.AUTH_SECRET = 'a-completely-different-secret'
    expect(decryptToken(encrypted)).toBeNull()
    process.env.AUTH_SECRET = 'test-secret-for-token-crypto-only'
  })
})

describe('mintManageToken', () => {
  it('returns a raw token plus both stored forms', () => {
    const token = mintManageToken()

    expect(token.raw.length).toBeGreaterThanOrEqual(40)
    expect(token.hash).toBe(hashToken(token.raw))
    expect(decryptToken(token.cipher)).toBe(token.raw)
  })

  it('never stores the raw token in either stored form', () => {
    const token = mintManageToken()
    expect(token.hash).not.toContain(token.raw)
    expect(token.cipher).not.toContain(token.raw)
  })

  it('gives every booking a distinct token (NFR-7: ≥128 bits of entropy)', () => {
    const seen = new Set(Array.from({ length: 200 }, () => mintManageToken().raw))
    expect(seen.size).toBe(200)
    // 32 bytes base64url ≈ 43 characters.
    expect([...seen][0].length).toBeGreaterThanOrEqual(43)
  })
})
