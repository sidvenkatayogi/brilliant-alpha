// Unit tests for the api/email-unsubscribe.ts HTTP handler.
// Mirrors the firebase-admin mocking pattern from tests/unit/email-quiz.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// generateHmacToken does NOT call ensureApp() — safe to import statically.
import { generateHmacToken } from '../../api/email-quiz'

// ---------------------------------------------------------------------------
// Request / Response helpers
// ---------------------------------------------------------------------------

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'GET',
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

// ---------------------------------------------------------------------------
// Suite: email-unsubscribe HTTP handler
// ---------------------------------------------------------------------------

describe('email-unsubscribe handler', () => {
  const SECRET = 'test-secret'

  beforeEach(() => {
    process.env.EMAIL_TOKEN_SECRET = SECRET
    vi.resetModules()
  })

  afterEach(() => {
    delete process.env.EMAIL_TOKEN_SECRET
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // (a) Valid token for existing opted-in user → merge-write + 200 HTML
  // -------------------------------------------------------------------------
  it('(a) valid token for opted-in user: merge-write called and 200 HTML returned', async () => {
    const uid = 'user-opted-in'
    const token = generateHmacToken(SECRET, uid)

    const setSpy = vi.fn().mockResolvedValue(undefined)

    const mockDb = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({
            exists: true,
            get: (field: string) => {
              if (field === 'emailPrefs') return { dailyQuiz: true }
              return undefined
            },
          }),
          set: setSpy,
        }),
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

    const { default: handler } = await import('../../api/email-unsubscribe')
    const req = makeReq({ query: { token } })
    const res = makeRes() as Record<string, unknown>
    await handler(req as never, res as never)

    expect(res._status).toBe(200)
    // Response must be HTML, not JSON
    expect(typeof res._body).toBe('string')
    expect(res._body as string).toContain('<!DOCTYPE html')
    // Must contain "unsubscribed" in the success page
    expect((res._body as string).toLowerCase()).toContain('unsubscribed')
    // Merge-write must have been called with emailPrefs.dailyQuiz: false
    expect(setSpy).toHaveBeenCalledWith(
      {
        emailPrefs: {
          dailyQuiz: false,
          optedOutAt: '__serverTimestamp__',
        },
      },
      { merge: true },
    )
  })

  // -------------------------------------------------------------------------
  // (b) Valid token for non-existent user → 404
  // -------------------------------------------------------------------------
  it('(b) valid token for non-existent user: 404', async () => {
    const uid = 'ghost-user'
    const token = generateHmacToken(SECRET, uid)

    const mockDb = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ exists: false }),
        }),
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

    const { default: handler } = await import('../../api/email-unsubscribe')
    const req = makeReq({ query: { token } })
    const res = makeRes() as Record<string, unknown>
    await handler(req as never, res as never)

    expect(res._status).toBe(404)
    expect((res._body as Record<string, unknown>).error).toBe('User not found.')
  })

  // -------------------------------------------------------------------------
  // (c) Valid token for already-opted-out user → 200 "already unsubscribed",
  //     NO set() call
  // -------------------------------------------------------------------------
  it('(c) valid token for already-opted-out user: 200 already-unsubscribed HTML, no write', async () => {
    const uid = 'user-already-out'
    const token = generateHmacToken(SECRET, uid)

    const setSpy = vi.fn()

    const mockDb = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({
            exists: true,
            get: (field: string) => {
              if (field === 'emailPrefs') return { dailyQuiz: false }
              return undefined
            },
          }),
          set: setSpy,
        }),
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

    const { default: handler } = await import('../../api/email-unsubscribe')
    const req = makeReq({ query: { token } })
    const res = makeRes() as Record<string, unknown>
    await handler(req as never, res as never)

    expect(res._status).toBe(200)
    expect(typeof res._body).toBe('string')
    expect((res._body as string).toLowerCase()).toContain('already unsubscribed')
    // set() must NOT have been called
    expect(setSpy).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // (d) Missing token → 400
  // -------------------------------------------------------------------------
  it('(d) missing token: 400 with error message', async () => {
    vi.doMock('firebase-admin/app', () => ({
      cert: vi.fn(),
      getApps: vi.fn().mockReturnValue([{}]),
      initializeApp: vi.fn(),
    }))
    vi.doMock('firebase-admin/firestore', () => ({
      getFirestore: vi.fn().mockReturnValue({}),
      FieldValue: { serverTimestamp: vi.fn() },
    }))

    const { default: handler } = await import('../../api/email-unsubscribe')
    // No token in query
    const req = makeReq({ query: {} })
    const res = makeRes() as Record<string, unknown>
    await handler(req as never, res as never)

    expect(res._status).toBe(400)
    expect((res._body as Record<string, unknown>).error).toBe(
      'Invalid or missing unsubscribe token.',
    )
  })

  // -------------------------------------------------------------------------
  // (e) Malformed token (no dot separator) → 400
  // -------------------------------------------------------------------------
  it('(e) malformed token with no dot separator: 400 with error message', async () => {
    vi.doMock('firebase-admin/app', () => ({
      cert: vi.fn(),
      getApps: vi.fn().mockReturnValue([{}]),
      initializeApp: vi.fn(),
    }))
    vi.doMock('firebase-admin/firestore', () => ({
      getFirestore: vi.fn().mockReturnValue({}),
      FieldValue: { serverTimestamp: vi.fn() },
    }))

    const { default: handler } = await import('../../api/email-unsubscribe')
    // Token has no dot — HMAC verification will fail
    const req = makeReq({ query: { token: 'nodottokenhere' } })
    const res = makeRes() as Record<string, unknown>
    await handler(req as never, res as never)

    expect(res._status).toBe(400)
    expect((res._body as Record<string, unknown>).error).toBe(
      'Invalid or missing unsubscribe token.',
    )
  })
})
