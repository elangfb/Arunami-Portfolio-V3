// Server-side relay for the Anthropic Messages API. The real API key lives only
// here (server env `ANTHROPIC_API_KEY`) and never reaches the browser. The
// client SDK in src/lib/gemini.ts is pointed at baseURL `${origin}/api/anthropic`,
// so it calls POST /api/anthropic/v1/messages — which maps to this file.
//
// This is a FIXED path (not a catch-all): plain Vercel `/api` functions only
// support single-segment dynamic routes, so `[...path].ts` did not match the
// two-segment `/v1/messages` and requests fell through to static (HTTP 405).
// The SDK only ever calls this one endpoint (streaming uses the same URL with
// `stream:true` in the body), so a fixed path is both sufficient and reliable.
//
// Uses the Vercel "web handler" signature for non-Next.js projects: named
// method exports that take a web `Request` and return a `Response`. A default
// export would be treated as the legacy Node (req, res) signature, where
// `request.headers.get()` does not exist. firebase-admin needs the Node runtime.
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const UPSTREAM = 'https://api.anthropic.com/v1/messages'

function ensureAdmin() {
  if (getApps().length > 0) return
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set')
  initializeApp({ credential: cert(JSON.parse(raw)) })
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function relay(req: Request): Promise<Response> {
  // ── Verify the caller is a signed-in app user ──────────────────────────
  const authz = req.headers.get('authorization') ?? ''
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : ''
  if (!token) return json(401, { error: { message: 'Unauthorized' } })
  try {
    ensureAdmin()
    await getAuth().verifyIdToken(token)
  } catch {
    return json(401, { error: { message: 'Unauthorized' } })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return json(500, { error: { message: 'Server misconfigured: ANTHROPIC_API_KEY missing' } })
  }

  // ── Forward to Anthropic with the real key injected ────────────────────
  const headers: Record<string, string> = {
    'content-type': req.headers.get('content-type') ?? 'application/json',
    'anthropic-version': req.headers.get('anthropic-version') ?? '2023-06-01',
    'x-api-key': apiKey,
  }
  const beta = req.headers.get('anthropic-beta')
  if (beta) headers['anthropic-beta'] = beta

  const upstream = await fetch(UPSTREAM, {
    method: 'POST',
    headers,
    body: await req.arrayBuffer(),
  })

  // Stream the upstream body straight back (handles both JSON and SSE).
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
    },
  })
}

// Health check — open /api/anthropic/v1/messages in a browser (a GET). If you
// see this JSON, the function is deployed and routing works; if you get a 405 or
// the SPA, the new code is NOT live yet (stale deploy / wrong root dir / build
// failed). It touches no secret, so it's safe to leave in.
export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true, relay: 'anthropic', version: 2 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

export async function POST(request: Request): Promise<Response> {
  return relay(request)
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204 })
}
