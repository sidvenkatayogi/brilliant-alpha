// Single self-contained serverless function for the cohort backend, routed by
// an `action` field in the POST body:
//   assignCohort   — transactional cohort matching/creation
//   generateOutline — the AI facilitator outline + group quiz (OpenAI)
//   getAnswerKey   — release the quiz answer key, gated on meeting time
//
// Why one file with everything inlined (no relative imports): Vercel's bundler
// would not reliably resolve cross-file relative imports under this repo's ESM
// setup (ERR_MODULE_NOT_FOUND on /var/task/api/_lib/*). Importing only npm
// packages sidesteps that entirely. The pure helpers are still exported so the
// unit tests can import them. Keep in sync with the client copies in src/cohort/.

import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import OpenAI from 'openai'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuizQuestion {
  lessonId: string
  question: string
  options: string[]
}
export interface QuizAnswer {
  answerIndex: number
  explanation: string
}
export type FullQuizQuestion = QuizQuestion & QuizAnswer
export interface AiOutline {
  warmUp: string
  agenda: { title: string; minutes: number; facilitatorNote: string }[]
  discussionQuestions: { lessonId: string; question: string }[]
  quiz: QuizQuestion[]
  peerTeachingActivity: string
  wrapUp: string
}
export interface RawOutline extends Omit<AiOutline, 'quiz'> {
  quiz: FullQuizQuestion[]
}
export interface LessonMetaLite {
  id: string
  title: string
  conceptSummary: string
  realWorldHook: string
}

// ---------------------------------------------------------------------------
// HTTP error + Firebase Admin (init at module load) + auth
// ---------------------------------------------------------------------------

class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function ensureApp(): void {
  if (getApps().length) return
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-long-run' })
    return
  }
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) {
    throw new ApiError(
      500,
      'Server is missing Firebase Admin credentials (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY).',
    )
  }
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
}

// Lazy accessors — admin init runs only when a request handler actually needs
// Firestore/Auth, NOT at module load. This keeps the pure helpers below
// importable (e.g. by unit tests) without requiring service-account env vars.
function getDb() {
  ensureApp()
  return getFirestore()
}

