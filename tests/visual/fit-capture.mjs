/**
 * Fit-to-viewport verification script for round-4 interactive lesson steps.
 * Tests that at 375x667, all key elements (canvas, controls, readout, Continue button)
 * are simultaneously visible with NO page scrolling needed.
 */
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const PROJECT = 'demo-long-run'
const AUTH = 'http://127.0.0.1:9099'
const FS = 'http://127.0.0.1:8080'
const PASSWORD = 'visual-pw-123'

const OUT = '/Users/sidvenkatayogi/Documents/Code/alphaai/brilliant-alpha/.factory/runs/2026-06-27-interactive-in-frame/domains/testing/visual-fit'

const log = (...a) => console.log(new Date().toISOString(), ...a)

// Lessons in unlock order
const LESSONS = [
  { id: 'long-run', title: 'The Insurance Desk', widget: 'insuranceDesk' },
  { id: 'combining-events', title: 'The Redundancy Bay', widget: 'redundancyBay' },
  { id: 'conditioning', title: 'The Spam Inbox', widget: 'spamInbox' },
  { id: 'bayes-base-rates', title: 'The Screening Clinic', widget: 'screeningClinic' },
  { id: 'expected-value', title: 'The Casino Floor', widget: 'casinoFloor' },
]

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
  await page.getByPlaceholder('Display name').fill('Fit Worker')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill(PASSWORD)
  await page.getByRole('button', { name: /sign ?up|create/i }).click()
  await page.waitForURL((u) => !/\/signup$/.test(u.toString()), { timeout: 15000 })
}

async function navigateToLesson(page, lesson, lessonIndex) {
  // Load dashboard
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  // Wait for dashboard content to load
  try {
    await page.getByText(/lessons done/i).waitFor({ timeout: 10000 })
  } catch {
    // No completed lessons (index 0): wait for lesson card
    await page.getByText(lesson.title, { exact: true }).first().waitFor({ timeout: 10000 })
  }
  // Click the lesson card (client-side nav avoids auth race)
  await page.getByText(lesson.title, { exact: true }).first().click()
  await page.waitForTimeout(2000)

  const pathname = new URL(page.url()).pathname
  return pathname === `/lesson/${lesson.id}`
}

async function navigateToInteractiveStep(page) {
  // Check current page - we may need to advance through intro steps
  // Look for a "Continue" button or interactive widget
  let attempts = 0
  while (attempts < 10) {
    // Check if we're on an interactive step
    const hasCanvas = await page.locator('canvas').count()
    const hasSlider = await page.locator('input[type="range"]').count()
    const hasChips = await page.locator('button[aria-label*="chip"], [data-testid*="chip"]').count()

    if (hasCanvas > 0 || hasSlider > 0) {
      log('Found interactive step with canvas/slider')
      return true
    }

    // Try to advance
    const continueBtn = page.getByRole('button', { name: /continue|next|start|begin/i }).first()
    const hasContinue = await continueBtn.isVisible().catch(() => false)
    if (hasContinue) {
      await continueBtn.click()
      await page.waitForTimeout(800)
    } else {
      break
    }
    attempts++
  }
  return false
}

async function measureScrollAndElements(page, viewportHeight, viewportWidth) {
  const metrics = await page.evaluate(({ vh, vw }) => {
    const scrollEl = document.scrollingElement || document.documentElement
    const scrollHeight = scrollEl.scrollHeight
    const scrollWidth = scrollEl.scrollWidth
    const innerHeight = window.innerHeight
    const innerWidth = window.innerWidth

    // Find key elements
    const canvas = document.querySelector('canvas')
    const sliders = [...document.querySelectorAll('input[type="range"]')]
    const continueBtn = [...document.querySelectorAll('button')].find(b =>
      /continue|keep going|next/i.test(b.textContent || '')
    )

    // Check for chip-like elements
    const chipBtns = [...document.querySelectorAll('button')].filter(b => {
      const r = b.getBoundingClientRect()
      // Small buttons likely to be chips/controls
      return r.width > 20 && r.width < 200 && r.height > 20 && r.height < 80
    })

    function elInfo(el) {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        right: Math.round(r.right),
        inFrame: r.top >= 0 && r.bottom <= vh && r.left >= 0 && r.right <= vw,
        visible: r.width > 0 && r.height > 0
      }
    }

    // Find readout elements (numeric displays)
    const readouts = [...document.querySelectorAll('[class*="readout"], [class*="stat"], [class*="ppv"], [class*="bankroll"]')]
    const numbersInPage = [...document.querySelectorAll('*')].filter(el => {
      const text = el.textContent?.trim() || ''
      return /^\d+\.?\d*%?$/.test(text) && el.children.length === 0 && text.length < 10
    }).slice(0, 5)

    return {
      scrollHeight,
      scrollWidth,
      innerHeight,
      innerWidth,
      canvas: elInfo(canvas),
      sliders: sliders.map(elInfo),
      continueBtn: elInfo(continueBtn),
      continueBtnText: continueBtn?.textContent?.trim(),
      readouts: readouts.map(elInfo),
      readoutsText: readouts.map(el => el.textContent?.trim()),
      allButtons: [...document.querySelectorAll('button')].map(b => ({
        text: b.textContent?.trim().slice(0, 30),
        ...elInfo(b)
      })),
      pageHtml: document.body.innerHTML.slice(0, 500)
    }
  }, { vh: viewportHeight, vw: viewportWidth })

  return metrics
}

