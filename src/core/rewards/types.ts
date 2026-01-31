import type { AggregatedBoosts } from '../boosts/types';

export type CurrencyType = 'dust' | 'shards';

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

export function calculateRewards(_input: RewardCalculationInput): SessionRewards {
  // TODO: Implement reward calculation strategy
  return { dust: 0, shards: 0, xp: 0 };
}
