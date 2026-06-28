// Per-user state stored in Firestore. Lesson content lives in the repo; only
// progress, streaks, and milestones are persisted here.

export type LessonStatus = 'not_started' | 'in_progress' | 'completed'

export interface StepResult {
  correct: boolean
  attempts: number
  /** ms epoch — stored as a Firestore Timestamp, normalized to number in app. */
  answeredAt: number
}

export interface LessonProgress {
  lessonId: string
  status: LessonStatus
  currentStepIndex: number
  stepResults: Record<string, StepResult>
  masteryScore: number
  startedAt: number | null
  completedAt: number | null
  lastAccessedAt: number | null
}

export type Milestone = 'first_lesson' | 'streak_3' | 'course_complete'

export interface UserDoc {
  displayName: string
  email: string
  createdAt: number
  currentStreak: number
  longestStreak: number
  /** YYYY-MM-DD in the user's local time. */
  lastActiveDate: string | null
  totalLessonsCompleted: number
  milestones: Milestone[]
  /** Phase 2: the cohort the learner belongs to; null until lazily assigned. */
  cohortId: string | null
  /** Email quiz opt-in preferences. Absent means opt-out (dailyQuiz: false). */
  emailPrefs?: EmailPrefs
}

export interface EmailPrefs {
  dailyQuiz: boolean
  /** Set by Admin SDK on unsubscribe. Absent when subscribed. ms epoch in app. */
  optedOutAt?: number
}

export type EmailDeliveryStatus = 'sent' | 'failed' | 'skipped'

export type EmailDeliveryReason =
  | 'ai-unavailable'   // OpenAI call threw
  | 'send-error'       // Resend call threw
  | 'no-email'         // userDoc.email absent

export interface EmailDeliveryRecord {
  status: EmailDeliveryStatus
  /** Present when status === 'sent'. ms epoch. */
  sentAt?: number
  /** Present when status !== 'sent'. */
  reason?: EmailDeliveryReason
  /** LLM model identifier. Present when status === 'sent'. */
  model?: string
  /** Human-readable topic. Present when status === 'sent'. */
  quizTopic?: string
}

export function emptyProgress(lessonId: string): LessonProgress {
  return {
    lessonId,
    status: 'not_started',
    currentStepIndex: 0,
    stepResults: {},
    masteryScore: 0,
    startedAt: null,
    completedAt: null,
    lastAccessedAt: null,
  }
}
