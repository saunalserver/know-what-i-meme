import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // Socket tests bind a port; keep them off each other's toes.
    fileParallelism: false,
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      include: ['server/**/*.js', 'server.js'],
      reporter: ['text-summary'],
    },
  },
})
