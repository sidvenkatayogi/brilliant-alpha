// DUPLICATE of src/cohort/outline.ts (parse/fallback) — keep in sync.

import type { AiOutline, LessonMetaLite } from './types'

function stripFences(raw: string): string {
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1)
  return s
}

function isOutline(v: unknown): v is AiOutline {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
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
  )
}

export function parseOutline(raw: string): AiOutline | null {
  try {
    const parsed = JSON.parse(stripFences(raw))
    return isOutline(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function fallbackOutline(completedLessons: LessonMetaLite[]): AiOutline {
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
        minutes: 25,
        facilitatorNote: 'Work through the discussion questions below. Let whoever feels most confident on a lesson kick it off.',
      },
      { title: 'Peer-teaching round', minutes: 10, facilitatorNote: 'Each person explains one idea to the group in their own words.' },
      { title: 'Wrap-up & next week', minutes: 5, facilitatorNote: 'Agree on which lesson(s) to reach before next meeting.' },
    ],
    discussionQuestions:
      lessons.length > 0
        ? lessons.map((l) => ({
            lessonId: l.id,
            question: `In "${l.title}", ${l.conceptSummary} — where have you seen this play out, and where does your gut still disagree with it?`,
          }))
        : [{ lessonId: '', question: 'What is the most surprising thing probability has taught you so far?' }],
    peerTeachingActivity:
      first != null
        ? `Pick one person to explain "${first.title}" to the group as if to a friend who never took stats — no formulas, just the intuition.`
        : 'Pick one person to explain the idea of "long-run frequency" to the group in plain words.',
    wrapUp: 'Close by each naming one thing you understand better now, and agree on the next lesson to tackle before you meet again.',
  }
}
