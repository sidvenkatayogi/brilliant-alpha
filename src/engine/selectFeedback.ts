import type { Feedback } from '../content/types'
import type { CheckResult } from './checkAnswer'

/**
 * Pick the authored feedback string for a checked answer. All feedback is
 * hand-written in the lesson JSON — nothing is generated. Resolution order for
 * a wrong answer: a per-option override (`byOption[id]`) if present, else the
 * generic `incorrect` line.
 */
export function selectFeedback(feedback: Feedback, result: CheckResult): string {
  if (result.correct) {
    return feedback.correct
  }
  if (result.optionId && feedback.byOption?.[result.optionId]) {
    return feedback.byOption[result.optionId]
  }
  return feedback.incorrect
}
