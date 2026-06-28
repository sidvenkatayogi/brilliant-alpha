// Acceptance tests for verifyQuiz integration with generateOutline.
// These tests exercise the verification layer as a user would experience it:
// the model returns a quiz, verifyQuiz runs, and the public outline + answer key
// reflect the corrected state.
//
// All cases that exercise verifyQuiz use a real apiKey ('sk-real-key') so
// generateOutline takes the live-AI path (OpenAI → parseOutline → verifyQuiz →
// splitOutline). The stub path (no key) is NOT used for verifier coverage.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LESSON_META_BY_ID } from '../../api/cohort'

const mockOpenAi = (create: () => unknown) => ({
  default: class {
    chat = { completions: { create } }
  },
})

const input = {
  cohortSize: 3,
  completed: [LESSON_META_BY_ID['long-run']],
  inProgress: [],
  meetingMinutes: 45,
}

// Reusable outline skeleton — fill in quiz per case.
function makeOutlineJson(quiz: unknown[]): string {
  return JSON.stringify({
    warmUp: 'w',
    agenda: [{ title: 't', minutes: 10, facilitatorNote: 'n' }],
    discussionQuestions: [{ lessonId: 'long-run', question: 'q?' }],
    quiz,
    peerTeachingActivity: 'p',
    wrapUp: 'done',
  })
}

