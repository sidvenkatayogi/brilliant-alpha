// Unit tests for api/email-quiz.ts and api/email-unsubscribe.ts pure helpers
// and the cron batch handler. Follows the same mocking style as server-logic.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Helpers (HMAC, buildEmailHtml) — imported statically because they do NOT call
// ensureApp() at module load time.
// ---------------------------------------------------------------------------
import {
  generateHmacToken,
  buildEmailHtml,
  type EmailQuizResult,
} from '../../api/email-quiz'
import { verifyHmacToken } from '../../api/email-unsubscribe'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeQuizResult(overrides: Partial<EmailQuizResult> = {}): EmailQuizResult {
  return {
    questions: [
      {
        question: 'What is the probability of a fair coin landing heads?',
        options: ['0.25', '0.5', '0.75', '1.0'],
        answerIndex: 1,
        explanation: 'A fair coin has equal chance of heads or tails.',
        topicId: 'long-run',
      },
    ],
    quizTopic: 'Probability Basics',
    model: 'gpt-4o-mini',
    ...overrides,
  }
}

const mockOpenAi = (create: () => unknown) => ({
  default: class {
    chat = { completions: { create } }
  },
})

// ---------------------------------------------------------------------------
// Suite: generateEmailQuiz
// ---------------------------------------------------------------------------

