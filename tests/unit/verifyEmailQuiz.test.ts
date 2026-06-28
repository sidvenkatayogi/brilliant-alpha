/**
 * White-box unit tests for verifyEmailQuiz, buildDeterministicEmailItem,
 * buildDeterministicEmailResult, and the generateEmailQuiz fallback paths.
 *
 * Uses REAL AUTH_LESSON_META conceptSummary strings and REAL DISTRACTORS so
 * similarity scoring (sim / CONCEPT_MIN / TIE_MARGIN) is exercised against
 * actual data, not synthetic strings.
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  verifyEmailQuiz,
  buildDeterministicEmailItem,
  buildDeterministicEmailResult,
  generateEmailQuiz,
  AUTH_LESSON_META,
  AUTH_LESSON_META_BY_ID,
  CANONICAL_INTRO_ITEM,
  CONCEPT_MIN,
  TIE_MARGIN,
  deterministicEmailExplanation,
  type AuthoritativeLesson,
  type EmailQuizQuestion,
  type EmailQuizInput,
} from '../../api/email-quiz'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LONG_RUN = AUTH_LESSON_META[0]       // id: 'long-run'
const COMBINING = AUTH_LESSON_META[1]      // id: 'combining-events'
const CONDITIONING = AUTH_LESSON_META[2]   // id: 'conditioning'
const BAYES = AUTH_LESSON_META[3]          // id: 'bayes-base-rates'
const EV = AUTH_LESSON_META[4]             // id: 'expected-value'

/** Build a well-formed EmailQuizQuestion with the lesson's own conceptSummary as the correct answer. */
function makeWellFormed(
  lesson: AuthoritativeLesson,
  i: number,
  overrides: Partial<EmailQuizQuestion> = {},
): EmailQuizQuestion {
  const base = buildDeterministicEmailItem(lesson, i)
  return { ...base, ...overrides }
}

/** A grounded array containing the given lessons (mirrors resolveGrounded output). */
function grounded(...lessons: AuthoritativeLesson[]): AuthoritativeLesson[] {
  return lessons
}

// ---------------------------------------------------------------------------
// buildDeterministicEmailItem
// ---------------------------------------------------------------------------

describe('buildDeterministicEmailItem', () => {
  it('places conceptSummary at answerIndex = i % 4', () => {
    for (let i = 0; i < 8; i++) {
      const lesson = AUTH_LESSON_META[i % 5]
      const item = buildDeterministicEmailItem(lesson, i)
      expect(item.options[item.answerIndex]).toBe(lesson.conceptSummary)
      expect(item.answerIndex).toBe(i % 4)
      expect(item.options).toHaveLength(4)
      expect(item.topicId).toBe(lesson.id)
      expect(item.question).toContain(lesson.title)
    }
  })

  it('options are a 4-tuple (exactly 4 elements)', () => {
    const item = buildDeterministicEmailItem(LONG_RUN, 0)
    expect(Array.isArray(item.options)).toBe(true)
    expect(item.options).toHaveLength(4)
  })

  it('explanation matches deterministicEmailExplanation', () => {
    const item = buildDeterministicEmailItem(BAYES, 2)
    expect(item.explanation).toBe(deterministicEmailExplanation(BAYES))
    expect(item.explanation).toContain(BAYES.title)
    expect(item.explanation).toContain(BAYES.conceptSummary)
    expect(item.explanation).toContain(BAYES.realWorldHook)
  })
})

// ---------------------------------------------------------------------------
// buildDeterministicEmailResult
// ---------------------------------------------------------------------------