describe('quizVerification acceptance tests', () => {
  beforeEach(() => {
    delete process.env.FIRESTORE_EMULATOR_HOST
    delete process.env.OUTLINE_STUB
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unmock('openai')
  })

  // -------------------------------------------------------------------------
  // AC1 — PASS: a correct AI item (paraphrase) is preserved unchanged
  //
  // Paraphrase chosen: "In the long run, probability settles into a stable,
  // predictable frequency — chaotic trial by trial but reliable in bulk."
  // Normalized tokens: {long-run, probability, settles, stable, predictable,
  //   frequency, chaotic, trial, reliable, bulk} — 10 content tokens.
  // Overlap with conceptSummary tokens {probability, long-run, relative,
  //   frequency, unpredictable, time, predictable, bulk}:
  //   matches = {long-run, probability, predictable, frequency, bulk} = 5
  //   sim = 5 / min(8, 10) = 0.625  >> CONCEPT_MIN=0.25
  // Nearest distractor sim ~ 0.14 (single overlap / min-size).
  // Margin 0.625 - 0.14 = 0.485  >> TIE_MARGIN=0.15 → deterministic PASS.
  // -------------------------------------------------------------------------
  it('AC1: correct AI item (paraphrase) passes verifyQuiz unchanged on the live path', async () => {
    const paraphrase =
      'In the long run, probability settles into a stable, predictable frequency — chaotic trial by trial but reliable in bulk.'
    const correctItem = {
      lessonId: 'long-run',
      question: 'What is the core insight of "Chance & the Long Run"?',
      options: [
        paraphrase,
        'Probability only applies to fair coins and dice, never to real life.',
        'Once an outcome is "due," it becomes more likely on the next try.',
        'A single sample tells you the true long-run rate exactly.',
      ],
      answerIndex: 0, // pointing at the paraphrase — already correct
      explanation: 'The AI got this right.',
    }

    vi.doMock('openai', () =>
      mockOpenAi(async () => ({ choices: [{ message: { content: makeOutlineJson([correctItem]) } }] })),
    )
    const { generateOutline } = await import('../../api/cohort')
    const res = await generateOutline(input, 'sk-real-key')

    // AC1: AI-supplied answerIndex is preserved (verifier did not change it)
    expect(res.answerKey[0].answerIndex).toBe(0)

    // AC1: question and options are preserved unchanged
    expect(res.outline.quiz[0].question).toBe(correctItem.question)
    expect(res.outline.quiz[0].options).toEqual(correctItem.options)

    // AC5: answerIndex must NOT appear in the public outline
    expect(res.outline.quiz[0]).not.toHaveProperty('answerIndex')

    // AC4: invariants hold
    expect(res.outline.quiz.length).toBe(res.answerKey.length)
    expect(res.answerKey[0].answerIndex).toBeGreaterThanOrEqual(0)
    expect(res.answerKey[0].answerIndex).toBeLessThan(res.outline.quiz[0].options.length)
  })

  // -------------------------------------------------------------------------
  // AC2/AC5 — REPAIR: mis-marked misconception is corrected on the live path
  // -------------------------------------------------------------------------
  it('AC2/AC5: repairs a well-formed item where answerIndex points at a distractor instead of the conceptSummary', async () => {
    const longRun = LESSON_META_BY_ID['long-run']
    const conceptSummary = longRun.conceptSummary

    // conceptSummary is at index 2, but answerIndex=0 (pointing at DISTRACTORS[0])
    const badQuizItem = {
      lessonId: 'long-run',
      question: 'Which statement best captures the core idea of "Chance & the Long Run"?',
      options: [
        'Probability only applies to fair coins and dice, never to real life.',
        'Once an outcome is "due," it becomes more likely on the next try.',
        conceptSummary,
        'A single sample tells you the true long-run rate exactly.',
      ],
      answerIndex: 0, // WRONG — conceptSummary is at index 2
      explanation: 'wrong explanation',
    }

    vi.doMock('openai', () =>
      mockOpenAi(async () => ({ choices: [{ message: { content: makeOutlineJson([badQuizItem]) } }] })),
    )
    const { generateOutline } = await import('../../api/cohort')
    const res = await generateOutline(input, 'sk-real-key')

    // AC2/AC5: answerIndex is repaired to 2 (where conceptSummary actually is)
    // — the answer key now points at the concept option, not the misconception
    expect(res.answerKey[0].answerIndex).toBe(2)

    // AC2: options are preserved unchanged (only answerIndex is fixed)
    expect(res.outline.quiz[0].options).toEqual(badQuizItem.options)

    // AC5: answerIndex must NOT leak into the public outline
    expect(res.outline.quiz[0]).not.toHaveProperty('answerIndex')

    // AC4: invariants hold
    expect(res.outline.quiz.length).toBe(res.answerKey.length)
    expect(res.answerKey[0].answerIndex).toBeGreaterThanOrEqual(0)
    expect(res.answerKey[0].answerIndex).toBeLessThan(res.outline.quiz[0].options.length)
  })

  // -------------------------------------------------------------------------
  // AC6 — PASS on live path: deterministically-correct items are not corrupted
  //
  // Mock returns an item shaped exactly like buildDeterministicItem(long-run, 0):
  //   answerIndex = 0 % 4 = 0
  //   options = [conceptSummary, DISTRACTORS[0], DISTRACTORS[1], DISTRACTORS[2]]
  // The overlap-coefficient sim(conceptSummary, conceptSummary) = 1.0, well above
  // CONCEPT_MIN=0.25 and TIE_MARGIN=0.15 above any distractor → PASS.
  // Assertion: options identical, answerKey[0].answerIndex === 0 (unchanged).
  // -------------------------------------------------------------------------
  it('AC6: correct items (verbatim conceptSummary as answer) pass verifyQuiz unchanged on the live path', async () => {
    const longRun = LESSON_META_BY_ID['long-run']
    const conceptSummary = longRun.conceptSummary

    // Build the item exactly as buildDeterministicItem(long-run, 0) would:
    //   distractors = [DISTRACTORS[0], DISTRACTORS[1], DISTRACTORS[2]]
    //   options.splice(0, 0, conceptSummary) → index 0 is the correct answer
    const deterministicItem = {
      lessonId: 'long-run',
      question: 'Which statement best captures the core idea of "Chance & the Long Run"?',
      options: [
        conceptSummary,
        'Probability only applies to fair coins and dice, never to real life.',
        'Once an outcome is "due," it becomes more likely on the next try.',
        'A single sample tells you the true long-run rate exactly.',
      ],
      answerIndex: 0,
      explanation: `"${longRun.title}": ${conceptSummary} (e.g. ${longRun.realWorldHook})`,
    }

    vi.doMock('openai', () =>
      mockOpenAi(async () => ({ choices: [{ message: { content: makeOutlineJson([deterministicItem]) } }] })),
    )
    const { generateOutline } = await import('../../api/cohort')
    const res = await generateOutline(input, 'sk-real-key')

    // AC6: options are preserved exactly — verifier did not mutate a correct item
    expect(res.outline.quiz[0].options).toEqual(deterministicItem.options)

    // AC6: the answer key still points at the conceptSummary option
    expect(res.answerKey[0].answerIndex).toBe(0)
    expect(res.outline.quiz[0].options[res.answerKey[0].answerIndex]).toBe(conceptSummary)

    // AC5: answerIndex must NOT appear in the public outline
    expect(res.outline.quiz[0]).not.toHaveProperty('answerIndex')

    // AC4: invariants hold
    expect(res.outline.quiz.length).toBe(res.answerKey.length)
    expect(res.answerKey[0].answerIndex).toBeGreaterThanOrEqual(0)
    expect(res.answerKey[0].answerIndex).toBeLessThan(res.outline.quiz[0].options.length)
  })

  // -------------------------------------------------------------------------
  // AC3 — REPLACE: ungrounded lessonId is replaced with a grounded lesson
  // -------------------------------------------------------------------------
  it('AC3: item with bogus lessonId is replaced with the completed lesson', async () => {
    // bogus-lesson-xyz is not in LESSON_META and not in completed → structural gate REPLACE
    const bogusItem = {
      lessonId: 'bogus-lesson-xyz',
      question: 'What is the answer to everything?',
      options: [
        'Forty-two.',
        'Probability only applies to fair coins and dice, never to real life.',
        'Once an outcome is "due," it becomes more likely on the next try.',
        'A single sample tells you the true long-run rate exactly.',
      ],
      answerIndex: 0,
      explanation: 'just because',
    }

    vi.doMock('openai', () =>
      mockOpenAi(async () => ({ choices: [{ message: { content: makeOutlineJson([bogusItem]) } }] })),
    )
    const { generateOutline } = await import('../../api/cohort')
    const res = await generateOutline(input, 'sk-real-key')

    // AC3: replaced with the only completed lesson (long-run; completed[0 % 1])
    expect(res.outline.quiz[0].lessonId).toBe('long-run')

    // AC3: the option at answerIndex equals long-run's conceptSummary
    expect(
      res.outline.quiz[0].options[res.answerKey[0].answerIndex],
    ).toBe(LESSON_META_BY_ID['long-run'].conceptSummary)

    // AC5: answerIndex must NOT leak into the public outline
    expect(res.outline.quiz[0]).not.toHaveProperty('answerIndex')

    // AC4: invariants hold
    expect(res.outline.quiz.length).toBe(res.answerKey.length)
    expect(res.answerKey[0].answerIndex).toBeGreaterThanOrEqual(0)
    expect(res.answerKey[0].answerIndex).toBeLessThan(res.outline.quiz[0].options.length)
  })
})
