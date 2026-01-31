export type BoostEffectType = 'progress_multiplier' | 'reward_multiplier' | 'xp_multiplier';

export interface Boost {
  id: string;
  effectType: BoostEffectType;
  effectValue: number;
  durationMs: number | null;
}

export interface AggregatedBoosts {
  progressMultiplier: number;
  rewardMultiplier: number;
  xpMultiplier: number;
}

export const DEFAULT_BOOSTS: AggregatedBoosts = {
  progressMultiplier: 1.0,
  rewardMultiplier: 1.0,
  xpMultiplier: 1.0,
};
