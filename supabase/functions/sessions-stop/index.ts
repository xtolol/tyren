import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { adminClient } from './shared/client.ts'
import { corsResponse, jsonResponse, errorResponse } from './shared/http.ts'
import { getUserId } from './shared/auth.ts'

// ---- Economy (single source of truth for session rewards) ----
//
// Dust: 10/min keeps shop prices meaningful — the cheapest booster
// (1,500 dust) costs ~2.5 hours of focus.
// Shards are the premium currency: earnable free, but only by honouring
// a target you committed to. Deterministic, never RNG.
// Streaks reward showing up daily without punishing missed days harshly.
const MAX_REWARDABLE_MS = 14_400_000 // 4-hour anti-abuse cap
const MIN_REWARD_MINUTES = 1 // shorter sessions earn nothing
const DUST_PER_MINUTE = 10
const XP_PER_MINUTE = 10
const TARGET_COMPLETION_DUST_BONUS = 0.25 // +25% dust for completing a target
const SHARD_TARGET_MINUTES = 30 // 1 shard per full 30 min of completed target
const MAX_SHARDS_PER_SESSION = 4
const STREAK_MIN_MINUTES = 25 // session length needed to advance the daily streak
const STREAK_BONUS_PER_DAY = 0.05 // +5% dust per consecutive day after the first
const STREAK_BONUS_CAP_DAYS = 10 // capped at +50%

interface SessionRewards {
  dust: number
  shards: number
  xp: number
}

function calculateRewards(
  elapsedMs: number,
  mode: string,
  targetMs: number | null,
  streakDays: number
): SessionRewards & { completed: boolean } {
  const cappedMs = Math.min(elapsedMs, MAX_REWARDABLE_MS)
  const minutes = cappedMs / 60_000
  const completed = mode === 'target' && targetMs != null && elapsedMs >= targetMs

  if (minutes < MIN_REWARD_MINUTES) {
    return { dust: 0, shards: 0, xp: 0, completed }
  }

  const completionMult = completed ? 1 + TARGET_COMPLETION_DUST_BONUS : 1
  const bonusDays = Math.min(Math.max(streakDays - 1, 0), STREAK_BONUS_CAP_DAYS)
  const streakMult = 1 + STREAK_BONUS_PER_DAY * bonusDays

  const dust = Math.floor(minutes * DUST_PER_MINUTE * completionMult * streakMult)
  const xp = Math.floor(minutes * XP_PER_MINUTE)
  const shards = completed && targetMs != null
    ? Math.min(MAX_SHARDS_PER_SESSION, Math.floor(targetMs / 60_000 / SHARD_TARGET_MINUTES))
    : 0

  return { dust, shards, xp, completed }
}

function calculateProgress(
  elapsedMs: number,
  mode: string,
  targetMs: number | null
): number {
  const cappedMs = Math.min(elapsedMs, MAX_REWARDABLE_MS)
  if (mode === 'target' && targetMs != null) {
    return Math.min(100, Math.round((cappedMs / targetMs) * 100))
  }
  // Freeform: 1% per minute, max 100%
  return Math.min(100, Math.round(cappedMs / 60_000))
}

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const userId = getUserId(req)
  if (!userId) return errorResponse('Unauthorized', 401)

  const body = await req.json().catch(() => ({}))
  const sessionId: string | undefined = body.session_id
  if (!sessionId) return errorResponse('session_id required')

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
  const cappedMs = Math.min(elapsedMs, MAX_REWARDABLE_MS)

  const { data: profile } = await db
    .from('player_profiles')
    .select('current_streak, last_focus_date')
    .eq('user_id', userId)
    .single()

  // Streak: alive if the last qualifying focus day was today or yesterday
  // (UTC). A qualifying session today either starts a streak, extends
  // yesterday's, or keeps today's.
  const today = utcDateString(now)
  const yesterday = utcDateString(new Date(now.getTime() - 86_400_000))
  const lastFocusDate: string | null = profile?.last_focus_date ?? null
  const prevStreak: number = profile?.current_streak ?? 0
  const aliveStreak = lastFocusDate === today || lastFocusDate === yesterday ? prevStreak : 0

  const qualifies = cappedMs >= STREAK_MIN_MINUTES * 60_000
  const newStreak = qualifies
    ? lastFocusDate === today ? Math.max(aliveStreak, 1) : aliveStreak + 1
    : aliveStreak

  const rewards = calculateRewards(elapsedMs, session.mode, session.target_ms, newStreak)
  const progress = calculateProgress(elapsedMs, session.mode, session.target_ms)

  const { data: rpcResult, error: rpcError } = await db.rpc('complete_focus_session', {
    p_session_id: sessionId,
    p_user_id:    userId,
    p_ended_at:   now.toISOString(),
    p_elapsed_ms: elapsedMs,
    p_dust:       rewards.dust,
    p_shards:     rewards.shards,
    p_xp:         rewards.xp,
    p_progress:   progress,
    p_streak:     newStreak,
    p_focus_date: qualifies ? today : null,
  })

  if (rpcError) return errorResponse(rpcError.message, 500)

  await db.from('focus_session_events').insert({
    session_id: sessionId,
    user_id:    userId,
    event_type: 'stop',
    metadata:   { elapsed_ms: elapsedMs, rewards, progress, streak: newStreak },
  })

  const response = {
    session_id: sessionId,
    elapsed_ms: elapsedMs,
    completed: rewards.completed,
    rewards: { dust: rewards.dust, shards: rewards.shards, xp: rewards.xp },
    ...(rpcResult as object),
  }

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
})
