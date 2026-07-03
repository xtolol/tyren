import { assertEquals } from 'jsr:@std/assert@1'
import {
  advanceStreak,
  calculateRewards,
  localDateString,
  rewardableMs,
  MAX_REWARDABLE_MS,
} from './economy.ts'

const MIN = 60_000

// Fully-verified session: rewardable time equals wall clock (up to the cap),
// i.e. the client heartbeated the whole way through.
function verifiedRewards(elapsedMs: number, mode: string, targetMs: number | null, streakDays: number) {
  return calculateRewards({
    rewardableMs: Math.min(elapsedMs, MAX_REWARDABLE_MS),
    elapsedMs,
    mode,
    targetMs,
    streakDays,
  })
}

// ---- calculateRewards ----

Deno.test('sub-minute sessions earn nothing', () => {
  const r = verifiedRewards(59_000, 'freeform', null, 1)
  assertEquals(r, { dust: 0, shards: 0, xp: 0, completed: false })
})

Deno.test('freeform pays 10 dust + 10 xp per minute', () => {
  const r = verifiedRewards(60 * MIN, 'freeform', null, 1)
  assertEquals(r.dust, 600)
  assertEquals(r.xp, 600)
  assertEquals(r.shards, 0)
  assertEquals(r.completed, false)
})

Deno.test('rewards cap at 4 hours', () => {
  const tenHours = verifiedRewards(10 * 60 * MIN, 'freeform', null, 1)
  const fourHours = verifiedRewards(MAX_REWARDABLE_MS, 'freeform', null, 1)
  assertEquals(tenHours.dust, fourHours.dust)
  assertEquals(tenHours.dust, 2400)
  assertEquals(tenHours.xp, 2400)
})

Deno.test('completed target gets +25% dust but plain xp', () => {
  const r = verifiedRewards(30 * MIN, 'target', 30 * MIN, 1)
  assertEquals(r.completed, true)
  assertEquals(r.dust, 375) // 30 * 10 * 1.25
  assertEquals(r.xp, 300)
})

Deno.test('unfinished target gets no bonus and no shards', () => {
  const r = verifiedRewards(29 * MIN, 'target', 30 * MIN, 1)
  assertEquals(r.completed, false)
  assertEquals(r.dust, 290)
  assertEquals(r.shards, 0)
})

Deno.test('shards: 1 per full 30 min of completed target, capped at 4', () => {
  const shardsFor = (targetMin: number) =>
    verifiedRewards(targetMin * MIN, 'target', targetMin * MIN, 1).shards
  assertEquals(shardsFor(29), 0)
  assertEquals(shardsFor(30), 1)
  assertEquals(shardsFor(59), 1)
  assertEquals(shardsFor(60), 2)
  assertEquals(shardsFor(120), 4)
  assertEquals(shardsFor(180), 4) // MAX_SHARDS_PER_SESSION
})

Deno.test('streak multiplier: +5% per day after the first', () => {
  // day 1 = no bonus, day 3 = +10%, day 11+ = capped +50%
  assertEquals(verifiedRewards(60 * MIN, 'freeform', null, 1).dust, 600)
  assertEquals(verifiedRewards(60 * MIN, 'freeform', null, 3).dust, 660)
  assertEquals(verifiedRewards(60 * MIN, 'freeform', null, 11).dust, 900)
  assertEquals(verifiedRewards(60 * MIN, 'freeform', null, 50).dust, 900)
})

Deno.test('streak multiplier never touches xp or shards', () => {
  const r = verifiedRewards(60 * MIN, 'target', 60 * MIN, 11)
  assertEquals(r.xp, 600)
  assertEquals(r.shards, 2)
  assertEquals(r.dust, Math.floor(600 * 1.25 * 1.5))
})

Deno.test('boosters multiply dust and xp but never shards', () => {
  const r = calculateRewards({
    rewardableMs: 60 * MIN, elapsedMs: 60 * MIN,
    mode: 'target', targetMs: 60 * MIN, streakDays: 1, boostMultiplier: 2,
  })
  assertEquals(r.dust, 1500) // 600 × 1.25 completion × 2 boost
  assertEquals(r.xp, 1200)
  assertEquals(r.shards, 2) // untouched by the boost
})

Deno.test('boost multiplier is clamped to a sane range', () => {
  const base = verifiedRewards(60 * MIN, 'freeform', null, 1)
  const under = calculateRewards({
    rewardableMs: 60 * MIN, elapsedMs: 60 * MIN,
    mode: 'freeform', targetMs: null, streakDays: 1, boostMultiplier: 0,
  })
  const over = calculateRewards({
    rewardableMs: 60 * MIN, elapsedMs: 60 * MIN,
    mode: 'freeform', targetMs: null, streakDays: 1, boostMultiplier: 999,
  })
  assertEquals(under.dust, base.dust) // floor: never reduces rewards
  assertEquals(over.dust, base.dust * 10) // MAX_BOOST_MULTIPLIER
})

