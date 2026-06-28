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

function isEmailQuizQuestion(v: unknown): v is EmailQuizQuestion {
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

/**
 * Calls OpenAI to generate 1–3 personalized probability quiz questions.
 * Throws (no fallback) if apiKey is missing or FIRESTORE_EMULATOR_HOST is set.
 */
export async function generateEmailQuiz(
  input: EmailQuizInput,
  apiKey: string | undefined,
): Promise<EmailQuizResult> {
  if (!apiKey || process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('AI unavailable')
  }

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
    throw new Error('Failed to parse AI response as JSON')
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as Record<string, unknown>).questions) ||
    typeof (parsed as Record<string, unknown>).quizTopic !== 'string'
  ) {
    throw new Error('AI response missing required fields')
  }

  const raw = parsed as { questions: unknown[]; quizTopic: string }
  if (raw.questions.length < 1 || raw.questions.length > 3) {
    throw new Error('AI returned wrong number of questions')
  }
  if (!raw.questions.every(isEmailQuizQuestion)) {
    throw new Error('AI returned malformed questions')
  }

  return {
    questions: raw.questions as EmailQuizQuestion[],
    quizTopic: raw.quizTopic,
    model: EMAIL_QUIZ_MODEL,
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

        // Generate quiz via AI
        let quizResult: EmailQuizResult
        try {
          quizResult = await generateEmailQuiz(quizInput, process.env.OPENAI_API_KEY)
        } catch {
          failed++
          countedFailed = true
          if (!dryRun) {
            await deliveryRef.set({ status: 'failed', reason: 'ai-unavailable' })
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
