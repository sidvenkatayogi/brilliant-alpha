import { type Page, expect } from '@playwright/test'

let counter = 0

/** Sign up a fresh user against the Auth emulator and land on the dashboard. */
export async function signUp(page: Page): Promise<string> {
  counter += 1
  const email = `maya_${Date.now()}_${counter}@example.com`
  await page.goto('/signup')
  await page.getByPlaceholder('Display name').fill('Maya')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill('hunter2pw')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page.getByRole('heading', { name: /Hi, Maya/ })).toBeVisible()
  return email
}

/** Open Lesson 1 from the dashboard. */
export async function openLessonOne(page: Page) {
  await page.getByTestId('lesson-card-long-run').click()
  await expect(page.getByText('Why insurers')).toBeVisible()
}

/**
 * Walk Lesson 1 to its final step. When `recover` is true, the first checkpoint
 * is answered wrong first (to exercise the feedback-recovery path) before the
 * correct answer. Leaves the page on the last step's Continue (not yet clicked).
 */
export async function playLessonOneToEnd(page: Page, recover = true) {
  // 1–2: two concept steps.
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  // 3: predict — lock in any guess.
  await page.getByText('Anywhere from 0 to 3').click()
  await page.getByRole('button', { name: 'Lock in my guess' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  // 4: interactive — run to the max so the completion gate is satisfied.
  await page.getByRole('button', { name: /Run to/ }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  // 5: question — optionally answer wrong, see feedback, then recover.
  if (recover) {
    await page.getByText('The die slowly becomes fair').click()
    await page.getByRole('button', { name: 'Check' }).click()
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false')
    await page.getByText('Small samples are noisy').click()
    await page.getByRole('button', { name: 'Try again' }).click()
  } else {
    await page.getByText('Small samples are noisy').click()
    await page.getByRole('button', { name: 'Check' }).click()
  }
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true')
  await page.getByRole('button', { name: 'Continue' }).click()

  // 6: second question.
  await page.getByText('Often 0, 1, or 2').click()
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true')
  await page.getByRole('button', { name: 'Continue' }).click()

  // 7: summary concept — caller decides when to finish.
  await expect(page.getByText('The long run, in one line')).toBeVisible()
}
