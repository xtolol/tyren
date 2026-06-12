import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { adminClient } from './shared/client.ts'
import { corsResponse, jsonResponse, errorResponse } from './shared/http.ts'
import { getUserId } from './shared/auth.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const userId = getUserId(req)
  if (!userId) return errorResponse('Unauthorized', 401)

  const db = adminClient()
  const nowIso = new Date().toISOString()

  const [
    { data: profile, error: profileError },
    { data: activeSession },
    { data: inventory },
    { data: activeBoosts },
  ] = await Promise.all([
    db.from('player_profiles').select('*').eq('user_id', userId).single(),
    db
      .from('focus_sessions')
      .select('id, mode, status, target_ms, started_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle(),
    db
      .from('player_inventory')
      .select('item_id, quantity')
      .eq('user_id', userId)
      .gt('quantity', 0),
    db
      .from('active_boosts')
      .select('id, item_id, effect, started_at, expires_at')
      .eq('user_id', userId)
      .gt('expires_at', nowIso),
  ])

  if (profileError) return errorResponse('Profile not found', 404)

  return jsonResponse({
    profile,
    active_session: activeSession ?? null,
    inventory: inventory ?? [],
    active_boosts: activeBoosts ?? [],
  })
})
