// Tiny request helpers shared by the serverless handlers. `run` enforces POST,
// runs the handler body, and maps thrown ApiErrors to JSON { error } responses
// with the right status — mirroring the HttpsError codes the old callables used.

import type { VercelRequest, VercelResponse } from '@vercel/node'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function run(
  req: VercelRequest,
  res: VercelResponse,
  fn: () => Promise<unknown>,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }
  try {
    const result = await fn()
    res.status(200).json(result ?? {})
  } catch (e) {
    if (e instanceof ApiError) {
      res.status(e.status).json({ error: e.message })
    } else {
      console.error('API error', e)
      res.status(500).json({ error: e instanceof Error ? e.message : 'Server error.' })
    }
  }
}
