import { test, expect } from '@playwright/test'
import { signUp, openLessonOne, playLessonOneToEnd } from './helpers'

// Scenario 4 — finishing a lesson recommends a sensible next step, the streak
// ticks to 1, and the next lesson unlocks on the course path.
test('finishing recommends the next lesson and unlocks it', async ({ page }) => {
  await signUp(page)
  await openLessonOne(page)
  await playLessonOneToEnd(page, false)
  await page.getByRole('button', { name: 'Continue' }).click()

  // Completion screen recommends lesson 2 by title.
  await expect(page).toHaveURL(/\/complete/)
  await expect(page.getByRole('button', { name: /Next: Combining Events/ })).toBeVisible()

  // Following it opens lesson 2.
  await page.getByRole('button', { name: /Next: Combining Events/ }).click()
  await expect(page).toHaveURL(/\/lesson\/combining-events/)

  // Back on the course path: streak is 1 and lesson 1 reads completed.
  await page.goto('/')
  await expect(page.getByText('🔥 1')).toBeVisible()
  await expect(page.getByTestId('lesson-card-long-run')).toHaveAttribute('data-state', 'completed')
  await expect(page.getByTestId('lesson-card-combining-events')).not.toHaveAttribute(
    'data-state',
    'locked',
  )
})
