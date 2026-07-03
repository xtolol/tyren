// Relic seals (Phase 8). The server owns all state transitions; these
// types and the constants in index.ts exist so the client can *display*
// seal progress without re-deriving outcomes.

export type SealRank = 'bronze' | 'silver' | 'gold' | 'mythic';

export interface RelicState {
  seal: SealRank;
  // Qualifying sessions credited inside the current seal (resets each rank-up).
  sealSessions: number;
  equippedSlot: 1 | 2 | null;
  earnedAt: string | null;
}