async function operateControl(page) {
  // Try to operate a slider first
  const slider = page.locator('input[type="range"]').first()
  const sliderVisible = await slider.isVisible().catch(() => false)

  if (sliderVisible) {
    const box = await slider.boundingBox()
    if (box) {
      // Get current value
      const before = await slider.inputValue().catch(() => 'N/A')
      // Move slider to middle
      await slider.fill('50')
      await page.waitForTimeout(500)
      const after = await slider.inputValue().catch(() => 'N/A')
      return { type: 'slider', before, after }
    }
  }

  // Try buttons/chips that might be controls
  const buttons = await page.locator('button').all()
  for (const btn of buttons) {
    const text = await btn.textContent().catch(() => '')
    if (/spin|roll|deal|flip|run/i.test(text || '')) {
      const before = await page.evaluate(() => document.body.textContent?.match(/\$[\d,]+|\d+%/)?.[0] || '')
      await btn.click()
      await page.waitForTimeout(800)
      const after = await page.evaluate(() => document.body.textContent?.match(/\$[\d,]+|\d+%/)?.[0] || '')
      return { type: 'button', label: text?.trim(), before, after }
    }
  }

  return { type: 'none', before: 'N/A', after: 'N/A' }
}

// Main execution
fs.mkdirSync(OUT, { recursive: true })

const results = {}
const browser = await chromium.launch({ headless: true })

