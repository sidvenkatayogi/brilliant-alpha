// Unit tests for generatePracticeQuiz (api/cohort.ts).
// OpenAI is mocked via vi.doMock so CI never calls the real API.
// Uses the same vi.resetModules / vi.doMock / dynamic-import pattern as
// tests/unit/server-logic.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockOpenAi = (create: () => unknown) => ({
  default: class {
    chat = { completions: { create } }
  },
})

function makeAiResponse(questions: unknown[]) {
  return async () => ({
    choices: [{ message: { content: JSON.stringify({ questions }) } }],
  })
}

function assertItemStructure(item: {
  options: string[]
  correctIndex: number
}) {
  expect(item.options.length).toBe(4)
  expect(item.correctIndex).toBeGreaterThanOrEqual(0)
  expect(item.correctIndex).toBeLessThanOrEqual(3)
}

// ---------------------------------------------------------------------------
// Test 1 & 2: No-key and FIRESTORE_EMULATOR_HOST paths (no OpenAI needed)
// ---------------------------------------------------------------------------

describe('generatePracticeQuiz — deterministic paths', () => {
  beforeEach(() => {
    delete process.env.FIRESTORE_EMULATOR_HOST
    delete process.env.OUTLINE_STUB
  })

  it('TC1: no apiKey → deterministic, no OpenAI call', async () => {
    const { generatePracticeQuiz, LESSON_META } = await import('../../api/cohort')
    const grounded = [LESSON_META[0], LESSON_META[1]] // long-run, combining-events

    const res = await generatePracticeQuiz(grounded, [], undefined)

    expect(res.source).toBe('deterministic')
    expect(res.questions.length).toBe(2)
    for (const q of res.questions) {
      assertItemStructure(q)
    }
    // Each item built by buildDeterministicItem has options[correctIndex] === conceptSummary
    expect(res.questions[0].options[res.questions[0].correctIndex]).toBe(LESSON_META[0].conceptSummary)
    expect(res.questions[1].options[res.questions[1].correctIndex]).toBe(LESSON_META[1].conceptSummary)
  })

  it('TC2: FIRESTORE_EMULATOR_HOST set → deterministic even with apiKey', async () => {
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
    try {
      const { generatePracticeQuiz, LESSON_META } = await import('../../api/cohort')
      const grounded = [LESSON_META[0], LESSON_META[2]]

      const res = await generatePracticeQuiz(grounded, [], 'sk-test')

      expect(res.source).toBe('deterministic')
      expect(res.questions.length).toBe(2)
      for (const q of res.questions) {
        assertItemStructure(q)
      }
    } finally {
      delete process.env.FIRESTORE_EMULATOR_HOST
    }
  })
})

// ---------------------------------------------------------------------------
// Tests 3–10: AI path (OpenAI mocked via vi.doMock + dynamic import)
// ---------------------------------------------------------------------------

