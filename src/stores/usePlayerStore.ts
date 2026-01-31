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

  addCurrency: (type: CurrencyType, amount: number) => void;
  addXp: (amount: number) => void;
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

      addCurrency: (type, amount) => {
        set((state) => ({
          [type]: state[type] + amount,
        }));
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
