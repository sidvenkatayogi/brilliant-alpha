import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'

// Runs against the Firestore emulator (via `npm run test:integration`, which
// wraps this in `firebase emulators:exec`). Verifies the generic subcollection
// rule covers quizAttempts (AC23) and progress (AC15) — own-uid read/write
// only, other uids and unauthenticated callers are denied.

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-long-run',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

afterAll(async () => {
  await env?.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
})

// ---------------------------------------------------------------------------
// quizAttempts subcollection — AC23
// ---------------------------------------------------------------------------
describe('quizAttempts rules (AC23)', () => {
  const OWNER = 'user_owner'
  const OTHER = 'user_other'
  const attempt = {
    submittedAt: Date.now(),
    score: 3,
    total: 5,
    perLesson: [{ lessonId: 'long-run', correct: true }],
  }

  it('owner can write to their own quizAttempts subcollection', async () => {
    const db = env.authenticatedContext(OWNER).firestore()
    await assertSucceeds(
      setDoc(doc(db, 'users', OWNER, 'quizAttempts', 'attempt-1'), attempt),
    )
  })

  it('owner can read back a doc from their own quizAttempts subcollection', async () => {
    // Seed via admin path to avoid depending on the write test.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OWNER, 'quizAttempts', 'attempt-1'), attempt)
    })

    const db = env.authenticatedContext(OWNER).firestore()
    const snap = await assertSucceeds(
      getDoc(doc(db, 'users', OWNER, 'quizAttempts', 'attempt-1')),
    )
    expect(snap.data()?.score).toBe(3)
    expect(snap.data()?.total).toBe(5)
  })

  it("a different uid is denied writing to another user's quizAttempts", async () => {
    const db = env.authenticatedContext(OTHER).firestore()
    await assertFails(
      setDoc(doc(db, 'users', OWNER, 'quizAttempts', 'any-id'), attempt),
    )
  })

  it("a different uid is denied reading another user's quizAttempts", async () => {
    // Seed the doc first so the denial is not just a missing-doc 404.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OWNER, 'quizAttempts', 'any-id'), attempt)
    })

    const db = env.authenticatedContext(OTHER).firestore()
    await assertFails(
      getDoc(doc(db, 'users', OWNER, 'quizAttempts', 'any-id')),
    )
  })

  it('an unauthenticated context is denied reading quizAttempts', async () => {
    // Seed the doc first so we are not just testing a missing-doc 404.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OWNER, 'quizAttempts', 'any-id'), attempt)
    })

    const db = env.unauthenticatedContext().firestore()
    await assertFails(
      getDoc(doc(db, 'users', OWNER, 'quizAttempts', 'any-id')),
    )
  })
})

// ---------------------------------------------------------------------------
// progress subcollection — AC15 (isolation after emailDelivery removal)
// ---------------------------------------------------------------------------
describe('progress rules — isolation after emailDelivery removal (AC15)', () => {
  const OWNER = 'user_progress_owner'
  const OTHER = 'user_progress_other'
  const progressDoc = {
    lessonId: 'long-run',
    status: 'completed',
    currentStepIndex: 6,
  }

  it('owner can write to their own progress subcollection', async () => {
    const db = env.authenticatedContext(OWNER).firestore()
    await assertSucceeds(
      setDoc(doc(db, 'users', OWNER, 'progress', 'long-run'), progressDoc),
    )
  })

  it('owner can read back a doc from their own progress subcollection', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OWNER, 'progress', 'long-run'), progressDoc)
    })

    const db = env.authenticatedContext(OWNER).firestore()
    const snap = await assertSucceeds(
      getDoc(doc(db, 'users', OWNER, 'progress', 'long-run')),
    )
    expect(snap.data()?.status).toBe('completed')
  })

  it("a different uid is denied writing to another user's progress", async () => {
    const db = env.authenticatedContext(OTHER).firestore()
    await assertFails(
      setDoc(doc(db, 'users', OWNER, 'progress', 'long-run'), progressDoc),
    )
  })

  it("a different uid is denied reading another user's progress", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OWNER, 'progress', 'long-run'), progressDoc)
    })

    const db = env.authenticatedContext(OTHER).firestore()
    await assertFails(
      getDoc(doc(db, 'users', OWNER, 'progress', 'long-run')),
    )
  })
})
