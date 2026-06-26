import { test, expect } from '@playwright/test'
import { signUp, openLessonOne } from './helpers'

// Scenario 3 — a learner leaves mid-lesson and returns; the step position and
// progress persist (across a full page reload, i.e. a fresh load from Firestore).
test('leaving mid-lesson resumes at the exact step', async ({ page }) => {
  await signUp(page)
  await openLessonOne(page)

  // Advance into the lesson, onto the predict step (step 2 of 6).
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('turn a profit')).toBeVisible()
  await expect(page.getByText('2/6')).toBeVisible()

  // Leave to the dashboard.
  await page.getByRole('button', { name: /Leave/ }).click()
  await expect(page.getByRole('heading', { name: /Hi, Maya/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Continue where you left off/ })).toBeVisible()

  // Hard reload — state must come back from Firestore, not memory.
  await page.reload()
  await page.getByRole('button', { name: /Continue where you left off/ }).click()

  // Back on the exact step we left.
  await expect(page.getByText('turn a profit')).toBeVisible()
  await expect(page.getByText('2/6')).toBeVisible()
})
