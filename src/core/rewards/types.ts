import type { AggregatedBoosts } from "../boosts/types";

export type CurrencyType = "dust" | "shards";

export interface RewardCalculationInput {
  focusTimeMs: number;
  currentLevel: number;
  boosts: AggregatedBoosts;
  sessionCompleted: boolean;
}

export interface SessionRewards {
  dust: number;
  shards: number;
  xp: number;
}

// Base rate: 10 dust per minute of focus time.
// Designed so the cheapest booster (1,500 dust) costs ~2.5 hours of focus.
// Active boosts scale earnings via rewardMultiplier.
const DUST_PER_MINUTE = 10;
const MIN_REWARD_MINUTES = 1;

// Shard drop: small F2P chance that grows with session length.
// Chance = min(40%,  0.5% per minute).
// Amount: 1 shard (<30 min), 2 shards (30–59 min), 3 shards (≥60 min).
const SHARD_BASE_CHANCE = 0.7;
const SHARD_CHANCE_PER_MINUTE = 0.005;
const SHARD_MAX_CHANCE = 0.9;

function rollShards(minutes: number): number {
  const chance = Math.min(
    SHARD_MAX_CHANCE,
    SHARD_BASE_CHANCE + minutes * SHARD_CHANCE_PER_MINUTE,
  );
  if (Math.random() >= chance) return 0;
  if (minutes >= 60) return 3;
  if (minutes >= 30) return 2;
  return 1;
}

export function calculateRewards(
  input: RewardCalculationInput,
): SessionRewards {
  const { focusTimeMs, boosts } = input;
  const minutes = focusTimeMs / 60000;

  if (minutes < MIN_REWARD_MINUTES) {
    return { dust: 0, shards: 0, xp: 0 };
  }
  const dust = Math.floor(minutes * DUST_PER_MINUTE * boosts.rewardMultiplier);
  const shards = rollShards(minutes);
  return { dust, shards, xp: 0 };
}
