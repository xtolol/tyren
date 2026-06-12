import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { adminClient } from './shared/client.ts'
import { corsResponse, jsonResponse, errorResponse } from './shared/http.ts'
import { getUserId } from './shared/auth.ts'

// Liveness evidence for verified-time payouts (see sessions-stop's
// shared/economy.ts). The client beats every 60s while foregrounded;
// beats arriving sooner than half an interval are acknowledged but not
// recorded, so retries and spam can't densify the evidence.
const MIN_HEARTBEAT_SPACING_MS = 30_000

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const userId = getUserId(req)
  if (!userId) return errorResponse('Unauthorized', 401)

  const body = await req.json().catch(() => ({}))
  const sessionId: string | undefined = body.session_id
  if (!sessionId) return errorResponse('session_id required')

  const db = adminClient()

  const { data: session } = await db
    .from('focus_sessions')
    .select('id, status')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()

  if (!session) return errorResponse('Session not found', 404)
  if (session.status !== 'active') {
    return errorResponse(`Session already ${session.status}`, 409)
  }

  const { data: lastBeat } = await db
    .from('focus_session_events')
    .select('server_ts')
    .eq('session_id', sessionId)
    .eq('event_type', 'heartbeat')
    .order('server_ts', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sinceLastMs = lastBeat
    ? Date.now() - new Date(lastBeat.server_ts).getTime()
    : Infinity

  if (sinceLastMs >= MIN_HEARTBEAT_SPACING_MS) {
    const { error: insertError } = await db.from('focus_session_events').insert({
      session_id: sessionId,
      user_id:    userId,
      event_type: 'heartbeat',
    })
    if (insertError) return errorResponse(insertError.message, 500)
  }

  return jsonResponse({ ok: true })
})
