// Server-side relay for the Anthropic Messages API. The real API key lives only
// here (server env `ANTHROPIC_API_KEY`) and never reaches the browser. The
// client SDK in src/lib/gemini.ts is pointed at baseURL `${origin}/api/anthropic`,
// so it calls POST /api/anthropic/v1/messages — which maps to this file.
//
// Uses the canonical @vercel/node handler signature: a single default export
// `(req, res)`. This is the universally-supported format for non-framework
// (Vite) projects — the web-standard named method exports (export function POST)
// are not reliably recognized here and caused every request to 405.
//
// Streaming: the client uses messages.stream(), so Anthropic replies with SSE
// (text/event-stream). We pipe the upstream body straight to the Node response.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Readable } from 'node:stream'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const UPSTREAM = 'https://api.anthropic.com/v1/messages'

function ensureAdmin() {
  if (getApps().length > 0) return
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set')
  initializeApp({ credential: cert(JSON.parse(raw)) })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Health check — open this URL in a browser (GET). If you see this JSON, the
  // function is deployed and routing works. Touches no secret.
  if (req.method === 'GET') {
    res.status(200).json({ ok: true, relay: 'anthropic', version: 3 })
    return
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method Not Allowed' } })
    return
  }

  // ── Verify the caller is a signed-in app user ──────────────────────────
  const authz = req.headers['authorization'] ?? ''
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : ''
  if (!token) {
    res.status(401).json({ error: { message: 'Unauthorized' } })
    return
  }
  try {
    ensureAdmin()
    await getAuth().verifyIdToken(token)
  } catch {
    res.status(401).json({ error: { message: 'Unauthorized' } })
    return
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: { message: 'Server misconfigured: ANTHROPIC_API_KEY missing' } })
    return
  }

  // ── Forward to Anthropic with the real key injected ────────────────────
  // @vercel/node parses the JSON body into req.body; re-stringify to forward.
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': (req.headers['anthropic-version'] as string) ?? '2023-06-01',
    'x-api-key': apiKey,
  }
  if (req.headers['anthropic-beta']) {
    headers['anthropic-beta'] = req.headers['anthropic-beta'] as string
  }

  const upstream = await fetch(UPSTREAM, {
    method: 'POST',
    headers,
    body: JSON.stringify(req.body),
  })

  res.status(upstream.status)
  res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json')

  // Stream the upstream body straight back (handles both JSON and SSE).
  if (upstream.body) {
    Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res)
  } else {
    res.end()
  }
}
