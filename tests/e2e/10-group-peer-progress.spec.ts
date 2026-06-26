import { test, expect, type Page, type Browser } from '@playwright/test'
import { openLessonOne, playLessonOneToEnd } from './helpers'

const BASE_URL = 'http://localhost:5173'

let seq = 0
async function signUpIn(page: Page, name: string): Promise<void> {
  seq += 1
  const email = `${name.toLowerCase()}_${Date.now()}_${seq}@example.com`
  await page.goto(`${BASE_URL}/signup`)
  await page.getByPlaceholder('Display name').fill(name)
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill('hunter2pw')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page.getByRole('heading', { name: new RegExp(`Hi, ${name}`) })).toBeVisible()
}

async function joinGroup(page: Page): Promise<void> {
  await page.getByTestId('group-cta').click()
  await page.getByTestId('confirm-join').click()
  await expect(page).toHaveURL(/\/group$/)
  await expect(page.getByRole('heading', { name: /^The \S+ \S+$/ })).toBeVisible({
    timeout: 30_000,
  })
}

// Complete Lesson 1, then wait until it's persisted (the dashboard re-reads it)
// so the user is reliably level band 1 before joining — giving this test its own
// closed cohort, isolated from the band-0 users in the other specs (so the two
// members are guaranteed to land together).
async function completeLessonOneToBand1(page: Page): Promise<void> {
  await openLessonOne(page)
  await playLessonOneToEnd(page, false)
  await page.getByRole('button', { name: 'Continue' }).click() // finish → completion
  await expect(page).toHaveURL(/\/lesson\/long-run\/complete/)
  await expect(async () => {
    await page.goto(`${BASE_URL}/`)
    await expect(page.getByText('1/5 lessons done')).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
}

// PRD2 §13 scenario 4 (revised): cohort presence on the course path. A lesson
// nobody has completed shows "be the first to complete this lesson!"; once a
// cohort-mate has completed one, their profile icon appears there instead — with
// a hover tooltip and no leaked scores.
test('course path shows the "be the first" nudge, then a peer icon once completed', async ({
  browser,
}: {
  browser: Browser
}) => {
  test.slow()

  // Ada: complete Lesson 1 (→ band 1), then join her own cohort.
  const ctxA = await browser.newContext()
  const pageA = await ctxA.newPage()
  await signUpIn(pageA, 'Ada')
  await completeLessonOneToBand1(pageA)
  await joinGroup(pageA)

  // Bo: also band 1 → joins the same (band-1) cohort as Ada.
  const ctxB = await browser.newContext()
  const pageB = await ctxB.newPage()
  await signUpIn(pageB, 'Bo')
  await completeLessonOneToBand1(pageB)
  await joinGroup(pageB)
  await expect(pageB.getByText('Ada', { exact: false }).first()).toBeVisible()

  // On the course path, Lesson 1 (completed) shows peer icons; a later lesson
  // nobody has finished shows the nudge.
  await pageB.goto(`${BASE_URL}/`)
  await expect(pageB.getByTestId('peer-avatars-long-run')).toBeVisible({ timeout: 15_000 })
  await expect(
    pageB.getByTestId('peer-avatars-long-run').getByTestId('peer-avatar').first(),
  ).toBeVisible()
  await expect(pageB.getByTestId('peer-be-first-expected-value')).toBeVisible()
  await expect(pageB.getByTestId('peer-be-first-expected-value')).toContainText(
    'Be the first one to complete this lesson',
  )

  // The hover tooltip names who completed it, with no leaked scores.
  const text = (await pageB.getByTestId('peer-tooltip-long-run').textContent()) ?? ''
  expect(text).toContain('Ada')
  expect(text).toMatch(/Completed by/i)
  expect(text).not.toMatch(/%|\bmastery\b|\battempts?\b/i)

  await ctxA.close()
  await ctxB.close()
})
