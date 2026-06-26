// Two callable Cloud Functions (PRD2 §7):
//   assignCohort           — transactional cohort matching/creation (Admin SDK)
//   generateMeetingOutline — the one AI feature; holds the Anthropic API key
// Everything else (availability writes, overlap math, confirming a time, the
// peer projection) stays client + security rules.

import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { levelBand } from './shared/levelBand'
import { cohortName } from './shared/cohortName'
import { chooseExistingCohort, type CohortCandidate } from './cohortMatch'
import type { AiOutline, LessonMetaLite } from './shared/types'
import { LESSON_META_BY_ID } from './lessonMeta'
import { generateOutline } from './anthropic'

initializeApp()
const db = getFirestore()

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')

const MAX_COHORT_SIZE = 6
// Picking the fewest-members open cohort naturally fills toward the soft target
// of 4 before opening a 5th seat (PRD2 §6.1).
// Only regenerate an outline at most this often per meeting (PRD2 §6.4).
const REGEN_COOLDOWN_MS = 3 * 60 * 1000

// ---------------------------------------------------------------------------
// assignCohort — lazily place the caller into a same-level cohort, or make one.
// ---------------------------------------------------------------------------

export const assignCohort = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in.')

  const cohortId = await db.runTransaction(async (tx) => {
    const userRef = db.collection('users').doc(uid)
    const userSnap = await tx.get(userRef)
    if (!userSnap.exists) throw new HttpsError('not-found', 'User doc missing.')
    const user = userSnap.data() as { cohortId?: string | null; totalLessonsCompleted?: number; displayName?: string }

    // 1. Idempotent: already assigned.
    if (user.cohortId) return user.cohortId

    // 2. Caller's band.
    const band = levelBand(user.totalLessonsCompleted ?? 0)

    // 3. Find an open same-band cohort; pick the fewest-members one (fill toward
    //    the soft target before opening a 5th). All reads must precede writes.
    const candidates = await tx.get(
      db.collection('cohorts').where('levelBand', '==', band),
    )
    const byId = new Map(candidates.docs.map((d) => [d.id, d.ref]))
    const candidateData: CohortCandidate[] = candidates.docs.map((d) => ({
      id: d.id,
      memberUids: d.get('memberUids') ?? [],
      maxSize: d.get('maxSize') ?? MAX_COHORT_SIZE,
    }))
    const chosenId = chooseExistingCohort(candidateData)

    if (chosenId) {
      // 4. Join the existing cohort.
      tx.update(byId.get(chosenId)!, { memberUids: FieldValue.arrayUnion(uid) })
      tx.update(userRef, { cohortId: chosenId })
      return chosenId
    }

    // 5. None fit — create a fresh cohort (handles the lonely-pioneer case).
    const newRef = db.collection('cohorts').doc()
    tx.set(newRef, {
      name: cohortName(newRef.id),
      levelBand: band,
      memberUids: [uid],
      maxSize: MAX_COHORT_SIZE,
      createdAt: FieldValue.serverTimestamp(),
    })
    tx.update(userRef, { cohortId: newRef.id })
    return newRef.id
  })

  return { cohortId }
})

// ---------------------------------------------------------------------------
// generateMeetingOutline — the AI facilitator outline, cached on the meeting.
// ---------------------------------------------------------------------------

interface MemberProjection {
  lessonsCompleted?: string[]
  lessonsStarted?: string[]
}

export const generateMeetingOutline = onCall(
  { secrets: [ANTHROPIC_API_KEY] },
  async (request) => {
    const uid = request.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in.')

    const { cohortId, weekId, force } = (request.data ?? {}) as {
      cohortId?: string
      weekId?: string
      force?: boolean
    }
    if (!cohortId || !weekId) {
      throw new HttpsError('invalid-argument', 'cohortId and weekId are required.')
    }

    // 1. Verify membership.
    const cohortSnap = await db.collection('cohorts').doc(cohortId).get()
    if (!cohortSnap.exists) throw new HttpsError('not-found', 'Cohort not found.')
    const memberUids: string[] = cohortSnap.get('memberUids') ?? []
    if (!memberUids.includes(uid)) {
      throw new HttpsError('permission-denied', 'Not a member of this cohort.')
    }

    const meetingRef = db
      .collection('cohorts')
      .doc(cohortId)
      .collection('meetings')
      .doc(weekId)
    const meetingSnap = await meetingRef.get()

    // 2. Cache + rate limit: serve the stored outline unless forced past cooldown.
    const existing = meetingSnap.get('aiOutline') as AiOutline | undefined
    const meta = meetingSnap.get('aiOutlineMeta') as { generatedAt?: number } | undefined
    if (existing && !force) {
      return { outline: existing, cached: true }
    }
    if (existing && force && meta?.generatedAt) {
      const elapsed = Date.now() - meta.generatedAt
      if (elapsed < REGEN_COOLDOWN_MS) {
        throw new HttpsError(
          'resource-exhausted',
          `Please wait before regenerating (cooldown ${Math.ceil((REGEN_COOLDOWN_MS - elapsed) / 1000)}s).`,
        )
      }
    }

    // 3. Gather collectively completed / in-progress lessons from projections.
    const projSnap = await db
      .collection('cohorts')
      .doc(cohortId)
      .collection('memberProgress')
      .get()
    const completedIds = new Set<string>()
    const startedIds = new Set<string>()
    for (const d of projSnap.docs) {
      const p = d.data() as MemberProjection
      for (const id of p.lessonsCompleted ?? []) completedIds.add(id)
      for (const id of p.lessonsStarted ?? []) startedIds.add(id)
    }
    const toMeta = (ids: Set<string>): LessonMetaLite[] =>
      [...ids].map((id) => LESSON_META_BY_ID[id]).filter((m): m is LessonMetaLite => !!m)
    const completed = toMeta(completedIds)
    const inProgress = toMeta(
      new Set([...startedIds].filter((id) => !completedIds.has(id))),
    )

    // 4 + 5. Generate (or stub/fallback), then cache on the meeting doc.
    // Read the secret defensively — under the emulator it's typically unset, and
    // generateOutline returns a deterministic stub in that case anyway.
    let apiKey: string | undefined
    try {
      apiKey = ANTHROPIC_API_KEY.value() || undefined
    } catch {
      apiKey = undefined
    }
    const { outline, usedFallback, model } = await generateOutline(
      {
        cohortSize: memberUids.length,
        completed,
        inProgress,
        meetingMinutes: 45,
      },
      apiKey,
    )

    const aiOutlineMeta = {
      generatedAt: Date.now(),
      model: usedFallback ? `${model} (fallback)` : model,
      byUid: uid,
    }
    // Meeting doc may not exist yet if the outline is generated before the poll
    // is opened; merge-create so we never clobber other fields.
    await meetingRef.set({ aiOutline: outline, aiOutlineMeta }, { merge: true })

    return { outline, cached: false }
  },
)
