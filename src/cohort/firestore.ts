// All cohort / meeting / availability / projection Firestore I/O is isolated
// here (mirrors src/progress/firestore.ts). The UI never imports firestore
// directly. The two callables (assignCohort, generateMeetingOutline) are wrapped
// here too so the rest of the app just awaits a plain function.

import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { callApi } from '../lib/api'
import type {
  AiOutline,
  Availability,
  Cohort,
  MemberProgress,
  Meeting,
  MeetingProposal,
  MeetingStatus,
  QuizAnswer,
  SlotConfig,
} from './types'

// --- Serverless API (Vercel /api) -------------------------------------------

/**
 * Lazily place the caller into a cohort (idempotent server-side). Retries a
 * couple of times so a transient cold-start failure on the first API call
 * doesn't surface as "couldn't load your group".
 */
export async function assignCohort(): Promise<string> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await callApi<{ cohortId: string }>('cohort', { action: 'assignCohort' })
      return res.cohortId
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
    }
  }
  throw lastErr
}

/** Generate (or fetch the cached) AI meeting outline. */
export async function generateMeetingOutline(
  cohortId: string,
  weekId: string,
  force = false,
): Promise<{ outline: AiOutline; cached: boolean }> {
  return callApi<{ outline: AiOutline; cached: boolean }>('cohort', {
    action: 'generateOutline',
    cohortId,
    weekId,
    force,
  })
}

/**
 * Fetch the quiz answer key. The API only releases it once the confirmed
 * meeting time has arrived; before that it throws.
 */
export async function getQuizAnswerKey(
  cohortId: string,
  weekId: string,
): Promise<QuizAnswer[]> {
  const res = await callApi<{ answers: QuizAnswer[] }>('cohort', {
    action: 'getAnswerKey',
    cohortId,
    weekId,
  })
  return res.answers
}

// --- Cohort + members -------------------------------------------------------

export async function fetchCohort(cohortId: string): Promise<Cohort | null> {
  const snap = await getDoc(doc(db, 'cohorts', cohortId))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Cohort) : null
}

/** Read every member's thin peer-visible projection for a cohort. */
export async function fetchMemberProgress(cohortId: string): Promise<MemberProgress[]> {
  const snap = await getDocs(collection(db, 'cohorts', cohortId, 'memberProgress'))
  return snap.docs.map((d) => d.data() as MemberProgress)
}

/** Self-write the caller's thin projection (no sensitive fields). */
export async function saveMemberProgress(
  cohortId: string,
  projection: MemberProgress,
): Promise<void> {
  await setDoc(
    doc(db, 'cohorts', cohortId, 'memberProgress', projection.uid),
    projection,
    { merge: true },
  )
}

// --- Meetings ---------------------------------------------------------------

function meetingRef(cohortId: string, weekId: string) {
  return doc(db, 'cohorts', cohortId, 'meetings', weekId)
}

export async function fetchMeeting(cohortId: string, weekId: string): Promise<Meeting | null> {
  const snap = await getDoc(meetingRef(cohortId, weekId))
  return snap.exists() ? (snap.data() as Meeting) : null
}

/**
 * Read this week's meeting, creating it if it doesn't exist yet. The doc id is
 * the weekId, so a losing race just overwrites identical seed fields (PRD2 §6.3).
 */
export async function ensureMeeting(
  cohortId: string,
  weekId: string,
  slotConfig: SlotConfig,
): Promise<Meeting> {
  const existing = await fetchMeeting(cohortId, weekId)
  if (existing) return existing
  const fresh: Meeting = {
    weekId,
    status: 'scheduling',
    slotConfig,
    proposals: [],
    finalizedSlotStart: null,
    meetingLink: null,
    confirmedBy: null,
    aiOutline: null,
    aiOutlineMeta: null,
    createdAt: Date.now(),
  }
  await setDoc(meetingRef(cohortId, weekId), { ...fresh, createdAt: serverTimestamp() }, { merge: true })
  return fresh
}

/**
 * Write the scheduling state — the full proposals list plus the lock fields.
 * Proposals are kept as a list so the group can view and approve any of them;
 * the client computes the next list and the lock outcome and writes it here.
 */
export async function setMeetingScheduling(
  cohortId: string,
  weekId: string,
  patch: {
    proposals: MeetingProposal[]
    status: MeetingStatus
    finalizedSlotStart: number | null
    confirmedBy: string | null
  },
): Promise<void> {
  await setDoc(meetingRef(cohortId, weekId), patch, { merge: true })
}

export async function setMeetingLink(
  cohortId: string,
  weekId: string,
  link: string,
): Promise<void> {
  await setDoc(meetingRef(cohortId, weekId), { meetingLink: link }, { merge: true })
}

// --- Availability -----------------------------------------------------------

export async function fetchAvailabilities(
  cohortId: string,
  weekId: string,
): Promise<Availability[]> {
  const snap = await getDocs(
    collection(db, 'cohorts', cohortId, 'meetings', weekId, 'availability'),
  )
  return snap.docs.map((d) => d.data() as Availability)
}

/** Self-write the caller's availability picks. */
export async function saveAvailability(
  cohortId: string,
  weekId: string,
  availability: Availability,
): Promise<void> {
  await setDoc(
    doc(db, 'cohorts', cohortId, 'meetings', weekId, 'availability', availability.uid),
    availability,
    { merge: true },
  )
}