describe('buildDeterministicEmailResult', () => {
  it('grounded=[] → intro item + "Probability Fundamentals"', () => {
    const result = buildDeterministicEmailResult([])
    expect(result.model).toBe('deterministic')
    expect(result.quizTopic).toBe('Probability Fundamentals')
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0]).toEqual(CANONICAL_INTRO_ITEM)
  })

  it('grounded 2 lessons → 2 items, titles joined with " & "', () => {
    const result = buildDeterministicEmailResult(grounded(LONG_RUN, COMBINING))
    expect(result.model).toBe('deterministic')
    expect(result.questions).toHaveLength(2)
    expect(result.quizTopic).toBe(`${LONG_RUN.title} & ${COMBINING.title}`)
    // correctness invariant
    result.questions.forEach((q, i) => {
      const lesson = [LONG_RUN, COMBINING][i]
      expect(q.options[q.answerIndex]).toBe(lesson.conceptSummary)
    })
  })

  it('grounded 4 lessons → capped at 3 items', () => {
    const result = buildDeterministicEmailResult(grounded(LONG_RUN, COMBINING, CONDITIONING, BAYES))
    expect(result.questions).toHaveLength(3)
    expect(result.quizTopic).toBe(
      `${LONG_RUN.title} & ${COMBINING.title} & ${CONDITIONING.title}`,
    )
  })
})

// ---------------------------------------------------------------------------
// verifyEmailQuiz — PASS
// ---------------------------------------------------------------------------

describe('verifyEmailQuiz — PASS', () => {
  it('well-formed concept-recall item with correct answerIndex → unchanged, repaired=0 replaced=0', () => {
    const q = makeWellFormed(LONG_RUN, 0)
    const { items, repaired, replaced } = verifyEmailQuiz([q], grounded(LONG_RUN))
    expect(items).toHaveLength(1)
    expect(repaired).toBe(0)
    expect(replaced).toBe(0)
    expect(items[0]).toEqual(q)
    // correctness invariant: marked option is the best concept-matching one
    expect(items[0].options[items[0].answerIndex]).toBe(LONG_RUN.conceptSummary)
  })

  it('multi-question PASS preserves length and order', () => {
    const q0 = makeWellFormed(LONG_RUN, 0)
    const q1 = makeWellFormed(COMBINING, 1)
    const { items, repaired, replaced } = verifyEmailQuiz(
      [q0, q1],
      grounded(LONG_RUN, COMBINING),
    )
    expect(items).toHaveLength(2)
    expect(repaired).toBe(0)
    expect(replaced).toBe(0)
    expect(items[0]).toEqual(q0)
    expect(items[1]).toEqual(q1)
  })
})

// ---------------------------------------------------------------------------
// verifyEmailQuiz — REPAIR
// ---------------------------------------------------------------------------

describe('verifyEmailQuiz — REPAIR', () => {
  it('mis-indexed item → index+explanation fixed, question/options preserved, repaired=1', () => {
    // Build a correct item then swap answerIndex to something wrong
    const correct = makeWellFormed(LONG_RUN, 0)
    // answerIndex should be 0 (i%4=0); place a wrong index
    const wrongIndex = correct.answerIndex === 0 ? 1 : 0
    const q = { ...correct, answerIndex: wrongIndex, explanation: 'wrong explanation' }

    const { items, repaired, replaced } = verifyEmailQuiz([q], grounded(LONG_RUN))
    expect(items).toHaveLength(1)
    expect(repaired).toBe(1)
    expect(replaced).toBe(0)

    // question and options must be unchanged
    expect(items[0].question).toBe(q.question)
    expect(items[0].options).toEqual(q.options)
    // answerIndex must now point to the best concept option
    expect(items[0].options[items[0].answerIndex]).toBe(LONG_RUN.conceptSummary)
    // explanation must be the deterministic one
    expect(items[0].explanation).toBe(deterministicEmailExplanation(LONG_RUN))
  })
})

// ---------------------------------------------------------------------------
// verifyEmailQuiz — REPLACE: structural failures
// ---------------------------------------------------------------------------

describe('verifyEmailQuiz — REPLACE: 3 options', () => {
  it('options.length===3 → replaced=1, correct by construction', () => {
    const q = {
      question: 'test?',
      options: ['a', 'b', 'c'] as unknown as [string, string, string, string],
      answerIndex: 0,
      explanation: 'e',
      topicId: LONG_RUN.id,
    }
    const { items, replaced } = verifyEmailQuiz([q], grounded(LONG_RUN))
    expect(items).toHaveLength(1)
    expect(replaced).toBe(1)
    expect(items[0].options[items[0].answerIndex]).toBe(LONG_RUN.conceptSummary)
    expect(AUTH_LESSON_META_BY_ID[items[0].topicId]).toBeTruthy()
  })
})

