import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore'

// Runs against the Firestore emulator (via `npm run test:integration`, which
// wraps this in `firebase emulators:exec`). Verifies that the
// `where('emailPrefs.dailyQuiz', '==', true)` query correctly returns only
// opted-in users and excludes:
//   - Users with emailPrefs.dailyQuiz === false
//   - Users with no emailPrefs field at all
// This also confirms the single-field index on emailPrefs.dailyQuiz resolves (M3).

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

describe('AC2 + M3 — emailPrefs.dailyQuiz query exclusion', () => {
  it('AC2: only opted-in users returned by dailyQuiz===true query', async () => {
    // Seed all three users via admin context (simulates Admin SDK, bypasses rules)
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'users/alice'), {
        emailPrefs: { dailyQuiz: true },
        email: 'alice@example.com',
      })
      await setDoc(doc(db, 'users/bob'), {
        emailPrefs: { dailyQuiz: false },
        email: 'bob@example.com',
      })
      await setDoc(doc(db, 'users/carol'), {
        email: 'carol@example.com',
        // no emailPrefs field
      })
    })

    // Run query inside withSecurityRulesDisabled since unauthenticated reads are denied by rules
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      const q = query(collection(db, 'users'), where('emailPrefs.dailyQuiz', '==', true))
      const snap = await getDocs(q)

      // AC2 assertion 1: only 1 document returned
      expect(snap.size).toBe(1)

      // AC2 assertion 2: the returned doc id is 'alice'
      expect(snap.docs[0].id).toBe('alice')

      // AC2 assertion 3: bob (dailyQuiz:false) is not in results
      const ids = snap.docs.map((d) => d.id)
      expect(ids).not.toContain('bob')

      // AC2 assertion 4: carol (no emailPrefs field) is not in results
      expect(ids).not.toContain('carol')
    })
  })

  it('AC2: opted-out user (dailyQuiz:false) is excluded', async () => {
    // Seed only bob
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'users/bob'), {
        emailPrefs: { dailyQuiz: false },
        email: 'bob@example.com',
      })
    })

    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      const q = query(collection(db, 'users'), where('emailPrefs.dailyQuiz', '==', true))
      const snap = await getDocs(q)

      expect(snap.size).toBe(0)
    })
  })

  it('AC2: user with no emailPrefs field is excluded', async () => {
    // Seed only carol (no emailPrefs)
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'users/carol'), {
        email: 'carol@example.com',
      })
    })

    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      const q = query(collection(db, 'users'), where('emailPrefs.dailyQuiz', '==', true))
      const snap = await getDocs(q)

      expect(snap.size).toBe(0)
    })
  })
})
