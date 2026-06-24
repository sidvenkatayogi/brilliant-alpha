/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Playwright specs (tests/e2e) and emulator-backed integration tests
    // (tests/integration) run via their own commands, not the default unit run.
    exclude: ['**/node_modules/**', '**/tests/e2e/**', '**/tests/integration/**'],
  },
})
