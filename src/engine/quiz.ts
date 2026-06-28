/**
 * quiz.ts — Pure quiz-engine helpers for the in-app Practice Quiz feature.
 * No I/O, no network, no side effects. All randomness goes through `rng` so
 * a seeded function makes output fully deterministic (useful in tests).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuizLessonMeta {
  id: string
  title: string
  conceptSummary: string
  realWorldHook: string
}

export interface QuizQuestion {
  lessonId: string
  prompt: string           // 'Which statement best captures the core idea of "<title>"?'
  options: string[]        // exactly 4, all distinct, shuffled each generation
  correctIndex: number     // 0–3, index of conceptSummary option
  explanation: string      // conceptSummary (+ realWorldHook) for the reveal
}

export interface QuizResult {
  score: number            // # correct
  total: number            // === questions.length
  perLesson: Array<{ lessonId: string; correct: boolean }>
}

// ---------------------------------------------------------------------------
// Distractor bank (verbatim from contracts/api.md)
// ---------------------------------------------------------------------------

const DISTRACTORS: readonly string[] = [
  'Probability only applies to fair coins and dice, never to real life.',
  'Once an outcome is "due," it becomes more likely on the next try.',
  'A single sample tells you the true long-run rate exactly.',
  'Rare events can be ignored because they essentially never happen.',
  'Knowing extra information can never change a probability.',
]

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Fisher-Yates shuffle in-place using the provided rng. Returns the array. */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate up to `count` quiz questions sampled from `completed` lessons.
 *
 * - Returns [] when `completed` is empty.
 * - Shuffles `completed` via `rng`, takes the first `count` entries.
 * - For each lesson: correct option = conceptSummary; picks 3 DISTINCT
 *   distractors from DISTRACTORS (skipping any that equal conceptSummary).
 *   If fewer than 3 distinct distractors are available for a lesson, that
 *   lesson is skipped (returned array may be shorter than count).
 * - All 4 options are shuffled via `rng` before being returned.
 * - Every returned question is guaranteed to have exactly 4 distinct options.
 * - Only `rng` is used for randomness (no internal Math.random calls).
 */
export function generateMixedQuiz(
  completed: QuizLessonMeta[],
  count = 5,
  rng: () => number = Math.random,
): QuizQuestion[] {
  if (completed.length === 0) return []

  // Shuffle a copy and take up to `count`
  const pool = shuffle([...completed], rng).slice(0, count)

  const questions: QuizQuestion[] = []

  for (const lesson of pool) {
    const correct = lesson.conceptSummary

    // Collect distractors that are distinct from the correct answer
    const available = DISTRACTORS.filter((d) => d !== correct)

    if (available.length < 3) {
      // Can't build 3 distinct distractors — skip this lesson
      continue
    }

    // Pick exactly 3 distractors (shuffle available pool, take first 3)
    const pickedDistractors = shuffle([...available], rng).slice(0, 3)

    // Build 4-option array and track correct index after shuffle
    const optionsWithMeta: Array<{ text: string; isCorrect: boolean }> = [
      { text: correct, isCorrect: true },
      ...pickedDistractors.map((d) => ({ text: d, isCorrect: false })),
    ]

    shuffle(optionsWithMeta, rng)

    const options = optionsWithMeta.map((o) => o.text)
    const correctIndex = optionsWithMeta.findIndex((o) => o.isCorrect)

    const explanation = `${lesson.conceptSummary} (e.g. ${lesson.realWorldHook})`

    questions.push({
      lessonId: lesson.id,
      prompt: `Which statement best captures the core idea of "${lesson.title}"?`,
      options,
      correctIndex,
      explanation,
    })
  }

  return questions
}

/**
 * Score a completed quiz. `picks` must be parallel to `questions`.
 * A null, undefined, or out-of-range pick is counted as wrong.
 */
export function scoreQuiz(
  questions: QuizQuestion[],
  picks: (number | null)[],
): QuizResult {
  let score = 0
  const perLesson: Array<{ lessonId: string; correct: boolean }> = []

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const pick = picks[i] ?? null
    const correct =
      pick !== null &&
      Number.isInteger(pick) &&
      pick >= 0 &&
      pick < q.options.length &&
      pick === q.correctIndex

    if (correct) score++
    perLesson.push({ lessonId: q.lessonId, correct })
  }

  return { score, total: questions.length, perLesson }
}

/**
 * Nudge mastery upward on a correct answer. Monotonic non-decreasing, capped at 1.0.
 * A wrong answer leaves mastery unchanged.
 */
export function nextMasteryAfterQuiz(current: number, correct: boolean): number {
  return correct ? Math.min(1, current + 0.05) : current
}
