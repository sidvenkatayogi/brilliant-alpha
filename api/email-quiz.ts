// Vercel serverless function: POST /api/email-quiz
// Invoked by Vercel Cron (0 7 * * * UTC) or manually by an operator.
// Auth: Authorization: Bearer <CRON_SECRET> (no learner token).
//
// Why one file with everything inlined (no relative imports): Vercel's bundler
// would not reliably resolve cross-file relative imports under this repo's ESM
// setup. Importing only npm packages sidesteps that entirely.

import { createHmac } from 'crypto'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import OpenAI from 'openai'
import { Resend } from 'resend'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LessonMetaLite {
  id: string
  title: string
  conceptSummary: string
  masteryScore?: number   // only on weak topics
}

// New internal type — kept in sync with api/cohort.ts AuthoritativeLesson shape
export interface AuthoritativeLesson {
  id: string
  title: string
  conceptSummary: string
  realWorldHook: string
}

export interface EmailQuizInput {
  uid: string
  weakTopics: LessonMetaLite[]
  completedTopics: LessonMetaLite[]
  hasAnyProgress: boolean
}

export interface EmailQuizQuestion {
  question: string
  options: [string, string, string, string]
  answerIndex: number
  explanation: string
  topicId: string
}

export interface EmailQuizResult {
  questions: EmailQuizQuestion[]
  quizTopic: string
  model: string
}

// ---------------------------------------------------------------------------
// HTTP error + Firebase Admin lazy init
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

function getDb() {
  ensureApp()
  return getFirestore()
}

// ---------------------------------------------------------------------------
// Inlined constants — kept in sync with api/cohort.ts
// ---------------------------------------------------------------------------

// DISTRACTORS — copy verbatim from api/cohort.ts
const DISTRACTORS = [
  'Probability only applies to fair coins and dice, never to real life.',
  'Once an outcome is "due," it becomes more likely on the next try.',
  'A single sample tells you the true long-run rate exactly.',
  'Rare events can be ignored because they essentially never happen.',
  'Knowing extra information can never change a probability.',
]

// STOPWORDS — copy verbatim from api/cohort.ts
const STOPWORDS = new Set([
  'a','an','the','is','are','was','were','be','in','on','at','to',
  'of','and','or','but','it','its','this','that','for','with','by','as','not','can',
  'never','once','only','you','your','i','we','they','one','two','three','all','any','no'
])

// normalize — copy verbatim from api/cohort.ts
function normalize(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\-\s]/g, ' ').split(/\s+/)
      .filter(t => t.length > 0 && !STOPWORDS.has(t)),
  )
}

// sim — copy verbatim from api/cohort.ts (overlap coefficient)
function sim(a: string, b: string): number {
  const A = normalize(a), B = normalize(b)
  const minSize = Math.min(A.size, B.size)
  if (minSize === 0) return 0
  let overlap = 0
  for (const t of A) if (B.has(t)) overlap++
  return overlap / minSize
}

// CONCEPT_MIN, TIE_MARGIN — copy verbatim from api/cohort.ts
export const CONCEPT_MIN = 0.25
export const TIE_MARGIN  = 0.15