try {
  const ctx = await browser.newContext()
  const setup = await ctx.newPage()
  await setup.setViewportSize({ width: 375, height: 667 })

  const email = `fit+${Date.now()}@example.com`
  await signUp(setup, email)
  const uid = await uidFromAuthEmulator(email)
  if (!uid) throw new Error('could not resolve uid from Auth emulator')
  log('[auth] signed up', email, 'uid', uid)
  await setup.close()

  // ============================================================
  // MOBILE 375x667 — main test for all 5 lessons
  // ============================================================
  const mobile = await ctx.newPage()
  await mobile.setViewportSize({ width: 375, height: 667 })

  for (let i = 0; i < LESSONS.length; i++) {
    const lesson = LESSONS[i]
    log(`\n=== Lesson ${i+1}: ${lesson.title} (${lesson.widget}) ===`)

    // Seed prerequisites completed, leave current lesson unseeded
    for (let j = 0; j < i; j++) {
      await seedCompleted(uid, LESSONS[j].id)
    }

    const reached = await navigateToLesson(mobile, lesson, i)
    if (!reached) {
      log(`BLOCKED — could not navigate to ${lesson.id}`)
      results[lesson.widget] = { lesson: lesson.id, reached: false, error: 'blocked' }
      continue
    }
    log(`Reached /lesson/${lesson.id}`)

    // Navigate to interactive step
    await navigateToInteractiveStep(mobile)
    await mobile.waitForTimeout(1000)

    // Special case for RedundancyBay: has TWO interactive steps (sandbox + compare)
    const isRedundancy = lesson.id === 'combining-events'

    // Take screenshot of first interactive step (or current state)
    const stepScreenshot = `${OUT}/L0${i+1}-${lesson.widget}-step.png`
    await mobile.screenshot({ path: stepScreenshot, fullPage: false })
    log(`Screenshot: ${stepScreenshot}`)

    // Measure scroll and elements
    const metrics1 = await measureScrollAndElements(mobile, 667, 375)
    log(`scrollHeight: ${metrics1.scrollHeight}, innerHeight: ${metrics1.innerHeight}`)
    log(`scrollWidth: ${metrics1.scrollWidth}, innerWidth: ${metrics1.innerWidth}`)
    log(`canvas: ${JSON.stringify(metrics1.canvas)}`)
    log(`sliders (${metrics1.sliders.length}): ${JSON.stringify(metrics1.sliders)}`)
    log(`continueBtn: ${JSON.stringify(metrics1.continueBtn)} text="${metrics1.continueBtnText}"`)

    // Operate the primary control
    const interaction = await operateControl(mobile)
    log(`Interaction: ${JSON.stringify(interaction)}`)

    // Screenshot after interaction
    const afterScreenshot = `${OUT}/L0${i+1}-${lesson.widget}-after.png`
    await mobile.screenshot({ path: afterScreenshot, fullPage: false })

    // Measure after interaction
    const metrics2 = await measureScrollAndElements(mobile, 667, 375)

    // For RedundancyBay, try to find and screenshot the compare mode step too
    let compareResult = null
    if (isRedundancy) {
      log('RedundancyBay: looking for compare mode / second interactive step')
      // Try advancing to see if there's a second interactive step
      let foundCompare = false
      for (let attempt = 0; attempt < 5; attempt++) {
        const continueBtn = mobile.getByRole('button', { name: /continue|next/i }).first()
        const hasContinue = await continueBtn.isVisible().catch(() => false)
        if (!hasContinue) break
        await continueBtn.click()
        await mobile.waitForTimeout(1000)
        const hasCanvas = await mobile.locator('canvas').count()
        if (hasCanvas > 0) {
          foundCompare = true
          break
        }
      }
      if (foundCompare) {
        const compareScreenshot = `${OUT}/L02-redundancyBay-compare.png`
        await mobile.screenshot({ path: compareScreenshot, fullPage: false })
        const compareMetrics = await measureScrollAndElements(mobile, 667, 375)
        compareResult = {
          screenshot: compareScreenshot,
          scrollHeight: compareMetrics.scrollHeight,
          innerHeight: compareMetrics.innerHeight,
          noScroll: compareMetrics.scrollHeight <= 680,
          noHScroll: compareMetrics.scrollWidth <= 400,
        }
        log(`Compare mode: scrollHeight=${compareMetrics.scrollHeight}`)
      }
    }

    results[lesson.widget] = {
      lesson: lesson.id,
      title: lesson.title,
      reached: true,
      screenshots: { step: stepScreenshot, after: afterScreenshot },
      metrics: {
        scrollHeight: metrics1.scrollHeight,
        innerHeight: metrics1.innerHeight,
        scrollWidth: metrics1.scrollWidth,
        innerWidth: metrics1.innerWidth,
        noScroll: metrics1.scrollHeight <= 680,
        noHScroll: metrics1.scrollWidth <= 400,
      },
      elements: {
        canvas: metrics1.canvas,
        slidersCount: metrics1.sliders.length,
        sliderInFrame: metrics1.sliders.every(s => s?.inFrame),
        firstSlider: metrics1.sliders[0],
        continueBtn: metrics1.continueBtn,
        continueBtnText: metrics1.continueBtnText,
        allButtons: metrics1.allButtons,
      },
      interaction: {
        ...interaction,
        afterScrollHeight: metrics2.scrollHeight,
        afterNoScroll: metrics2.scrollHeight <= 680,
      },
      compareMode: compareResult,
    }
  }

  await mobile.close()

  // ============================================================
  // DESKTOP 1280x800 — sanity check on L04 ScreeningClinic
  // ============================================================
  log('\n=== Desktop sanity check: L04 ScreeningClinic at 1280x800 ===')
  const desktop = await ctx.newPage()
  await desktop.setViewportSize({ width: 1280, height: 800 })

  // Seed all prerequisites for L04 (lessons 1-3)
  for (let j = 0; j < 3; j++) await seedCompleted(uid, LESSONS[j].id)

  const desktopReached = await navigateToLesson(desktop, LESSONS[3], 3)
  if (desktopReached) {
    await navigateToInteractiveStep(desktop)
    await desktop.waitForTimeout(1000)
    const desktopFile = `${OUT}/L04-screeningClinic-desktop.png`
    await desktop.screenshot({ path: desktopFile, fullPage: false })
    const desktopMetrics = await measureScrollAndElements(desktop, 800, 1280)
    results['screeningClinic-desktop'] = {
      scrollHeight: desktopMetrics.scrollHeight,
      innerHeight: desktopMetrics.innerHeight,
      noScroll: desktopMetrics.scrollHeight <= 810,
      screenshot: desktopFile,
    }
    log(`Desktop L04: scrollHeight=${desktopMetrics.scrollHeight}, innerHeight=${desktopMetrics.innerHeight}`)
  }

  await desktop.close()

} catch (e) {
  log('[FATAL]', e.message, e.stack)
  results.__error = { message: e.message, stack: e.stack }
} finally {
  await browser.close()
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2))
  log('\n=== All done. Results written to', OUT, '===')
}
