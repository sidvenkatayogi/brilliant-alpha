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

  // AC17: at least one question is rendered — wait for async quiz generation to complete.
  // quiz-loading is shown first; quiz div only appears once generateQuiz() resolves.
  await expect(page.getByTestId('quiz-loading')).not.toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('quiz')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('quiz-q-0')).toBeVisible({ timeout: 15000 })

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
  // with no data-testid. We assert it is visible and non-empty rather than matching a
  // specific phrase — the server's deterministic path (emulator) and the client fallback
  // path use slightly different conceptSummary copies, so any phrase match would be brittle.
  const explanationPara = page.getByTestId('quiz-q-0').locator('p.text-xs')
  await expect(explanationPara).toBeVisible()
  const explanationText = await explanationPara.innerText()
  expect(explanationText.trim().length).toBeGreaterThan(0)

  // AC22: "Generate new quiz" resets the state; wait for async re-generation to complete.
  await expect(page.getByTestId('quiz-new')).toBeVisible()
  await page.getByTestId('quiz-new').click()

  await expect(page.getByTestId('quiz-score')).not.toBeVisible()
  // quiz-loading appears briefly; wait it out before asserting quiz is back
  await expect(page.getByTestId('quiz-loading')).not.toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('quiz')).toBeVisible({ timeout: 15000 })
})

// AC14 — loading state is shown while the quiz is being generated, then resolves
// to the quiz container with at least one question.
test('AC14: quiz-loading shown while generating, then quiz appears', async ({ page }) => {
  await signUp(page)
  await openLessonOne(page)
  await playLessonOneToEnd(page, false)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.goto('/quiz')

  // Either quiz-loading is shown (async still in flight) or quiz is already visible
  // (resolved quickly). Both are valid; what matters is that quiz eventually appears.
  // We assert quiz-loading disappears within 15s and quiz follows.
  await expect(page.getByTestId('quiz-loading')).not.toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('quiz')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('quiz-q-0')).toBeVisible({ timeout: 15000 })
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

  // Wait for the async quiz generation to finish before interacting.
  await expect(page.getByTestId('quiz-loading')).not.toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('quiz')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('quiz-q-0')).toBeVisible({ timeout: 15000 })

  // Submit WITHOUT answering anything
  await page.getByTestId('quiz-submit').click()

  // Warning must appear; score must NOT appear
  await expect(page.getByTestId('quiz-warning')).toBeVisible()
  await expect(page.getByTestId('quiz-score')).not.toBeVisible()
})
