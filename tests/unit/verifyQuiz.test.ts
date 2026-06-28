// Unit tests for verifyQuiz, buildDeterministicItem, and related helpers in api/cohort.ts.
// These tests exercise the structural gate, concept-similarity scoring, REPAIR, REPLACE, and PASS paths.

import { describe, it, expect } from 'vitest'
import {
  verifyQuiz,
  buildDeterministicItem,
  generateQuiz,
  CONCEPT_MIN,
  TIE_MARGIN,
  LESSON_META,
  LESSON_META_BY_ID,
} from '../../api/cohort'
import type { FullQuizQuestion, LessonMetaLite } from '../../api/cohort'

// Helper: build a valid-looking item using real lesson data (answerIndex points at conceptSummary)
function makePassItem(lesson: LessonMetaLite, _i: number): FullQuizQuestion {
  // Place the conceptSummary at position 0, with 3 unrelated distractors
  return {
    lessonId: lesson.id,
    question: `Which statement best captures the core idea of "${lesson.title}"?`,
    options: [
      lesson.conceptSummary,
      'Probability only applies to fair coins and dice, never to real life.',
      'Once an outcome is "due," it becomes more likely on the next try.',
      'A single sample tells you the true long-run rate exactly.',
    ],
    answerIndex: 0,
    explanation: `"${lesson.title}": ${lesson.conceptSummary} (e.g. ${lesson.realWorldHook})`,
  }
}

// Helper: build an item where the conceptSummary is at index 2, but answerIndex=0 (mis-marked)
function makeRepairItem(lesson: LessonMetaLite): FullQuizQuestion {
  return {
    lessonId: lesson.id,
    question: `Which statement best captures the core idea of "${lesson.title}"?`,
    options: [
      'Probability only applies to fair coins and dice, never to real life.',
      'Once an outcome is "due," it becomes more likely on the next try.',
      lesson.conceptSummary,
      'A single sample tells you the true long-run rate exactly.',
    ],
    answerIndex: 0, // wrong — conceptSummary is at index 2
    explanation: 'wrong explanation',
  }
}

const LONG_RUN = LESSON_META_BY_ID['long-run']
const COMBINING = LESSON_META_BY_ID['combining-events']
const CONDITIONING = LESSON_META_BY_ID['conditioning']

// ---------------------------------------------------------------------------
// 1. Structural gate → REPLACE: ≠4 options
// ---------------------------------------------------------------------------
describe('verifyQuiz structural gate', () => {
  it('replaces item with 3 options', () => {
    const item: FullQuizQuestion = {
      lessonId: LONG_RUN.id,
      question: 'q?',
      options: ['a', 'b', 'c'],
      answerIndex: 0,
      explanation: 'e',
    }
    const { items, replaced } = verifyQuiz([item], [LONG_RUN])
    expect(replaced).toBe(1)
    expect(items[0].options).toHaveLength(4)
  })

  // ---------------------------------------------------------------------------
  // 2. Structural gate → REPLACE: duplicate options
  // ---------------------------------------------------------------------------
  it('replaces item with duplicate options (after trim)', () => {
    const item: FullQuizQuestion = {
      lessonId: LONG_RUN.id,
      question: 'q?',
      options: ['same', 'same', 'c', 'd'],
      answerIndex: 0,
      explanation: 'e',
    }
    const { items, replaced } = verifyQuiz([item], [LONG_RUN])
    expect(replaced).toBe(1)
    expect(new Set(items[0].options).size).toBe(4)
  })

  // ---------------------------------------------------------------------------
  // 3. Structural gate → REPLACE: bad answerIndex
  // ---------------------------------------------------------------------------
  it('replaces item with answerIndex=-1', () => {
    const item: FullQuizQuestion = {
      lessonId: LONG_RUN.id,
      question: 'q?',
      options: ['a', 'b', 'c', 'd'],
      answerIndex: -1,
      explanation: 'e',
    }
    const { items, replaced } = verifyQuiz([item], [LONG_RUN])
    expect(replaced).toBe(1)
    expect(items[0].answerIndex).toBeGreaterThanOrEqual(0)
    expect(items[0].answerIndex).toBeLessThan(4)
  })

  it('replaces item with answerIndex=4', () => {
    const item: FullQuizQuestion = {
      lessonId: LONG_RUN.id,
      question: 'q?',
      options: ['a', 'b', 'c', 'd'],
      answerIndex: 4,
      explanation: 'e',
    }
    const { items, replaced } = verifyQuiz([item], [LONG_RUN])
    expect(replaced).toBe(1)
    expect(items[0].answerIndex).toBeGreaterThanOrEqual(0)
    expect(items[0].answerIndex).toBeLessThan(4)
  })

  // ---------------------------------------------------------------------------
  // 4. Structural gate → REPLACE: lessonId not in completed
  // ---------------------------------------------------------------------------
  it('replaces item whose lessonId is not in the completed array (even if in LESSON_META)', () => {
    // LONG_RUN is in LESSON_META but not passed to verifyQuiz as completed
    const item: FullQuizQuestion = {
      lessonId: LONG_RUN.id,
      question: 'q?',
      options: ['a', 'b', 'c', 'd'],
      answerIndex: 0,
      explanation: 'e',
    }
    // Only COMBINING is in completed
    const { items, replaced } = verifyQuiz([item], [COMBINING])
    expect(replaced).toBe(1)
    // Should use COMBINING (completed[0 % 1])
    expect(items[0].lessonId).toBe(COMBINING.id)
  })

  // ---------------------------------------------------------------------------
  // 5. Structural gate → REPLACE: lessonId not in LESSON_META_BY_ID
  // ---------------------------------------------------------------------------
  it('replaces item with a made-up lessonId not in LESSON_META or completed', () => {
    const item: FullQuizQuestion = {
      lessonId: 'totally-fake-lesson',
      question: 'q?',
      options: ['a', 'b', 'c', 'd'],
      answerIndex: 0,
      explanation: 'e',
    }
    const { items, replaced } = verifyQuiz([item], [LONG_RUN])
    expect(replaced).toBe(1)
    expect(items[0].lessonId).toBe(LONG_RUN.id)
  })
})

