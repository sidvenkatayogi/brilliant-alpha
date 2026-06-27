// POST /api/getQuizAnswerKey — release the quiz answers, but only once it's
// meeting time. The answers live in a Function-only private subdoc clients
// cannot read. Ported from the old getQuizAnswerKey Cloud Function.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, requireUid } from './_lib/admin.js'
import { run, ApiError } from './_lib/http.js'
import type { QuizAnswer } from './_lib/types.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  return run(req, res, async () => {
    const uid = await requireUid(req)

    const { cohortId, weekId } = (req.body ?? {}) as { cohortId?: string; weekId?: string }
    if (!cohortId || !weekId) {
      throw new ApiError(400, 'cohortId and weekId are required.')
    }

    // 1. Verify membership.
    const cohortSnap = await db.collection('cohorts').doc(cohortId).get()
    if (!cohortSnap.exists) throw new ApiError(404, 'Cohort not found.')
    const memberUids: string[] = cohortSnap.get('memberUids') ?? []
    if (!memberUids.includes(uid)) {
      throw new ApiError(403, 'Not a member of this cohort.')
    }

    const meetingRef = db
      .collection('cohorts')
      .doc(cohortId)
      .collection('meetings')
      .doc(weekId)
    const meetingSnap = await meetingRef.get()

    // 2. Time gate: answers stay locked until the confirmed meeting time arrives.
    const finalized = meetingSnap.get('finalizedSlotStart') as number | null | undefined
    if (finalized == null) {
      throw new ApiError(
        412,
        'Confirm a meeting time first — answers unlock once the meeting starts.',
      )
    }
    if (Date.now() < finalized) {
      throw new ApiError(412, 'The answer key unlocks at the meeting time.')
    }

    // 3. Release the answers from the Function-only subdoc.
    const keySnap = await meetingRef.collection('private').doc('answerKey').get()
    if (!keySnap.exists) {
      throw new ApiError(404, 'No quiz yet — generate the outline first.')
    }
    const answers = (keySnap.get('answers') ?? []) as QuizAnswer[]
    return { answers }
  })
}
