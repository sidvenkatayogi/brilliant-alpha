/**
 * Black-box acceptance tests for generateEmailQuiz + verifyEmailQuiz integration.
 *
 * Drives generateEmailQuiz(input, 'sk-real-key') with the openai module mocked
 * so the verifier's PASS / REPAIR / REPLACE outcomes are exercised end-to-end,
 * exactly as a consumer of the public API would experience them.
 *
 * Mock pattern mirrors email-quiz.test.ts (generateEmailQuiz suite).
 * FIRESTORE_EMULATOR_HOST is cleared in beforeEach to force the AI code path.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  AUTH_LESSON_META,
  CANONICAL_INTRO_ITEM,
  type EmailQuizInput,
} from '../../api/email-quiz'

// ---------------------------------------------------------------------------
// Constants mirrored from production (not exported, so defined inline here)
// ---------------------------------------------------------------------------

const DISTRACTORS = [
  'Probability only applies to fair coins and dice, never to real life.',
  'Once an outcome is "due," it becomes more likely on the next try.',
  'A single sample tells you the true long-run rate exactly.',
  'Rare events can be ignored because they essentially never happen.',
  'Knowing extra information can never change a probability.',
]

const LONG_RUN = AUTH_LESSON_META[0] // id: 'long-run', conceptSummary starts with 'Probability is long-run...'

// ---------------------------------------------------------------------------
// Mock helper — mirrors the pattern from email-quiz.test.ts exactly
// ---------------------------------------------------------------------------

const mockOpenAi = (create: () => unknown) => ({
  default: class {
    chat = { completions: { create } }
  },
})

// ---------------------------------------------------------------------------
// Input builder
// ---------------------------------------------------------------------------

function makeLongRunInput(): EmailQuizInput {
  return {
    uid: 'u-test',
    weakTopics: [
      { id: LONG_RUN.id, title: LONG_RUN.title, conceptSummary: LONG_RUN.conceptSummary },
    ],
    completedTopics: [],
    hasAnyProgress: true,
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('emailQuizVerification acceptance tests (generateEmailQuiz + verifyEmailQuiz)', () => {
  beforeEach(() => {
    // IMPORTANT: must be clear so generateEmailQuiz takes the OpenAI code path
    delete process.env.FIRESTORE_EMULATOR_HOST
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // Case 1 — REPAIR: mis-indexed concept-recall question
  //
  // The AI returns a question where options[2] is the exact conceptSummary but
  // answerIndex=0 (points at a distractor). verifyEmailQuiz must detect that
  // index 2 has the highest conceptScore and repair answerIndex to 2.
  //
  // sim scoring analysis:
  //   options[0] = DISTRACTORS[3] ('Rare events can be ignored…')
  //   options[1] = DISTRACTORS[1] ('Once an outcome is "due,"…')
  //   options[2] = conceptSummary  → sim(conceptSummary, conceptSummary) = 1.0
  //   options[3] = unrelated string → sim ≈ 0
  //   best = options[2], score=1.0, runnerUp ~ 0.14 → margin >> 0.15 → REPAIR
  // -------------------------------------------------------------------------
  it('Case 1 — REPAIR: mis-indexed concept-recall → answerIndex corrected to where conceptSummary lives', async () => {
    const repairOptions: [string, string, string, string] = [
      DISTRACTORS[3], // idx 0 — 'Rare events can be ignored…'
      DISTRACTORS[1], // idx 1 — 'Once an outcome is "due,"…'
      LONG_RUN.conceptSummary, // idx 2 — THE correct answer
      'Something completely unrelated here about elephants',  // idx 3
    ]

    const aiJson = JSON.stringify({
      questions: [
        {
          question: 'Which statement best captures the core idea of "Chance & the Long Run"?',
          options: repairOptions,
          answerIndex: 0, // WRONG — conceptSummary is at index 2
          explanation: 'some wrong explanation',
          topicId: 'long-run',
        },
      ],
      quizTopic: 'Chance & the Long Run',
    })

    vi.doMock('openai', () =>
      mockOpenAi(async () => ({ choices: [{ message: { content: aiJson } }] })),
    )

    const { generateEmailQuiz } = await import('../../api/email-quiz')
    const result = await generateEmailQuiz(makeLongRunInput(), 'sk-real-key')

    // model must be from AI path (not deterministic)
    expect(result.model).toBe('gpt-4o-mini')

    // answerIndex must be repaired to 2 (where conceptSummary actually is)
    expect(result.questions[0].answerIndex).toBe(2)

    // The option at answerIndex must be the conceptSummary
    expect(result.questions[0].options[result.questions[0].answerIndex]).toBe(LONG_RUN.conceptSummary)

    // question text preserved (verifier only changes answerIndex and explanation)
    expect(result.questions[0].question).toBe(
      'Which statement best captures the core idea of "Chance & the Long Run"?',
    )

    // options array preserved unchanged
    expect(result.questions[0].options).toEqual(repairOptions)
  })

  // -------------------------------------------------------------------------
  // Case 2 — REPLACE: free-form arithmetic question (ungrounded options)
  //
  // The AI returns options like ['0.6', '0.4', '0.5', '0.3'] that bear no
  // resemblance to conceptSummary. Their conceptScore will be 0 (no token
  // overlap), which is below CONCEPT_MIN=0.25 → REPLACE with deterministic item.
  //
  // After REPLACE, the returned question must be the deterministic concept-recall
  // item for 'long-run' at index i=0, so answerIndex = 0%4 = 0 and
  // options[0] = conceptSummary.
  // -------------------------------------------------------------------------
  it('Case 2 — REPLACE: arithmetic options (no concept match) → replaced with deterministic item', async () => {
    const aiJson = JSON.stringify({
      questions: [
        {
          question: 'What fraction of trials show heads?',
          options: ['0.6', '0.4', '0.5', '0.3'],
          answerIndex: 2,
          explanation: 'coin flip is 0.5',
          topicId: 'long-run',
        },
      ],
      quizTopic: 'Chance & the Long Run',
    })

    vi.doMock('openai', () =>
      mockOpenAi(async () => ({ choices: [{ message: { content: aiJson } }] })),
    )

    const { generateEmailQuiz } = await import('../../api/email-quiz')
    const result = await generateEmailQuiz(makeLongRunInput(), 'sk-real-key')

    // model still gpt-4o-mini (the function succeeded with AI, just replaced per-question)
    expect(result.model).toBe('gpt-4o-mini')

    // replaced item must have conceptSummary at the answerIndex position
    expect(result.questions[0].options[result.questions[0].answerIndex]).toBe(LONG_RUN.conceptSummary)

    // question text matches the deterministic concept-recall template
    expect(result.questions[0].question).toBe(
      'Which statement best captures the core idea of "Chance & the Long Run"?',
    )
  })

  // -------------------------------------------------------------------------
  // Case 3 — PASS: verbatim correct concept-recall item passes unchanged
  //
  // options[0] = exact conceptSummary → sim = 1.0
  // options[1..3] = completely unrelated strings → sim ≈ 0
  // margin = 1.0 - 0 = 1.0 >> TIE_MARGIN=0.15 → PASS
  // misconScore for conceptSummary ~ 0 (no token overlap with any distractor)
  // best.conceptScore (1.0) > best.misconScore (≈0) → PASS
  // -------------------------------------------------------------------------
  it('Case 3 — PASS: verbatim correct concept-recall item is returned unchanged', async () => {
    const passOptions: [string, string, string, string] = [
      LONG_RUN.conceptSummary, // idx 0 — THE correct answer
      'Elephants are large mammals living in Africa and Asia.',
      'Water is a chemical compound with the formula H2O.',
      'The sun rises in the east and sets in the west.',
    ]

    const aiJson = JSON.stringify({
      questions: [
        {
          question: 'What is the core idea behind "Chance & the Long Run"?',
          options: passOptions,
          answerIndex: 0, // correctly pointing at conceptSummary
          explanation: 'Probability stabilises over many trials.',
          topicId: 'long-run',
        },
      ],
      quizTopic: 'Chance & the Long Run',
    })

    vi.doMock('openai', () =>
      mockOpenAi(async () => ({ choices: [{ message: { content: aiJson } }] })),
    )

    const { generateEmailQuiz } = await import('../../api/email-quiz')
    const result = await generateEmailQuiz(makeLongRunInput(), 'sk-real-key')

    // PASS path — model from AI
    expect(result.model).toBe('gpt-4o-mini')

    // answerIndex preserved at 0
    expect(result.questions[0].answerIndex).toBe(0)

    // options[0] is still the conceptSummary
    expect(result.questions[0].options[0]).toBe(LONG_RUN.conceptSummary)

    // The option at answerIndex equals conceptSummary
    expect(result.questions[0].options[result.questions[0].answerIndex]).toBe(LONG_RUN.conceptSummary)
  })

  // -------------------------------------------------------------------------
  // Case 4 — AC4 correctness invariant: multi-question result
  //
  // 3 questions are returned by the mock:
  //   q0: well-formed PASS (answerIndex=0 = conceptSummary, 3 unrelated others)
  //   q1: arithmetic/free-form → REPLACE
  //   q2: mis-indexed concept-recall (conceptSummary at idx 2 but answerIndex=0) → REPAIR
  //
  // After verification:
  //   - length is preserved (still 3)
  //   - every question's options[answerIndex] is NOT any DISTRACTORS string
  //   - for replaced/repaired items: options[answerIndex] === LONG_RUN.conceptSummary
  //   - model is 'gpt-4o-mini'
  // -------------------------------------------------------------------------
  it('Case 4 — multi-question: PASS + REPLACE + REPAIR all satisfy correctness invariant', async () => {
    const aiJson = JSON.stringify({
      questions: [
        // q0: PASS — conceptSummary at idx 0 (correct), 3 unrelated others
        {
          question: 'What is the core idea of "Chance & the Long Run"?',
          options: [
            LONG_RUN.conceptSummary,  // idx 0 — correct
            'The moon is made of cheese and green grass.',
            'Cats are domesticated felines kept as pets.',
            'Jazz music originated in New Orleans in the early 1900s.',
          ],
          answerIndex: 0,
          explanation: 'Probability is long-run relative frequency.',
          topicId: 'long-run',
        },
        // q1: REPLACE — arithmetic options, no concept match
        {
          question: 'What is 0.1 plus 0.2?',
          options: ['0.1', '0.2', '0.3', '0.4'],
          answerIndex: 2,
          explanation: 'basic arithmetic',
          topicId: 'long-run',
        },
        // q2: REPAIR — conceptSummary at idx 2 but answerIndex=0 (wrong)
        {
          question: 'Which statement best captures the core idea of "Chance & the Long Run"?',
          options: [
            DISTRACTORS[3], // idx 0 — 'Rare events can be ignored…'
            DISTRACTORS[1], // idx 1 — 'Once an outcome is "due,"…'
            LONG_RUN.conceptSummary, // idx 2 — THE correct answer
            'Something completely unrelated about ancient history and politics',  // idx 3
          ],
          answerIndex: 0, // WRONG
          explanation: 'some wrong explanation',
          topicId: 'long-run',
        },
      ],
      quizTopic: 'Chance & the Long Run',
    })

    vi.doMock('openai', () =>
      mockOpenAi(async () => ({ choices: [{ message: { content: aiJson } }] })),
    )

    const { generateEmailQuiz } = await import('../../api/email-quiz')
    const result = await generateEmailQuiz(makeLongRunInput(), 'sk-real-key')

    // Count is preserved
    expect(result.questions.length).toBe(3)

    // model from AI path
    expect(result.model).toBe('gpt-4o-mini')

    const distractorsSet = new Set(DISTRACTORS)

    // Every question: options[answerIndex] must NOT be a distractor
    for (const q of result.questions) {
      const chosen = q.options[q.answerIndex]
      expect(distractorsSet.has(chosen)).toBe(false)
    }

    // q0: PASS — should be unchanged (answerIndex still 0, conceptSummary at 0)
    expect(result.questions[0].answerIndex).toBe(0)
    expect(result.questions[0].options[result.questions[0].answerIndex]).toBe(LONG_RUN.conceptSummary)

    // q1: REPLACE — deterministic item, conceptSummary at answerIndex
    expect(result.questions[1].options[result.questions[1].answerIndex]).toBe(LONG_RUN.conceptSummary)

    // q2: REPAIR — answerIndex corrected to 2 (where conceptSummary is), or REPLACE
    // Either way, options[answerIndex] === conceptSummary
    expect(result.questions[2].options[result.questions[2].answerIndex]).toBe(LONG_RUN.conceptSummary)
  })

  // -------------------------------------------------------------------------
  // Case 5 — AI exception with a GROUNDED learner → deterministic concept-recall
  //
  // The learner has a grounded topic (long-run), so grounded is non-empty.
  // The OpenAI mock throws → generateEmailQuiz catches → buildDeterministicEmailResult(grounded).
  // This is observably distinct from:
  //   - a successful AI path (which would return the AI's question, model:'gpt-4o-mini')
  //   - the empty-topics intro path (which returns CANONICAL_INTRO_ITEM)
  // Here we expect the deterministic concept-recall item for 'long-run'.
  // -------------------------------------------------------------------------
  it('Case 5 — grounded learner with AI failure → deterministic concept-recall for that topic (not intro item)', async () => {
    vi.doMock('openai', () =>
      mockOpenAi(async () => {
        throw new Error('down')
      }),
    )

    const { generateEmailQuiz } = await import('../../api/email-quiz')
    const result = await generateEmailQuiz(
      {
        uid: 'grounded-user',
        weakTopics: [{ id: LONG_RUN.id, title: LONG_RUN.title, conceptSummary: LONG_RUN.conceptSummary }],
        completedTopics: [],
        hasAnyProgress: true,
      },
      'sk-real-key',
    )

    // AI-exception fallback fires → deterministic (not AI model)
    expect(result.model).toBe('deterministic')

    // Must NOT be the generic intro item — the learner has a grounded topic
    expect(result.questions[0]).not.toEqual(CANONICAL_INTRO_ITEM)

    // The deterministic item for long-run at i=0: answerIndex=0%4=0, options[0]=conceptSummary
    expect(result.questions[0].options[result.questions[0].answerIndex]).toBe(LONG_RUN.conceptSummary)

    // Question follows the deterministic template for the lesson title
    expect(result.questions[0].question).toContain('Chance & the Long Run')
    expect(result.questions[0].question).toMatch(/Which statement best captures the core idea of/)

    // topicId is the grounded lesson
    expect(result.questions[0].topicId).toBe(LONG_RUN.id)
  })
})
