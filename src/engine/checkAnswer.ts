import type { Answer, AnswerFormat } from '../content/types'

/** A learner's raw response: an option id (MC) or a number (numeric). */
export type Response =
  | { optionId: string }
  | { value: number }

export interface CheckResult {
  correct: boolean
  /** Echoed back so feedback selection can resolve per-option messages. */
  optionId?: string
}

/**
 * Pure answer check. No network, no side effects — this is the path that must
 * resolve in well under 100ms. Returns `correct: false` for malformed input
 * rather than throwing, so the UI never crashes on a stray response.
 */
export function checkAnswer(
  format: AnswerFormat,
  answer: Answer,
  response: Response,
): CheckResult {
  if (format === 'multiple_choice') {
    if (!('optionId' in response) || !('correctOptionId' in answer)) {
      return { correct: false }
    }
    return {
      correct: response.optionId === answer.correctOptionId,
      optionId: response.optionId,
    }
  }

  // numeric: correct when within tolerance of the target value (inclusive).
  if (!('value' in response) || !('value' in answer)) {
    return { correct: false }
  }
  if (!Number.isFinite(response.value)) {
    return { correct: false }
  }
  const within = Math.abs(response.value - answer.value) <= answer.tolerance
  return { correct: within }
}
