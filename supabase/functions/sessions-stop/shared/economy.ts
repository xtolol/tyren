// ---- Economy (single source of truth for session rewards) ----
//
// Pure functions only — no I/O — so the math is unit-testable with
// `deno test`. The edge function stays a thin I/O wrapper around this.
//
// Dust: 10/min keeps shop prices meaningful — the cheapest booster
// (1,500 dust) costs ~2.5 hours of focus.
// Shards are the premium currency: earnable free, but only by honouring
// a target you committed to. Deterministic, never RNG.
// Streaks reward showing up daily without punishing missed days harshly.

export const MAX_REWARDABLE_MS = 14_400_000 // 4-hour anti-abuse cap
export const MIN_REWARD_MINUTES = 1 // shorter sessions earn nothing
export const DUST_PER_MINUTE = 10
export const XP_PER_MINUTE = 10
export const TARGET_COMPLETION_DUST_BONUS = 0.25 // +25% dust for completing a target
export const SHARD_TARGET_MINUTES = 30 // 1 shard per full 30 min of completed target
export const MAX_SHARDS_PER_SESSION = 4
export const STREAK_MIN_MINUTES = 25 // session length needed to advance the daily streak
export const STREAK_BONUS_PER_DAY = 0.05 // +5% dust per consecutive day after the first
export const STREAK_BONUS_CAP_DAYS = 10 // capped at +50%
export const MAX_TZ_OFFSET_MINUTES = 840 // ±14h spans every real timezone

// ---- Verified focus time ----
// The client heartbeats every interval while foregrounded; backgrounding
// suspends JS, so heartbeats are evidence the app was actually open.
// Payouts are bounded by what the heartbeats vouch for, with tolerance so
// a flaky network can't starve an honest session (each beat covers 1.5
// intervals — only sustained loss of over a third of beats costs time).
export const HEARTBEAT_INTERVAL_MS = 60_000
export const HEARTBEAT_TOLERANCE = 1.5
export const LEAVE_GRACE_MS = 30_000 // mirrored by the client's leave policy

export function rewardableMs(elapsedMs: number, heartbeatCount: number): number {
  const verifiedCeiling =
    Math.round(heartbeatCount * HEARTBEAT_INTERVAL_MS * HEARTBEAT_TOLERANCE) + LEAVE_GRACE_MS
  return Math.max(0, Math.min(elapsedMs, verifiedCeiling, MAX_REWARDABLE_MS))
}

// Purchased boosters multiply dust and xp — never shards (the premium
// currency stays earnable only by honouring targets). When several
// boosts are active the highest wins; they don't stack.
export const MAX_BOOST_MULTIPLIER = 10

export interface SessionRewards {
  dust: number
  shards: number
  xp: number
}

export function calculateRewards(args: {
  rewardableMs: number // verified time that earns currency (≤ elapsed, ≤ 4h cap)
  elapsedMs: number // wall clock — only target completion judges against it
  mode: string
  targetMs: number | null
  streakDays: number
  boostMultiplier?: number
}): SessionRewards & { completed: boolean } {
  const { elapsedMs, mode, targetMs, streakDays } = args
  const minutes = Math.min(args.rewardableMs, MAX_REWARDABLE_MS) / 60_000
  const completed = mode === 'target' && targetMs != null && elapsedMs >= targetMs

  if (minutes < MIN_REWARD_MINUTES) {
    return { dust: 0, shards: 0, xp: 0, completed }
  }

  const boostMult = Math.min(Math.max(args.boostMultiplier ?? 1, 1), MAX_BOOST_MULTIPLIER)
  const completionMult = completed ? 1 + TARGET_COMPLETION_DUST_BONUS : 1
  const bonusDays = Math.min(Math.max(streakDays - 1, 0), STREAK_BONUS_CAP_DAYS)
  const streakMult = 1 + STREAK_BONUS_PER_DAY * bonusDays

  const dust = Math.floor(minutes * DUST_PER_MINUTE * completionMult * streakMult * boostMult)
  const xp = Math.floor(minutes * XP_PER_MINUTE * boostMult)
  const shards = completed && targetMs != null
    ? Math.min(MAX_SHARDS_PER_SESSION, Math.floor(targetMs / 60_000 / SHARD_TARGET_MINUTES))
    : 0

  return { dust, shards, xp, completed }
}

export function calculateProgress(
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

// Streak day boundaries follow the user's local clock. The client reports
// its offset as minutes *behind* UTC (JS `Date#getTimezoneOffset`, e.g.
// New York in summer = 240, Berlin in summer = -120). Missing or
// out-of-range offsets fall back to UTC so old clients keep working.
export function localDateString(now: Date, tzOffsetMinutes = 0): string {
  const offset =
    Number.isFinite(tzOffsetMinutes) && Math.abs(tzOffsetMinutes) <= MAX_TZ_OFFSET_MINUTES
      ? tzOffsetMinutes
      : 0
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

export interface StreakResult {
  streak: number
  qualifies: boolean
  // Local focus day to persist, or null when the session doesn't qualify.
  focusDate: string | null
}

// A streak is alive if the last qualifying focus day was today or
// yesterday (user-local). A qualifying session today either starts a
// streak, extends yesterday's, or keeps today's. Qualification is judged
// on verified (rewardable) time so an unattended timer can't farm streaks.
export function advanceStreak(args: {
  rewardableMs: number
  prevStreak: number
  lastFocusDate: string | null
  now: Date
  tzOffsetMinutes?: number
}): StreakResult {
  const { rewardableMs, prevStreak, lastFocusDate, now, tzOffsetMinutes = 0 } = args

  const today = localDateString(now, tzOffsetMinutes)
  const yesterday = localDateString(new Date(now.getTime() - 86_400_000), tzOffsetMinutes)
  const aliveStreak = lastFocusDate === today || lastFocusDate === yesterday ? prevStreak : 0

  const qualifies = rewardableMs >= STREAK_MIN_MINUTES * 60_000
  const streak = qualifies
    ? lastFocusDate === today ? Math.max(aliveStreak, 1) : aliveStreak + 1
    : aliveStreak

  return { streak, qualifies, focusDate: qualifies ? today : null }
}
