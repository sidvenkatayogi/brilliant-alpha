import { test, expect } from '@playwright/test'
import { signUp } from './helpers'

// PRD2 §13 scenario 5: the whole Group tab works on a phone-sized viewport with
// touch. Runs under the Playwright "mobile" project (Pixel 5, touch enabled).
test('Group tab works on a phone with touch', async ({ page }) => {
  test.slow() // first assignCohort call may cold-start the functions emulator
  await signUp(page)

  await page.getByTestId('group-cta').tap() // "Join a group"
  await page.getByTestId('confirm-join').tap()
  await expect(page).toHaveURL(/\/group$/)

  // Cohort + members render in a single column.
  await expect(page.getByRole('heading', { name: /^The \S+ \S+$/ })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByText('(you)')).toBeVisible()

  // Availability grid is tappable.
  const cells = page.locator('[data-testid^="slot-"]')
  await expect(cells.first()).toBeVisible()
  await cells.nth(0).tap()
  await expect(cells.nth(0)).toHaveAttribute('data-selected', 'true')

  // Overlap view + suggested slot.
  await page.getByTestId('overlap-toggle').tap()
  await expect(page.getByText('Best slot:')).toBeVisible()

  // AI outline (stub) generates and renders.
  await page.getByTestId('generate-outline').scrollIntoViewIfNeeded()
  await page.getByTestId('generate-outline').tap()
  await expect(page.getByTestId('outline')).toBeVisible()
})
