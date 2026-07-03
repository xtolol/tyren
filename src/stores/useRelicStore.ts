import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { RelicState, SealRank } from '../core/relics';
import { api } from '../lib/api';
import type { LoadoutResponse, PlayerRelicEntry, RelicResult } from '../lib/api';

// Server-authoritative mirror of the player's relic collection
// (player_relics). Names, perks, and flavor live on the location catalog
// (useMapStore.locations); this store only tracks per-relic state. The
// client never decides seal transitions — it displays state and mirrors
// responses, same as the player and map stores.

interface RelicStore {
  // location_id → relic state; owning a key means the relic is earned.
  relics: Record<string, RelicState>;

  // Mirror the full collection from player-state.
  setRelics: (entries: PlayerRelicEntry[]) => void;
  // Mirror the relics block of a session-stop response (post-attunement).
  applySessionRelics: (relics: RelicResult[]) => void;
  // Equip perks (slot order = array order); mirrors the server's response.
  setLoadout: (slots: string[]) => Promise<void>;
  reset: () => void;
}

const toState = (e: {
  seal: SealRank;
  seal_sessions: number;
  equipped_slot: 1 | 2 | null;
  earned_at?: string;
}): RelicState => ({
  seal: e.seal,
  sealSessions: e.seal_sessions,
  equippedSlot: e.equipped_slot,
  earnedAt: e.earned_at ?? null,
});

// Selector helpers (kept here so screens don't each re-derive them).

export function equippedRelics(relics: Record<string, RelicState>): [string, RelicState][] {
  return Object.entries(relics)
    .filter(([, r]) => r.equippedSlot !== null)
    .sort(([, a], [, b]) => (a.equippedSlot ?? 0) - (b.equippedSlot ?? 0));
}

export const useRelicStore = create<RelicStore>()(
  persist(
    (set) => ({
      relics: {},

      setRelics: (entries) => {
        set({
          relics: Object.fromEntries(entries.map((e) => [e.location_id, toState(e)])),
        });
      },

      applySessionRelics: (relics) => {
        if (relics.length === 0) return;
        set((state) => {
          const next = { ...state.relics };
          for (const r of relics) {
            next[r.location_id] = {
              ...toState(r),
              earnedAt: state.relics[r.location_id]?.earnedAt ?? null,
            };
          }
          return { relics: next };
        });
      },

      setLoadout: async (slots) => {
        const result: LoadoutResponse = await api.relics.setLoadout(slots);
        set((state) => {
          const next = { ...state.relics };
          for (const r of result.relics) {
            next[r.location_id] = {
              ...toState(r),
              earnedAt: state.relics[r.location_id]?.earnedAt ?? null,
            };
          }
          return { relics: next };
        });
      },

      reset: () => set({ relics: {} }),
    }),
    {
      name: 'relic-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
