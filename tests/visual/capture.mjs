// Visual capture for gated lessons. Used by the factory's visual-worker (L2).
//
// Why this exists: lessons are locked behind progression (lesson N opens only
// once lesson N-1 is `completed` — see src/engine/mastery.ts:isUnlocked). You
// CANNOT reach them by driving the UI, and deep-linking to `/lesson/<id>` hits
// a Firebase auth-restore race that redirects you home. So this script seeds
// progress straight into the Firestore emulator, then navigates CLIENT-SIDE.
//
// Prereqs (the visual-worker brings these up first):
//   npm run emulators      # Auth :9099 + Firestore :8080, project demo-long-run
//   npm run dev:test       # Vite --mode test -> app talks to those emulators
//
// Usage: node tests/visual/capture.mjs <out-dir>
//   out-dir defaults to .factory visual dir if unset.

import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const PROJECT = 'demo-long-run'
const AUTH = 'http://127.0.0.1:9099'
const FS = 'http://127.0.0.1:8080'
const PASSWORD = 'visual-pw-123'
const OUT = process.argv[2] ?? '/tmp/visual-out'

// Lessons in unlock order. Keep in sync with src/content/lessons/*.json.
const LESSONS = [
  { id: 'long-run', title: 'The Insurance Desk' },
  { id: 'combining-events', title: 'The Redundancy Bay' },
  { id: 'conditioning', title: 'The Spam Inbox' },
  { id: 'bayes-base-rates', title: 'The Screening Clinic' },
  { id: 'expected-value', title: 'The Casino Floor' },
]

const VIEWPORTS = [
  { w: 375, h: 667, tag: 'mobile' },
  { w: 1280, h: 800, tag: 'desktop' },
]

const log = (...a) => console.log(new Date().toISOString(), ...a)

// Write a completed LessonProgress doc straight into the Firestore emulator,
// bypassing security rules with the emulator's "owner" bearer token.
async function seedCompleted(uid, lessonId) {
  const url = `${FS}/v1/projects/${PROJECT}/databases/(default)/documents/users/${uid}/progress/${lessonId}`
  const body = {
    fields: {
      lessonId: { stringValue: lessonId },
      status: { stringValue: 'completed' },
      currentStepIndex: { integerValue: '0' },
      stepResults: { mapValue: { fields: {} } },
      masteryScore: { doubleValue: 1 },
      startedAt: { integerValue: '0' },
      completedAt: { integerValue: '1' },
      lastAccessedAt: { integerValue: '1' },
    },
  }
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`seed ${lessonId} failed: ${r.status} ${await r.text()}`)
}

async function uidFromAuthEmulator(email) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ email: [email] }),
  })
  return (await r.json()).users?.[0]?.localId
}

async function signUp(page, email) {
  await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('Display name').fill('Visual Worker')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill(PASSWORD)
  await page.getByRole('button', { name: /sign ?up|create/i }).click()
  await page.waitForURL((u) => !/\/signup$/.test(u.toString()), { timeout: 15000 })
}

const results = {}
const browser = await chromium.launch()

try {
  const ctx = await browser.newContext()
  const setup = await ctx.newPage()
  const email = `visual+${Date.now()}@example.com`
  await signUp(setup, email)
  const uid = await uidFromAuthEmulator(email)
  if (!uid) throw new Error('could not resolve uid from Auth emulator')
  log('[auth] signed up', email, 'uid', uid)
  await setup.close()

  for (const vp of VIEWPORTS) {
    const page = await ctx.newPage()
    await page.setViewportSize({ width: vp.w, height: vp.h })

    for (let i = 0; i < LESSONS.length; i++) {
      const lesson = LESSONS[i]
      // Seed the PREREQUISITES completed (unlocks lesson i); leave lesson i
      // unseeded so it opens on the interactive content, not the recap screen.
      for (let j = 0; j < i; j++) await seedCompleted(uid, LESSONS[j].id)

      // Load the dashboard once and wait until progress has loaded, then click
      // the lesson card. Client-side nav (no reload) dodges the deep-link race.
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
      try {
        await page.getByText(/lessons done/i).waitFor({ timeout: 10000 })
      } catch {
        // No completed lessons yet (i === 0): the dashboard still renders cards.
        await page.getByText(lesson.title, { exact: true }).first().waitFor({ timeout: 10000 })
      }
      await page.getByText(lesson.title, { exact: true }).first().click()
      await page.waitForTimeout(1000)

      const landed = new URL(page.url()).pathname === `/lesson/${lesson.id}`
      const file = `${OUT}/${lesson.id}-${vp.tag}.png`
      await page.screenshot({ path: file })
      results[`${lesson.id}-${vp.tag}`] = {
        lesson: lesson.id,
        title: lesson.title,
        viewport: `${vp.w}x${vp.h}`,
        url: page.url(),
        reached: landed,
        screenshot: file,
        verdict: landed ? 'REACHED' : 'BLOCKED — redirected home',
      }
      log(`[${vp.tag}] ${lesson.id}: ${landed ? 'REACHED' : 'BLOCKED ' + page.url()} -> ${file}`)
    }
    await page.close()
  }
} catch (e) {
  log('[FATAL]', e.message)
  results.__error = e.message
} finally {
  await browser.close()
  const fs = await import('fs')
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2))
  const vals = Object.values(results).filter((r) => r && typeof r === 'object' && 'reached' in r)
  log(`=== DONE: ${vals.filter((r) => r.reached).length}/${vals.length} views reached ===`)
}