async function requireUid(req: VercelRequest): Promise<string> {
  const header = req.headers.authorization
  const token =
    typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) throw new ApiError(401, 'Must be signed in.')
  ensureApp()
  try {
    const decoded = await getAuth().verifyIdToken(token)
    return decoded.uid
  } catch {
    throw new ApiError(401, 'Invalid or expired session.')
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

export function levelBand(totalLessonsCompleted: number): number {
  const n = Math.max(0, Math.floor(totalLessonsCompleted))
  if (n === 0) return 0
  if (n <= 2) return 1
  if (n <= 4) return 2
  return 3
}

const ADJECTIVES = [
  'Lucky', 'Likely', 'Bold', 'Curious', 'Steady', 'Random', 'Fair', 'Clever',
  'Rolling', 'Long-Run', 'Sure', 'Surprising',
]
const NOUNS = [
  'Priors', 'Outcomes', 'Trials', 'Samples', 'Events', 'Odds', 'Distributions',
  'Frequencies', 'Estimators', 'Gamblers', 'Bayesians', 'Variables',
]
function hash(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
export function cohortName(seed: string): string {
  const h = hash(seed)
  const adj = ADJECTIVES[h % ADJECTIVES.length]
  const noun = NOUNS[Math.floor(h / ADJECTIVES.length) % NOUNS.length]
  return `The ${adj} ${noun}`
}

export interface CohortCandidate {
  id: string
  memberUids: string[]
  maxSize: number
}
export function chooseExistingCohort(candidates: CohortCandidate[]): string | null {
  let bestId: string | null = null
  let bestCount = Number.POSITIVE_INFINITY
  for (const c of candidates) {
    if (c.memberUids.length < c.maxSize && c.memberUids.length < bestCount) {
      bestId = c.id
      bestCount = c.memberUids.length
    }
  }
  return bestId
}

export const LESSON_META: LessonMetaLite[] = [
  {
    id: 'long-run',
    title: 'Chance & the Long Run',
    conceptSummary:
      'Probability is long-run relative frequency: unpredictable one at a time, predictable in bulk.',
    realWorldHook:
      "An insurance company has no idea whether you'll crash your car this year — but across two million drivers, the crash rate barely moves.",
  },
  {
    id: 'combining-events',
    title: 'Combining Events',
    conceptSummary:
      'Independent chances multiply for AND; overlapping chances must avoid double-counting for OR.',
    realWorldHook:
      "A jet's three hydraulic systems each fail on 1 in 1,000 flights — yet all three failing at once is about 1 in a billion.",
  },
  {
    id: 'conditioning',
    title: 'Conditioning',
    conceptSummary:
      'Conditioning on B shrinks the world to B, then recounts how often A happens inside it.',
    realWorldHook:
      "Every spam filter and every 'customers who bought this also bought…' runs on conditioning — updating a probability once you know something.",
  },
  {
    id: 'bayes-base-rates',
    title: 'Bayes & Base Rates',
    conceptSummary:
      'With a rare condition, the few true positives are swamped by false positives from the huge healthy group.',
    realWorldHook:
      "A '99% accurate' test for a rare disease comes back positive. Most people — including many doctors — think you almost certainly have it. They're wrong, often badly.",
  },
  {
    id: 'expected-value',
    title: 'Expected Value & Why the House Wins',
    conceptSummary:
      'Expected value = Σ(outcome × probability). A negative-EV game can feel winnable and still drain you.',
    realWorldHook:
      'A roulette bet pays 35-to-1 and feels like a jackpot waiting to happen. Over time it bleeds you at a steady, mathematically guaranteed rate.',
  },
]
export const LESSON_META_BY_ID: Record<string, LessonMetaLite> = Object.fromEntries(
  LESSON_META.map((l) => [l.id, l]),
)

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
export function splitOutline(raw: RawOutline): { outline: AiOutline; answerKey: QuizAnswer[] } {
  const quiz = raw.quiz ?? []
  return {
    outline: {
      warmUp: raw.warmUp,
      agenda: raw.agenda,
      discussionQuestions: raw.discussionQuestions,
      quiz: quiz.map((q) => ({ lessonId: q.lessonId, question: q.question, options: q.options })),
      peerTeachingActivity: raw.peerTeachingActivity,
      wrapUp: raw.wrapUp,
    },
    answerKey: quiz.map((q) => ({ answerIndex: q.answerIndex, explanation: q.explanation })),
  }
}
const DISTRACTORS = [
  'Probability only applies to fair coins and dice, never to real life.',
  'Once an outcome is "due," it becomes more likely on the next try.',
  'A single sample tells you the true long-run rate exactly.',
  'Rare events can be ignored because they essentially never happen.',
  'Knowing extra information can never change a probability.',
]
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
  const completed = input.completed.length > 0 ? input.completed.map(fmt).join('\n') : '(none yet)'
  const inProgress = input.inProgress.length > 0 ? input.inProgress.map(fmt).join('\n') : '(none)'
  return `Cohort size: ${input.cohortSize} people.
Target meeting length: ${input.meetingMinutes} minutes.

Lessons the group has COLLECTIVELY COMPLETED (the shared, discussable ground):
${completed}

Lessons currently IN PROGRESS somewhere in the group:
${inProgress}

Produce the facilitator outline JSON now, including the quiz. Only reference lessons listed above.`
}
export async function generateOutline(
  input: OutlineInput,
  apiKey: string | undefined,
): Promise<{ outline: AiOutline; answerKey: QuizAnswer[]; usedFallback: boolean; model: string }> {
  if (!apiKey || process.env.OUTLINE_STUB === 'true' || !!process.env.FIRESTORE_EMULATOR_HOST) {
    const base = fallbackOutline(input.completed)
    const stub = { ...base, warmUp: `[stub outline · ${input.cohortSize} members] ${base.warmUp}` }
    const { outline, answerKey } = splitOutline(stub)
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
      if (!parsed.quiz || parsed.quiz.length === 0) parsed.quiz = generateQuiz(input.completed)
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

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const MAX_COHORT_SIZE = 6
const REGEN_COOLDOWN_MS = 3 * 60 * 1000

async function doAssignCohort(uid: string): Promise<{ cohortId: string }> {
  const db = getDb()
  const cohortId = await db.runTransaction(async (tx) => {
    const userRef = db.collection('users').doc(uid)
    const userSnap = await tx.get(userRef)
    if (!userSnap.exists) throw new ApiError(404, 'User doc missing.')
    const user = userSnap.data() as { cohortId?: string | null; totalLessonsCompleted?: number }
    if (user.cohortId) return user.cohortId

    const band = levelBand(user.totalLessonsCompleted ?? 0)
    const candidates = await tx.get(db.collection('cohorts').where('levelBand', '==', band))
    const byId = new Map(candidates.docs.map((d) => [d.id, d.ref]))
    const candidateData: CohortCandidate[] = candidates.docs.map((d) => ({
      id: d.id,
      memberUids: d.get('memberUids') ?? [],
      maxSize: d.get('maxSize') ?? MAX_COHORT_SIZE,
    }))
    const chosenId = chooseExistingCohort(candidateData)
    if (chosenId) {
      tx.update(byId.get(chosenId)!, { memberUids: FieldValue.arrayUnion(uid) })
      tx.update(userRef, { cohortId: chosenId })
      return chosenId
    }
    const newRef = db.collection('cohorts').doc()
    tx.set(newRef, {
      name: cohortName(newRef.id),
      levelBand: band,
      memberUids: [uid],
      maxSize: MAX_COHORT_SIZE,
      createdAt: FieldValue.serverTimestamp(),
    })
    tx.update(userRef, { cohortId: newRef.id })
    return newRef.id
  })
  return { cohortId }
}

interface MemberProjection {
  lessonsCompleted?: string[]
  lessonsStarted?: string[]
}

async function doGenerateOutline(
  uid: string,
  body: { cohortId?: string; weekId?: string; force?: boolean },
): Promise<{ outline: AiOutline; cached: boolean }> {
  const { cohortId, weekId, force } = body
  if (!cohortId || !weekId) throw new ApiError(400, 'cohortId and weekId are required.')

  const db = getDb()
  const cohortSnap = await db.collection('cohorts').doc(cohortId).get()
  if (!cohortSnap.exists) throw new ApiError(404, 'Cohort not found.')
  const memberUids: string[] = cohortSnap.get('memberUids') ?? []
  if (!memberUids.includes(uid)) throw new ApiError(403, 'Not a member of this cohort.')

  const meetingRef = db.collection('cohorts').doc(cohortId).collection('meetings').doc(weekId)
  const meetingSnap = await meetingRef.get()

  const existing = meetingSnap.get('aiOutline') as AiOutline | undefined
  const meta = meetingSnap.get('aiOutlineMeta') as { generatedAt?: number } | undefined
  if (existing && !force) return { outline: existing, cached: true }
  if (existing && force && meta?.generatedAt) {
    const elapsed = Date.now() - meta.generatedAt
    if (elapsed < REGEN_COOLDOWN_MS) {
      throw new ApiError(
        429,
        `Please wait before regenerating (cooldown ${Math.ceil((REGEN_COOLDOWN_MS - elapsed) / 1000)}s).`,
      )
    }
  }

  const projSnap = await db.collection('cohorts').doc(cohortId).collection('memberProgress').get()
  const completedIds = new Set<string>()
  const startedIds = new Set<string>()
  for (const d of projSnap.docs) {
    const p = d.data() as MemberProjection
    for (const id of p.lessonsCompleted ?? []) completedIds.add(id)
    for (const id of p.lessonsStarted ?? []) startedIds.add(id)
  }
  const toMeta = (ids: Set<string>): LessonMetaLite[] =>
    [...ids].map((id) => LESSON_META_BY_ID[id]).filter((m): m is LessonMetaLite => !!m)
  const completed = toMeta(completedIds)
  const inProgress = toMeta(new Set([...startedIds].filter((id) => !completedIds.has(id))))

  const apiKey = process.env.OPENAI_API_KEY || undefined
  const { outline, answerKey, usedFallback, model } = await generateOutline(
    { cohortSize: memberUids.length, completed, inProgress, meetingMinutes: 45 },
    apiKey,
  )
  const aiOutlineMeta = {
    generatedAt: Date.now(),
    model: usedFallback ? `${model} (fallback)` : model,
    byUid: uid,
  }
  await meetingRef.set({ aiOutline: outline, aiOutlineMeta }, { merge: true })
  await meetingRef.collection('private').doc('answerKey').set({ answers: answerKey, generatedAt: Date.now() })
  return { outline, cached: false }
}

async function doGetAnswerKey(
  uid: string,
  body: { cohortId?: string; weekId?: string },
): Promise<{ answers: QuizAnswer[] }> {
  const { cohortId, weekId } = body
  if (!cohortId || !weekId) throw new ApiError(400, 'cohortId and weekId are required.')

  const db = getDb()
  const cohortSnap = await db.collection('cohorts').doc(cohortId).get()
  if (!cohortSnap.exists) throw new ApiError(404, 'Cohort not found.')
  const memberUids: string[] = cohortSnap.get('memberUids') ?? []
  if (!memberUids.includes(uid)) throw new ApiError(403, 'Not a member of this cohort.')

  const meetingRef = db.collection('cohorts').doc(cohortId).collection('meetings').doc(weekId)
  const meetingSnap = await meetingRef.get()
  const finalized = meetingSnap.get('finalizedSlotStart') as number | null | undefined
  if (finalized == null) {
    throw new ApiError(412, 'Confirm a meeting time first — answers unlock once the meeting starts.')
  }
  if (Date.now() < finalized) throw new ApiError(412, 'The answer key unlocks at the meeting time.')

  const keySnap = await meetingRef.collection('private').doc('answerKey').get()
  if (!keySnap.exists) throw new ApiError(404, 'No quiz yet — generate the outline first.')
  return { answers: (keySnap.get('answers') ?? []) as QuizAnswer[] }
}

// ---------------------------------------------------------------------------
// Handler — POST /api/cohort with { action, ... }
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }
  try {
    const uid = await requireUid(req)
    const body = (req.body ?? {}) as { action?: string } & Record<string, unknown>
    let result: unknown
    switch (body.action) {
      case 'assignCohort':
        result = await doAssignCohort(uid)
        break
      case 'generateOutline':
        result = await doGenerateOutline(uid, body as { cohortId?: string; weekId?: string; force?: boolean })
        break
      case 'getAnswerKey':
        result = await doGetAnswerKey(uid, body as { cohortId?: string; weekId?: string })
        break
      default:
        throw new ApiError(400, `Unknown action: ${body.action ?? '(none)'}`)
    }
    res.status(200).json(result)
  } catch (e) {
    if (e instanceof ApiError) res.status(e.status).json({ error: e.message })
    else {
      console.error('API error', e)
      res.status(500).json({ error: e instanceof Error ? e.message : 'Server error.' })
    }
  }
}
