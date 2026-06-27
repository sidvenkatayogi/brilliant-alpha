// POST /api/assignCohort — lazily place the caller into a same-level cohort, or
// make one (transactional). Ported from the old assignCohort Cloud Function.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, FieldValue, requireUid } from './_lib/admin'
import { run, ApiError } from './_lib/http'
import { levelBand } from './_lib/levelBand'
import { cohortName } from './_lib/cohortName'
import { chooseExistingCohort, type CohortCandidate } from './_lib/cohortMatch'

const MAX_COHORT_SIZE = 6

export default function handler(req: VercelRequest, res: VercelResponse) {
  return run(req, res, async () => {
    const uid = await requireUid(req)

    const cohortId = await db.runTransaction(async (tx) => {
      const userRef = db.collection('users').doc(uid)
      const userSnap = await tx.get(userRef)
      if (!userSnap.exists) throw new ApiError(404, 'User doc missing.')
      const user = userSnap.data() as { cohortId?: string | null; totalLessonsCompleted?: number }

      // 1. Idempotent: already assigned.
      if (user.cohortId) return user.cohortId

      // 2. Caller's band.
      const band = levelBand(user.totalLessonsCompleted ?? 0)

      // 3. Find an open same-band cohort; pick the fewest-members one. All reads
      //    must precede writes inside the transaction.
      const candidates = await tx.get(db.collection('cohorts').where('levelBand', '==', band))
      const byId = new Map(candidates.docs.map((d) => [d.id, d.ref]))
      const candidateData: CohortCandidate[] = candidates.docs.map((d) => ({
        id: d.id,
        memberUids: d.get('memberUids') ?? [],
        maxSize: d.get('maxSize') ?? MAX_COHORT_SIZE,
      }))
      const chosenId = chooseExistingCohort(candidateData)

      if (chosenId) {
        tx.update(byId.get(chosenId)!, { memberUids: FieldValue.arrayUnion(uid) })
        tx.update(userRef, { cohortId: chosenId })
        return chosenId
      }

      // 4. None fit — create a fresh cohort (handles the lonely-pioneer case).
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
}
