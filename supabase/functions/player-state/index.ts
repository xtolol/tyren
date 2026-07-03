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
  const weekAgoIso = new Date(Date.now() - 7 * 86_400_000).toISOString()

  // Lazily seed the first map progress row so every player has a
  // 'current' location before the parallel reads below.
  await db.rpc('ensure_map_start', { p_user_id: userId })

  const [
    { data: profile, error: profileError },
    { data: activeSession },
    { data: inventory },
    { data: activeBoosts },
    { data: mapProgress },
    { data: weekRewards },
    { data: weekStops },
    { data: entitlements },
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
    db
      .from('player_map_progress')
      .select('location_id, status, stage, fragments_collected, fragment_progress_ms, boss_hp_remaining')
      .eq('user_id', userId),
    db
      .from('reward_ledger')
      .select('dust, shards, xp')
      .eq('user_id', userId)
      .gte('created_at', weekAgoIso),
    db
      .from('focus_session_events')
      .select('metadata')
      .eq('user_id', userId)
      .eq('event_type', 'stop')
      .gte('server_ts', weekAgoIso),
    db
      .from('entitlements')
      .select('entitlement, expires_at')
      .eq('user_id', userId)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`),
  ])

  if (profileError) return errorResponse('Profile not found', 404)

  // Weekly recap, derived from the ledgers — never from client state.
  // Stop-event metadata carries verified (rewarded) time and boss damage;
  // forfeited stops have neither and naturally count as zero.
  const recap = {
    window_days: 7,
    dust:     (weekRewards ?? []).reduce((sum, r) => sum + (r.dust ?? 0), 0),
    shards:   (weekRewards ?? []).reduce((sum, r) => sum + (r.shards ?? 0), 0),
    xp:       (weekRewards ?? []).reduce((sum, r) => sum + (r.xp ?? 0), 0),
    focus_ms: (weekStops ?? []).reduce((sum, e) => sum + (Number(e.metadata?.rewarded_ms) || 0), 0),
    damage:   (weekStops ?? []).reduce((sum, e) => sum + (Number(e.metadata?.damage) || 0), 0),
    sessions: (weekStops ?? []).filter((e) => (Number(e.metadata?.rewarded_ms) || 0) > 0).length,
  }

  return jsonResponse({
    profile,
    active_session: activeSession ?? null,
    inventory: inventory ?? [],
    active_boosts: activeBoosts ?? [],
    map_progress: mapProgress ?? [],
    entitlements: entitlements ?? [],
    recap,
  })
})