// ---------------------------------------------------------------------------
// 6. Correct answer → PASS
// ---------------------------------------------------------------------------
describe('verifyQuiz PASS path', () => {
  it('passes item where answerIndex already points at the conceptSummary option', () => {
    const item = makePassItem(LONG_RUN, 0)
    const { items, repaired, replaced } = verifyQuiz([item], [LONG_RUN])
    expect(repaired).toBe(0)
    expect(replaced).toBe(0)
    expect(items[0]).toEqual(item)
  })
})

// ---------------------------------------------------------------------------
// 7. Mis-marked → REPAIR
// ---------------------------------------------------------------------------
describe('verifyQuiz REPAIR path', () => {
  it('repairs item where conceptSummary option exists but answerIndex points elsewhere', () => {
    const item = makeRepairItem(LONG_RUN)
    const { items, repaired, replaced } = verifyQuiz([item], [LONG_RUN])
    expect(repaired).toBe(1)
    expect(replaced).toBe(0)
    // conceptSummary is at index 2
    expect(items[0].answerIndex).toBe(2)
    // question and options should be unchanged
    expect(items[0].question).toBe(item.question)
    expect(items[0].options).toEqual(item.options)
    // explanation should be updated to deterministicExplanation
    expect(items[0].explanation).toContain(LONG_RUN.title)
    expect(items[0].explanation).toContain(LONG_RUN.conceptSummary)
  })
})

