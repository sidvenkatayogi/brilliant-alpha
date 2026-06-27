// POST /api/generateMeetingOutline — the AI facilitator outline + group quiz,
// cached on the meeting doc. The quiz answer key is written to a private subdoc
// that clients cannot read (released later by /api/getQuizAnswerKey).
// Ported from the old generateMeetingOutline Cloud Function.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, requireUid } from './_lib/admin.js'
import { run, ApiError } from './_lib/http.js'
import type { AiOutline, LessonMetaLite } from './_lib/types.js'
import { LESSON_META_BY_ID } from './_lib/lessonMeta.js'
import { generateOutline } from './_lib/openai.js'

// Only regenerate an outline at most this often per meeting (PRD2 §6.4).
const REGEN_COOLDOWN_MS = 3 * 60 * 1000

interface MemberProjection {
  lessonsCompleted?: string[]
  lessonsStarted?: string[]
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  return run(req, res, async () => {
    const uid = await requireUid(req)

    const { cohortId, weekId, force } = (req.body ?? {}) as {
      cohortId?: string
      weekId?: string
      force?: boolean
    }
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

    // 2. Cache + rate limit: serve the stored outline unless forced past cooldown.
    const existing = meetingSnap.get('aiOutline') as AiOutline | undefined
    const meta = meetingSnap.get('aiOutlineMeta') as { generatedAt?: number } | undefined
    if (existing && !force) {
      return { outline: existing, cached: true }
    }
    if (existing && force && meta?.generatedAt) {
      const elapsed = Date.now() - meta.generatedAt
      if (elapsed < REGEN_COOLDOWN_MS) {
        throw new ApiError(
          429,
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

    // 4 + 5. Generate (or stub/fallback), then cache on the meeting doc and
    // stash the answer key in the Function-only private subdoc.
    const apiKey = process.env.OPENAI_API_KEY || undefined
    const { outline, answerKey, usedFallback, model } = await generateOutline(
      { cohortSize: memberUids.length, completed, inProgress, meetingMinutes: 45 },
      apiKey,
    )

    const aiOutlineMeta = {
      generatedAt: Date.now(),
      model: usedFallback ? `${model} (fallback)` : model,
      byUid: uid,
    }
    await meetingRef.set({ aiOutline: outline, aiOutlineMeta }, { merge: true })
    await meetingRef
      .collection('private')
      .doc('answerKey')
      .set({ answers: answerKey, generatedAt: Date.now() })

    return { outline, cached: false }
  })
}