Deno.test('payout follows verified time, completion follows wall clock', () => {
  // 30-min target honestly completed, but a few heartbeats were lost:
  // bonus + shards still awarded, dust/xp paid on the verified 28 min.
  const r = calculateRewards({
    rewardableMs: 28 * MIN,
    elapsedMs: 30 * MIN,
    mode: 'target',
    targetMs: 30 * MIN,
    streakDays: 1,
  })
  assertEquals(r.completed, true)
  assertEquals(r.shards, 1)
  assertEquals(r.dust, 350) // 28 * 10 * 1.25
  assertEquals(r.xp, 280)
})

// ---- rewardableMs (heartbeat-verified ceiling) ----

Deno.test('full heartbeat coverage pays the whole session', () => {
  // 60 min with the expected ~59 beats: ceiling far exceeds wall clock.
  assertEquals(rewardableMs(60 * MIN, 59), 60 * MIN)
})

Deno.test('an app killed in background stops earning at its last heartbeats', () => {
  // 60 min wall clock but only 10 beats (app died at ~minute 10):
  // 10 × 90s + 30s grace = 15.5 min.
  assertEquals(rewardableMs(60 * MIN, 10), 15.5 * MIN)
})

Deno.test('zero heartbeats pays at most the grace window', () => {
  assertEquals(rewardableMs(60 * MIN, 0), 30_000)
  assertEquals(rewardableMs(20_000, 0), 20_000) // shorter than grace: wall clock wins
})

Deno.test('verified time still respects the 4h cap', () => {
  assertEquals(rewardableMs(10 * 60 * MIN, 1000), MAX_REWARDABLE_MS)
})

Deno.test('tolerance absorbs moderate heartbeat loss', () => {
  // 45 of 60 expected beats (25% loss): 45 × 90s + 30s = 68 min ≥ wall.
  assertEquals(rewardableMs(60 * MIN, 45), 60 * MIN)
})

// ---- localDateString ----

Deno.test('local date respects the client tz offset', () => {
  const now = new Date('2026-06-12T03:00:00Z')
  assertEquals(localDateString(now, 0), '2026-06-12') // UTC
  assertEquals(localDateString(now, 240), '2026-06-11') // New York (UTC-4): still 11 June locally
  const lateBerlin = new Date('2026-06-11T23:00:00Z')
  assertEquals(localDateString(lateBerlin, -120), '2026-06-12') // Berlin (UTC+2): already 12 June
})

Deno.test('invalid tz offsets fall back to UTC', () => {
  const now = new Date('2026-06-12T03:00:00Z')
  assertEquals(localDateString(now, 900), '2026-06-12') // out of range
  assertEquals(localDateString(now, NaN), '2026-06-12')
})

// ---- advanceStreak ----

const NOW = new Date('2026-06-12T12:00:00Z')
const QUALIFYING = 25 * MIN
const SHORT = 10 * MIN

Deno.test('first qualifying session starts a streak', () => {
  const r = advanceStreak({ rewardableMs: QUALIFYING, prevStreak: 0, lastFocusDate: null, now: NOW })
  assertEquals(r, { streak: 1, qualifies: true, focusDate: '2026-06-12', freezesConsumed: 0, freezesEarned: 0 })
})

Deno.test('qualifying session extends yesterday’s streak', () => {
  const r = advanceStreak({ rewardableMs: QUALIFYING, prevStreak: 3, lastFocusDate: '2026-06-11', now: NOW })
  assertEquals(r.streak, 4)
})

Deno.test('second qualifying session the same day keeps the streak', () => {
  const r = advanceStreak({ rewardableMs: QUALIFYING, prevStreak: 4, lastFocusDate: '2026-06-12', now: NOW })
  assertEquals(r.streak, 4)
  assertEquals(r.focusDate, '2026-06-12')
})

Deno.test('a gap resets the streak to 1', () => {
  const r = advanceStreak({ rewardableMs: QUALIFYING, prevStreak: 40, lastFocusDate: '2026-03-01', now: NOW })
  assertEquals(r.streak, 1)
})

Deno.test('short session never advances or persists a focus day', () => {
  const dead = advanceStreak({ rewardableMs: SHORT, prevStreak: 5, lastFocusDate: '2026-03-01', now: NOW })
  assertEquals(dead, { streak: 0, qualifies: false, focusDate: null, freezesConsumed: 0, freezesEarned: 0 })

  const alive = advanceStreak({ rewardableMs: SHORT, prevStreak: 5, lastFocusDate: '2026-06-11', now: NOW })
  assertEquals(alive, { streak: 5, qualifies: false, focusDate: null, freezesConsumed: 0, freezesEarned: 0 })
})

