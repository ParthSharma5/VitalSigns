import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Integration tests run against an in-memory PGlite, never the dev database.
    env: { PGLITE_DIR: 'memory://', DATABASE_URL: '' },
  },
});
