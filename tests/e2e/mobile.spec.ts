import { test, expect } from '@playwright/test'
import { signUp, openLessonOne, playLessonOneToEnd } from './helpers'

// Scenario 5 — the full flow on a phone-sized viewport with touch input
// (the `mobile` project uses the Pixel 5 device profile, which enables touch).
test('full lesson flow works on a phone with touch', async ({ page }) => {
  await signUp(page)
  await openLessonOne(page)
  await playLessonOneToEnd(page, true)
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page).toHaveURL(/\/complete/)
  await expect(page.getByRole('heading', { name: 'Lesson complete' })).toBeVisible()
})
