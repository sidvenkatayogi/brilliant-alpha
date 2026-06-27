// Firebase Admin SDK init for the serverless functions, plus ID-token auth.
//
// On Vercel the credentials come from env vars (a service account split into
// FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY). Locally /
// in e2e we run against the emulators: if FIRESTORE_EMULATOR_HOST is set the
// Admin SDK needs no real credentials and talks to the emulator directly.

import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import type { VercelRequest } from '@vercel/node'
import { ApiError } from './http'

function ensureApp(): void {
  if (getApps().length) return
  // Emulator path — no credentials required.
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-long-run' })
    return
  }
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  // Vercel stores the private key with literal "\n"; restore real newlines.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) {
    throw new ApiError(
      500,
      'Server is missing Firebase Admin credentials (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY).',
    )
  }
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
}

ensureApp()

export const db = getFirestore()
export { FieldValue }

/** Verify the caller's Firebase ID token (Authorization: Bearer …) → uid. */
export async function requireUid(req: VercelRequest): Promise<string> {
  const header = req.headers.authorization
  const token =
    typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) throw new ApiError(401, 'Must be signed in.')
  try {
    const decoded = await getAuth().verifyIdToken(token)
    return decoded.uid
  } catch {
    throw new ApiError(401, 'Invalid or expired session.')
  }
}
