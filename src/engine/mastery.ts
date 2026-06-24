import type { Lesson } from '../content/types'
import { isQuestionStep } from '../content/types'
import type { LessonProgress } from '../progress/types'

export const MASTERY_THRESHOLD = 0.8
export const REVIEW_NUDGE_THRESHOLD = 0.6

/**
 * masteryScore = (question steps answered correctly on the FIRST try) / (total
 * question steps). A step counts as first-try-correct when its result is
 * correct and was reached in a single attempt. Lessons with no question steps
 * score 1 (nothing to get wrong).
 */
export function computeMastery(lesson: Lesson, progress: LessonProgress): number {
  const questionSteps = lesson.steps.filter(isQuestionStep)
  if (questionSteps.length === 0) return 1

  const firstTryCorrect = questionSteps.filter((step) => {
    const r = progress.stepResults[step.id]
    return r?.correct && r.attempts === 1
  }).length

  return firstTryCorrect / questionSteps.length
}

export function isMastered(masteryScore: number): boolean {
  return masteryScore >= MASTERY_THRESHOLD
}

/** A completed lesson below this bar earns a "revisit" suggestion (P1). */
export function needsReview(progress: LessonProgress): boolean {
  return progress.status === 'completed' && progress.masteryScore < REVIEW_NUDGE_THRESHOLD
}

/**
 * Unlock rule: lesson N unlocks once lesson N-1 is completed. The first lesson
 * (lowest order) is always open. `lessons` need not be pre-sorted.
 */
export function isUnlocked(
  lesson: Lesson,
  lessons: Lesson[],
  progressByLesson: Record<string, LessonProgress | undefined>,
): boolean {
  const ordered = [...lessons].sort((a, b) => a.order - b.order)
  const index = ordered.findIndex((l) => l.id === lesson.id)
  if (index <= 0) return true
  const prev = ordered[index - 1]
  return progressByLesson[prev.id]?.status === 'completed'
}

/**
 * Recommend the next step after finishing a lesson: the first lesson by order
 * that isn't completed and is unlocked. Returns null when the course is done.
 */
export function recommendNext(
  lessons: Lesson[],
  progressByLesson: Record<string, LessonProgress | undefined>,
): Lesson | null {
  const ordered = [...lessons].sort((a, b) => a.order - b.order)
  for (const lesson of ordered) {
    const status = progressByLesson[lesson.id]?.status
    if (status !== 'completed' && isUnlocked(lesson, lessons, progressByLesson)) {
      return lesson
    }
  }
  return null
}
