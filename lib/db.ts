import { PrismaClient } from '@/prisma/generated/client'
import { PrismaPg } from '@prisma/adapter-pg'

/**
 * The single Prisma client for the whole app.
 *
 * Two things here are load-bearing:
 *
 * 1. DATABASE_URL must be Neon's POOLED string (the host containing "-pooler").
 *    Every serverless function instance opens its own connection and Postgres allows
 *    roughly a hundred; a couple of dozen concurrent cold starts exhausts them while the
 *    CPU sits idle. This kills more serverless Postgres apps than load ever does.
 *    Migrations use the unpooled DIRECT_URL instead — see prisma.config.ts.
 *
 * 2. The client is cached on globalThis in development. Next's hot reload re-evaluates
 *    modules on every save; without this you accumulate a new connection pool per edit
 *    until the database refuses you.
 *
 * Prisma 7 requires a driver adapter — there is no default connector any more.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.')
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

export const db = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
