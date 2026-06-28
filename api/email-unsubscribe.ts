// Vercel serverless function: GET /api/email-unsubscribe?token=<signed>
//
// Verifies an HMAC-signed unsubscribe token and opts the user out of daily
// email quizzes. No login required — authenticated by the signed token alone.
//
// Token structure (contracts/api.md §2):
//   payload  = base64url(uid)
//   mac      = base64url( HMAC-SHA256(EMAIL_TOKEN_SECRET, uid) )
//   token    = payload + "." + mac
//
// Everything is inlined (no relative imports) — same pattern as api/cohort.ts.

import { createHmac, timingSafeEqual } from 'crypto'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// ---------------------------------------------------------------------------
// HTTP error + Firebase Admin (lazy init)
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
// Pure helper — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Verify an HMAC-signed unsubscribe token.
 * Returns the decoded uid on success, null on any parse or verify failure.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function verifyHmacToken(secret: string, token: string): string | null {
  try {
    const dotIndex = token.indexOf('.')
    if (dotIndex === -1) return null

    const encodedUid = token.slice(0, dotIndex)
    const encodedMac = token.slice(dotIndex + 1)

    if (!encodedUid || !encodedMac) return null

    const uid = Buffer.from(encodedUid, 'base64url').toString('utf8')

    const expectedMac = createHmac('sha256', secret).update(uid).digest('base64url')

    const a = Buffer.from(encodedMac)
    const b = Buffer.from(expectedMac)

    // Buffers must be the same length for timingSafeEqual; length mismatch means invalid.
    if (a.length !== b.length) return null

    if (!timingSafeEqual(a, b)) return null

    return uid
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// HTML responses
// ---------------------------------------------------------------------------

const HTML_ALREADY_UNSUBSCRIBED = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Unsubscribe</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:80px auto;padding:0 24px">
<h2>You are already unsubscribed.</h2>
<p>You are not receiving daily quiz emails. You can re-enable this from your profile settings.</p>
</body></html>`

const HTML_UNSUBSCRIBED = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Unsubscribe</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:80px auto;padding:0 24px">
<h2>You have been unsubscribed from daily email quizzes.</h2>
<p>You won't receive any more daily quizzes. You can re-enable this from your profile settings.</p>
</body></html>`

// ---------------------------------------------------------------------------
// Handler — GET /api/email-unsubscribe?token=<signed>
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }

  try {
    // 1. Extract token from query string
    const rawToken = req.query.token
    const token = Array.isArray(rawToken) ? rawToken[0] : rawToken

    if (!token) {
      res.status(400).json({ error: 'Invalid or missing unsubscribe token.' })
      return
    }

    // 2. Verify HMAC token
    const uid = verifyHmacToken(process.env.EMAIL_TOKEN_SECRET!, token)
    if (!uid) {
      res.status(400).json({ error: 'Invalid or missing unsubscribe token.' })
      return
    }

    // 3. Load user document
    const userSnap = await getDb().collection('users').doc(uid).get()
    if (!userSnap.exists) {
      res.status(404).json({ error: 'User not found.' })
      return
    }

    // 4. Check if already opted out
    const emailPrefs = userSnap.get('emailPrefs') as { dailyQuiz?: boolean } | undefined
    if (emailPrefs?.dailyQuiz === false) {
      res.setHeader('Content-Type', 'text/html')
      res.status(200).send(HTML_ALREADY_UNSUBSCRIBED)
      return
    }

    // 5. Write opt-out via Admin SDK
    await getDb()
      .collection('users')
      .doc(uid)
      .set({ emailPrefs: { dailyQuiz: false, optedOutAt: FieldValue.serverTimestamp() } }, { merge: true })

    // 6. Render success HTML
    res.setHeader('Content-Type', 'text/html')
    res.status(200).send(HTML_UNSUBSCRIBED)
  } catch (e) {
    if (e instanceof ApiError) {
      res.status(e.status).json({ error: e.message })
    } else {
      console.error('email-unsubscribe: unhandled error')
      res.status(500).json({ error: 'Server error.' })
    }
  }
}
