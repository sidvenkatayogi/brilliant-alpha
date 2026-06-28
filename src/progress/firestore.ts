import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
  runTransaction,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { LessonProgress, UserDoc } from './types'

// All Firestore I/O is isolated here. The UI never imports firestore directly.
// Writes are awaited by callers only when they choose to; the player fires them
// without blocking feedback or interaction.

function userRef(uid: string) {
  return doc(db, 'users', uid)
}
function progressRef(uid: string, lessonId: string) {
  return doc(db, 'users', uid, 'progress', lessonId)
}

export async function fetchUserDoc(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(userRef(uid))
  return snap.exists() ? (snap.data() as UserDoc) : null
}

/**
 * Create the user doc on first sign-in; no-op if it already exists. Runs in a
 * transaction so two concurrent callers (the sign-in load and a very fast first
 * lesson completion) can't both create it and clobber each other's writes.
 * Display-name correction after the sign-up race is handled by `syncDisplayName`.
 */
export async function ensureUserDoc(
  uid: string,
  displayName: string,
  email: string,
): Promise<UserDoc> {
  return runTransaction(db, async (tx) => {
    const ref = userRef(uid)
    const snap = await tx.get(ref)
    if (snap.exists()) {
      const d = snap.data() as UserDoc
      // Backfill cohortId for user docs created before Phase 2.
      return { ...d, cohortId: d.cohortId ?? null }
    }
    const fresh: UserDoc = {
      displayName,
      email,
      createdAt: Date.now(),
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      totalLessonsCompleted: 0,
      milestones: [],
      cohortId: null,
    }
    tx.set(ref, fresh)
    return fresh
  })
}

export async function updateUserDoc(
  uid: string,
  patch: Partial<UserDoc>,
): Promise<void> {
  await setDoc(userRef(uid), patch, { merge: true })
}

export async function fetchAllProgress(uid: string): Promise<LessonProgress[]> {
  const snap = await getDocs(collection(db, 'users', uid, 'progress'))
  return snap.docs.map((d) => d.data() as LessonProgress)
}

export async function saveLessonProgress(
  uid: string,
  progress: LessonProgress,
): Promise<void> {
  await setDoc(progressRef(uid, progress.lessonId), progress, { merge: true })
}

export async function updateEmailPrefs(
  uid: string,
  prefs: { dailyQuiz: boolean },
): Promise<void> {
  await setDoc(doc(db, 'users', uid), { emailPrefs: prefs }, { merge: true })
}
