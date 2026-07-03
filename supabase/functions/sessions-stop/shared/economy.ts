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

// Map progress (fragment accrual in the gate stage, boss damage in the boss
// stage) is owned entirely by complete_focus_session in SQL — it derives both
// from the verified rewardable ms this module computes, branching on the
// player's current stage and carrying the per-location fragment remainder.
// Both are deliberately boost-immune: boosters buy currency, not progress
// through the world.

// ---- Relic seals (Phase 8) ----
// Every defeated location leaves a relic at Bronze Seal. Qualifying sessions
// (the streak bar) attune each *equipped* relic; seals rank up on thresholds
// and the perk bonus rises with the seal. The perk multiplies MAP progression
// (fragments / boss damage) only — never currency. The SQL twins of these
// constants live in relic_seal_bonus / relic_seal_sessions_required; keep
// them in sync.

export type SealRank = 'bronze' | 'silver' | 'gold' | 'mythic'

export const SEAL_RANKS: SealRank[] = ['bronze', 'silver', 'gold', 'mythic']

export const SEAL_PERK_BONUS: Record<SealRank, number> = {
  bronze: 0.05,
  silver: 0.08,
  gold: 0.12,
  mythic: 0.2,
}

// Qualifying sessions needed *inside* each seal to reach the next one.
export const SEAL_SESSIONS_REQUIRED: Record<Exclude<SealRank, 'mythic'>, number> = {
  bronze: 3,
  silver: 6,
  gold: 12,
}

export const RELIC_LOADOUT_SLOTS = 2

// 1 + the summed bonuses of the equipped seals (two Mythics = 1.40×).
// Rounded so float drift can't diverge from SQL's exact numeric sum.
export function perkMultiplier(equippedSeals: SealRank[]): number {
  const sum = equippedSeals
    .slice(0, RELIC_LOADOUT_SLOTS)
    .reduce((mult, seal) => mult + SEAL_PERK_BONUS[seal], 1)
  return Math.round(sum * 100) / 100
}

export interface AttuneResult {
  seal: SealRank
  sealSessions: number
  rankedUp: boolean
}

// Credit qualifying sessions to a relic, cascading rank-ups. Progress resets
// each seal (thresholds are per-seal, not cumulative); Mythic just banks.
export function attuneRelic(seal: SealRank, sealSessions: number, credited = 1): AttuneResult {
  let current = seal
  let sessions = sealSessions + credited
  let rankedUp = false
  while (current !== 'mythic' && sessions >= SEAL_SESSIONS_REQUIRED[current]) {
    sessions -= SEAL_SESSIONS_REQUIRED[current]
    current = SEAL_RANKS[SEAL_RANKS.indexOf(current) + 1]
    rankedUp = true
  }
  return { seal: current, sealSessions: sessions, rankedUp }
}

// How many more qualifying sessions until the next seal; null at Mythic.
export function sessionsToNextSeal(seal: SealRank, sealSessions: number): number | null {
  if (seal === 'mythic') return null
  return Math.max(0, SEAL_SESSIONS_REQUIRED[seal] - sealSessions)
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

// Streak freezes (banked, capped): every 7th consecutive day banks one,
// and missed days are retroactively covered when the player returns — a
// freeze is only spent when it actually saves the streak.
export const MAX_STREAK_FREEZES = 2
export const STREAK_FREEZE_EARN_DAYS = 7

export interface StreakResult {
  streak: number
  qualifies: boolean
  // Local focus day to persist, or null when the session doesn't qualify.
  focusDate: string | null
  freezesConsumed: number
  freezesEarned: number
}

// A streak is alive if the last qualifying focus day was today or
// yesterday (user-local), or if banked freezes cover every fully-missed
// day in between. A qualifying session today either starts a streak,
// extends yesterday's (or a frozen gap's), or keeps today's.
// Qualification is judged on verified (rewardable) time so an unattended
// timer can't farm streaks.
export function advanceStreak(args: {
  rewardableMs: number
  prevStreak: number
  lastFocusDate: string | null
  now: Date
  tzOffsetMinutes?: number
  streakFreezes?: number
}): StreakResult {
  const { rewardableMs, prevStreak, lastFocusDate, now, tzOffsetMinutes = 0, streakFreezes = 0 } = args

  const today = localDateString(now, tzOffsetMinutes)
  // Whole local days since the last qualifying focus day. Date strings
  // parse as UTC midnights, so the difference is an exact day count.
  const daysSince = lastFocusDate
    ? Math.round((Date.parse(today) - Date.parse(lastFocusDate)) / 86_400_000)
    : Infinity
  const missedDays = Math.max(0, daysSince - 1)
  const frozen = prevStreak > 0 && missedDays > 0 && missedDays <= streakFreezes
  const aliveStreak = daysSince <= 1 || frozen ? prevStreak : 0

  const qualifies = rewardableMs >= STREAK_MIN_MINUTES * 60_000
  if (!qualifies) {
    return { streak: aliveStreak, qualifies, focusDate: null, freezesConsumed: 0, freezesEarned: 0 }
  }

  const newDay = daysSince !== 0
  const streak = newDay ? aliveStreak + 1 : Math.max(aliveStreak, 1)
  const freezesConsumed = newDay && frozen ? missedDays : 0
  const freezesEarned =
    newDay &&
    streak % STREAK_FREEZE_EARN_DAYS === 0 &&
    streakFreezes - freezesConsumed < MAX_STREAK_FREEZES
      ? 1
      : 0

  return { streak, qualifies, focusDate: today, freezesConsumed, freezesEarned }
}
