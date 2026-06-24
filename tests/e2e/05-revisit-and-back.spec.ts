import { test, expect } from '@playwright/test'
import { signUp, openLessonOne, playLessonOneToEnd } from './helpers'

// Re-entering a finished lesson should offer a choice rather than dumping the
// learner on the last step; and Back should step one stage backward in-lesson.
test('finished lesson prompts to restart; Back steps backward', async ({ page }) => {
  await signUp(page)

  // The Back control steps one stage backward (here, off the interactive step).
  await openLessonOne(page)
  await page.getByRole('button', { name: 'Continue' }).click() // -> step 2
  await expect(page.getByText('2/7')).toBeVisible()
  await page.getByTestId('step-back').click() // -> step 1
  await expect(page.getByText('1/7')).toBeVisible()
  await expect(page.getByTestId('step-back')).toBeDisabled() // nothing before step 1

  // Finish the lesson.
  await playLessonOneToEnd(page, false)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/complete/)

  // Re-enter the completed lesson from the course path → restart prompt appears.
  await page.goto('/')
  await page.getByTestId('lesson-card-long-run').click()
  await expect(page.getByText("You've finished this lesson")).toBeVisible()

  // Choosing "start from the beginning" lands on step 1, not the end.
  await page.getByRole('button', { name: 'Start from the beginning' }).click()
  await expect(page.getByText('1/7')).toBeVisible()
  await expect(page.getByText('Why insurers')).toBeVisible()
})
