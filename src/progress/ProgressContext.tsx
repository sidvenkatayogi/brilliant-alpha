import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { useAuth } from '../auth/AuthContext'
import { lessons as allLessons } from '../content/loadLessons'
import type { Lesson } from '../content/types'
import { computeMastery } from '../engine/mastery'
import { applyActivity, toLocalDateString } from '../engine/streak'
import {
  ensureUserDoc,
  fetchAllProgress,
  saveLessonProgress,
  updateEmailPrefs,
  updateUserDoc,
} from './firestore'
import { saveMemberProgress } from '../cohort/firestore'
import type { MemberProgress } from '../cohort/types'
import { emptyProgress, type LessonProgress, type Milestone, type UserDoc } from './types'

interface ProgressContextValue {
  userDoc: UserDoc | null
  progressByLesson: Record<string, LessonProgress>
  loading: boolean
  getProgress: (lessonId: string) => LessonProgress
  setCurrentStep: (lessonId: string, index: number) => void
  recordStepResult: (
    lessonId: string,
    stepId: string,
    correct: boolean,
    attempts: number,
  ) => void
  restartLesson: (lessonId: string) => void
  completeLesson: (lesson: Lesson) => Promise<{ newMilestones: Milestone[]; mastery: number }>
  /** Reflect a server-side cohort assignment locally so the peer projection syncs. */
  setCohortId: (cohortId: string) => void
  /**
   * Toggle the daily-quiz email preference. Updates local state optimistically so
   * the UI reflects the change immediately, persists to Firestore, and reverts on
   * failure. Rejects if the write fails so callers can surface an error.
   */
  setDailyQuizEnabled: (enabled: boolean) => Promise<void>
}

const ProgressContext = createContext<ProgressContextValue | null>(null)

// The set of lessons that actually exist. Completion is counted against this so
// stale or unknown lesson ids in saved progress can never inflate the total.
const knownLessonIds = new Set(allLessons.map((l) => l.id))

/**
 * The single source of truth for "lessons completed": derive it from the
 * per-lesson progress map rather than tracking a separate counter. Because the
 * map is keyed by lessonId, a lesson can be re-completed any number of times
 * without ever being counted twice, and the result is capped at the number of
 * real lessons — so "6/5" is structurally impossible.
 */
