/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only middleware that serves the Vercel-style serverless functions in
// `/api/*` during `vite dev` / `vite --mode test`, so local development and the
// Playwright e2e suite work without the Vercel CLI. In production Vercel runs
// these functions itself; this plugin only applies to the dev server.
function apiDevServer(): Plugin {
  return {
    name: 'api-dev-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next()
        const route = req.url.split('?')[0].replace(/^\/api\//, '').replace(/\/+$/, '')
        try {
          const mod = await server.ssrLoadModule(`/api/${route}.ts`)
          // Collect the request body and parse JSON (Vercel does this for us).
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const raw = Buffer.concat(chunks).toString('utf8')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(req as any).body = raw ? JSON.parse(raw) : {}
          // Shim the Vercel response helpers used by the handlers.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(res as any).status = (code: number) => {
            res.statusCode = code
            return res
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(res as any).json = (obj: unknown) => {
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(obj))
          }
          await mod.default(req, res)
        } catch (e) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'API error' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // In test mode (vite --mode test → dev:test / e2e) the /api functions talk to
  // the local emulators; point the Admin SDK at them (no credentials needed).
  // Skip under Vitest (process.env.VITEST), whose mode is also "test" — the unit
  // suite must not be forced onto the emulator/stub path.
  if (mode === 'test' && !process.env.VITEST) {
    process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080'
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099'
    process.env.GCLOUD_PROJECT ||= 'demo-long-run'
  }
  // Make server-side secrets in .env.local available to the dev /api handlers
  // (Vite only exposes VITE_-prefixed vars to the client by default).
  const env = loadEnv(mode, process.cwd(), '')
  for (const k of ['OPENAI_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) {
    if (env[k] && !process.env[k]) process.env[k] = env[k]
  }

  return {
    plugins: [react(), apiDevServer()],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // Playwright specs (tests/e2e) and emulator-backed integration tests
      // (tests/integration) run via their own commands, not the default unit run.
      exclude: ['**/node_modules/**', '**/tests/e2e/**', '**/tests/integration/**', '**/.factory/**'],
    },
  }
})
