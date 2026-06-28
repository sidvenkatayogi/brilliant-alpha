import { describe, it, expect } from 'vitest'
import { generateMixedQuiz, scoreQuiz, nextMasteryAfterQuiz } from '../../src/engine/quiz'
import type { QuizLessonMeta, QuizQuestion } from '../../src/engine/quiz'

// ---------------------------------------------------------------------------
// Seeded deterministic RNG (LCG)
// ---------------------------------------------------------------------------

function seededRng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Helper: build a QuizLessonMeta
// ---------------------------------------------------------------------------

function meta(
  id: string,
  title: string,
  conceptSummary: string,
  realWorldHook = 'rwh',
): QuizLessonMeta {
  return { id, title, conceptSummary, realWorldHook }
}

// ---------------------------------------------------------------------------
// DISTRACTORS bank (must stay in sync with src/engine/quiz.ts)
// ---------------------------------------------------------------------------

const DISTRACTORS = [
  'Probability only applies to fair coins and dice, never to real life.',
  'Once an outcome is "due," it becomes more likely on the next try.',
  'A single sample tells you the true long-run rate exactly.',
  'Rare events can be ignored because they essentially never happen.',
  'Knowing extra information can never change a probability.',
]

// ---------------------------------------------------------------------------
// Reusable lesson fixtures
// ---------------------------------------------------------------------------

const L1 = meta('l1', 'Lesson One', 'Long-run frequency defines probability.', 'coin flips')
const L2 = meta('l2', 'Lesson Two', 'Sample size matters for precision.', 'polling')
const L3 = meta('l3', 'Lesson Three', 'Conditional probability updates beliefs.', 'medical tests')
const L4 = meta('l4', 'Lesson Four', 'Independence means one event has no bearing on another.', 'dice')
const L5 = meta('l5', 'Lesson Five', 'Expected value weights outcomes by their probability.', 'insurance')
const L6 = meta('l6', 'Lesson Six', 'Variance measures how spread out outcomes are.', 'investing')

// ---------------------------------------------------------------------------
// generateMixedQuiz
// ---------------------------------------------------------------------------

describe('generateMixedQuiz', () => {
  // AC1 — empty input
  it('returns [] when completed is empty', () => {
    expect(generateMixedQuiz([], 5, seededRng(1))).toEqual([])
  })

  // AC2 — 1 lesson: exactly 1 question, 4 distinct options, correctIndex matches conceptSummary, prompt matches
  it('1 completed lesson → 1 question with 4 distinct options and correct correctIndex', () => {
    const rng = seededRng(42)
    const questions = generateMixedQuiz([L1], 5, rng)

    expect(questions).toHaveLength(1)

    const q = questions[0]
    expect(q.options).toHaveLength(4)
    expect(new Set(q.options).size).toBe(4)
    expect(q.options[q.correctIndex]).toBe(L1.conceptSummary)
    expect(q.prompt).toBe(`Which statement best captures the core idea of "${L1.title}"?`)
  })

  // AC3 — 2 completed lessons → 2 questions
  it('2 completed lessons → 2 questions', () => {
    const questions = generateMixedQuiz([L1, L2], 5, seededRng(7))
    expect(questions).toHaveLength(2)
  })

  // AC4 — 5 completed lessons → 5 questions (min(5,5))
  it('5 completed lessons → 5 questions', () => {
    const questions = generateMixedQuiz([L1, L2, L3, L4, L5], 5, seededRng(13))
    expect(questions).toHaveLength(5)
  })

  // AC5 — 6 completed lessons → capped at 5 (default count)
  it('6 completed lessons → capped at 5 questions', () => {
    const questions = generateMixedQuiz([L1, L2, L3, L4, L5, L6], 5, seededRng(17))
    expect(questions).toHaveLength(5)
  })

  // AC6 — each question has exactly 4 distinct options
  it('every question has exactly 4 distinct options', () => {
    const questions = generateMixedQuiz([L1, L2, L3, L4, L5, L6], 5, seededRng(99))
    for (const q of questions) {
      expect(q.options).toHaveLength(4)
      expect(new Set(q.options).size).toBe(4)
    }
  })

  // AC7 — correctIndex in [0,3] and options[correctIndex] === conceptSummary
  it('correctIndex is in range [0,3] and points to the lesson conceptSummary', () => {
    const lessons = [L1, L2, L3, L4, L5]
    const questions = generateMixedQuiz(lessons, 5, seededRng(55))
    for (const q of questions) {
      const lesson = lessons.find((l) => l.id === q.lessonId)!
      expect(q.correctIndex).toBeGreaterThanOrEqual(0)
      expect(q.correctIndex).toBeLessThanOrEqual(3)
      expect(q.options[q.correctIndex]).toBe(lesson.conceptSummary)
    }
  })

  // AC8 — prompt uses the template exactly
  it('prompt matches the required template for every question', () => {
    const lessons = [L1, L2, L3]
    const questions = generateMixedQuiz(lessons, 3, seededRng(22))
    for (const q of questions) {
      const lesson = lessons.find((l) => l.id === q.lessonId)!
      expect(q.prompt).toBe(
        `Which statement best captures the core idea of "${lesson.title}"?`,
      )
    }
  })

  // EC1 — lesson whose conceptSummary equals one distractor: available = 4 ≥ 3 → NOT skipped
  it('lesson with conceptSummary equal to one DISTRACTOR is not skipped (4 available ≥ 3)', () => {
    // conceptSummary equals one of the five DISTRACTORS, leaving 4 available
    const distractorLesson = meta(
      'dLesson',
      'Distractor Lesson',
      DISTRACTORS[0], // conceptSummary === one distractor
      'example hook',
    )
    const questions = generateMixedQuiz([distractorLesson], 5, seededRng(33))
    // Should produce 1 question — not skipped
    expect(questions).toHaveLength(1)
    const q = questions[0]
    // 4 distinct options
    expect(q.options).toHaveLength(4)
    expect(new Set(q.options).size).toBe(4)
    // The correct answer is the conceptSummary (which equals DISTRACTORS[0])
    expect(q.options[q.correctIndex]).toBe(DISTRACTORS[0])
    // The other 3 options must come from remaining distinct DISTRACTORS (not DISTRACTORS[0])
    const wrongOptions = q.options.filter((_, i) => i !== q.correctIndex)
    for (const opt of wrongOptions) {
      expect(opt).not.toBe(DISTRACTORS[0])
    }
  })

  // AC10 — different seeds produce different orderings (shuffle is driven by rng)
  it('two different seeded rngs over 6 lessons produce different question orderings', () => {
    const lessons = [L1, L2, L3, L4, L5, L6]
    const qA = generateMixedQuiz(lessons, 5, seededRng(1))
    const qB = generateMixedQuiz(lessons, 5, seededRng(9999))

    // At least one of: first lessonId differs OR first options array differs
    const firstLessonsDiffer = qA[0].lessonId !== qB[0].lessonId
    const firstOptionsDiffer = JSON.stringify(qA[0].options) !== JSON.stringify(qB[0].options)
    expect(firstLessonsDiffer || firstOptionsDiffer).toBe(true)
  })

  // explanation format
  it('explanation is formatted as "conceptSummary (e.g. realWorldHook)"', () => {
    const questions = generateMixedQuiz([L1], 5, seededRng(11))
    expect(questions[0].explanation).toBe(
      `${L1.conceptSummary} (e.g. ${L1.realWorldHook})`,
    )
  })
})

