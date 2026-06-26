// The one AI feature: generate a facilitator outline for a peer book-club call.
// Hard boundary (PRD2 §6.4): the model does NOT teach probability, generate
// lesson content, write hints, or grade anyone. It only structures a human
// discussion of already-authored, already-learned material.

import Anthropic from '@anthropic-ai/sdk'
import type { AiOutline, LessonMetaLite } from './shared/types'
import { fallbackOutline, parseOutline } from './shared/outline'

// One-line swap for cost/quality (PRD2 D8). haiku = cheaper, opus = richer.
export const OUTLINE_MODEL = 'claude-sonnet-4-6'

const SYSTEM_PROMPT = `You are a warm, encouraging facilitator for a peer study group — a "book club" working through an interactive probability & statistics course together. Everyone in the group is a peer; there is no teacher in the room, so you play the role of the facilitator who gives the meeting structure.

Hard rules:
- Do NOT teach or explain the probability concepts yourself. The course already does that. Your job is to structure a discussion among people who have already learned the material.
- Do NOT generate new lesson content, hints, quiz questions with answers, or grade anyone.
- Ground every agenda item and question in the specific lessons the group has completed.
- Keep it friendly and low-pressure. This is presence and momentum, not a competition.

Return ONLY a single JSON object (no prose, no markdown code fences) with exactly this shape:
{
  "warmUp": string,
  "agenda": [{ "title": string, "minutes": number, "facilitatorNote": string }],
  "discussionQuestions": [{ "lessonId": string, "question": string }],
  "peerTeachingActivity": string,
  "wrapUp": string
}`

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

Produce the facilitator outline JSON now. Only reference lessons listed above.`
}

/**
 * Generate an outline. Returns a validated AiOutline. Falls back to a static
 * authored template on any API error or parse failure so the group is never
 * blocked. Returns whether the fallback was used so the caller can record meta.
 */
export async function generateOutline(
  input: OutlineInput,
  apiKey: string | undefined,
): Promise<{ outline: AiOutline; usedFallback: boolean; model: string }> {
  // Emulator / no-secret path: deterministic stub so tests + local runs never
  // hit the real API (PRD2 §13 — CI never calls Anthropic).
  if (!apiKey || process.env.FUNCTIONS_EMULATOR === 'true' || process.env.OUTLINE_STUB === 'true') {
    return { outline: stubOutline(input), usedFallback: false, model: 'stub' }
  }

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: OUTLINE_MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
    })
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    const parsed = parseOutline(text)
    if (parsed) return { outline: parsed, usedFallback: false, model: OUTLINE_MODEL }
    return { outline: fallbackOutline(input.completed), usedFallback: true, model: OUTLINE_MODEL }
  } catch {
    return { outline: fallbackOutline(input.completed), usedFallback: true, model: OUTLINE_MODEL }
  }
}

/** A deterministic, clearly-labelled stub used under the emulator and in tests. */
function stubOutline(input: OutlineInput): AiOutline {
  const base = fallbackOutline(input.completed)
  return {
    ...base,
    warmUp: `[stub outline · ${input.cohortSize} members] ${base.warmUp}`,
  }
}
