// Slim shared types for the functions package. Mirrors the client's
// src/cohort/types.ts for the bits the backend touches.

export interface AiOutline {
  warmUp: string
  agenda: { title: string; minutes: number; facilitatorNote: string }[]
  discussionQuestions: { lessonId: string; question: string }[]
  peerTeachingActivity: string
  wrapUp: string
}

export interface LessonMetaLite {
  id: string
  title: string
  conceptSummary: string
  realWorldHook: string
}
