import type { SealRank } from './types';

export type { RelicState, SealRank } from './types';

// Mirrors supabase/functions/sessions-stop/shared/economy.ts (and the SQL
// relic_seal_* helpers). Display-only on the client — keep in sync.

export const SEAL_RANKS: SealRank[] = ['bronze', 'silver', 'gold', 'mythic'];

export const SEAL_PERK_BONUS: Record<SealRank, number> = {
  bronze: 0.05,
  silver: 0.08,
  gold: 0.12,
  mythic: 0.2,
};

// Qualifying sessions needed inside each seal to reach the next one.
export const SEAL_SESSIONS_REQUIRED: Record<Exclude<SealRank, 'mythic'>, number> = {
  bronze: 3,
  silver: 6,
  gold: 12,
};

export const RELIC_LOADOUT_SLOTS = 2;

export const SEAL_LABELS: Record<SealRank, string> = {
  bronze: 'Bronze Seal',
  silver: 'Silver Seal',
  gold: 'Gold Seal',
  mythic: 'Mythic Seal',
};

// Rank-track abbreviations (BRZ · SLV · GLD · MYT in the designs).
export const SEAL_SHORT: Record<SealRank, string> = {
  bronze: 'BRZ',
  silver: 'SLV',
  gold: 'GLD',
  mythic: 'MYT',
};

// Whether a seal meets a shop item's required rank.
export function sealAtLeast(seal: SealRank, required: SealRank): boolean {
  return SEAL_RANKS.indexOf(seal) >= SEAL_RANKS.indexOf(required);
}

export function nextSeal(seal: SealRank): SealRank | null {
  const index = SEAL_RANKS.indexOf(seal);
  return index >= 0 && index < SEAL_RANKS.length - 1 ? SEAL_RANKS[index + 1] : null;
}

// How many more qualifying sessions until the next seal; null at Mythic.
export function sessionsToNextSeal(seal: SealRank, sealSessions: number): number | null {
  if (seal === 'mythic') return null;
  return Math.max(0, SEAL_SESSIONS_REQUIRED[seal] - sealSessions);
}

// +bonus formatted the way the designs write it: "+0.08×".
export function formatPerkBonus(seal: SealRank): string {
  return `+${SEAL_PERK_BONUS[seal].toFixed(2)}×`;
}

// 1 + the summed bonuses of the equipped seals (display twin of the server's).
export function perkMultiplier(equippedSeals: SealRank[]): number {
  const sum = equippedSeals
    .slice(0, RELIC_LOADOUT_SLOTS)
    .reduce((mult, seal) => mult + SEAL_PERK_BONUS[seal], 1);
  return Math.round(sum * 100) / 100;
}
