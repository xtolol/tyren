import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { adminClient } from './shared/client.ts'
import { corsResponse, jsonResponse, errorResponse } from './shared/http.ts'
import { getUserId } from './shared/auth.ts'

const MAX_SESSION_MS = 14_400_000 // 4 hours
// Active sessions older than the cap plus this grace are corpses from a
// dead client; abandon them (no rewards) instead of blocking new starts.
const STALE_SESSION_GRACE_MS = 3_600_000 // 1 hour

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const userId = getUserId(req)
  if (!userId) return errorResponse('Unauthorized', 401)

  const body = await req.json().catch(() => ({}))
  const mode: string = body.mode === 'target' ? 'target' : 'freeform'
  const targetMs: number | null = mode === 'target' && body.target_ms ? Number(body.target_ms) : null

  if (mode === 'target' && (!targetMs || targetMs <= 0 || targetMs > MAX_SESSION_MS)) {
    return errorResponse('Invalid target_ms: must be between 1 and 14400000')
  }

  const db = adminClient()
  const now = new Date().toISOString()
  const idempotencyKey = req.headers.get('x-idempotency-key')

  if (idempotencyKey) {
    const { data: cached } = await db
      .from('idempotency_keys')
      .select('response')
      .eq('user_id', userId)
      .eq('key', idempotencyKey)
      .gt('expires_at', now)
      .maybeSingle()
    if (cached) return jsonResponse(cached.response)
  }

  const { data: existingSession } = await db
    .from('focus_sessions')
    .select('id, started_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (existingSession) {
    const ageMs = Date.now() - new Date(existingSession.started_at).getTime()
    if (ageMs <= MAX_SESSION_MS + STALE_SESSION_GRACE_MS) {
      return errorResponse('An active session already exists. Stop it first.', 409)
    }
    // Same sweep the hourly cron job performs, done inline so the user
    // never waits on it to start focusing again.
    const { error: abandonError } = await db
      .from('focus_sessions')
      .update({
        status: 'abandoned',
        ended_at: new Date(new Date(existingSession.started_at).getTime() + MAX_SESSION_MS).toISOString(),
      })
      .eq('id', existingSession.id)
      .eq('status', 'active')
    if (abandonError) return errorResponse(abandonError.message, 500)
  }

  const { data: session, error: sessionError } = await db
    .from('focus_sessions')
    .insert({ user_id: userId, mode, target_ms: targetMs, status: 'active' })
    .select()
    .single()

  if (sessionError) return errorResponse(sessionError.message, 500)

  await db.from('focus_session_events').insert({
    session_id: session.id,
    user_id: userId,
    event_type: 'start',
  })

  const response = {
    session_id: session.id,
    started_at: session.started_at,
    mode,
    target_ms: targetMs,
  }

  if (idempotencyKey) {
    await db.from('idempotency_keys').upsert({
      user_id: userId,
      key: idempotencyKey,
      request_hash: '',
      response,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
  }

  return jsonResponse(response, 201)
})
