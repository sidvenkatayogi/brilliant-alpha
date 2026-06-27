// Slim shared types for the functions package. Mirrors the client's
// src/cohort/types.ts for the bits the backend touches.

/** A single multiple-choice quiz question as shown to learners (no answer). */
export interface QuizQuestion {
  lessonId: string
  question: string
  options: string[]
}

/** The hidden answer for one quiz question — stored server-side only. */
export interface QuizAnswer {
  /** Index into the question's `options` array. */
  answerIndex: number
  explanation: string
}

/** A quiz question with its answer baked in — the model/fallback output shape. */
export type FullQuizQuestion = QuizQuestion & QuizAnswer

export interface AiOutline {
  warmUp: string
  agenda: { title: string; minutes: number; facilitatorNote: string }[]
  discussionQuestions: { lessonId: string; question: string }[]
  /** ~5 multiple-choice questions everyone takes; answers live elsewhere. */
  quiz: QuizQuestion[]
  peerTeachingActivity: string
  wrapUp: string
}

/**
 * The model/fallback output before we split it into the public outline and the
 * private answer key. Identical to AiOutline except the quiz carries answers.
 */
export interface RawOutline extends Omit<AiOutline, 'quiz'> {
  quiz: FullQuizQuestion[]
}

export interface LessonMetaLite {
  id: string
  title: string
  conceptSummary: string
  realWorldHook: string
}
