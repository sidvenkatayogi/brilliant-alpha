import { test, expect, type Page, type Browser } from '@playwright/test'

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

// PRD2 §13 scenario 2 (revised): no single member locks the time. A member
// proposes a slot; it stays pending; you can withdraw/re-approve; all proposed
// times remain viewable (you can go back); and other members can approve them.
test('proposed times wait for group approval and all stay viewable', async ({
  browser,
}: {
  browser: Browser
}) => {
  test.slow()

  // Two members in the same cohort.
  const ctxA = await browser.newContext()
  const pageA = await ctxA.newPage()
  await signUpIn(pageA, 'Ada')
  await joinGroup(pageA)

  const ctxB = await browser.newContext()
  const pageB = await ctxB.newPage()
  await signUpIn(pageB, 'Bo')
  await joinGroup(pageB)

  // Ada reloads so her member list includes Bo, then proposes a time.
  await pageA.goto(`${BASE_URL}/group`)
  await pageA.getByTestId('overlap-toggle').click()
  const cellsA = pageA.locator('[data-testid^="slot-"]')
  await expect(cellsA.first()).toBeVisible({ timeout: 15_000 })
  await cellsA.nth(20).click()

  // Listed as pending (Ada approved her own), not unilaterally locked.
  await expect(pageA.getByTestId('meeting-proposal')).toBeVisible()
  await expect(pageA.getByTestId('you-approved')).toBeVisible()
  await expect(pageA.getByText('Confirmed time')).toHaveCount(0)

  // Ada is the sole approver — withdrawing drops the proposal entirely.
  await pageA.getByTestId('you-approved').click()
  await expect(pageA.locator('[data-testid^="proposal-"]')).toHaveCount(0)
  await expect(pageA.getByTestId('meeting-proposal')).toHaveCount(0)

  // Propose it again, then a SECOND time — both stay viewable.
  await pageA.locator('[data-testid^="slot-"]').nth(20).click()
  await expect(pageA.getByTestId('you-approved')).toBeVisible()
  await pageA.getByTestId('propose-another').click()
  await pageA.locator('[data-testid^="slot-"]').nth(25).click()
  await expect(pageA.locator('[data-testid^="proposal-"]')).toHaveCount(2)

  // The grid's back button returns to the list without losing proposals.
  await pageA.getByTestId('propose-another').click()
  await pageA.getByTestId('back-to-proposals').click()
  await expect(pageA.locator('[data-testid^="proposal-"]')).toHaveCount(2)

  // Bo opens the meeting, sees both proposed times, and approves one — recorded
  // for the group (his approve button on that proposal goes away).
  await pageB.goto(`${BASE_URL}/group`)
  await expect(pageB.getByTestId('meeting-proposal')).toBeVisible({ timeout: 15_000 })
  await expect(pageB.locator('[data-testid^="proposal-"]')).toHaveCount(2)
  const before = await pageB.getByTestId('approve-time').count()
  await pageB.getByTestId('approve-time').first().click()
  await expect.poll(() => pageB.getByTestId('approve-time').count()).toBeLessThan(before)

  await ctxA.close()
  await ctxB.close()
})