describe('verifyEmailQuiz — REPLACE: duplicate options', () => {
  it('duplicate options → replaced=1', () => {
    const base = makeWellFormed(LONG_RUN, 0)
    const q = {
      ...base,
      options: [base.options[0], base.options[0], base.options[2], base.options[3]] as [string, string, string, string],
    }
    const { items, replaced } = verifyEmailQuiz([q], grounded(LONG_RUN))
    expect(items).toHaveLength(1)
    expect(replaced).toBe(1)
    expect(items[0].options[items[0].answerIndex]).toBe(LONG_RUN.conceptSummary)
  })
})

describe('verifyEmailQuiz — REPLACE: empty explanation', () => {
  it('structurally-valid item with explanation:"" → replaced=1, emitted item is deterministic', () => {
    // All structural conditions pass EXCEPT !explanation ('' is falsy → structural gate fires)
    const base = makeWellFormed(LONG_RUN, 0)
    const q = { ...base, explanation: '' }
    const { items, replaced } = verifyEmailQuiz([q], grounded(LONG_RUN))
    expect(items).toHaveLength(1)
    expect(replaced).toBe(1)
    // Deterministic concept-recall item: options[answerIndex] === conceptSummary
    expect(items[0].options[items[0].answerIndex]).toBe(LONG_RUN.conceptSummary)
    expect(items[0].explanation).not.toBe('')
    expect(items[0].topicId).toBe(LONG_RUN.id)
  })
})

describe('verifyEmailQuiz — REPLACE: topicId not in AUTH_LESSON_META', () => {
  it('unknown topicId → replaced=1, grounded[i%len] used', () => {
    const base = makeWellFormed(LONG_RUN, 0)
    const q = { ...base, topicId: 'unknown-topic-xyz' }
    const { items, replaced } = verifyEmailQuiz([q], grounded(LONG_RUN, COMBINING))
    expect(items).toHaveLength(1)
    expect(replaced).toBe(1)
    // i=0, grounded[0%2]=LONG_RUN → conceptSummary must be in options at answerIndex
    expect(items[0].options[items[0].answerIndex]).toBe(LONG_RUN.conceptSummary)
    expect(AUTH_LESSON_META_BY_ID[items[0].topicId]).toBeTruthy()
  })
})

describe('verifyEmailQuiz — REPLACE: topicId valid-but-not-grounded', () => {
  it('topicId in meta but absent from grounded → replaced=1, grounded[i%len] used', () => {
    // BAYES is in meta but NOT in grounded
    const base = makeWellFormed(BAYES, 0)
    const { items, replaced } = verifyEmailQuiz([base], grounded(LONG_RUN))
    expect(items).toHaveLength(1)
    expect(replaced).toBe(1)
    // i=0, grounded[0%1]=LONG_RUN
    expect(items[0].options[items[0].answerIndex]).toBe(LONG_RUN.conceptSummary)
  })
})

describe('verifyEmailQuiz — REPLACE: low concept score (free-form question)', () => {
  it('free-form question with no good concept match → replaced=1', () => {
    // Use LONG_RUN as topic but options that bear no resemblance to conceptSummary
    const q: EmailQuizQuestion = {
      question: 'What is the color of the sky?',
      options: ['blue', 'green', 'red', 'yellow'],
      answerIndex: 0,
      explanation: 'sky is blue',
      topicId: LONG_RUN.id,
    }
    const { items, replaced } = verifyEmailQuiz([q], grounded(LONG_RUN))
    expect(items).toHaveLength(1)
    expect(replaced).toBe(1)
    // REPLACE → concept-fail, topic valid+grounded → use LONG_RUN lesson
    expect(items[0].options[items[0].answerIndex]).toBe(LONG_RUN.conceptSummary)
  })
})

