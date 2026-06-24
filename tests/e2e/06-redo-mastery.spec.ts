import { test, expect } from '@playwright/test'
import { signUp, openLessonOne, playLessonOneToEnd } from './helpers'

// Restarting a finished lesson must score the redo fresh: a clean first-try run
// should reach 100% even if the original run had a wrong answer.
test('redoing a lesson scores first-try mastery fresh', async ({ page }) => {
  await signUp(page)

  // First run: miss the first checkpoint (then recover) → 50% first-try mastery.
  await openLessonOne(page)
  await playLessonOneToEnd(page, true)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/complete/)
  await expect(page.getByText('50%')).toBeVisible()

  // Redo from the beginning, answering everything correctly first try.
  await page.goto('/')
  await page.getByTestId('lesson-card-long-run').click()
  await page.getByRole('button', { name: 'Start from the beginning' }).click()
  await playLessonOneToEnd(page, false)
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page).toHaveURL(/\/complete/)
  // Fresh first-try mastery — would be stuck at 50% (the original score) if the
  // redo reused the old attempt counts.
  await expect(page.getByText('100%', { exact: true })).toBeVisible()
})
