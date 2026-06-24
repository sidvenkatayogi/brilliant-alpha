import { test, expect } from '@playwright/test'
import { signUp, openLessonOne, playLessonOneToEnd } from './helpers'

// Scenario 1 — a learner completes a lesson, gets a question wrong, and uses the
// authored feedback to recover, ending on the completion screen.
test('complete a lesson, recover from a wrong answer', async ({ page }) => {
  await signUp(page)
  await openLessonOne(page)
  await playLessonOneToEnd(page, true)

  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page).toHaveURL(/\/lesson\/long-run\/complete/)
  await expect(page.getByRole('heading', { name: 'Lesson complete' })).toBeVisible()
  await expect(page.getByText('first-try mastery')).toBeVisible()
})
