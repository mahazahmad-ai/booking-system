import 'dotenv/config'
import { defineConfig } from 'prisma/config'

/**
 * Prisma 7 configuration.
 *
 * `directUrl` was REMOVED in v7, so the pooled/direct split lives here:
 *
 *   this file  -> DIRECT_URL   (unpooled)  used by the Prisma CLI for migrations.
 *                                          PgBouncer transaction mode cannot run DDL, so
 *                                          migrations MUST NOT go through the pooler.
 *
 *   lib/db.ts  -> DATABASE_URL (pooled)    used by the app at runtime via
 *                                          @prisma/adapter-pg. Serverless functions each
 *                                          open their own connection; the pooler is what
 *                                          stops Postgres running out of them.
 *
 * Neon gives you both strings. The pooled host contains `-pooler`; the direct one doesn't.
 *
 * The URL is read from process.env rather than Prisma's env() helper, which throws the
 * moment the variable is absent. `prisma generate` needs no database connection at all —
 * it only reads the schema — so an absent DIRECT_URL should not be able to fail a build.
 * It did exactly that on the first Vercel deploy.
 *
 * Falling back to DATABASE_URL keeps generate working anywhere either variable exists.
 * If a migration ever runs against that fallback it will fail on DDL through the pooler,
 * which is a loud and obvious failure rather than a silent wrong one.
 *
 * Reminder: `prisma db push` is banned here — it would drop the exclusion constraint and
 * the time-off trigger, which live only in the hand-written migration SQL.
 */

const migrationUrl =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  // Generation never dials out; this placeholder only ever satisfies the config shape.
  'postgresql://unset:unset@localhost:5432/unset'

export default defineConfig({
  schema: 'prisma/schema.prisma',

  datasource: {
    url: migrationUrl,
  },

  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --env-file=.env prisma/seed.ts',
  },
})
