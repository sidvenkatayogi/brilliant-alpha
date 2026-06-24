import { test, expect } from '@playwright/test'
import { signUp, openLessonOne } from './helpers'

// Scenario 2 — a learner manipulates an interactive widget and the visual
// responds in real time (the trial count jumps as the sampler runs).
test('manipulating the sampler updates the visual live', async ({ page }) => {
  await signUp(page)
  await openLessonOne(page)

  // Advance to the interactive sampler step.
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByText('Anywhere from 0 to 3').click()
  await page.getByRole('button', { name: 'Lock in my guess' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  const count = page.getByTestId('trial-count')
  await expect(count).toHaveText('6')

  // Running the experiment drives the count up immediately.
  await page.getByRole('button', { name: /Run to/ }).click()
  await expect(count).toHaveText('10,000')

  // And the completion gate is now satisfied, so Continue is enabled.
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled()
})
