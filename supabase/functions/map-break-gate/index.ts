import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { adminClient } from './shared/client.ts'
import { corsResponse, jsonResponse, errorResponse } from './shared/http.ts'
import { getUserId } from './shared/auth.ts'

// Breaks the gate at the player's current map location via the break_gate
// RPC, which owns the invariants atomically: there must be a current
// location, it must be in the gate stage, and the player must have collected
// every fragment the gate requires. On success the location flips to the boss
// stage with full HP. Advancing to the *next* location is not done here — the
// killing blow inside complete_focus_session handles that automatically.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const userId = getUserId(req)
  if (!userId) return errorResponse('Unauthorized', 401)

  const db = adminClient()
  const idempotencyKey = req.headers.get('x-idempotency-key')

  if (idempotencyKey) {
    const { data: cached } = await db
      .from('idempotency_keys')
      .select('response')
      .eq('user_id', userId)
      .eq('key', idempotencyKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (cached) return jsonResponse(cached.response)
  }

  const { data, error } = await db.rpc('break_gate', { p_user_id: userId })

  if (error) {
    const known: Record<string, string> = {
      no_current_location: 'No current map location.',
      no_boss: 'There is nothing to break here.',
      not_in_gate_stage: 'The gate here is already broken.',
      gate_not_ready: 'Collect every fragment before breaking the gate.',
    }
    return errorResponse(known[error.message] ?? error.message, 400)
  }

  if (idempotencyKey) {
    await db.from('idempotency_keys').upsert({
      user_id:      userId,
      key:          idempotencyKey,
      request_hash: '',
      response:     data,
      expires_at:   new Date(Date.now() + 86_400_000).toISOString(),
    })
  }

  return jsonResponse(data)
})
