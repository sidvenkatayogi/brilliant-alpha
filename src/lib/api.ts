// Thin client for the serverless API (Vercel `/api/*`, replacing the old
// Firebase callables). Every call attaches the signed-in user's Firebase ID
// token as a Bearer header; the function verifies it server-side.

import { auth } from './firebase'

export async function callApi<T>(name: string, data: unknown = {}): Promise<T> {
  const user = auth.currentUser
  if (!user) throw new Error('Must be signed in.')
  const token = await user.getIdToken()

  const res = await fetch(`/api/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data ?? {}),
  })

  const json = (await res.json().catch(() => ({}))) as { error?: string } & T
  if (!res.ok) {
    throw new Error(json.error || `Request failed (${res.status}).`)
  }
  return json as T
}
