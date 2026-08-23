'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { signIn } from '@/lib/auth'
import { clientIp } from '@/lib/ratelimit'

export type LoginState = { error?: string }

const schema = z.object({
  email: z.string().trim().toLowerCase().max(160).pipe(z.email()),
  password: z.string().min(1).max(200),
  next: z.string().startsWith('/').max(200).optional(),
})

/**
 * Throttle sign-in attempts per email AND per IP.
 *
 * Per-email alone lets an attacker spray one password across thousands of accounts;
 * per-IP alone is defeated by a botnet. In-process, because Upstash is optional in this
 * deployment — the same caveat as lib/ratelimit.ts applies: serverless instances don't
 * share memory, so this is a speed bump, not a wall.
 */
const attempts = new Map<string, number[]>()
const WINDOW_MS = 15 * 60_000
const MAX_ATTEMPTS = 8

function tooMany(key: string): boolean {
  const now = Date.now()
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  attempts.set(key, recent)
  if (recent.length >= MAX_ATTEMPTS) return true
  recent.push(now)
  return false
}

/**
 * Next signals redirect and notFound by throwing a tagged error. Those must propagate —
 * swallowing them turns a successful sign-in into a silent no-op.
 */
function isNextControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown })?.digest
  return (
    typeof digest === 'string' &&
    (digest.startsWith('NEXT_REDIRECT') || digest === 'NEXT_NOT_FOUND')
  )
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') || undefined,
  })

  // One generic failure for every reason: bad email, wrong password, disabled account,
  // account that doesn't exist. Anything more specific is an enumeration oracle.
  const GENERIC = 'Those details don’t match an account.'
  if (!parsed.success) return { error: GENERIC }

  const ip = clientIp(await headers())
  if (tooMany(`ip:${ip}`) || tooMany(`email:${parsed.data.email}`)) {
    return { error: 'Too many attempts. Please wait a few minutes and try again.' }
  }

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      // Validated as starting with "/", so this can never become an open redirect.
      redirectTo: parsed.data.next ?? '/admin',
    })
  } catch (e) {
    if (isNextControlFlow(e)) throw e
    return { error: GENERIC }
  }

  return {}
}