function countCompleted(progress: Record<string, LessonProgress>): number {
  let n = 0
  for (const p of Object.values(progress)) {
    if (p.status === 'completed' && knownLessonIds.has(p.lessonId)) n++
  }
  return Math.min(n, knownLessonIds.size)
}

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null)
  const [progressByLesson, setProgressByLesson] = useState<Record<string, LessonProgress>>({})
  const [loading, setLoading] = useState(true)
  // Latest progress snapshot for fire-and-forget persistence without stale closures.
  const progressRef = useRef(progressByLesson)
  progressRef.current = progressByLesson
  // Signature of the last peer projection we wrote, to avoid redundant writes.
  const lastProjectionRef = useRef<string>('')

  // Load user doc + all progress on sign-in; clear on sign-out.
  useEffect(() => {
    let cancelled = false
    if (!user) {
      setUserDoc(null)
      setProgressByLesson({})
      setLoading(false)
      return
    }
    setLoading(true)
    ;(async () => {
      const doc = await ensureUserDoc(user.uid, user.displayName ?? 'Learner', user.email ?? '')
      // Sign-up race: the doc can be created (from onAuthStateChanged) before
      // updateProfile sets the chosen name. If auth now has a real name that
      // differs, correct the stored doc so it (and the peer projection) match.
      if (user.displayName && doc.displayName !== user.displayName) {
        doc.displayName = user.displayName
        void updateUserDoc(user.uid, { displayName: user.displayName })
      }
      const list = await fetchAllProgress(user.uid)
      if (cancelled) return
      const progressMap = Object.fromEntries(list.map((p) => [p.lessonId, p]))
      // Self-heal a drifted count: recompute the true value from per-lesson
      // progress and correct the stored doc if an older imperative-increment
      // path left it wrong (e.g. an impossible "6/5"). Idempotent on clean docs.
      const trueCompleted = countCompleted(progressMap)
      if (doc.totalLessonsCompleted !== trueCompleted) {
        doc.totalLessonsCompleted = trueCompleted
        void updateUserDoc(user.uid, { totalLessonsCompleted: trueCompleted })
      }
      setUserDoc(doc)
      setProgressByLesson(progressMap)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  // Mirror lesson-level started/completed into the cohort's thin peer-visible
  // projection (PRD2 §6.2/§8). Runs whenever the started/completed set changes,
  // only if the learner has a cohort. Deliberately carries NO step results,
  // attempts, mastery, or streaks — peers must never see those.
  useEffect(() => {
    const cohortId = userDoc?.cohortId
    if (!user || !cohortId || !userDoc) return
    const touched = Object.values(progressByLesson).filter((p) => p.status !== 'not_started')
    const lessonsStarted = touched.map((p) => p.lessonId)
    const lessonsCompleted = touched
      .filter((p) => p.status === 'completed')
      .map((p) => p.lessonId)
    // Current lesson = most-recently-accessed in-progress lesson.
    const current = touched
      .filter((p) => p.status === 'in_progress')
      .sort((a, b) => (b.lastAccessedAt ?? 0) - (a.lastAccessedAt ?? 0))[0]
    const projection: MemberProgress = {
      uid: user.uid,
      displayName: userDoc.displayName,
      lessonsStarted,
      lessonsCompleted,
      currentLessonId: current?.lessonId ?? null,
      updatedAt: Date.now(),
    }
    const signature = JSON.stringify({
      c: cohortId,
      s: [...lessonsStarted].sort(),
      d: [...lessonsCompleted].sort(),
      l: projection.currentLessonId,
      n: userDoc.displayName,
    })
    if (signature === lastProjectionRef.current) return
    lastProjectionRef.current = signature
    void saveMemberProgress(cohortId, projection) // fire-and-forget
  }, [progressByLesson, user, userDoc])

  const setCohortId = useCallback((cohortId: string) => {
    setUserDoc((prev) => (prev && prev.cohortId !== cohortId ? { ...prev, cohortId } : prev))
  }, [])

  const setDailyQuizEnabled = useCallback(
    async (enabled: boolean) => {
      if (!user) return
      // Optimistic: flip local state now so the toggle animates immediately.
      setUserDoc((prev) =>
        prev ? { ...prev, emailPrefs: { ...prev.emailPrefs, dailyQuiz: enabled } } : prev,
      )
      try {
        await updateEmailPrefs(user.uid, { dailyQuiz: enabled })
      } catch (e) {
        // Revert on failure so the UI never lies about the saved preference.
        setUserDoc((prev) =>
          prev ? { ...prev, emailPrefs: { ...prev.emailPrefs, dailyQuiz: !enabled } } : prev,
        )
        throw e
      }
    },
    [user],
  )

  const getProgress = useCallback(
    (lessonId: string): LessonProgress =>
      progressByLesson[lessonId] ?? emptyProgress(lessonId),
    [progressByLesson],
  )

  /** Update one lesson's progress in state and persist it (non-blocking). */
  const persist = useCallback(
    (lessonId: string, mutate: (prev: LessonProgress) => LessonProgress) => {
      setProgressByLesson((prev) => {
        const current = prev[lessonId] ?? emptyProgress(lessonId)
        const next = mutate(current)
        if (user) void saveLessonProgress(user.uid, next) // fire-and-forget
        return { ...prev, [lessonId]: next }
      })
    },
    [user],
  )

  const setCurrentStep = useCallback(
    (lessonId: string, index: number) => {
      persist(lessonId, (prev) => ({
        ...prev,
        status: prev.status === 'completed' ? 'completed' : 'in_progress',
        currentStepIndex: index,
        startedAt: prev.startedAt ?? Date.now(),
        lastAccessedAt: Date.now(),
      }))
    },
    [persist],
  )

  const recordStepResult = useCallback(
    (lessonId: string, stepId: string, correct: boolean, attempts: number) => {
      persist(lessonId, (prev) => {
        // Never let the attempt count drop. Going Back and re-answering a
        // question remounts it with a fresh counter; taking the max keeps the
        // original first-try outcome intact so mastery can't be inflated.
        const prior = prev.stepResults[stepId]?.attempts ?? 0
        return {
          ...prev,
          status: prev.status === 'completed' ? 'completed' : 'in_progress',
          stepResults: {
            ...prev.stepResults,
            [stepId]: { correct, attempts: Math.max(prior, attempts), answeredAt: Date.now() },
          },
        }
      })
    },
    [persist],
  )

  /**
   * Start a finished lesson over: clear its per-step results so a fresh redo is
   * scored cleanly for first-try mastery. Keeps status/mastery until the redo is
   * completed (so the course path doesn't flicker to 0% mid-redo).
   */
  const restartLesson = useCallback(
    (lessonId: string) => {
      persist(lessonId, (prev) => ({
        ...prev,
        currentStepIndex: 0,
        stepResults: {},
        lastAccessedAt: Date.now(),
      }))
    },
    [persist],
  )

  const completeLesson = useCallback(
    async (lesson: Lesson) => {
      const current = progressRef.current[lesson.id] ?? emptyProgress(lesson.id)
      const mastery = computeMastery(lesson, current)

      const completed: LessonProgress = {
        ...current,
        status: 'completed',
        masteryScore: mastery,
        completedAt: current.completedAt ?? Date.now(),
        lastAccessedAt: Date.now(),
      }
      const nextProgress = { ...progressRef.current, [lesson.id]: completed }
      setProgressByLesson(nextProgress)
      if (user) void saveLessonProgress(user.uid, completed)

      // Update streak + milestones on the user doc. If the doc hasn't finished
      // loading yet (e.g. a very fast first lesson), fetch/create it first so the
      // streak and lessons-completed count are never silently dropped.
      const newMilestones: Milestone[] = []
      let baseDoc = userDoc
      if (!baseDoc && user) {
        baseDoc = await ensureUserDoc(user.uid, user.displayName ?? 'Learner', user.email ?? '')
      }
      if (baseDoc && user) {
        const today = toLocalDateString(new Date())
        const streak = applyActivity(
          {
            currentStreak: baseDoc.currentStreak,
            longestStreak: baseDoc.longestStreak,
            lastActiveDate: baseDoc.lastActiveDate,
          },
          today,
        )

        // Derived, not incremented: counting completed lessons from the live
        // progress map is idempotent, so re-finishing a lesson (Skip to recap →
        // advance, browser back, double-tap) can never overcount.
        const totalCompleted = countCompleted(nextProgress)
        const milestones = new Set(baseDoc.milestones)
        if (totalCompleted >= 1 && !milestones.has('first_lesson')) {
          milestones.add('first_lesson')
          newMilestones.push('first_lesson')
        }
        if (streak.currentStreak >= 3 && !milestones.has('streak_3')) {
          milestones.add('streak_3')
          newMilestones.push('streak_3')
        }
        if (totalCompleted >= allLessons.length && !milestones.has('course_complete')) {
          milestones.add('course_complete')
          newMilestones.push('course_complete')
        }

        const nextDoc: UserDoc = {
          ...baseDoc,
          currentStreak: streak.currentStreak,
          longestStreak: streak.longestStreak,
          lastActiveDate: streak.lastActiveDate,
          totalLessonsCompleted: totalCompleted,
          milestones: [...milestones],
        }
        setUserDoc(nextDoc)
        void updateUserDoc(user.uid, {
          currentStreak: nextDoc.currentStreak,
          longestStreak: nextDoc.longestStreak,
          lastActiveDate: nextDoc.lastActiveDate,
          totalLessonsCompleted: nextDoc.totalLessonsCompleted,
          milestones: nextDoc.milestones,
        })
      }

      return { newMilestones, mastery }
    },
    [user, userDoc],
  )

  return (
    <ProgressContext.Provider
      value={{
        userDoc,
        progressByLesson,
        loading,
        getProgress,
        setCurrentStep,
        recordStepResult,
        restartLesson,
        completeLesson,
        setCohortId,
        setDailyQuizEnabled,
      }}
    >
      {children}
    </ProgressContext.Provider>
  )
}

export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext)
  if (!ctx) throw new Error('useProgress must be used within ProgressProvider')
  return ctx
}
