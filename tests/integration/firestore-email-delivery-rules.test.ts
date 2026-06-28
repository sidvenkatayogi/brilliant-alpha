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
// wraps this in `firebase emulators:exec`). Verifies that emailDelivery
// subcollection rules are enforced correctly:
//   - Clients cannot write to emailDelivery (Admin SDK only)
//   - Owners can read their own emailDelivery docs
//   - Cross-tenant reads are denied
//   - Other subcollections (e.g. progress) still allow owner writes (regression)

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

describe('emailDelivery subcollection security rules', () => {
  it('AC13: denies client write to own emailDelivery doc', async () => {
    const db = env.authenticatedContext('maya').firestore()
    await assertFails(
      setDoc(doc(db, 'users/maya/emailDelivery/2026-06-27'), { status: 'sent' }),
    )
  })

  it('AC13: allows owner to read their own emailDelivery doc', async () => {
    // Seed via admin context (bypasses rules, simulates Admin SDK write)
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/maya/emailDelivery/2026-06-27'), {
        status: 'sent',
        sentAt: Date.now(),
        quizTopic: 'Probability Basics',
        model: 'gpt-4o-mini',
      })
    })

    const db = env.authenticatedContext('maya').firestore()
    const snap = await assertSucceeds(
      getDoc(doc(db, 'users/maya/emailDelivery/2026-06-27')),
    )
    expect(snap.data()?.status).toBe('sent')
  })

  it('AC13: denies cross-tenant read of another user emailDelivery doc', async () => {
    // Seed a delivery doc for 'ada'
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/ada/emailDelivery/2026-06-27'), {
        status: 'sent',
      })
    })

    // 'maya' should not be able to read 'ada's delivery record
    const db = env.authenticatedContext('maya').firestore()
    await assertFails(getDoc(doc(db, 'users/ada/emailDelivery/2026-06-27')))
  })

  it('AC12 regression: client write to own progress subcollection still allowed', async () => {
    const db = env.authenticatedContext('maya').firestore()
    await assertSucceeds(
      setDoc(doc(db, 'users/maya/progress/lesson-1'), {
        lessonId: 'lesson-1',
        status: 'in_progress',
      }),
    )
  })
})