describe('generatePracticeQuiz — AI path (mocked OpenAI)', () => {
  beforeEach(() => {
    delete process.env.FIRESTORE_EMULATOR_HOST
    delete process.env.OUTLINE_STUB
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unmock('openai')
  })

  it('I2: OUTLINE_STUB=true → deterministic even with real apiKey; openai create NOT called', async () => {
    process.env.OUTLINE_STUB = 'true'
    // Ensure emulator var is absent so the ONLY stub trigger is OUTLINE_STUB
    delete process.env.FIRESTORE_EMULATOR_HOST
    try {
      const createSpy = vi.fn()
      vi.doMock('openai', () => mockOpenAi(createSpy))
      const { generatePracticeQuiz, LESSON_META } = await import('../../api/cohort')
      const grounded = [LESSON_META[0], LESSON_META[1]]

      const res = await generatePracticeQuiz(grounded, [], 'sk-looks-real')

      expect(res.source).toBe('deterministic')
      expect(res.questions.length).toBe(2)
      for (const q of res.questions) {
        assertItemStructure(q)
      }
      // The openai client must never have been instantiated / create called
      expect(createSpy).not.toHaveBeenCalled()
    } finally {
      delete process.env.OUTLINE_STUB
    }
  })

  it('TC3: valid AI items are trusted and mapped', async () => {
    const aiQuestion = {
      topicId: 'long-run',
      question: 'What is probability?',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      answerIndex: 2,
      explanation: 'Because long run frequency',
    }

    vi.doMock('openai', () => mockOpenAi(makeAiResponse([aiQuestion])))
    const { generatePracticeQuiz, LESSON_META } = await import('../../api/cohort')
    const grounded = [LESSON_META[0]] // long-run

    const res = await generatePracticeQuiz(grounded, [], 'sk-real-key')

    expect(res.source).toBe('ai')
    expect(res.questions.length).toBe(1)
    const q = res.questions[0]
    expect(q.lessonId).toBe('long-run')
    expect(q.correctIndex).toBe(2)
    expect(q.explanation).toBe('Because long run frequency')
    expect(q.options.length).toBe(4)
    assertItemStructure(q)
  })

  it('TC4: malformed item dropped and padded (source=ai if ≥1 survived)', async () => {
    // Item 1: valid
    const validItem = {
      topicId: 'long-run',
      question: 'Describe the long run?',
      options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
      answerIndex: 0,
      explanation: 'Long run frequency',
    }
    // Item 2: invalid — only 3 options
    const invalidItem = {
      topicId: 'combining-events',
      question: 'Combining?',
      options: ['A', 'B', 'C'],
      answerIndex: 0,
      explanation: 'Multiplied',
    }

    vi.doMock('openai', () => mockOpenAi(makeAiResponse([validItem, invalidItem])))
    const { generatePracticeQuiz, LESSON_META } = await import('../../api/cohort')
    const grounded = [LESSON_META[0], LESSON_META[1]] // target = 2

    const res = await generatePracticeQuiz(grounded, [], 'sk-real-key')

    expect(res.source).toBe('ai')
    expect(res.questions.length).toBe(2) // padded to 2
    // At least one question has the valid AI data
    const aiItem = res.questions.find((q) => q.lessonId === 'long-run' && q.prompt === 'Describe the long run?')
    expect(aiItem).toBeDefined()
    for (const q of res.questions) {
      assertItemStructure(q)
    }
  })

  it('TC5: all malformed → full deterministic (source=deterministic)', async () => {
    // Only 3 options — will fail validation
    const badItem = {
      topicId: 'long-run',
      question: 'Bad?',
      options: ['X', 'Y', 'Z'],
      answerIndex: 0,
      explanation: 'Nope',
    }

    vi.doMock('openai', () => mockOpenAi(makeAiResponse([badItem])))
    const { generatePracticeQuiz, LESSON_META } = await import('../../api/cohort')
    const grounded = [LESSON_META[0]] // target = 1

    const res = await generatePracticeQuiz(grounded, [], 'sk-real-key')

    expect(res.source).toBe('deterministic')
    expect(res.questions.length).toBe(1)
    const q = res.questions[0]
    expect(q.options[q.correctIndex]).toBe(LESSON_META[0].conceptSummary)
    assertItemStructure(q)
  })

  it('TC6: parse failure → full deterministic', async () => {
    vi.doMock('openai', () =>
      mockOpenAi(async () => ({
        choices: [{ message: { content: 'not valid json at all' } }],
      })),
    )
    const { generatePracticeQuiz, LESSON_META } = await import('../../api/cohort')
    const grounded = [LESSON_META[0], LESSON_META[1]]

    const res = await generatePracticeQuiz(grounded, [], 'sk-real-key')

    expect(res.source).toBe('deterministic')
    for (const q of res.questions) {
      assertItemStructure(q)
    }
  })

  it('TC7: topicId not in grounded → dropped → full deterministic', async () => {
    // 'expected-value' is in LESSON_META but NOT in grounded
    const item = {
      topicId: 'expected-value',
      question: 'What is EV?',
      options: ['A', 'B', 'C', 'D'],
      answerIndex: 1,
      explanation: 'Sum of outcomes times probabilities',
    }

    vi.doMock('openai', () => mockOpenAi(makeAiResponse([item])))
    const { generatePracticeQuiz, LESSON_META } = await import('../../api/cohort')
    const grounded = [LESSON_META[0]] // only long-run

    const res = await generatePracticeQuiz(grounded, [], 'sk-real-key')

    expect(res.source).toBe('deterministic')
    expect(res.questions.length).toBe(1)
    assertItemStructure(res.questions[0])
  })

  it('TC8: OpenAI throws → full deterministic, no throw', async () => {
    vi.doMock('openai', () =>
      mockOpenAi(async () => {
        throw new Error('network error')
      }),
    )
    const { generatePracticeQuiz, LESSON_META } = await import('../../api/cohort')
    const grounded = [LESSON_META[0], LESSON_META[1], LESSON_META[2]]
    const target = grounded.length

    // Should not throw — the function catches OpenAI errors internally
    const res = await generatePracticeQuiz(grounded, [], 'sk-real-key')

    expect(res.source).toBe('deterministic')
    expect(res.questions.length).toBe(target)
    for (const q of res.questions) {
      assertItemStructure(q)
    }
  })

  it('TC9: topicId in LESSON_META but not in grounded → dropped and padded (source=ai for survivors)', async () => {
    // grounded = [long-run, combining-events], target = 2
    // Item 1: topicId='long-run' (in grounded) — valid
    // Item 2: topicId='expected-value' (NOT in grounded) — invalid
    const item1 = {
      topicId: 'long-run',
      question: 'Long run question?',
      options: ['A', 'B', 'C', 'D'],
      answerIndex: 0,
      explanation: 'Long run explanation',
    }
    const item2 = {
      topicId: 'expected-value',
      question: 'EV question?',
      options: ['A', 'B', 'C', 'D'],
      answerIndex: 1,
      explanation: 'EV explanation',
    }

    vi.doMock('openai', () => mockOpenAi(makeAiResponse([item1, item2])))
    const { generatePracticeQuiz, LESSON_META } = await import('../../api/cohort')
    const grounded = [LESSON_META[0], LESSON_META[1]] // long-run, combining-events

    const res = await generatePracticeQuiz(grounded, [], 'sk-real-key')

    // item2 dropped (not in grounded), padded to 2
    expect(res.questions.length).toBe(2)
    expect(res.source).toBe('ai') // item1 survived
    // Verify the AI item is there
    const aiItem = res.questions.find(
      (q) => q.lessonId === 'long-run' && q.prompt === 'Long run question?',
    )
    expect(aiItem).toBeDefined()
    for (const q of res.questions) {
      assertItemStructure(q)
    }
  })

  it('TC10: grounded.length===3 → at most 3 questions returned', async () => {
    // 5 AI items cycling through 3 grounded ids
    const groundedIds = ['long-run', 'combining-events', 'conditioning']
    const aiQuestions = Array.from({ length: 5 }, (_, i) => ({
      topicId: groundedIds[i % 3],
      question: `Question ${i}?`,
      options: ['A', 'B', 'C', 'D'],
      answerIndex: i % 4,
      explanation: `Explanation ${i}`,
    }))

    vi.doMock('openai', () => mockOpenAi(makeAiResponse(aiQuestions)))
    const { generatePracticeQuiz, LESSON_META } = await import('../../api/cohort')
    const grounded = [LESSON_META[0], LESSON_META[1], LESSON_META[2]] // target = min(5,3) = 3

    const res = await generatePracticeQuiz(grounded, [], 'sk-real-key')

    expect(res.questions.length).toBe(3) // capped at min(5, 3) = 3
    expect(res.source).toBe('ai')
    for (const q of res.questions) {
      assertItemStructure(q)
    }
  })
})