Deno.test('unverified wall-clock time cannot farm a streak', () => {
  // 2h on the wall but only 5 heartbeats of evidence (≈8 min verified):
  // below the 25-min bar, so no streak credit.
  const r = advanceStreak({
    rewardableMs: rewardableMs(120 * MIN, 5),
    prevStreak: 0,
    lastFocusDate: null,
    now: NOW,
  })
  assertEquals(r, { streak: 0, qualifies: false, focusDate: null, freezesConsumed: 0, freezesEarned: 0 })
})

Deno.test('tz offset decides which local day a session lands on', () => {
  // 03:00 UTC on 12 June is still 11 June in New York: extends a streak
  // whose last focus day was 10 June (local yesterday), instead of
  // breaking it the way a UTC boundary would.
  const earlyUtc = new Date('2026-06-12T03:00:00Z')
  const ny = advanceStreak({
    rewardableMs: QUALIFYING, prevStreak: 2, lastFocusDate: '2026-06-10', now: earlyUtc, tzOffsetMinutes: 240,
  })
  assertEquals(ny, { streak: 3, qualifies: true, focusDate: '2026-06-11', freezesConsumed: 0, freezesEarned: 0 })

  const utc = advanceStreak({
    rewardableMs: QUALIFYING, prevStreak: 2, lastFocusDate: '2026-06-10', now: earlyUtc, tzOffsetMinutes: 0,
  })
  assertEquals(utc.streak, 1) // the bug this fixes: UTC sees a gap
})

// ---- streak freezes ----

Deno.test('a freeze covers a single missed day', () => {
  // Last qualified 10 June, returns 12 June: one fully-missed day (11th).
  const r = advanceStreak({
    rewardableMs: QUALIFYING, prevStreak: 5, lastFocusDate: '2026-06-10', now: NOW, streakFreezes: 1,
  })
  assertEquals(r.streak, 6)
  assertEquals(r.freezesConsumed, 1)
})

Deno.test('two freezes cover a two-day gap; more days than freezes resets', () => {
  const saved = advanceStreak({
    rewardableMs: QUALIFYING, prevStreak: 9, lastFocusDate: '2026-06-09', now: NOW, streakFreezes: 2,
  })
  assertEquals(saved.streak, 10)
  assertEquals(saved.freezesConsumed, 2)

  const lost = advanceStreak({
    rewardableMs: QUALIFYING, prevStreak: 9, lastFocusDate: '2026-06-09', now: NOW, streakFreezes: 1,
  })
  assertEquals(lost.streak, 1)
  assertEquals(lost.freezesConsumed, 0) // freezes are not burned unless they save the streak
})

Deno.test('a frozen gap keeps the streak visible before the player qualifies', () => {
  // Short session after one missed day with a banked freeze: streak
  // still shows alive, nothing consumed yet.
  const r = advanceStreak({
    rewardableMs: SHORT, prevStreak: 5, lastFocusDate: '2026-06-10', now: NOW, streakFreezes: 1,
  })
  assertEquals(r, { streak: 5, qualifies: false, focusDate: null, freezesConsumed: 0, freezesEarned: 0 })
})

Deno.test('every 7th consecutive day banks a freeze, capped at 2', () => {
  const seventh = advanceStreak({
    rewardableMs: QUALIFYING, prevStreak: 6, lastFocusDate: '2026-06-11', now: NOW, streakFreezes: 0,
  })
  assertEquals(seventh.streak, 7)
  assertEquals(seventh.freezesEarned, 1)

  const atCap = advanceStreak({
    rewardableMs: QUALIFYING, prevStreak: 13, lastFocusDate: '2026-06-11', now: NOW, streakFreezes: 2,
  })
  assertEquals(atCap.streak, 14)
  assertEquals(atCap.freezesEarned, 0)

  // Spending a freeze on the way to day 7 frees room to earn one back.
  const spendAndEarn = advanceStreak({
    rewardableMs: QUALIFYING, prevStreak: 6, lastFocusDate: '2026-06-10', now: NOW, streakFreezes: 2,
  })
  assertEquals(spendAndEarn.streak, 7)
  assertEquals(spendAndEarn.freezesConsumed, 1)
  assertEquals(spendAndEarn.freezesEarned, 1)
})

Deno.test('same-day sessions never earn or spend freezes', () => {
  const r = advanceStreak({
    rewardableMs: QUALIFYING, prevStreak: 7, lastFocusDate: '2026-06-12', now: NOW, streakFreezes: 1,
  })
  assertEquals(r.streak, 7)
  assertEquals(r.freezesConsumed, 0)
  assertEquals(r.freezesEarned, 0)
})
