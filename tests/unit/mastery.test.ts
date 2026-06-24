import { describe, it, expect } from 'vitest'
import {
  computeMastery,
  isMastered,
  isUnlocked,
  needsReview,
  recommendNext,
} from '../../src/engine/mastery'
import type { Lesson } from '../../src/content/types'
import { emptyProgress, type LessonProgress } from '../../src/progress/types'

function lesson(id: string, order: number, questionIds: string[]): Lesson {
  return {
    id,
    order,
    title: id,
    subtitle: '',
    realWorldHook: '',
    conceptSummary: '',
    estimatedMinutes: 5,
    steps: [
      { id: 'c1', type: 'concept', body: 'x' },
      ...questionIds.map((qid) => ({
        id: qid,
        type: 'question' as const,
        prompt: '',
        format: 'multiple_choice' as const,
        options: [{ id: 'a', label: 'a' }],
        answer: { correctOptionId: 'a' },
        feedback: { correct: 'y', incorrect: 'n' },
      })),
    ],
  }
}

function progressWith(
  lessonId: string,
  results: Record<string, { correct: boolean; attempts: number }>,
): LessonProgress {
  return {
    ...emptyProgress(lessonId),
    stepResults: Object.fromEntries(
      Object.entries(results).map(([k, v]) => [k, { ...v, answeredAt: 0 }]),
    ),
  }
}

describe('computeMastery', () => {
  const l = lesson('a', 1, ['q1', 'q2', 'q3', 'q4'])

  it('counts only first-try-correct question steps', () => {
    const p = progressWith('a', {
      q1: { correct: true, attempts: 1 }, // counts
      q2: { correct: true, attempts: 2 }, // got it eventually — does NOT count
      q3: { correct: false, attempts: 3 }, // wrong
      q4: { correct: true, attempts: 1 }, // counts
    })
    expect(computeMastery(l, p)).toBe(0.5)
  })

  it('is 1 for a lesson with no question steps', () => {
    expect(computeMastery(lesson('a', 1, []), emptyProgress('a'))).toBe(1)
  })

  it('drives the mastered threshold at 0.8', () => {
    expect(isMastered(0.8)).toBe(true)
    expect(isMastered(0.79)).toBe(false)
  })
})

describe('needsReview', () => {
  it('flags a completed lesson under 0.6', () => {
    const p = { ...emptyProgress('a'), status: 'completed' as const, masteryScore: 0.5 }
    expect(needsReview(p)).toBe(true)
  })
  it('does not flag an in-progress lesson', () => {
    const p = { ...emptyProgress('a'), status: 'in_progress' as const, masteryScore: 0.1 }
    expect(needsReview(p)).toBe(false)
  })
})

describe('isUnlocked / recommendNext', () => {
  const lessons = [lesson('l1', 1, ['q']), lesson('l2', 2, ['q']), lesson('l3', 3, ['q'])]

  it('always unlocks the first lesson', () => {
    expect(isUnlocked(lessons[0], lessons, {})).toBe(true)
  })

  it('locks a later lesson until its predecessor is completed', () => {
    expect(isUnlocked(lessons[1], lessons, {})).toBe(false)
    const done = { l1: { ...emptyProgress('l1'), status: 'completed' as const } }
    expect(isUnlocked(lessons[1], lessons, done)).toBe(true)
  })

  it('recommends the first incomplete unlocked lesson', () => {
    const done = { l1: { ...emptyProgress('l1'), status: 'completed' as const } }
    expect(recommendNext(lessons, done)?.id).toBe('l2')
  })

  it('returns null when every lesson is complete', () => {
    const all = Object.fromEntries(
      lessons.map((l) => [l.id, { ...emptyProgress(l.id), status: 'completed' as const }]),
    )
    expect(recommendNext(lessons, all)).toBeNull()
  })
})
