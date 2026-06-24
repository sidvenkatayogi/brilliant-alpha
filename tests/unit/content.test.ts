import { describe, it, expect } from 'vitest'
import { lessons } from '../../src/content/loadLessons'
import { isQuestionStep } from '../../src/content/types'

// Structural guards on the authored content — these encode the Definition of
// Done so a malformed or under-built lesson fails CI rather than shipping.

describe('course content', () => {
  it('has exactly 5 lessons in ascending order', () => {
    expect(lessons).toHaveLength(5)
    const orders = lessons.map((l) => l.order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
    expect(new Set(lessons.map((l) => l.id)).size).toBe(5)
  })

  it('has well-formed [[term|explanation]] tokens everywhere they appear', () => {
    const TERM = /\[\[([^|\]]+)\|([^\]]+)\]\]/g
    for (const lesson of lessons) {
      const blob = JSON.stringify(lesson)
      const opens = (blob.match(/\[\[/g) ?? []).length
      const matches = [...blob.matchAll(TERM)]
      // Every `[[` must be part of a complete, balanced token (no stray / unclosed).
      expect(matches.length, `${lesson.id} has an unbalanced [[ token`).toBe(opens)
      for (const m of matches) {
        expect(m[1].trim().length, `${lesson.id}: empty term label`).toBeGreaterThan(0)
        expect(m[2].trim().length, `${lesson.id}: empty term explanation`).toBeGreaterThan(0)
      }
    }
  })

  for (const lesson of lessons) {
    describe(`lesson: ${lesson.id}`, () => {
      it('has a real-world hook and a concept summary', () => {
        expect(lesson.realWorldHook.length).toBeGreaterThan(20)
        expect(lesson.conceptSummary.length).toBeGreaterThan(10)
      })

      it('has a predict step (the surprise setup)', () => {
        expect(lesson.steps.some((s) => s.type === 'predict')).toBe(true)
      })

      it('has a manipulable visual (an interactive widget step)', () => {
        expect(lesson.steps.some((s) => s.type === 'interactive')).toBe(true)
      })

      it('has at least one checkpoint question', () => {
        expect(lesson.steps.some(isQuestionStep)).toBe(true)
      })

      it('authors both correct and incorrect feedback on every question', () => {
        for (const step of lesson.steps.filter(isQuestionStep)) {
          expect(step.feedback.correct.length).toBeGreaterThan(0)
          expect(step.feedback.incorrect.length).toBeGreaterThan(0)
        }
      })

      it('gives every MC question a correct option that exists', () => {
        for (const step of lesson.steps.filter(isQuestionStep)) {
          if (step.format === 'multiple_choice' && 'correctOptionId' in step.answer) {
            const ids = step.options?.map((o) => o.id) ?? []
            expect(ids).toContain(step.answer.correctOptionId)
          }
        }
      })

      it('has unique step ids', () => {
        const ids = lesson.steps.map((s) => s.id)
        expect(new Set(ids).size).toBe(ids.length)
      })

      it('maps every question byOption key to a WRONG option (never the correct one)', () => {
        for (const step of lesson.steps.filter(isQuestionStep)) {
          const ids = step.options?.map((o) => o.id) ?? []
          const correct = 'correctOptionId' in step.answer ? step.answer.correctOptionId : null
          for (const key of Object.keys(step.feedback.byOption ?? {})) {
            // A valid option that exists...
            expect(ids).toContain(key)
            // ...and not the correct one (byOption only fires on a wrong answer,
            // so a key on the correct option would be dead, misleading copy).
            expect(key).not.toBe(correct)
          }
        }
      })

      it('maps every predict revealByOption key to a real option', () => {
        for (const step of lesson.steps) {
          if (step.type !== 'predict' || !step.revealByOption) continue
          const ids = step.options?.map((o) => o.id) ?? []
          for (const key of Object.keys(step.revealByOption)) {
            expect(ids).toContain(key)
          }
        }
      })
    })
  }
})
