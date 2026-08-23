import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // NFR-3 — the availability engine is the module that has to be proven. Coverage
      // elsewhere is not interesting; coverage here is the whole point.
      // Note: the text reporter groups by directory and does not render a row for
      // lib/time.ts, though it IS measured (100%). Use --coverage.reporter=json-summary
      // to see every file individually.
      include: ['lib/**/*.ts'],
      exclude: [
        'lib/db.ts', // thin Prisma wrapper; exercised by integration, not unit tests
        'lib/brand.ts',
        'lib/placeholder-data.ts',
        'lib/utils.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})
