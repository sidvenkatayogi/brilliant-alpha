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

/** Open Lesson 1 (The Insurance Desk) from the dashboard. */
export async function openLessonOne(page: Page) {
  await page.getByTestId('lesson-card-long-run').click()
  await expect(page.getByText("Here's your town")).toBeVisible()
}

/**
 * Walk Lesson 1 (The Insurance Desk) to its final step. When `recover` is true,
 * the first checkpoint is answered wrong first (to exercise the feedback-recovery
 * path) before the correct answer. Leaves the page on the last step's Continue
 * (not yet clicked).
 *
 * Lesson 1 has two checkpoint questions, so a clean run masters 100% and a
 * single recovered miss scores 50%.
 */
export async function playLessonOneToEnd(page: Page, recover = true) {
  // 1: concept — "Here's your town".
  await page.getByRole('button', { name: 'Continue' }).click()

  // 2: predict — lock in any guess.
  await page.getByText('Most years, but the odd bad year').click()
  await page.getByRole('button', { name: 'Lock in my guess' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  // 3: interactive — grow the business to 2,000 drivers to satisfy the gate.
  await page.getByTestId('scale-2000').click()
  await page.getByRole('button', { name: 'Continue' }).click()

  // 4: first question — optionally answer wrong, see feedback, then recover.
  if (recover) {
    await page.getByText('Bigger companies somehow make drivers crash less').click()
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

  // 5: second question — answer correctly (first try on both runs).
  await page.getByText("Nothing certain").click()
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true')
  await page.getByRole('button', { name: 'Continue' }).click()

  // 6: summary concept — caller decides when to finish.
  await expect(page.getByText('The long run, in one line')).toBeVisible()
}