describe('verifyEmailQuiz — REPLACE: tie', () => {
  it('two options with identical conceptScore (margin=0 < TIE_MARGIN=0.15) → replaced=1 unconditionally', () => {
    // Craft two options that normalize to the SAME token set as LONG_RUN.conceptSummary,
    // so sim(opt, conceptSummary)=1.0 for both. The tie margin is exactly 0 < 0.15 → REPLACE.
    //
    // LONG_RUN.conceptSummary tokens (after normalize): {probability, long-run, relative,
    // frequency, unpredictable, time, predictable, bulk}
    //
    // opt1 = the actual conceptSummary → sim=1.0
    // opt2 = same 8 tokens in a different surface order → also sim=1.0
    // margin = 1.0 - 1.0 = 0.0 < TIE_MARGIN (0.15) → REPLACE fires unconditionally
    const summary = LONG_RUN.conceptSummary
    const sameTokensDifferentOrder =
      'In bulk, predictable long-run relative frequency: unpredictable at a time, probability.'
    const q: EmailQuizQuestion = {
      question: 'Which best describes long-run probability?',
      options: [
        summary,
        sameTokensDifferentOrder,
        'Something completely unrelated here XYZ',
        'Another irrelevant sentence entirely',
      ],
      answerIndex: 0,
      explanation: 'e',
      topicId: LONG_RUN.id,
    }
    const { items, replaced } = verifyEmailQuiz([q], grounded(LONG_RUN))
    expect(items).toHaveLength(1)
    // REPLACE must fire — the tie is guaranteed (margin === 0 < TIE_MARGIN)
    expect(replaced).toBe(1)
    // Emitted item is the deterministic concept-recall item (correctness invariant)
    expect(items[0].options[items[0].answerIndex]).toBe(LONG_RUN.conceptSummary)
    expect(items[0].topicId).toBe(LONG_RUN.id)
  })
})

describe('verifyEmailQuiz — REPLACE: float/out-of-range answerIndex', () => {
  it('float answerIndex (1.5) → replaced=1', () => {
    const base = makeWellFormed(LONG_RUN, 0)
    const q = { ...base, answerIndex: 1.5 }
    const { items, replaced } = verifyEmailQuiz([q], grounded(LONG_RUN))
    expect(items).toHaveLength(1)
    expect(replaced).toBe(1)
    expect(Number.isInteger(items[0].answerIndex)).toBe(true)
    expect(items[0].answerIndex).toBeGreaterThanOrEqual(0)
    expect(items[0].answerIndex).toBeLessThanOrEqual(3)
  })

  it('out-of-range answerIndex (4) → replaced=1', () => {
    const base = makeWellFormed(LONG_RUN, 0)
    const q = { ...base, answerIndex: 4 }
    const { items, replaced } = verifyEmailQuiz([q], grounded(LONG_RUN))
    expect(items).toHaveLength(1)
    expect(replaced).toBe(1)
    expect(items[0].answerIndex).toBeLessThan(4)
  })

  it('negative answerIndex → replaced=1', () => {
    const base = makeWellFormed(LONG_RUN, 0)
    const q = { ...base, answerIndex: -1 }
    const { items, replaced } = verifyEmailQuiz([q], grounded(LONG_RUN))
    expect(items).toHaveLength(1)
    expect(replaced).toBe(1)
  })
})

describe('verifyEmailQuiz — REPLACE: per-question exception', () => {
  it('null question (would throw) → replaced=1, other items preserved', () => {
    const good = makeWellFormed(COMBINING, 1)
    const bad = null as unknown as EmailQuizQuestion
    const { items, replaced, repaired } = verifyEmailQuiz([good, bad], grounded(LONG_RUN, COMBINING))
    expect(items).toHaveLength(2)
    expect(replaced).toBe(1)
    expect(repaired).toBe(0)
    // good item at index 0 should be PASSed
    expect(items[0]).toEqual(good)
    // bad item at index 1 → REPLACE: grounded[1%2]=COMBINING
    expect(items[1].options[items[1].answerIndex]).toBe(COMBINING.conceptSummary)
  })
})

// ---------------------------------------------------------------------------
// EC1: grounded=[] → CANONICAL_INTRO_ITEM
// ---------------------------------------------------------------------------