// AUTH_LESSON_META — authoritative 5-lesson metadata (incl. realWorldHook); kept in sync with api/cohort.ts
export const AUTH_LESSON_META: AuthoritativeLesson[] = [
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

export const AUTH_LESSON_META_BY_ID: Record<string, AuthoritativeLesson> = Object.fromEntries(
  AUTH_LESSON_META.map((l) => [l.id, l]),
)

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Generates an HMAC-signed opaque token for unsubscribe links.
 * payload = base64url(uid)
 * mac     = base64url( HMAC-SHA256(secret, uid) )
 * token   = payload + "." + mac
 */
export function generateHmacToken(secret: string, uid: string): string {
  const payload = Buffer.from(uid).toString('base64url')
  const mac = createHmac('sha256', secret).update(uid).digest('base64url')
  return `${payload}.${mac}`
}

/**
 * Builds the email HTML for a quiz result.
 */
export function buildEmailHtml(result: EmailQuizResult, unsubscribeUrl: string): string {
  const subject = `Your Daily Probability Quiz — ${result.quizTopic}`
  const letters = ['A', 'B', 'C', 'D']

  const questionsHtml = result.questions.map((q, i) => {
    const optionsHtml = q.options.map((opt, j) => {
      const isCorrect = j === q.answerIndex
      return `<li style="margin:4px 0;${isCorrect ? 'font-weight:bold;' : ''}">${letters[j]}. ${escapeHtml(opt)}${isCorrect ? ' ✓' : ''}</li>`
    }).join('\n')
    return `
    <div style="margin-bottom:24px;padding:16px;border:1px solid #e5e7eb;border-radius:8px;">
      <p style="font-weight:bold;margin:0 0 8px 0;">${i + 1}. ${escapeHtml(q.question)}</p>
      <ul style="list-style:none;padding:0;margin:0 0 12px 0;">
        ${optionsHtml}
      </ul>
      <div style="background:#f0fdf4;padding:10px;border-radius:4px;border-left:3px solid #22c55e;">
        <strong>Answer:</strong> ${letters[q.answerIndex]}. ${escapeHtml(q.options[q.answerIndex])}<br/>
        <strong>Explanation:</strong> ${escapeHtml(q.explanation)}
      </div>
    </div>`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111827;">
  <h2 style="margin-top:0;">${escapeHtml(subject)}</h2>
  <p style="color:#6b7280;">Test your probability knowledge with today's quiz. Answers and explanations are included below each question.</p>
  ${questionsHtml}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 16px 0;"/>
  <p style="font-size:12px;color:#9ca3af;text-align:center;">
    <a href="${unsubscribeUrl}" style="color:#9ca3af;">Unsubscribe</a>
  </p>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function stripFences(raw: string): string {
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1)
  return s
}

export function isEmailQuizQuestion(v: unknown): v is EmailQuizQuestion {
  if (!v || typeof v !== 'object') return false
  const q = v as Record<string, unknown>
  return (
    typeof q.question === 'string' &&
    Array.isArray(q.options) &&
    q.options.length === 4 &&
    q.options.every((o) => typeof o === 'string') &&
    typeof q.answerIndex === 'number' &&
    q.answerIndex >= 0 &&
    q.answerIndex <= 3 &&
    typeof q.explanation === 'string' &&
    typeof q.topicId === 'string'
  )
}

const EMAIL_QUIZ_MODEL = 'gpt-4o-mini'

// ---------------------------------------------------------------------------
// Deterministic quiz helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/** "<title>": <conceptSummary> (e.g. <realWorldHook>) */
export function deterministicEmailExplanation(l: AuthoritativeLesson): string {
  return `"${l.title}": ${l.conceptSummary} (e.g. ${l.realWorldHook})`
}

/** Build a deterministic concept-recall item for lesson l at list-index i. */
export function buildDeterministicEmailItem(l: AuthoritativeLesson, i: number): EmailQuizQuestion {
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
    question: `Which statement best captures the core idea of "${l.title}"?`,
    options: options as [string, string, string, string],
    answerIndex,
    explanation: deterministicEmailExplanation(l),
    topicId: l.id,
  }
}

/** The canonical intro question when no grounded lessons exist. */
export const CANONICAL_INTRO_ITEM: EmailQuizQuestion = {
  question: 'In one sentence, what does a probability describe?',
  options: [
    'An outcome that is unpredictable one at a time but stable in the long run',
    'A guarantee about what happens on the very next try',
    'Something decided purely by luck with no underlying pattern',
    'A value that only ever equals 50/50',
  ],
  answerIndex: 0,
  explanation: 'Probability is long-run relative frequency: unpredictable individually, predictable in bulk.',
  topicId: 'long-run',
}

/** Resolve the authoritative lesson list from the input for grounding. */
export function resolveGrounded(input: EmailQuizInput): AuthoritativeLesson[] {
  const candidates = input.weakTopics.length > 0
    ? input.weakTopics
    : input.completedTopics.slice(0, 3)
  return candidates
    .map(t => AUTH_LESSON_META_BY_ID[t.id])
    .filter((l): l is AuthoritativeLesson => !!l)
}

/** Build a deterministic EmailQuizResult from a (possibly empty) grounded lesson list. */
export function buildDeterministicEmailResult(grounded: AuthoritativeLesson[]): EmailQuizResult {
  if (grounded.length === 0) {
    return {
      questions: [CANONICAL_INTRO_ITEM],
      quizTopic: 'Probability Fundamentals',
      model: 'deterministic',
    }
  }
  const capped = grounded.slice(0, 3)
  return {
    questions: capped.map((l, i) => buildDeterministicEmailItem(l, i)),
    quizTopic: capped.map(l => l.title).join(' & '),
    model: 'deterministic',
  }
}

/**
 * Per-question verifier. Returns items with the same length and order as input.
 * Each question is either PASSed unchanged, REPAIRed (answerIndex+explanation fixed),
 * or REPLACEd with a deterministic concept-recall item.
 */
export function verifyEmailQuiz(
  questions: EmailQuizQuestion[],
  grounded: AuthoritativeLesson[],
): { items: EmailQuizQuestion[]; repaired: number; replaced: number } {
  let repaired = 0
  let replaced = 0

  const items = questions.map((q, i): EmailQuizQuestion => {
    try {
      // --- Structural gate (any → REPLACE) ---
      const { options, answerIndex, explanation, topicId } = q

      const topicInMeta = !!AUTH_LESSON_META_BY_ID[topicId]
      const topicInGrounded = grounded.some(l => l.id === topicId)

      const distinctOptions =
        options && Array.isArray(options)
          ? new Set(options.map((o: string) => o.trim())).size === 4
          : false

      const structuralFail =
        !Array.isArray(options) ||
        options.length !== 4 ||
        !distinctOptions ||
        !Number.isInteger(answerIndex) ||
        answerIndex < 0 ||
        answerIndex >= 4 ||
        !explanation ||
        typeof explanation !== 'string' ||
        !topicInMeta ||
        !topicInGrounded

      if (structuralFail) {
        replaced++
        // REPLACE topic selection:
        //   - topic valid + grounded → use that lesson
        //   - topic valid but not grounded OR topic invalid → grounded[i % len]
        //   - grounded empty → CANONICAL_INTRO_ITEM
        if (grounded.length === 0) return CANONICAL_INTRO_ITEM
        const lessonForReplace = (topicInMeta && topicInGrounded)
          ? AUTH_LESSON_META_BY_ID[topicId]
          : grounded[i % grounded.length]
        return buildDeterministicEmailItem(lessonForReplace, i)
      }

      // --- Concept match ---
      const L = AUTH_LESSON_META_BY_ID[topicId]
      const scores = options.map((opt: string, idx: number) => ({
        idx,
        conceptScore: sim(opt, L.conceptSummary),
        misconScore: Math.max(...DISTRACTORS.map(d => sim(opt, d))),
      }))

      const ranked = [...scores].sort((a, b) => b.conceptScore - a.conceptScore)
      const best = ranked[0]
      const runnerUp = ranked[1]

      // REPLACE conditions
      if (
        best.conceptScore < CONCEPT_MIN ||
        best.conceptScore - runnerUp.conceptScore < TIE_MARGIN ||
        best.conceptScore <= best.misconScore
      ) {
        replaced++
        // concept-fail: topic valid + grounded → use that lesson (already confirmed above)
        return buildDeterministicEmailItem(L, i)
      }

      // PASS
      if (answerIndex === best.idx) {
        return q
      }

      // REPAIR
      repaired++
      return {
        ...q,
        answerIndex: best.idx,
        explanation: deterministicEmailExplanation(L),
      }
    } catch {
      // Any exception → REPLACE
      replaced++
      if (grounded.length === 0) return CANONICAL_INTRO_ITEM
      return buildDeterministicEmailItem(grounded[i % grounded.length], i)
    }
  })

  return { items, repaired, replaced }
}

/**
 * Calls OpenAI to generate 1–3 personalized probability quiz questions.
 * Now total — never throws on AI-unavailable/failure; returns deterministic result instead.
 */
export async function generateEmailQuiz(
  input: EmailQuizInput,
  apiKey: string | undefined,
): Promise<EmailQuizResult> {
  const grounded = resolveGrounded(input)

  // No API key or running against emulator → deterministic fallback
  if (!apiKey || process.env.FIRESTORE_EMULATOR_HOST) {
    return buildDeterministicEmailResult(grounded)
  }

  try {
    const topicsForPrompt = input.weakTopics.length > 0
      ? input.weakTopics
      : input.completedTopics.slice(0, 3)

    const topicsJson = JSON.stringify(
      topicsForPrompt.map((t) => ({ id: t.id, title: t.title, conceptSummary: t.conceptSummary })),
      null,
      2,
    )

    const framingNote = !input.hasAnyProgress
      ? 'This learner is brand new — use introductory framing, focusing on fundamental probability concepts.'
      : input.weakTopics.length > 0
        ? 'Focus on the topics listed — these are areas where the learner needs reinforcement (mastery < 60%).'
        : 'The learner has completed some topics. Pick engaging questions from the topics listed.'

    const systemPrompt = `You are a probability quiz generator for an educational app.
Generate 1–3 multiple-choice questions grounded in the provided topics.
${framingNote}

Rules:
- Each question must be clearly grounded in one of the provided topic IDs.
- Each question has exactly 4 answer options (strings).
- answerIndex is 0-based index of the correct option.
- topicId must match one of the provided topic ids.
- Return ONLY a JSON object with this exact shape:
{
  "questions": [
    {
      "question": string,
      "options": [string, string, string, string],
      "answerIndex": number,
      "explanation": string,
      "topicId": string
    }
  ],
  "quizTopic": string
}
No prose, no markdown fences.`

    const userPrompt = `Topics to quiz on:
${topicsJson}

Generate ${input.weakTopics.length > 0 ? `${Math.min(input.weakTopics.length, 3)} question(s)` : '1–2 introductory question(s)'} now.`

    const client = new OpenAI({ apiKey })
    const response = await client.chat.completions.create({
      model: EMAIL_QUIZ_MODEL,
      max_tokens: 1500,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })

    const text = response.choices[0]?.message?.content ?? ''
    let parsed: unknown
    try {
      parsed = JSON.parse(stripFences(text))
    } catch {
      return buildDeterministicEmailResult(grounded)
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray((parsed as Record<string, unknown>).questions) ||
      typeof (parsed as Record<string, unknown>).quizTopic !== 'string'
    ) {
      return buildDeterministicEmailResult(grounded)
    }

    const raw = parsed as { questions: unknown[]; quizTopic: string }
    if (raw.questions.length < 1 || raw.questions.length > 3) {
      return buildDeterministicEmailResult(grounded)
    }

    // Let verifyEmailQuiz handle per-question validation instead of pre-rejecting
    const { items, repaired, replaced } = verifyEmailQuiz(
      raw.questions as EmailQuizQuestion[],
      grounded,
    )
    if (repaired + replaced > 0) {
      console.warn('[verifyEmailQuiz] repaired=' + repaired + ' replaced=' + replaced)
    }

    return { questions: items, quizTopic: raw.quizTopic, model: EMAIL_QUIZ_MODEL }
  } catch {
    // Network error or any other exception → deterministic fallback
    return buildDeterministicEmailResult(grounded)
  }
}

// ---------------------------------------------------------------------------
// Handler — POST /api/email-quiz
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.authorization
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Unauthorized.' })
    return
  }

  const emailTokenSecret = process.env.EMAIL_TOKEN_SECRET
  if (!emailTokenSecret) {
    res.status(500).json({ error: 'Server misconfiguration.' })
    return
  }

  try {
    const dateKey = new Date().toISOString().slice(0, 10)
    const body = (req.body ?? {}) as { dryRun?: boolean }
    const dryRun = body.dryRun === true

    const db = getDb()
    const usersSnap = await db.collection('users').where('emailPrefs.dailyQuiz', '==', true).get()

    let processed = 0
    let sent = 0
    let failed = 0
    let skipped = 0

    for (const userDoc of usersSnap.docs) {
      let countedFailed = false
      try {
        processed++
        const uid = userDoc.id
        const deliveryRef = db.collection('users').doc(uid).collection('emailDelivery').doc(dateKey)

        // Idempotency check
        const deliverySnap = await deliveryRef.get()
        if (deliverySnap.exists && deliverySnap.get('status') === 'sent') {
          skipped++
          continue
        }

        // Validate email
        const userData = userDoc.data() as Record<string, unknown>
        const userEmail = typeof userData.email === 'string' ? userData.email : null
        if (!userEmail) {
          if (!dryRun) {
            await deliveryRef.set({ status: 'skipped', reason: 'no-email' })
          }
          skipped++
          continue
        }

        // Build personalization from progress subcollection
        const progressSnap = await db.collection('users').doc(uid).collection('progress').get()
        const weakTopics: LessonMetaLite[] = []
        const completedTopics: LessonMetaLite[] = []

        for (const pd of progressSnap.docs) {
          const pd_ = pd.data() as Record<string, unknown>
          const lessonId = pd.id
          const masteryScore = typeof pd_.masteryScore === 'number' ? pd_.masteryScore : undefined
          const title = typeof pd_.title === 'string' ? pd_.title : lessonId
          const conceptSummary = typeof pd_.conceptSummary === 'string' ? pd_.conceptSummary : ''

          const meta: LessonMetaLite = { id: lessonId, title, conceptSummary }
          completedTopics.push(meta)

          if (masteryScore !== undefined && masteryScore < 0.6) {
            weakTopics.push({ ...meta, masteryScore })
          }
        }

        const hasAnyProgress = progressSnap.docs.length > 0

        const quizInput: EmailQuizInput = {
          uid,
          weakTopics,
          completedTopics,
          hasAnyProgress,
        }

        // Generate HMAC token for unsubscribe
        const token = generateHmacToken(emailTokenSecret, uid)

        // Generate quiz — now total (never throws on AI-unavailable/failure).
        // The catch here is a safety net for unexpected exceptions only.
        let quizResult: EmailQuizResult
        try {
          quizResult = await generateEmailQuiz(quizInput, process.env.OPENAI_API_KEY)
        } catch {
          failed++
          countedFailed = true
          if (!dryRun) {
            await deliveryRef.set({ status: 'failed', reason: 'quiz-generation-error' })
          }
          continue
        }

        // Build unsubscribe URL
        const appDomain =
          process.env.APP_URL ||
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
        const unsubscribeUrl = `${appDomain}/api/email-unsubscribe?token=${token}`

        // Build HTML
        const html = buildEmailHtml(quizResult, unsubscribeUrl)

        if (dryRun) {
          sent++
          continue
        }

        // Send via Resend
        const resend = new Resend(process.env.RESEND_API_KEY)
        const sendResult = await resend.emails.send({
          from: process.env.EMAIL_FROM || 'quiz@example.com',
          to: userEmail,
          subject: `Your Daily Probability Quiz — ${quizResult.quizTopic}`,
          html,
          headers: { 'List-Unsubscribe': unsubscribeUrl },
        })

        if (sendResult.error) {
          await deliveryRef.set({ status: 'failed', reason: 'send-error' })
          failed++
          continue
        }

        await deliveryRef.set({
          status: 'sent',
          sentAt: FieldValue.serverTimestamp(),
          model: quizResult.model,
          quizTopic: quizResult.quizTopic,
        })
        sent++
      } catch {
        if (!countedFailed) failed++
      }
    }

    res.status(200).json({ dateKey, processed, sent, failed, skipped })
  } catch {
    res.status(500).json({ error: 'Server error.' })
  }
}
