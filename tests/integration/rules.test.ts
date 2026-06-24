import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'

// Runs against the Firestore emulator (via `npm run test:integration`, which
// wraps this in `firebase emulators:exec`). Verifies a user can round-trip their
// own data and is blocked from touching anyone else's.

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

describe('firestore security rules', () => {
  it('lets a user write and read their own user doc and progress', async () => {
    const db = env.authenticatedContext('maya').firestore()

    await assertSucceeds(
      setDoc(doc(db, 'users/maya'), { displayName: 'Maya', currentStreak: 1 }),
    )
    const snap = await assertSucceeds(getDoc(doc(db, 'users/maya')))
    expect(snap.data()?.displayName).toBe('Maya')

    await assertSucceeds(
      setDoc(doc(db, 'users/maya/progress/long-run'), {
        lessonId: 'long-run',
        status: 'completed',
        currentStepIndex: 6,
      }),
    )
    const prog = await assertSucceeds(getDoc(doc(db, 'users/maya/progress/long-run')))
    expect(prog.data()?.status).toBe('completed')
  })

  it("blocks reading another user's doc", async () => {
    const db = env.authenticatedContext('maya').firestore()
    await assertFails(getDoc(doc(db, 'users/someone-else')))
  })

  it("blocks writing another user's progress", async () => {
    const db = env.authenticatedContext('maya').firestore()
    await assertFails(setDoc(doc(db, 'users/someone-else/progress/long-run'), { status: 'completed' }))
  })

  it('blocks an unauthenticated client entirely', async () => {
    const db = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'users/maya')))
  })
})