describe('verifyEmailQuiz — EC1: grounded=[]', () => {
  it('any question with grounded=[] → CANONICAL_INTRO_ITEM, replaced=1', () => {
    const q = makeWellFormed(LONG_RUN, 0)
    // Even a well-formed item fails structural gate (topicId not in grounded=[])
    const { items, replaced } = verifyEmailQuiz([q], [])
    expect(items).toHaveLength(1)
    expect(replaced).toBe(1)
    expect(items[0]).toEqual(CANONICAL_INTRO_ITEM)
  })

  it('multiple questions with grounded=[] → all CANONICAL_INTRO_ITEM', () => {
    const q0 = makeWellFormed(LONG_RUN, 0)
    const q1 = makeWellFormed(COMBINING, 1)
    const { items, replaced, repaired } = verifyEmailQuiz([q0, q1], [])
    expect(items).toHaveLength(2)
    expect(replaced).toBe(2)
    expect(repaired).toBe(0)
    items.forEach(item => expect(item).toEqual(CANONICAL_INTRO_ITEM))
  })
})

// ---------------------------------------------------------------------------
// items.length === input.length invariant
// ---------------------------------------------------------------------------

describe('items.length === input.length invariant', () => {
  it('holds for 1, 2, and 3 questions of mixed outcomes', () => {
    const q0 = makeWellFormed(LONG_RUN, 0)
    const qBad: EmailQuizQuestion = {
      question: 'xyz?',
      options: ['a', 'b', 'c', 'd'],
      answerIndex: 0,
      explanation: 'e',
      topicId: 'unknown',
    }
    const qMisIndexed = { ...makeWellFormed(CONDITIONING, 2), answerIndex: 3 }

    const cases: [EmailQuizQuestion[], AuthoritativeLesson[]][] = [
      [[q0], grounded(LONG_RUN)],
      [[q0, qBad], grounded(LONG_RUN)],
      [[q0, qBad, qMisIndexed], grounded(LONG_RUN, CONDITIONING)],
    ]
    for (const [questions, g] of cases) {
      const { items } = verifyEmailQuiz(questions, g)
      expect(items).toHaveLength(questions.length)
    }
  })
})

// ---------------------------------------------------------------------------
// Correctness invariants
// ---------------------------------------------------------------------------

describe('Correctness invariant: REPLACE/deterministic → options[answerIndex]===conceptSummary', () => {
  it('buildDeterministicEmailItem satisfies invariant for all 5 lessons, i=0..7', () => {
    for (let i = 0; i < 8; i++) {
      const lesson = AUTH_LESSON_META[i % 5]
      const item = buildDeterministicEmailItem(lesson, i)
      expect(item.options[item.answerIndex]).toBe(lesson.conceptSummary)
    }
  })

  it('verifyEmailQuiz REPLACE satisfies invariant', () => {
    const q: EmailQuizQuestion = {
      question: 'What color is the sky?',
      options: ['blue', 'green', 'red', 'yellow'],
      answerIndex: 0,
      explanation: 'sky',
      topicId: LONG_RUN.id,
    }
    const { items, replaced } = verifyEmailQuiz([q], grounded(LONG_RUN))
    expect(replaced).toBe(1)
    expect(items[0].options[items[0].answerIndex]).toBe(LONG_RUN.conceptSummary)
  })
})

describe('Correctness invariant: PASS/REPAIR → answerIndex is top concept option, never a DISTRACTOR', () => {
  it('PASS item: marked option matches conceptSummary (which has highest sim to conceptSummary)', () => {
    const q = makeWellFormed(EV, 0)
    const { items, repaired, replaced } = verifyEmailQuiz([q], grounded(EV))
    expect(repaired + replaced).toBe(0)
    void repaired; void replaced
    // The correct option must have highest conceptScore
    expect(items[0].options[items[0].answerIndex]).toBe(EV.conceptSummary)
  })

  it('REPAIR item: repaired answerIndex points to conceptSummary, not a distractor', () => {
    const correct = makeWellFormed(BAYES, 0)
    const wrongIdx = correct.answerIndex === 0 ? 1 : 0
    const q = { ...correct, answerIndex: wrongIdx }
    const { items, repaired } = verifyEmailQuiz([q], grounded(BAYES))
    expect(repaired).toBe(1)
    expect(items[0].options[items[0].answerIndex]).toBe(BAYES.conceptSummary)
    // Must NOT be a distractor
    const DISTRACTORS_LIST = [
      'Probability only applies to fair coins and dice, never to real life.',
      'Once an outcome is "due," it becomes more likely on the next try.',
      'A single sample tells you the true long-run rate exactly.',
      'Rare events can be ignored because they essentially never happen.',
      'Knowing extra information can never change a probability.',
    ]
    expect(DISTRACTORS_LIST).not.toContain(items[0].options[items[0].answerIndex])
  })
})

