import { test, expect } from '@playwright/test'
import { signUp, openLessonOne } from './helpers'

// Scenario 2 — a learner manipulates an interactive widget and the visual
// responds in real time (growing the insurance book of business satisfies the
// step's completion gate, which unlocks Continue).
test('manipulating the insurance desk updates the visual live', async ({ page }) => {
  await signUp(page)
  await openLessonOne(page)

  // Advance to the interactive insurance-desk step.
  await page.getByRole('button', { name: 'Continue' }).click() // concept -> predict
  await page.getByText('Most years, but the odd bad year').click()
  await page.getByRole('button', { name: 'Lock in my guess' }).click()
  await page.getByRole('button', { name: 'Continue' }).click() // predict -> interactive

  // The widget is present and the completion gate is not yet satisfied.
  await expect(page.getByTestId('insurance-desk')).toBeVisible()
  await expect(page.getByRole('button', { name: /Keep going/ })).toBeVisible()

  // Growing the business drives the gated `customers` param past its threshold…
  await page.getByTestId('scale-2000').click()

  // …so Continue immediately becomes enabled (the visual responded live).
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled()
})
