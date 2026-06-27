// Defensive parse + static fallback for the AI meeting outline, plus the quiz
// helpers. The MODEL/fallback emit a RawOutline whose quiz items include the
// answer; `splitOutline` separates the public outline (questions only) from the
// private answer key. Mirror of the client copy in src/cohort/outline.ts.

import type {
  AiOutline,
  FullQuizQuestion,
  LessonMetaLite,
  QuizAnswer,
  RawOutline,
} from './types.js'

function stripFences(raw: string): string {
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1)
  return s
}

function isFullQuizQuestion(v: unknown): v is FullQuizQuestion {
  if (!v || typeof v !== 'object') return false
  const q = v as Record<string, unknown>
  return (
    typeof q.lessonId === 'string' &&
    typeof q.question === 'string' &&
    Array.isArray(q.options) &&
    q.options.length >= 2 &&
    q.options.every((o) => typeof o === 'string') &&
    typeof q.answerIndex === 'number' &&
    q.answerIndex >= 0 &&
    q.answerIndex < q.options.length &&
    typeof q.explanation === 'string'
  )
}

// Validates the base outline fields. The quiz is OPTIONAL here (kept
// backward-compatible with outlines generated before the quiz existed), but if
// present every item must be a well-formed question-with-answer.
function isRawOutline(v: unknown): v is RawOutline {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  const baseOk =
    typeof o.warmUp === 'string' &&
    Array.isArray(o.agenda) &&
    o.agenda.every(
      (a) =>
        a &&
        typeof a === 'object' &&
        typeof (a as Record<string, unknown>).title === 'string' &&
        typeof (a as Record<string, unknown>).minutes === 'number' &&
        typeof (a as Record<string, unknown>).facilitatorNote === 'string',
    ) &&
    Array.isArray(o.discussionQuestions) &&
    o.discussionQuestions.every(
      (q) =>
        q &&
        typeof q === 'object' &&
        typeof (q as Record<string, unknown>).lessonId === 'string' &&
        typeof (q as Record<string, unknown>).question === 'string',
    ) &&
    typeof o.peerTeachingActivity === 'string' &&
    typeof o.wrapUp === 'string'
  if (!baseOk) return false
  if (o.quiz === undefined) return true
  return Array.isArray(o.quiz) && o.quiz.every(isFullQuizQuestion)
}

export function parseOutline(raw: string): RawOutline | null {
  try {
    const parsed = JSON.parse(stripFences(raw))
    return isRawOutline(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Split a RawOutline (quiz-with-answers) into the publicly-storable outline
 * (questions only) and the private answer key. Tolerates a missing quiz.
 */
export function splitOutline(raw: RawOutline): {
  outline: AiOutline
  answerKey: QuizAnswer[]
} {
  const quiz = raw.quiz ?? []
  return {
    outline: {
      warmUp: raw.warmUp,
      agenda: raw.agenda,
      discussionQuestions: raw.discussionQuestions,
      quiz: quiz.map((q) => ({
        lessonId: q.lessonId,
        question: q.question,
        options: q.options,
      })),
      peerTeachingActivity: raw.peerTeachingActivity,
      wrapUp: raw.wrapUp,
    },
    answerKey: quiz.map((q) => ({ answerIndex: q.answerIndex, explanation: q.explanation })),
  }
}

// Plausible-but-wrong statements used as distractors in the authored fallback
// quiz so each question still has real choices when the model is unavailable.
const DISTRACTORS = [
  'Probability only applies to fair coins and dice, never to real life.',
  'Once an outcome is "due," it becomes more likely on the next try.',
  'A single sample tells you the true long-run rate exactly.',
  'Rare events can be ignored because they essentially never happen.',
  'Knowing extra information can never change a probability.',
]

/**
 * A deterministic authored quiz built from the completed lessons, so the group
 * always has ~5 questions even when the AI is unavailable. Each correct option
 * is the lesson's own concept summary; the answer position rotates by index.
 */
export function generateQuiz(completed: LessonMetaLite[]): FullQuizQuestion[] {
  const lessons = completed.slice(0, 5)
  if (lessons.length === 0) {
    return [
      {
        lessonId: '',
        question: 'In one sentence, what does a probability describe?',
        options: [
          'An outcome that is unpredictable one at a time but stable in the long run',
          'A guarantee about what happens on the very next try',
          'Something decided purely by luck with no underlying pattern',
          'A value that only ever equals 50/50',
        ],
        answerIndex: 0,
        explanation:
          'Probability is long-run relative frequency: unpredictable individually, predictable in bulk.',
      },
    ]
  }
  return lessons.map((l, i) => {
    const correct = l.conceptSummary
    const distractors = [
      DISTRACTORS[i % DISTRACTORS.length],
      DISTRACTORS[(i + 1) % DISTRACTORS.length],
      DISTRACTORS[(i + 2) % DISTRACTORS.length],
    ]
    const answerIndex = i % 4
    const options = [...distractors]
    options.splice(answerIndex, 0, correct)
    return {
      lessonId: l.id,
      question: `Which statement best captures the core idea of "${l.title}"?`,
      options,
      answerIndex,
      explanation: `"${l.title}": ${l.conceptSummary} (e.g. ${l.realWorldHook})`,
    }
  })
}

/** A static authored outline so the group is never stuck on AI failure. */
export function fallbackOutline(completedLessons: LessonMetaLite[]): RawOutline {
  const lessons = completedLessons.length > 0 ? completedLessons : []
  const first = lessons[0]
  return {
    warmUp:
      first != null
        ? `Go around the group: share one moment from real life where "${first.realWorldHook.split('.')[0]}." felt true (or fooled you).`
        : 'Go around the group: what made each of you want to think more clearly about probability?',
    agenda: [
      { title: 'Warm-up & check-in', minutes: 5, facilitatorNote: 'Quick round; let everyone say where they are in the course.' },
      {
        title: lessons.length > 0 ? `Discuss: ${lessons.map((l) => l.title).join(', ')}` : 'Discuss what you have learned so far',
        minutes: 20,
        facilitatorNote: 'Work through the discussion questions below. Let whoever feels most confident on a lesson kick it off.',
      },
      { title: 'Take the group quiz together', minutes: 10, facilitatorNote: 'Everyone answers the quiz; reveal the answer key and talk through any disagreements.' },
      { title: 'Peer-teaching round', minutes: 5, facilitatorNote: 'Each person explains one idea to the group in their own words.' },
      { title: 'Wrap-up & next week', minutes: 5, facilitatorNote: 'Agree on which lesson(s) to reach before next meeting.' },
    ],
    discussionQuestions:
      lessons.length > 0
        ? lessons.map((l) => ({
            lessonId: l.id,
            question: `In "${l.title}", ${l.conceptSummary} — where have you seen this play out, and where does your gut still disagree with it?`,
          }))
        : [{ lessonId: '', question: 'What is the most surprising thing probability has taught you so far?' }],
    quiz: generateQuiz(lessons),
    peerTeachingActivity:
      first != null
        ? `Pick one person to explain "${first.title}" to the group as if to a friend who never took stats — no formulas, just the intuition.`
        : 'Pick one person to explain the idea of "long-run frequency" to the group in plain words.',
    wrapUp: 'Close by each naming one thing you understand better now, and agree on the next lesson to tackle before you meet again.',
  }
}
