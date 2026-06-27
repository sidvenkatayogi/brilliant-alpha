import { defineConfig, devices } from '@playwright/test'

const PORT = 5173
const BASE_URL = `http://localhost:${PORT}`
const isCI = !!process.env.CI

// The e2e suite runs the app in test mode (emulators, demo project) and boots
// both the Firebase Emulator Suite and the Vite dev server before testing.
export default defineConfig({
  testDir: './tests/e2e',
  // Generous enough to absorb the first-test cold start (Vite first compile +
  // functions emulator warm-up) on a fresh boot.
  timeout: 45_000,
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
      // Boot auth + firestore emulators. The serverless /api functions run inside
      // the Vite dev server (see the api-dev-server plugin in vite.config.ts) and
      // talk to these emulators; the outline generator returns a deterministic
      // stub under the emulator, so the OpenAI API is never called in e2e.
      command: 'firebase emulators:start --only auth,firestore --project demo-long-run',
      url: 'http://127.0.0.1:4000',
      reuseExistingServer: !isCI,
      timeout: 120_000,
      stdout: 'ignore',
    },
    {
      command: `vite --mode test --port ${PORT}`,
      url: BASE_URL,
      reuseExistingServer: !isCI,
      timeout: 60_000,
      // The /api handlers' Admin SDK targets the emulators in test mode.
      env: {
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
        GCLOUD_PROJECT: 'demo-long-run',
      },
    },
  ],
})
