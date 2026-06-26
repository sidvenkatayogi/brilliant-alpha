import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore'

// Phase 2 cohort privacy boundary (PRD2 §9). Members can read each other's THIN
// projection + shared meeting data; non-members are locked out; nobody writes
// membership from the client. Runs against the Firestore emulator.

let env: RulesTestEnvironment

const COHORT = 'cohort_1'
const OTHER = 'cohort_2'

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
  // Seed cohorts + a projection via the Admin path (bypasses rules).
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'cohorts', COHORT), {
      name: 'The Lucky Priors',
      levelBand: 1,
      memberUids: ['maya', 'ada'],
      maxSize: 6,
    })
    await setDoc(doc(db, 'cohorts', OTHER), {
      name: 'The Bold Outcomes',
      levelBand: 2,
      memberUids: ['zed'],
    })
    await setDoc(doc(db, 'cohorts', COHORT, 'memberProgress', 'ada'), {
      uid: 'ada',
      displayName: 'Ada',
      lessonsStarted: ['long-run'],
      lessonsCompleted: [],
      currentLessonId: 'long-run',
    })
    await setDoc(doc(db, 'cohorts', COHORT, 'meetings', '2026-W26'), {
      weekId: '2026-W26',
      status: 'scheduling',
    })
    await setDoc(
      doc(db, 'cohorts', COHORT, 'meetings', '2026-W26', 'availability', 'ada'),
      { uid: 'ada', displayName: 'Ada', slots: [100] },
    )
  })
})

describe('cohort metadata', () => {
  it('lets a member read their cohort', async () => {
    const db = env.authenticatedContext('maya').firestore()
    const snap = await assertSucceeds(getDoc(doc(db, 'cohorts', COHORT)))
    expect(snap.data()?.name).toBe('The Lucky Priors')
  })

  it('blocks a non-member from reading the cohort', async () => {
    const db = env.authenticatedContext('zed').firestore()
    await assertFails(getDoc(doc(db, 'cohorts', COHORT)))
  })

  it('denies all client writes to memberUids', async () => {
    const db = env.authenticatedContext('maya').firestore()
    await assertFails(
      setDoc(doc(db, 'cohorts', COHORT), { memberUids: ['maya', 'ada', 'intruder'] }, { merge: true }),
    )
  })
})

describe('peer projection (thin, member-visible only)', () => {
  it('lets a member read another member’s projection', async () => {
    const db = env.authenticatedContext('maya').firestore()
    const snap = await assertSucceeds(
      getDoc(doc(db, 'cohorts', COHORT, 'memberProgress', 'ada')),
    )
    expect(snap.data()?.displayName).toBe('Ada')
  })

  it('blocks a non-member from reading projections', async () => {
    const db = env.authenticatedContext('zed').firestore()
    await assertFails(getDoc(doc(db, 'cohorts', COHORT, 'memberProgress', 'ada')))
  })

  it('lets a member write their own projection', async () => {
    const db = env.authenticatedContext('maya').firestore()
    await assertSucceeds(
      setDoc(doc(db, 'cohorts', COHORT, 'memberProgress', 'maya'), {
        uid: 'maya',
        displayName: 'Maya',
        lessonsStarted: ['long-run'],
        lessonsCompleted: [],
        currentLessonId: 'long-run',
      }),
    )
  })

  it("blocks a member from writing another member's projection", async () => {
    const db = env.authenticatedContext('maya').firestore()
    await assertFails(
      setDoc(doc(db, 'cohorts', COHORT, 'memberProgress', 'ada'), { displayName: 'hacked' }),
    )
  })

  it('round-trips a projection without any forbidden fields', async () => {
    const db = env.authenticatedContext('maya').firestore()
    await setDoc(doc(db, 'cohorts', COHORT, 'memberProgress', 'maya'), {
      uid: 'maya',
      displayName: 'Maya',
      lessonsStarted: ['long-run'],
      lessonsCompleted: ['long-run'],
      currentLessonId: null,
    })
    const snap = await getDoc(doc(db, 'cohorts', COHORT, 'memberProgress', 'maya'))
    const data = snap.data() ?? {}
    for (const forbidden of ['stepResults', 'attempts', 'masteryScore', 'currentStreak']) {
      expect(data).not.toHaveProperty(forbidden)
    }
  })
})

describe('meetings + availability', () => {
  it('lets a member read and update the meeting doc', async () => {
    const db = env.authenticatedContext('maya').firestore()
    await assertSucceeds(getDoc(doc(db, 'cohorts', COHORT, 'meetings', '2026-W26')))
    await assertSucceeds(
      setDoc(
        doc(db, 'cohorts', COHORT, 'meetings', '2026-W26'),
        { status: 'scheduled', finalizedSlotStart: 100, confirmedBy: 'maya' },
        { merge: true },
      ),
    )
  })

  it('lets a member create this week’s meeting doc (race-safe new week)', async () => {
    const db = env.authenticatedContext('maya').firestore()
    await assertSucceeds(
      setDoc(doc(db, 'cohorts', COHORT, 'meetings', '2026-W27'), {
        weekId: '2026-W27',
        status: 'scheduling',
      }),
    )
  })

  it('blocks a non-member from reading meetings', async () => {
    const db = env.authenticatedContext('zed').firestore()
    await assertFails(getDoc(doc(db, 'cohorts', COHORT, 'meetings', '2026-W26')))
  })

  it('lets a member write their own availability', async () => {
    const db = env.authenticatedContext('maya').firestore()
    await assertSucceeds(
      setDoc(doc(db, 'cohorts', COHORT, 'meetings', '2026-W26', 'availability', 'maya'), {
        uid: 'maya',
        displayName: 'Maya',
        slots: [100, 200],
      }),
    )
  })

  it("blocks a member from writing another member's availability", async () => {
    const db = env.authenticatedContext('maya').firestore()
    await assertFails(
      setDoc(doc(db, 'cohorts', COHORT, 'meetings', '2026-W26', 'availability', 'ada'), {
        slots: [999],
      }),
    )
  })

  it('lets a member read all availability docs (for the overlap view)', async () => {
    const db = env.authenticatedContext('maya').firestore()
    const snap = await assertSucceeds(
      getDocs(collection(db, 'cohorts', COHORT, 'meetings', '2026-W26', 'availability')),
    )
    expect(snap.size).toBeGreaterThanOrEqual(1)
  })

  it('blocks a non-member from reading availability', async () => {
    const db = env.authenticatedContext('zed').firestore()
    await assertFails(
      getDoc(doc(db, 'cohorts', COHORT, 'meetings', '2026-W26', 'availability', 'ada')),
    )
  })
})