// ---------------------------------------------------------------------------
// generateEmailQuiz — no-key / emulator → model:'deterministic'
// ---------------------------------------------------------------------------

describe('generateEmailQuiz fallback paths', () => {
  afterEach(() => {
    delete process.env.FIRESTORE_EMULATOR_HOST
  })

  it('no apiKey → resolves with model:"deterministic"', async () => {
    const input: EmailQuizInput = {
      uid: 'u1',
      weakTopics: [{ id: LONG_RUN.id, title: LONG_RUN.title, conceptSummary: LONG_RUN.conceptSummary }],
      completedTopics: [],
      hasAnyProgress: true,
    }
    const result = await generateEmailQuiz(input, undefined)
    expect(result.model).toBe('deterministic')
    expect(result.questions.length).toBeGreaterThanOrEqual(1)
    expect(result.questions.length).toBeLessThanOrEqual(3)
  })

  it('FIRESTORE_EMULATOR_HOST set → resolves with model:"deterministic"', async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080'
    const input: EmailQuizInput = {
      uid: 'u2',
      weakTopics: [],
      completedTopics: [
        { id: COMBINING.id, title: COMBINING.title, conceptSummary: COMBINING.conceptSummary },
      ],
      hasAnyProgress: true,
    }
    const result = await generateEmailQuiz(input, 'some-api-key')
    expect(result.model).toBe('deterministic')
  })

  it('no apiKey, no progress → returns CANONICAL_INTRO_ITEM', async () => {
    const input: EmailQuizInput = {
      uid: 'u3',
      weakTopics: [],
      completedTopics: [],
      hasAnyProgress: false,
    }
    const result = await generateEmailQuiz(input, undefined)
    expect(result.model).toBe('deterministic')
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0]).toEqual(CANONICAL_INTRO_ITEM)
    expect(result.quizTopic).toBe('Probability Fundamentals')
  })

  it('no apiKey, 2 weak topics → deterministic result with 2 questions', async () => {
    const input: EmailQuizInput = {
      uid: 'u4',
      weakTopics: [
        { id: LONG_RUN.id, title: LONG_RUN.title, conceptSummary: LONG_RUN.conceptSummary, masteryScore: 0.3 },
        { id: BAYES.id, title: BAYES.title, conceptSummary: BAYES.conceptSummary, masteryScore: 0.4 },
      ],
      completedTopics: [],
      hasAnyProgress: true,
    }
    const result = await generateEmailQuiz(input, undefined)
    expect(result.model).toBe('deterministic')
    expect(result.questions).toHaveLength(2)
    // Correctness invariant
    expect(result.questions[0].options[result.questions[0].answerIndex]).toBe(LONG_RUN.conceptSummary)
    expect(result.questions[1].options[result.questions[1].answerIndex]).toBe(BAYES.conceptSummary)
  })
})

// ---------------------------------------------------------------------------
// CONCEPT_MIN and TIE_MARGIN exported sanity check
// ---------------------------------------------------------------------------

describe('exported constants', () => {
  it('CONCEPT_MIN is 0.25', () => expect(CONCEPT_MIN).toBe(0.25))
  it('TIE_MARGIN is 0.15', () => expect(TIE_MARGIN).toBe(0.15))
  it('AUTH_LESSON_META has 5 entries', () => expect(AUTH_LESSON_META).toHaveLength(5))
  it('AUTH_LESSON_META_BY_ID covers all 5 ids', () => {
    const ids = ['long-run', 'combining-events', 'conditioning', 'bayes-base-rates', 'expected-value']
    ids.forEach(id => expect(AUTH_LESSON_META_BY_ID[id]).toBeTruthy())
  })
})
