// Server-side relay for the Anthropic API. The real API key lives only here
// (server env `ANTHROPIC_API_KEY`) and never reaches the browser. The client
// SDK in src/lib/gemini.ts points at /api/anthropic and sends the user's
// Firebase ID token; this function verifies it, then forwards the request to
// api.anthropic.com with the real key injected, streaming the response back so
// the SDK's .stream() / SSE behavior is preserved.
//
// Runs on the Vercel Node runtime (firebase-admin needs Node). Uses the Web
// handler signature (Request -> Response) so streaming is a straight body
// pass-through.
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

// Extractions with max_tokens=32768 over PDFs can take 30-90s.
export const config = { maxDuration: 60 }

const ANTHROPIC_BASE = 'https://api.anthropic.com'

function ensureAdmin() {
  if (getApps().length > 0) return
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set')
  initializeApp({ credential: cert(JSON.parse(raw)) })
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })

  // ── Verify the caller is a signed-in app user ──────────────────────────
  const authz = req.headers.get('authorization') ?? ''
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : ''
  if (!token) return unauthorized()
  try {
    ensureAdmin()
    await getAuth().verifyIdToken(token)
  } catch {
    return unauthorized()
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: { message: 'Server misconfigured: ANTHROPIC_API_KEY missing' } }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }

  // ── Forward to Anthropic with the real key injected ────────────────────
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api\/anthropic/, '') // e.g. /v1/messages
  const upstreamUrl = `${ANTHROPIC_BASE}${path}${url.search}`

  const headers: Record<string, string> = {
    'content-type': req.headers.get('content-type') ?? 'application/json',
    'anthropic-version': req.headers.get('anthropic-version') ?? '2023-06-01',
    'x-api-key': apiKey,
  }
  const beta = req.headers.get('anthropic-beta')
  if (beta) headers['anthropic-beta'] = beta

  const body =
    req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer()

  const upstream = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body,
  })

  // Stream the upstream body straight back (handles both JSON and SSE).
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
    },
  })
}
