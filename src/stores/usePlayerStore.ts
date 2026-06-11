import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CurrencyType } from '../core/rewards/types';

interface PlayerStore {
  dust: number;
  shards: number;
  level: number;
  xp: number;
  xpToNextLevel: number;
  progressPercent: number;
  totalFocusTimeMs: number;
  totalItemsBought: number;
  totalBossesDefeated: number;

  addCurrency: (type: CurrencyType, amount: number) => void;
  addXp: (amount: number) => void;
  addProgressPercent: (amount: number) => void;
  setProgressPercent: (value: number) => void;
  addFocusTime: (ms: number) => void;
  incrementItemsBought: () => void;
  incrementBossesDefeated: () => void;
  hydrate: (profile: {
    dust: number; shards: number; level: number; xp: number;
    xp_to_next_level: number; progress_percent: number;
    total_focus_time_ms: number; total_items_bought: number;
    total_bosses_defeated: number;
  }) => void;
  reset: () => void;
}

const XP_PER_LEVEL = 1000;

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => ({
      dust: 0,
      shards: 0,
      level: 1,
      xp: 0,
      xpToNextLevel: XP_PER_LEVEL,
      progressPercent: 0,
      totalFocusTimeMs: 0,
      totalItemsBought: 0,
      totalBossesDefeated: 0,

      addCurrency: (type, amount) => {
        set((state) => ({
          [type]: state[type] + amount,
        }));
      },

      addFocusTime: (ms) => {
        set((state) => ({
          totalFocusTimeMs: state.totalFocusTimeMs + ms,
        }));
      },

      addProgressPercent: (amount) => {
        set((state) => ({
          progressPercent: Math.min(100, state.progressPercent + Math.max(0, amount)),
        }));
      },

      setProgressPercent: (value) => {
        set({ progressPercent: Math.min(100, Math.max(0, value)) });
      },

      incrementItemsBought: () => {
        set((state) => ({
          totalItemsBought: state.totalItemsBought + 1,
        }));
      },

      incrementBossesDefeated: () => {
        set((state) => ({
          totalBossesDefeated: state.totalBossesDefeated + 1,
        }));
      },

      hydrate: (profile) => {
        set({
          dust: profile.dust,
          shards: profile.shards,
          level: profile.level,
          xp: profile.xp,
          xpToNextLevel: profile.xp_to_next_level,
          progressPercent: Number(profile.progress_percent),
          totalFocusTimeMs: profile.total_focus_time_ms,
          totalItemsBought: profile.total_items_bought,
          totalBossesDefeated: profile.total_bosses_defeated,
        });
      },

      reset: () => {
        set({
          dust: 0, shards: 0, level: 1, xp: 0,
          xpToNextLevel: XP_PER_LEVEL, progressPercent: 0,
          totalFocusTimeMs: 0, totalItemsBought: 0, totalBossesDefeated: 0,
        });
      },

      addXp: (amount) => {
        const state = get();
        let newXp = state.xp + amount;
        let newLevel = state.level;
        let newXpToNextLevel = state.xpToNextLevel;

        while (newXp >= newXpToNextLevel) {
          newXp -= newXpToNextLevel;
          newLevel += 1;
          newXpToNextLevel = XP_PER_LEVEL * newLevel;
        }

        set({
          xp: newXp,
          level: newLevel,
          xpToNextLevel: newXpToNextLevel,
        });
      },
    }),
    {
      name: 'player-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
