import { test, expect } from '@playwright/test'
import { signUp, openLessonOne, playLessonOneToEnd } from './helpers'

// AC25 — empty state: a brand-new user with 0 completed lessons sees the
// "Complete a lesson first" placeholder, not the question container.
test('AC25: quiz empty state shown when no lessons completed', async ({ page }) => {
  await signUp(page)
  await page.goto('/quiz')

  await expect(page.getByTestId('quiz-empty')).toBeVisible()
  await expect(page.getByTestId('quiz')).not.toBeVisible()
})

// AC16/AC17/AC18/AC21/AC22 — happy path: complete lesson 1, navigate to the
// quiz via the dashboard CTA, answer the single question, submit, inspect the
// score display, then regenerate a fresh quiz.
test('AC16-18/21-22: quiz happy path after lesson 1 completion', async ({ page }) => {
  // Complete lesson 1 (clean run, no wrong answer)
  await signUp(page)
  await openLessonOne(page)
  await playLessonOneToEnd(page, false)
  await page.getByRole('button', { name: 'Continue' }).click()
  // Now at /lesson/long-run/complete
  await page.goto('/')

  // AC21: dashboard exposes the quiz CTA
  await expect(page.getByTestId('quiz-cta')).toBeVisible()

  // AC16: clicking the CTA navigates to /quiz
  await page.getByTestId('quiz-cta').click()
  await expect(page).toHaveURL(/\/quiz/)

  // AC17: at least one question is rendered
  await expect(page.getByTestId('quiz')).toBeVisible()
  await expect(page.getByTestId('quiz-q-0')).toBeVisible()

  // Answer every rendered question (with 1 completed lesson, generateMixedQuiz
  // produces exactly 1 question; guard against more with a loop just in case).
  const questionCards = page.locator('[data-testid^="quiz-q-"]')
  const count = await questionCards.count()
  for (let qi = 0; qi < count; qi++) {
    await page.getByTestId(`quiz-opt-${qi}-0`).click()
  }

  // AC18: submit button visible and functional
  await expect(page.getByTestId('quiz-submit')).toBeVisible()
  await page.getByTestId('quiz-submit').click()

  // AC22: score displayed after submission
  await expect(page.getByTestId('quiz-score')).toBeVisible()
  const scoreText = await page.getByTestId('quiz-score').innerText()
  expect(scoreText).toMatch(/\/\s*\d+\s*correct/)

  // AC21: per-question explanation text is visible after submit.
  // Quiz.tsx renders the explanation as a plain <p class="mt-2 text-xs text-slate-500">
  // with no data-testid. The same conceptSummary text also appears in the correct option
  // button, so getByText() resolves to 2 elements (strict mode violation). Scope to the
  // question card and filter to the <p> role to avoid ambiguity.
  // The ✓ tick on the correct option is a bare <span> with no data-testid; a tighter
  // selector would require a frontend testid (noted as needs: if required later).
  await expect(
    page.getByTestId('quiz-q-0').getByRole('paragraph').filter({ hasText: 'rock-steady at scale' }),
  ).toBeVisible()

  // AC22: "Generate new quiz" resets the state
  await expect(page.getByTestId('quiz-new')).toBeVisible()
  await page.getByTestId('quiz-new').click()

  await expect(page.getByTestId('quiz-score')).not.toBeVisible()
  await expect(page.getByTestId('quiz')).toBeVisible()
})

// AC20 — submit with unanswered question is blocked: the warning appears and
// the score is NOT shown.
test('AC20: submitting unanswered quiz shows warning and blocks score', async ({ page }) => {
  // Complete lesson 1 so the quiz has at least one question to answer
  await signUp(page)
  await openLessonOne(page)
  await playLessonOneToEnd(page, false)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.goto('/quiz')

  // Wait for the quiz to finish generating
  await expect(page.getByTestId('quiz')).toBeVisible()
  await expect(page.getByTestId('quiz-q-0')).toBeVisible()

  // Submit WITHOUT answering anything
  await page.getByTestId('quiz-submit').click()

  // Warning must appear; score must NOT appear
  await expect(page.getByTestId('quiz-warning')).toBeVisible()
  await expect(page.getByTestId('quiz-score')).not.toBeVisible()
})
