import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.ts', 'scripts/**/*.{test,spec}.ts'],
    passWithNoTests: true,
    setupFiles: ['./vitest.setup.ts'],
    // Run job queue tests sequentially in their own pool to avoid Redis conflicts
    poolMatchGlobs: [
      ['**/jobs/**/*.test.ts', 'forks'],
    ],
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
})
