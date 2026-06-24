import { defineConfig } from 'vitest/config'

// Integration tests talk to the Firebase emulators and run in Node, separate
// from the jsdom unit suite. Invoked via `npm run test:integration`, which wraps
// this in `firebase emulators:exec`.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
  },
})