// ---------------------------------------------------------------------------
// scoreQuiz
// ---------------------------------------------------------------------------

describe('scoreQuiz', () => {
  // Build a deterministic set of questions for scoring tests
  const lessons = [L1, L2, L3]
  let questions: QuizQuestion[]

  // We generate with a fixed seed so correctIndex is known
  questions = generateMixedQuiz(lessons, 3, seededRng(50))

  // AC11 — all-correct
  it('all-correct: score === total, all perLesson correct', () => {
    const picks = questions.map((q) => q.correctIndex)
    const result = scoreQuiz(questions, picks)
    expect(result.score).toBe(result.total)
    expect(result.total).toBe(questions.length)
    for (const pl of result.perLesson) {
      expect(pl.correct).toBe(true)
    }
  })

  // AC12 — all-wrong
  it('all-wrong: score === 0', () => {
    const picks = questions.map((q) => (q.correctIndex + 1) % 4)
    const result = scoreQuiz(questions, picks)
    expect(result.score).toBe(0)
  })

  // AC13 — partial
  it('partial correct/wrong: score counts only correct picks', () => {
    const picks = questions.map((q, i) => (i === 0 ? q.correctIndex : (q.correctIndex + 1) % 4))
    const result = scoreQuiz(questions, picks)
    expect(result.score).toBe(1)
    expect(result.total).toBe(questions.length)
  })

  // AC14 — null pick → wrong
  it('null pick is counted as wrong', () => {
    const picks: (number | null)[] = questions.map(() => null)
    const result = scoreQuiz(questions, picks)
    expect(result.score).toBe(0)
    for (const pl of result.perLesson) {
      expect(pl.correct).toBe(false)
    }
  })

  // AC15 — perLesson is parallel to questions (same length, matching lessonIds)
  it('perLesson is parallel to questions array', () => {
    const picks = questions.map((q) => q.correctIndex)
    const result = scoreQuiz(questions, picks)
    expect(result.perLesson).toHaveLength(questions.length)
    for (let i = 0; i < questions.length; i++) {
      expect(result.perLesson[i].lessonId).toBe(questions[i].lessonId)
    }
  })

  // out-of-range pick → wrong
  it('out-of-range pick is counted as wrong', () => {
    const picks = questions.map(() => 99) // 99 is out of range for 4 options
    const result = scoreQuiz(questions, picks)
    expect(result.score).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// nextMasteryAfterQuiz
// ---------------------------------------------------------------------------

describe('nextMasteryAfterQuiz', () => {
  // AC16 — correct + 0.5 → 0.55
  it('correct answer from 0.5 yields 0.55', () => {
    expect(nextMasteryAfterQuiz(0.5, true)).toBeCloseTo(0.55, 10)
  })

  // AC17 — wrong + 0.5 → 0.5 (unchanged)
  it('wrong answer from 0.5 yields 0.5 (unchanged)', () => {
    expect(nextMasteryAfterQuiz(0.5, false)).toBe(0.5)
  })

  // AC18 — correct + 1.0 → 1.0 (cap)
  it('correct answer from 1.0 stays at 1.0 (cap)', () => {
    expect(nextMasteryAfterQuiz(1.0, true)).toBe(1.0)
  })

  // AC19 — correct + 0.96 → 1.0 (not 1.01)
  it('correct answer from 0.96 yields 1.0 (not 1.01)', () => {
    expect(nextMasteryAfterQuiz(0.96, true)).toBe(1.0)
  })

  // AC20 — wrong never lowers mastery
  it('wrong answer never lowers mastery', () => {
    expect(nextMasteryAfterQuiz(0.5, false)).toBeGreaterThanOrEqual(0.5)
  })
})