describe('generateEmailQuiz', () => {
  beforeEach(() => {
    delete process.env.FIRESTORE_EMULATOR_HOST
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('AC1: missing apiKey (undefined) throws "AI unavailable"', async () => {
    // No FIRESTORE_EMULATOR_HOST set for this test
    const { generateEmailQuiz } = await import('../../api/email-quiz')
    await expect(
      generateEmailQuiz(
        { uid: 'u1', weakTopics: [], completedTopics: [], hasAnyProgress: false },
        undefined,
      ),
    ).rejects.toThrow('AI unavailable')
  })

  it('AC2: FIRESTORE_EMULATOR_HOST set throws even with a real apiKey', async () => {
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
    const { generateEmailQuiz } = await import('../../api/email-quiz')
    await expect(
      generateEmailQuiz(
        { uid: 'u1', weakTopics: [], completedTopics: [], hasAnyProgress: false },
        'sk-real-key',
      ),
    ).rejects.toThrow('AI unavailable')
  })

  it('AC3: OpenAI error propagates', async () => {
    vi.doMock('openai', () =>
      mockOpenAi(async () => {
        throw new Error('openai network error')
      }),
    )
    const { generateEmailQuiz } = await import('../../api/email-quiz')
    await expect(
      generateEmailQuiz(
        { uid: 'u1', weakTopics: [], completedTopics: [], hasAnyProgress: false },
        'sk-real-key',
      ),
    ).rejects.toThrow('openai network error')
  })

  it('AC4: valid mocked completion parses to correct EmailQuizResult shape', async () => {
    const weakTopics = [
      { id: 'long-run', title: 'Chance & the Long Run', conceptSummary: 'Basic probability' },
    ]
    const validJson = JSON.stringify({
      questions: [
        {
          question: 'What is the probability of rolling a 6?',
          options: ['1/2', '1/3', '1/6', '1/4'],
          answerIndex: 2,
          explanation: 'A fair die has 6 faces.',
          topicId: 'long-run',
        },
      ],
      quizTopic: 'Chance & the Long Run',
    })

    vi.doMock('openai', () =>
      mockOpenAi(async () => ({ choices: [{ message: { content: validJson } }] })),
    )
    const { generateEmailQuiz } = await import('../../api/email-quiz')
    const result = await generateEmailQuiz(
      { uid: 'u1', weakTopics, completedTopics: [], hasAnyProgress: true },
      'sk-real-key',
    )

    expect(result.questions.length).toBeGreaterThanOrEqual(1)
    expect(typeof result.quizTopic).toBe('string')
    expect(typeof result.model).toBe('string')
    // Verify the result has correctly shaped questions
    for (const q of result.questions) {
      expect(typeof q.question).toBe('string')
      expect(q.options).toHaveLength(4)
      expect(typeof q.answerIndex).toBe('number')
      expect(typeof q.explanation).toBe('string')
      expect(typeof q.topicId).toBe('string')
    }
  })
})

// ---------------------------------------------------------------------------
// Suite: HMAC token (generateHmacToken / verifyHmacToken)
// ---------------------------------------------------------------------------

describe('HMAC token round-trip', () => {
  const SECRET = 'test-hmac-secret-1234'

  it('AC5: round-trip valid — verifyHmacToken returns original uid', () => {
    const uid = 'user-abc-123'
    const token = generateHmacToken(SECRET, uid)
    expect(verifyHmacToken(SECRET, token)).toBe(uid)
  })

  it('AC6: tampered payload (uid changed) returns null', () => {
    // Generate token for 'alice'
    const token = generateHmacToken(SECRET, 'alice')
    // Tamper: replace payload with base64url('bob') but keep alice's mac
    const dot = token.indexOf('.')
    const mac = token.slice(dot)
    const bobPayload = Buffer.from('bob').toString('base64url')
    const tamperedToken = bobPayload + mac
    expect(verifyHmacToken(SECRET, tamperedToken)).toBeNull()
  })

  it('AC7: wrong secret returns null', () => {
    const token = generateHmacToken('secretA', 'user-xyz')
    expect(verifyHmacToken('secretB', token)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Suite: buildEmailHtml
// ---------------------------------------------------------------------------

describe('buildEmailHtml', () => {
  const UNSUB_URL = 'https://example.com/api/email-unsubscribe?token=tok123'

  it('AC8: contains the unsubscribe URL in output HTML', () => {
    const html = buildEmailHtml(makeQuizResult(), UNSUB_URL)
    expect(html).toContain(UNSUB_URL)
  })

  it('AC9: all 4 option letters A B C D are present', () => {
    const html = buildEmailHtml(makeQuizResult(), UNSUB_URL)
    expect(html).toContain('A.')
    expect(html).toContain('B.')
    expect(html).toContain('C.')
    expect(html).toContain('D.')
  })

  it('AC10: subject / title contains quizTopic', () => {
    const result = makeQuizResult({ quizTopic: 'Conditional Probability' })
    const html = buildEmailHtml(result, UNSUB_URL)
    // Both the <title> and <h2> include the quizTopic
    expect(html).toContain('Conditional Probability')
  })
})

// ---------------------------------------------------------------------------
// Suite: Cron batch handler
// ---------------------------------------------------------------------------

function makeReq(
  overrides: Partial<{ method: string; headers: Record<string, string>; body: unknown }> = {},
) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer test-cron-secret' },
    body: {},
    query: {},
    ...overrides,
  }
}

function makeRes() {
  const res: Record<string, unknown> = {}
  res.status = (code: number) => {
    res._status = code
    return res
  }
  res.json = (data: unknown) => {
    res._body = data
    return res
  }
  res.send = (data: unknown) => {
    res._body = data
    return res
  }
  res.setHeader = () => res
  return res as unknown
}

// Helper to build a fake Firestore deliveryDoc snapshot
function makeDeliverySnap(opts: { exists: boolean; status?: string }) {
  return {
    exists: opts.exists,
    get: (field: string) => {
      if (field === 'status') return opts.status
      return undefined
    },
  }
}

// Helper to build a fake Firestore progress snapshot
function makeProgressSnap(docs: Array<{ id: string; masteryScore?: number; title?: string; conceptSummary?: string }>) {
  return {
    docs: docs.map((d) => ({
      id: d.id,
      data: () => ({
        masteryScore: d.masteryScore,
        title: d.title ?? d.id,
        conceptSummary: d.conceptSummary ?? '',
      }),
    })),
  }
}

describe('Cron batch handler', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret'
    process.env.OPENAI_API_KEY = 'sk-test-openai'
    process.env.EMAIL_TOKEN_SECRET = 'test-email-secret'
    delete process.env.FIRESTORE_EMULATOR_HOST
    vi.resetModules()
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
    delete process.env.OPENAI_API_KEY
    delete process.env.EMAIL_TOKEN_SECRET
    vi.restoreAllMocks()
  })

  it('AC11: idempotency — delivery doc exists with status "sent" → user skipped, no email sent', async () => {
    const deliverySetSpy = vi.fn()
    const resendSendSpy = vi.fn().mockResolvedValue({ data: { id: 'email-id' }, error: null })

    const deliverySnap = makeDeliverySnap({ exists: true, status: 'sent' })
    const deliveryRef = {
      get: vi.fn().mockResolvedValue(deliverySnap),
      set: deliverySetSpy,
    }

    const userDoc = {
      id: 'user1',
      data: () => ({ email: 'user1@example.com', emailPrefs: { dailyQuiz: true } }),
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ docs: [] }),
        }),
        get: vi.fn().mockResolvedValue(makeProgressSnap([])),
      }),
    }

    const mockDb = {
      collection: vi.fn().mockImplementation((col: string) => {
        if (col === 'users') {
          return {
            where: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ docs: [userDoc] }),
            }),
            doc: vi.fn().mockReturnValue({
              collection: vi.fn().mockReturnValue({
                doc: vi.fn().mockReturnValue(deliveryRef),
              }),
            }),
          }
        }
        return {}
      }),
    }

    vi.doMock('firebase-admin/app', () => ({
      cert: vi.fn(),
      getApps: vi.fn().mockReturnValue([{}]),
      initializeApp: vi.fn(),
    }))
    vi.doMock('firebase-admin/firestore', () => ({
      getFirestore: vi.fn().mockReturnValue(mockDb),
      FieldValue: { serverTimestamp: vi.fn().mockReturnValue('__serverTimestamp__') },
    }))
    vi.doMock('resend', () => ({
      Resend: class {
        emails = { send: resendSendSpy }
      },
    }))
    vi.doMock('openai', () =>
      mockOpenAi(async () => {
        throw new Error('should not be called')
      }),
    )

    const { default: handler } = await import('../../api/email-quiz')
    const req = makeReq()
    const res = makeRes() as Record<string, unknown>
    await handler(req as never, res as never)

    expect(res._status).toBe(200)
    const body = res._body as Record<string, unknown>
    expect(body.skipped).toBe(1)
    expect(body.sent).toBe(0)
    // deliveryRef.set should NOT have been called (already sent, no write needed)
    expect(deliverySetSpy).not.toHaveBeenCalled()
    // Resend should not have been called
    expect(resendSendSpy).not.toHaveBeenCalled()
  })

  it('AC12: no email on user doc → deliveryRef.set({ status: "skipped", reason: "no-email" })', async () => {
    const deliverySetSpy = vi.fn().mockResolvedValue(undefined)

    const deliveryRef = {
      get: vi.fn().mockResolvedValue(makeDeliverySnap({ exists: false })),
      set: deliverySetSpy,
    }

    const userDoc = {
      id: 'user2',
      data: () => ({ emailPrefs: { dailyQuiz: true } }), // no email field
      collection: vi.fn(),
    }

    const mockDb = {
      collection: vi.fn().mockImplementation((col: string) => {
        if (col === 'users') {
          return {
            where: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ docs: [userDoc] }),
            }),
            doc: vi.fn().mockReturnValue({
              collection: vi.fn().mockReturnValue({
                doc: vi.fn().mockReturnValue(deliveryRef),
              }),
            }),
          }
        }
        return {}
      }),
    }

    vi.doMock('firebase-admin/app', () => ({
      cert: vi.fn(),
      getApps: vi.fn().mockReturnValue([{}]),
      initializeApp: vi.fn(),
    }))
    vi.doMock('firebase-admin/firestore', () => ({
      getFirestore: vi.fn().mockReturnValue(mockDb),
      FieldValue: { serverTimestamp: vi.fn().mockReturnValue('__serverTimestamp__') },
    }))
    vi.doMock('resend', () => ({
      Resend: class {
        emails = { send: vi.fn() }
      },
    }))
    vi.doMock('openai', () => mockOpenAi(async () => { throw new Error('no') }))

    const { default: handler } = await import('../../api/email-quiz')
    const req = makeReq()
    const res = makeRes() as Record<string, unknown>
    await handler(req as never, res as never)

    expect(res._status).toBe(200)
    const body = res._body as Record<string, unknown>
    expect(body.skipped).toBe(1)
    expect(deliverySetSpy).toHaveBeenCalledWith({ status: 'skipped', reason: 'no-email' })
  })

  it('AC13: AI failure sets status "failed" and batch continues to next user', async () => {
    const user1DeliverySetSpy = vi.fn().mockResolvedValue(undefined)
    const user2DeliverySetSpy = vi.fn().mockResolvedValue(undefined)
    const resendSendSpy = vi.fn().mockResolvedValue({ data: { id: 'e2' }, error: null })

    const progressSnap = makeProgressSnap([
      { id: 'long-run', title: 'Chance & Long Run', conceptSummary: 'basics', masteryScore: 0.4 },
    ])

    const user1Doc = {
      id: 'user1',
      data: () => ({ email: 'user1@example.com', emailPrefs: { dailyQuiz: true } }),
    }
    const user2Doc = {
      id: 'user2',
      data: () => ({ email: 'user2@example.com', emailPrefs: { dailyQuiz: true } }),
    }

    // user1 deliveryRef — not yet sent
    const user1DeliveryRef = {
      get: vi.fn().mockResolvedValue(makeDeliverySnap({ exists: false })),
      set: user1DeliverySetSpy,
    }
    // user2 deliveryRef — not yet sent
    const user2DeliveryRef = {
      get: vi.fn().mockResolvedValue(makeDeliverySnap({ exists: false })),
      set: user2DeliverySetSpy,
    }

    // user1 progress subcollection (has weak topics — used for prompt grounding)
    const user1ProgressSnap = progressSnap
    // user2 progress
    const user2ProgressSnap = makeProgressSnap([])

    const mockDb = {
      collection: vi.fn().mockImplementation((col: string) => {
        if (col === 'users') {
          return {
            where: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ docs: [user1Doc, user2Doc] }),
            }),
            doc: vi.fn().mockImplementation((uid: string) => ({
              collection: vi.fn().mockImplementation((sub: string) => ({
                doc: vi.fn().mockImplementation((_docId: string) => {
                  if (sub === 'emailDelivery') {
                    return uid === 'user1' ? user1DeliveryRef : user2DeliveryRef
                  }
                  return { get: vi.fn().mockResolvedValue({ exists: false }) }
                }),
                get: vi.fn().mockResolvedValue(
                  uid === 'user1' ? user1ProgressSnap : user2ProgressSnap,
                ),
              })),
            })),
          }
        }
        return {}
      }),
    }

    let openAiCallCount = 0
    vi.doMock('openai', () =>
      mockOpenAi(async () => {
        openAiCallCount++
        if (openAiCallCount === 1) {
          // user1: AI fails
          throw new Error('AI service down')
        }
        // user2: AI succeeds
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  questions: [
                    {
                      question: 'What is P(A)?',
                      options: ['0.1', '0.2', '0.3', '0.4'],
                      answerIndex: 0,
                      explanation: 'test',
                      topicId: 'long-run',
                    },
                  ],
                  quizTopic: 'Basic Probability',
                }),
              },
            },
          ],
        }
      }),
    )

    vi.doMock('firebase-admin/app', () => ({
      cert: vi.fn(),
      getApps: vi.fn().mockReturnValue([{}]),
      initializeApp: vi.fn(),
    }))
    vi.doMock('firebase-admin/firestore', () => ({
      getFirestore: vi.fn().mockReturnValue(mockDb),
      FieldValue: { serverTimestamp: vi.fn().mockReturnValue('__serverTimestamp__') },
    }))
    vi.doMock('resend', () => ({
      Resend: class {
        emails = { send: resendSendSpy }
      },
    }))

    const { default: handler } = await import('../../api/email-quiz')
    const req = makeReq()
    const res = makeRes() as Record<string, unknown>
    await handler(req as never, res as never)

    expect(res._status).toBe(200)
    const body = res._body as Record<string, unknown>
    // user1 failed, user2 sent
    expect(body.failed).toBe(1)
    expect(body.sent).toBe(1)
    // user1 delivery marked failed
    expect(user1DeliverySetSpy).toHaveBeenCalledWith({ status: 'failed', reason: 'ai-unavailable' })
    // user2 delivery attempted — Resend called
    expect(resendSendSpy).toHaveBeenCalledTimes(1)
  })

  it('AC14: dryRun=true → Resend not called and delivery record not written', async () => {
    const deliverySetSpy = vi.fn().mockResolvedValue(undefined)
    const resendSendSpy = vi.fn().mockResolvedValue({ data: { id: 'e1' }, error: null })

    const deliveryRef = {
      get: vi.fn().mockResolvedValue(makeDeliverySnap({ exists: false })),
      set: deliverySetSpy,
    }

    const userDoc = {
      id: 'user1',
      data: () => ({ email: 'user1@example.com', emailPrefs: { dailyQuiz: true } }),
    }

    const progressSnap = makeProgressSnap([])

    const mockDb = {
      collection: vi.fn().mockImplementation((col: string) => {
        if (col === 'users') {
          return {
            where: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ docs: [userDoc] }),
            }),
            doc: vi.fn().mockReturnValue({
              collection: vi.fn().mockImplementation((_sub: string) => ({
                doc: vi.fn().mockReturnValue(deliveryRef),
                get: vi.fn().mockResolvedValue(progressSnap),
              })),
            }),
          }
        }
        return {}
      }),
    }

    const validQuizJson = JSON.stringify({
      questions: [
        {
          question: 'Q1?',
          options: ['A', 'B', 'C', 'D'],
          answerIndex: 0,
          explanation: 'exp',
          topicId: 'long-run',
        },
      ],
      quizTopic: 'Probability',
    })

    vi.doMock('openai', () =>
      mockOpenAi(async () => ({ choices: [{ message: { content: validQuizJson } }] })),
    )
    vi.doMock('firebase-admin/app', () => ({
      cert: vi.fn(),
      getApps: vi.fn().mockReturnValue([{}]),
      initializeApp: vi.fn(),
    }))
    vi.doMock('firebase-admin/firestore', () => ({
      getFirestore: vi.fn().mockReturnValue(mockDb),
      FieldValue: { serverTimestamp: vi.fn().mockReturnValue('__serverTimestamp__') },
    }))
    vi.doMock('resend', () => ({
      Resend: class {
        emails = { send: resendSendSpy }
      },
    }))

    const { default: handler } = await import('../../api/email-quiz')
    const req = makeReq({ body: { dryRun: true } })
    const res = makeRes() as Record<string, unknown>
    await handler(req as never, res as never)

    expect(res._status).toBe(200)
    const body = res._body as Record<string, unknown>
    expect(body.sent).toBe(1)
    // Resend must NOT have been called
    expect(resendSendSpy).not.toHaveBeenCalled()
    // Delivery record must NOT have been written
    expect(deliverySetSpy).not.toHaveBeenCalled()
  })

  it('AC6: successful send → deliveryRef.set called with { status:"sent", sentAt, model, quizTopic }', async () => {
    const deliverySetSpy = vi.fn().mockResolvedValue(undefined)
    const resendSendSpy = vi.fn().mockResolvedValue({ data: { id: 'email-123' }, error: null })

    const deliveryRef = {
      get: vi.fn().mockResolvedValue(makeDeliverySnap({ exists: false })),
      set: deliverySetSpy,
    }

    const userDoc = {
      id: 'user1',
      data: () => ({ email: 'user1@example.com', emailPrefs: { dailyQuiz: true } }),
    }

    const progressSnap = makeProgressSnap([])

    const mockDb = {
      collection: vi.fn().mockImplementation((col: string) => {
        if (col === 'users') {
          return {
            where: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ docs: [userDoc] }),
            }),
            doc: vi.fn().mockReturnValue({
              collection: vi.fn().mockImplementation((_sub: string) => ({
                doc: vi.fn().mockReturnValue(deliveryRef),
                get: vi.fn().mockResolvedValue(progressSnap),
              })),
            }),
          }
        }
        return {}
      }),
    }

    const validQuizJson = JSON.stringify({
      questions: [
        {
          question: 'What is the probability of a fair coin landing heads?',
          options: ['0.25', '0.5', '0.75', '1.0'],
          answerIndex: 1,
          explanation: 'A fair coin has equal chance of heads or tails.',
          topicId: 'long-run',
        },
      ],
      quizTopic: 'Basic Probability',
    })

    vi.doMock('firebase-admin/app', () => ({
      cert: vi.fn(),
      getApps: vi.fn().mockReturnValue([{}]),
      initializeApp: vi.fn(),
    }))
    vi.doMock('firebase-admin/firestore', () => ({
      getFirestore: vi.fn().mockReturnValue(mockDb),
      FieldValue: { serverTimestamp: vi.fn().mockReturnValue('__serverTimestamp__') },
    }))
    vi.doMock('resend', () => ({
      Resend: class {
        emails = { send: resendSendSpy }
      },
    }))
    vi.doMock('openai', () => mockOpenAi(async () => ({ choices: [{ message: { content: validQuizJson } }] })))

    const { default: handler } = await import('../../api/email-quiz')
    const req = makeReq()
    const res = makeRes() as Record<string, unknown>
    await handler(req as never, res as never)

    expect(res._status).toBe(200)
    const body = res._body as Record<string, unknown>
    expect(body.sent).toBe(1)
    expect(deliverySetSpy).toHaveBeenCalledTimes(1)
    expect(deliverySetSpy).toHaveBeenCalledWith({
      status: 'sent',
      sentAt: '__serverTimestamp__',
      model: 'gpt-4o-mini',
      quizTopic: 'Basic Probability',
    })
  })
})