// ---------------------------------------------------------------------------
// 8. Two-strong options tie → REPLACE
// ---------------------------------------------------------------------------
describe('verifyQuiz REPLACE: tie in concept scores', () => {
  it('replaces item when two options both score high against conceptSummary (margin < TIE_MARGIN)', () => {
    const lesson = LONG_RUN
    // Create two options that both strongly overlap with conceptSummary
    // conceptSummary: 'Probability is long-run relative frequency: unpredictable one at a time, predictable in bulk.'
    // Use the conceptSummary itself and a very close paraphrase
    const tiedItem: FullQuizQuestion = {
      lessonId: lesson.id,
      question: 'q?',
      options: [
        lesson.conceptSummary, // sim = 1.0
        'Probability is long-run relative frequency unpredictable predictable bulk', // sim very high
        'Once an outcome is "due," it becomes more likely on the next try.',
        'Rare events can be ignored because they essentially never happen.',
      ],
      answerIndex: 0,
      explanation: 'e',
    }
    const { items, replaced } = verifyQuiz([tiedItem], [lesson])
    // Both options 0 and 1 score high — margin should be < TIE_MARGIN → REPLACE
    expect(replaced).toBe(1)
    expect(items[0].options).toHaveLength(4)
    expect(new Set(items[0].options).size).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// 9. Below CONCEPT_MIN → REPLACE
// ---------------------------------------------------------------------------
describe('verifyQuiz REPLACE: no option resembles conceptSummary', () => {
  it('replaces item when no option scores >= CONCEPT_MIN against conceptSummary', () => {
    const lesson = LONG_RUN
    // All options are unrelated distractors — none will score >= CONCEPT_MIN
    const badItem: FullQuizQuestion = {
      lessonId: lesson.id,
      question: 'q?',
      options: [
        'Probability only applies to fair coins and dice, never to real life.',
        'Once an outcome is "due," it becomes more likely on the next try.',
        'A single sample tells you the true long-run rate exactly.',
        'Rare events can be ignored because they essentially never happen.',
      ],
      answerIndex: 0,
      explanation: 'e',
    }
    const { items, replaced } = verifyQuiz([badItem], [lesson])
    expect(replaced).toBe(1)
    // Should be replaced with deterministic item for lesson
    expect(items[0].lessonId).toBe(lesson.id)
    expect(items[0].options).toContain(lesson.conceptSummary)
  })
})

// ---------------------------------------------------------------------------
// 10. lessonId∉completed → REPLACE using completed[i%len]
// ---------------------------------------------------------------------------
describe('verifyQuiz REPLACE: structural fail uses completed[i%len]', () => {
  it('uses completed[i % completed.length] as replacement when lessonId not in completed', () => {
    const item: FullQuizQuestion = {
      lessonId: LONG_RUN.id, // in LESSON_META but not in completed
      question: 'q?',
      options: ['a', 'b', 'c', 'd'],
      answerIndex: 0,
      explanation: 'e',
    }
    // completed has two lessons; i=0 → completed[0 % 2] = COMBINING
    const { items, replaced } = verifyQuiz([item], [COMBINING, CONDITIONING])
    expect(replaced).toBe(1)
    expect(items[0].lessonId).toBe(COMBINING.id) // i=0, 0 % 2 = 0 → COMBINING
  })

  it('wraps around: i=1 uses completed[1 % 1] = completed[0]', () => {
    const item0 = makePassItem(COMBINING, 0) // will PASS
    const item1: FullQuizQuestion = {
      lessonId: LONG_RUN.id, // not in completed
      question: 'q?',
      options: ['a', 'b', 'c', 'd'],
      answerIndex: 0,
      explanation: 'e',
    }
    // Only COMBINING in completed; i=1 → completed[1 % 1] = COMBINING
    const { items, replaced } = verifyQuiz([item0, item1], [COMBINING])
    expect(replaced).toBe(1)
    expect(items[1].lessonId).toBe(COMBINING.id)
  })
})

// ---------------------------------------------------------------------------
// 11. Empty completed → canonical item
// ---------------------------------------------------------------------------
describe('verifyQuiz with empty completed', () => {
  it('returns canonical generateQuiz([]) item when completed is empty and item needs replacing', () => {
    const item: FullQuizQuestion = {
      lessonId: LONG_RUN.id, // not in empty completed → structural fail
      question: 'q?',
      options: ['a', 'b', 'c', 'd'],
      answerIndex: 0,
      explanation: 'e',
    }
    const canonical = generateQuiz([])[0]
    const { items, replaced } = verifyQuiz([item], [])
    expect(replaced).toBe(1)
    expect(items[0]).toEqual(canonical)
  })
})

// ---------------------------------------------------------------------------
// 12. Per-item throw → REPLACE
// ---------------------------------------------------------------------------
describe('verifyQuiz: exception inside item processing → REPLACE', () => {
  it('handles null options gracefully (via as any) and replaces the item', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = { lessonId: LONG_RUN.id, question: 'q?', options: null as any, answerIndex: 0, explanation: 'e' } as FullQuizQuestion
    const { items, replaced } = verifyQuiz([item], [LONG_RUN])
    expect(replaced).toBe(1)
    expect(items[0].options).toHaveLength(4)
  })
})

// ---------------------------------------------------------------------------
// 13. buildDeterministicItem
// ---------------------------------------------------------------------------
describe('buildDeterministicItem', () => {
  it('returns a valid 4-option FullQuizQuestion', () => {
    const result = buildDeterministicItem(LONG_RUN, 0)
    expect(result.options).toHaveLength(4)
    expect(result.lessonId).toBe(LONG_RUN.id)
    expect(result.answerIndex).toBeGreaterThanOrEqual(0)
    expect(result.answerIndex).toBeLessThan(4)
    expect(result.options[result.answerIndex]).toBe(LONG_RUN.conceptSummary)
    expect(typeof result.question).toBe('string')
    expect(typeof result.explanation).toBe('string')
  })

  it('is deterministic — same inputs produce same output', () => {
    const a = buildDeterministicItem(LONG_RUN, 0)
    const b = buildDeterministicItem(LONG_RUN, 0)
    expect(a).toEqual(b)
  })

  it('has answerIndex in [0, 4)', () => {
    for (let i = 0; i < 8; i++) {
      const result = buildDeterministicItem(LONG_RUN, i)
      expect(result.answerIndex).toBeGreaterThanOrEqual(0)
      expect(result.answerIndex).toBeLessThan(4)
    }
  })

  it('options.length === 4 for every LESSON_META entry', () => {
    for (const lesson of LESSON_META) {
      for (let i = 0; i < 5; i++) {
        const result = buildDeterministicItem(lesson, i)
        expect(result.options).toHaveLength(4)
      }
    }
  })

  it('places the conceptSummary at the answerIndex position', () => {
    const result = buildDeterministicItem(COMBINING, 1)
    expect(result.options[result.answerIndex]).toBe(COMBINING.conceptSummary)
  })
})

// ---------------------------------------------------------------------------
// 14a. REPLACE: best.conceptScore <= best.misconScore (AC5 safety guard)
// ---------------------------------------------------------------------------
describe('verifyQuiz REPLACE: best option looks like a misconception', () => {
  it('replaces when the highest-conceptScore option also scores >= that on misconScore', () => {
    // Token math (overlap-coefficient, normalize removes stopwords):
    //
    // option0 = "In the long run, probability applies to fair coins but remains unpredictable one at a time"
    //   normalize → {long-run, probability, applies, fair, coins, remains, unpredictable, time}  (8 tokens)
    //
    //   vs conceptSummary tokens {probability, long-run, relative, frequency, unpredictable, time, predictable, bulk}
    //     overlap = {probability, long-run, unpredictable, time} = 4 → conceptScore = 4/min(8,8) = 0.50  ✓ ≥ CONCEPT_MIN
    //
    //   vs DISTRACTOR[0] = "Probability only applies to fair coins and dice, never to real life."
    //     DISTRACTOR tokens {probability, applies, fair, coins, dice, real, life} (7 tokens)
    //     overlap = {probability, applies, fair, coins} = 4 → misconScore = 4/min(8,7) = 4/7 ≈ 0.571
    //
    //   conceptScore (0.50) <= misconScore (0.571) → REPLACE fires
    //
    // options 1-3 score 0 on conceptSummary → runnerUp.conceptScore = 0
    //   margin = 0.50 - 0.00 = 0.50 ≥ TIE_MARGIN (0.15), so tie check does NOT fire first;
    //   the misconScore guard is the operative condition.
    const lesson = LONG_RUN
    const misconceptionLookingOption =
      'In the long run, probability applies to fair coins but remains unpredictable one at a time'
    const item: FullQuizQuestion = {
      lessonId: lesson.id,
      question: 'Which statement best describes probability?',
      options: [
        misconceptionLookingOption,                                 // conceptScore 0.50, misconScore ~0.571
        'A guarantee about what happens on the very next try',      // conceptScore 0
        'Something decided purely by luck with no underlying pattern', // conceptScore 0
        'Values exactly calculated from a single experiment',       // conceptScore 0
      ],
      answerIndex: 0,
      explanation: 'e',
    }
    const { items, repaired, replaced } = verifyQuiz([item], [lesson])
    expect(replaced).toBe(1)
    expect(repaired).toBe(0)
    // Replaced with the deterministic buildDeterministicItem for this lesson at index 0
    expect(items[0]).toEqual(buildDeterministicItem(lesson, 0))
  })
})

// ---------------------------------------------------------------------------
// 14. AC6 regression — verifyQuiz(generateQuiz(LESSON_META), LESSON_META) → no repairs or replaces
// ---------------------------------------------------------------------------
describe('AC6 regression: generateQuiz output passes verifyQuiz unchanged', () => {
  it('repaired===0 && replaced===0 when verifying deterministic quiz', () => {
    const quiz = generateQuiz(LESSON_META)
    const { items, repaired, replaced } = verifyQuiz(quiz, LESSON_META)
    expect(repaired).toBe(0)
    expect(replaced).toBe(0)
    expect(items).toEqual(quiz)
  })

  it('items deep-equal the generateQuiz output', () => {
    const quiz = generateQuiz(LESSON_META)
    const { items } = verifyQuiz(quiz, LESSON_META)
    expect(items).toHaveLength(quiz.length)
    for (let i = 0; i < quiz.length; i++) {
      expect(items[i]).toEqual(quiz[i])
    }
  })

  it('CONCEPT_MIN and TIE_MARGIN are exported with correct values', () => {
    expect(CONCEPT_MIN).toBe(0.25)
    expect(TIE_MARGIN).toBe(0.15)
  })
})
