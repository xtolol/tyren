import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { adminClient } from './shared/client.ts'
import { corsResponse, jsonResponse, errorResponse } from './shared/http.ts'
import { getUserId } from './shared/auth.ts'
import {
  advanceStreak,
  calculateProgress,
  calculateRewards,
  rewardableMs,
} from './shared/economy.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const userId = getUserId(req)
  if (!userId) return errorResponse('Unauthorized', 401)

  const body = await req.json().catch(() => ({}))
  const sessionId: string | undefined = body.session_id
  if (!sessionId) return errorResponse('session_id required')
  const tzOffsetMinutes = Number(body.tz_offset_minutes ?? 0)
  const forfeited = body.forfeited === true

  const db = adminClient()
  const now = new Date()
  const idempotencyKey = req.headers.get('x-idempotency-key')

  if (idempotencyKey) {
    const { data: cached } = await db
      .from('idempotency_keys')
      .select('response')
      .eq('user_id', userId)
      .eq('key', idempotencyKey)
      .gt('expires_at', now.toISOString())
      .maybeSingle()
    if (cached) return jsonResponse(cached.response)
  }

  const { data: session, error: fetchError } = await db
    .from('focus_sessions')
    .select('id, status, mode, target_ms, started_at')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()

  if (fetchError || !session) return errorResponse('Session not found', 404)
  if (session.status !== 'active') {
    return errorResponse(`Session already ${session.status}`, 409)
  }

  const elapsedMs = Math.max(0, now.getTime() - new Date(session.started_at).getTime())

  const cacheAndRespond = async (response: object) => {
    if (idempotencyKey) {
      await db.from('idempotency_keys').upsert({
        user_id:      userId,
        key:          idempotencyKey,
        request_hash: '',
        response,
        expires_at:   new Date(Date.now() + 86_400_000).toISOString(),
      })
    }
    return jsonResponse(response)
  }

  // ---- Forfeit: the user left the app past the grace window. The
  // session closes as abandoned with zero rewards and no streak credit
  // (the streak itself is untouched — losing the session is the stake).
  if (forfeited) {
    const { error: abandonError } = await db
      .from('focus_sessions')
      .update({ status: 'abandoned', ended_at: now.toISOString() })
      .eq('id', sessionId)
      .eq('status', 'active')
    if (abandonError) return errorResponse(abandonError.message, 500)

    await db.from('focus_session_events').insert({
      session_id: sessionId,
      user_id:    userId,
      event_type: 'stop',
      metadata:   { elapsed_ms: elapsedMs, forfeited: true },
    })

    const { data: profile, error: profileError } = await db
      .from('player_profiles')
      .select('dust, shards, level, xp, xp_to_next_level, progress_percent, total_focus_time_ms, current_streak, longest_streak')
      .eq('user_id', userId)
      .single()
    if (profileError || !profile) return errorResponse('Profile not found', 404)

    return cacheAndRespond({
      session_id:          sessionId,
      elapsed_ms:          elapsedMs,
      completed:           false,
      forfeited:           true,
      rewards:             { dust: 0, shards: 0, xp: 0 },
      rewarded_ms:         0,
      level:               profile.level,
      new_xp:              profile.xp,
      xp_to_next_level:    profile.xp_to_next_level,
      progress_percent:    profile.progress_percent,
      dust:                profile.dust,
      shards:              profile.shards,
      total_focus_time_ms: profile.total_focus_time_ms,
      current_streak:      profile.current_streak,
      longest_streak:      profile.longest_streak,
    })
  }

  // ---- Normal stop: pay out only heartbeat-verified time.
  const { count: heartbeats } = await db
    .from('focus_session_events')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('event_type', 'heartbeat')

  const rewardable = rewardableMs(elapsedMs, heartbeats ?? 0)

  // Highest active purchased boost wins; they don't stack.
  const { data: boosts } = await db
    .from('active_boosts')
    .select('effect')
    .eq('user_id', userId)
    .gt('expires_at', now.toISOString())

  const boostMultiplier = (boosts ?? []).reduce((max, b) => {
    const effect = b.effect as { type?: string; value?: number }
    return effect?.type === 'reward_multiplier' && typeof effect.value === 'number'
      ? Math.max(max, effect.value)
      : max
  }, 1)

  const { data: profile } = await db
    .from('player_profiles')
    .select('current_streak, last_focus_date')
    .eq('user_id', userId)
    .single()

  const { streak, qualifies, focusDate } = advanceStreak({
    rewardableMs: rewardable,
    prevStreak: profile?.current_streak ?? 0,
    lastFocusDate: profile?.last_focus_date ?? null,
    now,
    tzOffsetMinutes,
  })

  const rewards = calculateRewards({
    rewardableMs: rewardable,
    elapsedMs,
    mode: session.mode,
    targetMs: session.target_ms,
    streakDays: streak,
    boostMultiplier,
  })
  const progress = calculateProgress(rewardable, session.mode, session.target_ms)

  const { data: rpcResult, error: rpcError } = await db.rpc('complete_focus_session', {
    p_session_id: sessionId,
    p_user_id:    userId,
    p_ended_at:   now.toISOString(),
    // Verified time only: total_focus_time_ms must never absorb
    // unbounded or unevidenced wall-clock time.
    p_elapsed_ms: rewardable,
    p_dust:       rewards.dust,
    p_shards:     rewards.shards,
    p_xp:         rewards.xp,
    p_progress:   progress,
    p_streak:     streak,
    p_focus_date: focusDate,
  })

  if (rpcError) return errorResponse(rpcError.message, 500)

  await db.from('focus_session_events').insert({
    session_id: sessionId,
    user_id:    userId,
    event_type: 'stop',
    metadata:   { elapsed_ms: elapsedMs, rewarded_ms: rewardable, heartbeats: heartbeats ?? 0, boost_multiplier: boostMultiplier, rewards, progress, streak, qualifies },
  })

  return cacheAndRespond({
    session_id: sessionId,
    elapsed_ms: elapsedMs,
    completed: rewards.completed,
    forfeited: false,
    rewards: { dust: rewards.dust, shards: rewards.shards, xp: rewards.xp },
    rewarded_ms: rewardable,
    boost_multiplier: boostMultiplier,
    ...(rpcResult as object),
  })
})
