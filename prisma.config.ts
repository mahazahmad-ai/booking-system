import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

/**
 * Prisma 7 configuration.
 *
 * `directUrl` was REMOVED in v7, so the pooled/direct split moves here:
 *
 *   this file  -> DIRECT_URL   (unpooled)  used by the Prisma CLI for migrations.
 *                                          PgBouncer transaction mode cannot run DDL, so
 *                                          migrations MUST NOT go through the pooler.
 *
 *   lib/db.ts  -> DATABASE_URL (pooled)    used by the app at runtime via @prisma/adapter-pg.
 *                                          Serverless functions each open their own
 *                                          connection; the pooler is what stops Postgres
 *                                          running out of them under a handful of cold starts.
 *
 * Neon gives you both strings. The pooled host contains `-pooler`; the direct one does not.
 *
 * Reminder: `prisma db push` is banned on this project — it would drop the exclusion
 * constraint and the time-off trigger, which live only in the hand-written migration SQL
 * under `prisma/migrations`.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',

  datasource: {
    url: env('DIRECT_URL'),
  },

  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --env-file=.env prisma/seed.ts',
  },
})
