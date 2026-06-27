// Phase 2 social layer. Cohorts, weekly meetings, availability polls, and the
// AI-generated facilitator outline. The peer-visible projection
// (`MemberProgress`) is deliberately thin: it is the ONLY thing peers can read
// about each other, so it carries nothing sensitive — no step results, attempts,
// mastery, or streaks.

/** Group metadata. Written only by the `assignCohort` Cloud Function. */
export interface Cohort {
  id: string
  name: string
  /** Coarse level derived from totalLessonsCompleted (see levelBand). */
  levelBand: number
  memberUids: string[]
  maxSize: number
  /** ms epoch. */
  createdAt: number
}

/**
 * The peer-visible projection of a learner's progress. Self-written alongside
 * the private progress write. Contains lesson-level started/completed ONLY.
 */
export interface MemberProgress {
  uid: string
  displayName: string
  lessonsStarted: string[]
  lessonsCompleted: string[]
  /** For "on Lesson N" display. */
  currentLessonId: string | null
  /** ms epoch. */
  updatedAt: number
}

/** Config for generating the candidate availability slots of a meeting. */
export interface SlotConfig {
  /** Always 'UTC' — slots are absolute instants, rendered in each viewer's tz. */
  tz: 'UTC'
  blockMinutes: number
  /** ISO date strings (YYYY-MM-DD) for the days in the poll window. */
  days: string[]
  /** Local-day hour bounds used to lay out the grid rows. */
  startHour: number
  endHour: number
}

/** A single multiple-choice quiz question as shown to learners (no answer). */
export interface QuizQuestion {
  lessonId: string
  question: string
  options: string[]
}

/**
 * The hidden answer for one quiz question. Never stored on the readable meeting
 * doc — it lives in a Cloud-Function-only subdoc and is handed to the client by
 * the `getQuizAnswerKey` callable, but only once the meeting time has arrived.
 */
export interface QuizAnswer {
  /** Index into the question's `options` array. */
  answerIndex: number
  explanation: string
}

/** A quiz question with its answer baked in — the model/fallback output shape. */
export type FullQuizQuestion = QuizQuestion & QuizAnswer

/** The structured AI facilitator outline (PRD2 §6.4). */
export interface AiOutline {
  warmUp: string
  agenda: { title: string; minutes: number; facilitatorNote: string }[]
  discussionQuestions: { lessonId: string; question: string }[]
  /** ~5 multiple-choice questions everyone takes before/at the meeting. */
  quiz: QuizQuestion[]
  peerTeachingActivity: string
  wrapUp: string
}

/** The model/fallback output before splitting into public outline + answer key. */
export interface RawOutline extends Omit<AiOutline, 'quiz'> {
  quiz: FullQuizQuestion[]
}

export interface AiOutlineMeta {
  /** ms epoch. */
  generatedAt: number
  model: string
  byUid: string
}

// scheduling → one or more times are proposed (proposed) → a proposal everyone
// approves locks the meeting (scheduled).
export type MeetingStatus = 'scheduling' | 'proposed' | 'scheduled'

/** A candidate meeting time anyone in the cohort has put forward. */
export interface MeetingProposal {
  /** UTC ms epoch — also the stable id (a time is only proposed once). */
  slotStart: number
  /** uid of whoever proposed it (auto-approves their own proposal). */
  proposedBy: string
  /** uids who have approved this time. */
  approvals: string[]
}

/** One meeting poll per ISO week; doc id is the weekId (race-safe create). */
export interface Meeting {
  weekId: string
  status: MeetingStatus
  slotConfig: SlotConfig
  /** Every time anyone has proposed — kept so the group can view/approve them all. */
  proposals: MeetingProposal[]
  /** UTC ms epoch once a proposal is approved by everyone and the time is locked. */
  finalizedSlotStart: number | null
  meetingLink: string | null
  confirmedBy: string | null
  aiOutline: AiOutline | null
  aiOutlineMeta: AiOutlineMeta | null
  /** ms epoch. */
  createdAt: number
}

/** A single member's availability picks for a meeting (separate doc per member). */
export interface Availability {
  uid: string
  displayName: string
  /** UTC ms-epoch slot starts the member is free. */
  slots: number[]
  /** ms epoch. */
  updatedAt: number
}
