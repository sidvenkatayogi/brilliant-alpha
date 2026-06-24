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
  updateUserDoc,
} from './firestore'
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
}

const ProgressContext = createContext<ProgressContextValue | null>(null)

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null)
  const [progressByLesson, setProgressByLesson] = useState<Record<string, LessonProgress>>({})
  const [loading, setLoading] = useState(true)
  // Latest progress snapshot for fire-and-forget persistence without stale closures.
  const progressRef = useRef(progressByLesson)
  progressRef.current = progressByLesson

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
      const list = await fetchAllProgress(user.uid)
      if (cancelled) return
      setUserDoc(doc)
      setProgressByLesson(Object.fromEntries(list.map((p) => [p.lessonId, p])))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user])

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
      const wasCompleted = current.status === 'completed'
      const mastery = computeMastery(lesson, current)

      const completed: LessonProgress = {
        ...current,
        status: 'completed',
        masteryScore: mastery,
        completedAt: current.completedAt ?? Date.now(),
        lastAccessedAt: Date.now(),
      }
      setProgressByLesson((prev) => ({ ...prev, [lesson.id]: completed }))
      if (user) void saveLessonProgress(user.uid, completed)

      // Update streak + milestones on the user doc.
      const newMilestones: Milestone[] = []
      if (userDoc && user) {
        const today = toLocalDateString(new Date())
        const streak = applyActivity(
          {
            currentStreak: userDoc.currentStreak,
            longestStreak: userDoc.longestStreak,
            lastActiveDate: userDoc.lastActiveDate,
          },
          today,
        )

        const totalCompleted = userDoc.totalLessonsCompleted + (wasCompleted ? 0 : 1)
        const milestones = new Set(userDoc.milestones)
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
          ...userDoc,
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
