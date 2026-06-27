// The one AI feature: generate a facilitator outline (plus a short group quiz)
// for a peer book-club call, using the OpenAI API.
// Hard boundary (PRD2 §6.4): the model does NOT teach probability or grade
// anyone. It structures a human discussion of already-learned material and
// writes a handful of recall questions grounded in the lessons the group did.

import OpenAI from 'openai'
import type { AiOutline, LessonMetaLite, QuizAnswer } from './types'
import { fallbackOutline, generateQuiz, parseOutline, splitOutline } from './outline'

// One-line swap for cost/quality. gpt-4o-mini = cheap + JSON mode; gpt-4o richer.
export const OUTLINE_MODEL = 'gpt-4o-mini'

const SYSTEM_PROMPT = `You are a warm, encouraging facilitator for a peer study group — a "book club" working through an interactive probability & statistics course together. Everyone in the group is a peer; there is no teacher in the room, so you play the role of the facilitator who gives the meeting structure.

Hard rules:
- Do NOT teach or explain the probability concepts yourself in the agenda. The course already does that. Your job is to structure a discussion among people who have already learned the material.
- Ground every agenda item, discussion question, and quiz question in the SPECIFIC lessons the group has completed. Never reference a lesson that is not listed.
- The quiz is a light, friendly recall check the group takes together — not a graded exam. Write exactly 5 multiple-choice questions (or one per completed lesson if fewer than 5 were completed), each with 4 options, exactly one correct, and a one-sentence explanation.
- Keep it friendly and low-pressure. This is presence and momentum, not a competition.

Return ONLY a single JSON object (no prose, no markdown code fences) with exactly this shape:
{
  "warmUp": string,
  "agenda": [{ "title": string, "minutes": number, "facilitatorNote": string }],
  "discussionQuestions": [{ "lessonId": string, "question": string }],
  "quiz": [{ "lessonId": string, "question": string, "options": [string, string, string, string], "answerIndex": number, "explanation": string }],
  "peerTeachingActivity": string,
  "wrapUp": string
}
"answerIndex" is the 0-based index into that question's "options" array of the correct choice.`

interface OutlineInput {
  cohortSize: number
  completed: LessonMetaLite[]
  inProgress: LessonMetaLite[]
  meetingMinutes: number
}

export function buildUserPrompt(input: OutlineInput): string {
  const fmt = (l: LessonMetaLite) =>
    `- ${l.id} — "${l.title}": ${l.conceptSummary} (real-world hook: ${l.realWorldHook})`
  const completed =
    input.completed.length > 0 ? input.completed.map(fmt).join('\n') : '(none yet)'
  const inProgress =
    input.inProgress.length > 0 ? input.inProgress.map(fmt).join('\n') : '(none)'
  return `Cohort size: ${input.cohortSize} people.
Target meeting length: ${input.meetingMinutes} minutes.

Lessons the group has COLLECTIVELY COMPLETED (the shared, discussable ground):
${completed}

Lessons currently IN PROGRESS somewhere in the group:
${inProgress}

Produce the facilitator outline JSON now, including the quiz. Only reference lessons listed above.`
}

/**
 * Generate an outline + its hidden answer key. Returns a validated AiOutline and
 * the matching QuizAnswer[] for the questions. Falls back to a static authored
 * template on any API error or parse failure so the group is never blocked.
 */
export async function generateOutline(
  input: OutlineInput,
  apiKey: string | undefined,
): Promise<{ outline: AiOutline; answerKey: QuizAnswer[]; usedFallback: boolean; model: string }> {
  // No-key / local-emulator / explicit-stub path: deterministic stub so tests
  // and local runs never hit the real API.
  if (!apiKey || process.env.OUTLINE_STUB === 'true' || !!process.env.FIRESTORE_EMULATOR_HOST) {
    const { outline, answerKey } = splitOutline(stubOutline(input))
    return { outline, answerKey, usedFallback: false, model: 'stub' }
  }

  try {
    const client = new OpenAI({ apiKey })
    const response = await client.chat.completions.create({
      model: OUTLINE_MODEL,
      max_tokens: 2000,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(input) },
      ],
    })
    const text = response.choices[0]?.message?.content ?? ''
    const parsed = parseOutline(text)
    if (parsed) {
      // The model occasionally omits the quiz; backfill an authored one so the
      // group always gets recall questions.
      if (!parsed.quiz || parsed.quiz.length === 0) {
        parsed.quiz = generateQuiz(input.completed)
      }
      const { outline, answerKey } = splitOutline(parsed)
      return { outline, answerKey, usedFallback: false, model: OUTLINE_MODEL }
    }
    const { outline, answerKey } = splitOutline(fallbackOutline(input.completed))
    return { outline, answerKey, usedFallback: true, model: OUTLINE_MODEL }
  } catch {
    const { outline, answerKey } = splitOutline(fallbackOutline(input.completed))
    return { outline, answerKey, usedFallback: true, model: OUTLINE_MODEL }
  }
}

/** A deterministic, clearly-labelled stub used locally and in tests. */
function stubOutline(input: OutlineInput) {
  const base = fallbackOutline(input.completed)
  return {
    ...base,
    warmUp: `[stub outline · ${input.cohortSize} members] ${base.warmUp}`,
  }
}
