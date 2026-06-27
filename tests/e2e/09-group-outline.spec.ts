import { test, expect, type Page } from '@playwright/test'

// Two fresh users both have 0 lessons completed → level band 0 → the same cohort
// (the first creates it, the second joins). The AI call resolves to the
// emulator's deterministic stub, so no real OpenAI request is made.
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
}

// PRD2 §13 scenario 3: a member generates a meeting outline (AI mocked) and it
// renders; a second member sees the same cached outline without regenerating.
test('outline generates once and is cached for the whole cohort', async ({ browser }) => {
  test.slow() // first /api call may cold-load the serverless handler in the dev server
  const ctxA = await browser.newContext()
  const pageA = await ctxA.newPage()
  await signUpIn(pageA, 'Ada')
  await joinGroup(pageA)

  // Ada generates the outline (generous wait: first call may cold-start functions).
  await expect(pageA.getByTestId('generate-outline')).toBeVisible({ timeout: 30_000 })
  await pageA.getByTestId('generate-outline').click()
  await expect(pageA.getByTestId('outline')).toBeVisible()
  await expect(pageA.getByText('Warm-up', { exact: true })).toBeVisible()

  // The outline includes the group quiz, and the answer key stays locked until a
  // meeting time is confirmed — the button shows the locked state and is disabled.
  await expect(pageA.getByTestId('quiz')).toBeVisible()
  const revealKey = pageA.getByTestId('reveal-answer-key')
  await expect(revealKey).toBeVisible()
  await expect(revealKey).toBeDisabled()
  await expect(revealKey).toContainText('unlocks at meeting time')

  // Bo joins the same cohort and opens the Group tab.
  const ctxB = await browser.newContext()
  const pageB = await ctxB.newPage()
  await signUpIn(pageB, 'Bo')
  await joinGroup(pageB)

  // Bo should be in the same cohort as Ada…
  await expect(pageB.getByText('Ada', { exact: false }).first()).toBeVisible()
  // …and see the cached outline already rendered (no Generate button).
  await expect(pageB.getByTestId('outline')).toBeVisible()
  await expect(pageB.getByTestId('generate-outline')).toHaveCount(0)

  await ctxA.close()
  await ctxB.close()
})
