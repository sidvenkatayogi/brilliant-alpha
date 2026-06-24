import type { Lesson } from './types'
import longRun from './lessons/01-long-run.json'
import combining from './lessons/02-combining-events.json'
import conditioning from './lessons/03-conditioning.json'
import bayes from './lessons/04-bayes-base-rates.json'
import expectedValue from './lessons/05-expected-value.json'

// Lesson content ships as versioned JSON in the repo and is loaded at runtime.
// Importing the JSON statically lets Vite bundle it (first interaction < 2s).
const rawLessons = [longRun, combining, conditioning, bayes, expectedValue]

export const lessons: Lesson[] = (rawLessons as Lesson[])
  .slice()
  .sort((a, b) => a.order - b.order)

export const lessonsById: Record<string, Lesson> = Object.fromEntries(
  lessons.map((lesson) => [lesson.id, lesson]),
)

export function getLesson(id: string): Lesson | undefined {
  return lessonsById[id]
}
