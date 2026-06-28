import { callApi } from '../lib/api'
import type { QuizQuestion } from '../engine/quiz'

const TIMEOUT_MS = 10_000

/**
 * Fetch an AI-generated practice quiz from the server.
 * Wraps callApi with a ~10s timeout via Promise.race (callApi uses plain fetch
 * with no abort signal). On timeout or any other failure, rejects so Quiz.tsx
 * can fall back to generateMixedQuiz.
 */
export async function fetchPracticeQuiz(
  completedLessonIds: string[],
  weakLessonIds: string[],
): Promise<QuizQuestion[]> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('fetchPracticeQuiz timed out')), TIMEOUT_MS),
  )

  const request = callApi<{ questions: QuizQuestion[]; source: string }>('cohort', {
    action: 'generatePracticeQuiz',
    completedLessonIds,
    weakLessonIds,
  })

  const res = await Promise.race([request, timeout])
  return res.questions
}
