import { defineConfig, devices } from '@playwright/test'

const PORT = 5173
const BASE_URL = `http://localhost:${PORT}`
const isCI = !!process.env.CI

// The e2e suite runs the app in test mode (emulators, demo project) and boots
// both the Firebase Emulator Suite and the Vite dev server before testing.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI ? 'list' : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 5'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    {
      command: 'firebase emulators:start --only auth,firestore --project demo-long-run',
      url: 'http://127.0.0.1:4000',
      reuseExistingServer: !isCI,
      timeout: 60_000,
      stdout: 'ignore',
    },
    {
      command: `vite --mode test --port ${PORT}`,
      url: BASE_URL,
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
})
