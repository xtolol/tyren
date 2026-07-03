import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ActiveBoost, Entitlement, InventoryEntry, PurchaseResponse, ActivateBoostResponse, WeeklyRecap } from '../lib/api';
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
  currentStreak: number;
  longestStreak: number;
  streakFreezes: number;
  // item_id → quantity owned; server-authoritative, mirrored on sync
  inventory: Record<string, number>;
  activeBoosts: ActiveBoost[];
  // Active (unexpired) entitlements, e.g. 'crystal_pass'. Server-granted.
  entitlements: Entitlement[];
  // Rolling 7-day recap from the last server sync; null until first sync.
  weeklyRecap: WeeklyRecap | null;

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
    current_streak: number; longest_streak: number;
    streak_freezes: number;
  }) => void;
  applySessionResult: (result: {
    dust: number; shards: number; level: number; new_xp: number;
    xp_to_next_level: number; progress_percent: number;
    total_focus_time_ms: number;
    current_streak: number; longest_streak: number;
    streak_freezes: number;
    total_bosses_defeated: number;
  }) => void;
  setInventoryState: (inventory: InventoryEntry[], boosts: ActiveBoost[]) => void;
  setEntitlements: (entitlements: Entitlement[]) => void;
  hasEntitlement: (entitlement: string) => boolean;
  setWeeklyRecap: (recap: WeeklyRecap) => void;
  applyPurchase: (result: PurchaseResponse) => void;
  applyBoostActivation: (result: ActivateBoostResponse) => void;
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
      currentStreak: 0,
      longestStreak: 0,
      streakFreezes: 0,
      inventory: {},
      activeBoosts: [],
      entitlements: [],
      weeklyRecap: null,

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
          currentStreak: profile.current_streak,
          longestStreak: profile.longest_streak,
          streakFreezes: profile.streak_freezes,
        });
      },

      applySessionResult: (result) => {
        set({
          dust: result.dust,
          shards: result.shards,
          level: result.level,
          xp: result.new_xp,
          xpToNextLevel: result.xp_to_next_level,
          progressPercent: Number(result.progress_percent),
          totalFocusTimeMs: result.total_focus_time_ms,
          currentStreak: result.current_streak,
          longestStreak: result.longest_streak,
          streakFreezes: result.streak_freezes,
          totalBossesDefeated: result.total_bosses_defeated,
        });
      },

      setInventoryState: (inventory, boosts) => {
        set({
          inventory: Object.fromEntries(inventory.map((e) => [e.item_id, e.quantity])),
          activeBoosts: boosts,
        });
      },

      setEntitlements: (entitlements) => {
        set({ entitlements });
      },

      // Gates Crystal Pass content. Expired rows are already filtered out
      // server-side, but re-check the expiry defensively.
      hasEntitlement: (entitlement) => {
        const now = Date.now();
        return get().entitlements.some(
          (e) => e.entitlement === entitlement && (e.expires_at == null || Date.parse(e.expires_at) > now),
        );
      },

      setWeeklyRecap: (recap) => {
        set({ weeklyRecap: recap });
      },

      applyPurchase: (result) => {
        set((state) => ({
          dust: result.dust,
          shards: result.shards,
          totalItemsBought: state.totalItemsBought + 1,
          // Dust packs convert instantly (quantity 0): nothing enters
          // the inventory.
          inventory: result.quantity > 0
            ? { ...state.inventory, [result.item_id]: result.quantity }
            : state.inventory,
        }));
      },

      applyBoostActivation: (result) => {
        set((state) => {
          const inventory = { ...state.inventory };
          if (result.quantity > 0) inventory[result.item_id] = result.quantity;
          else delete inventory[result.item_id];
          return { inventory, activeBoosts: [...state.activeBoosts, result.boost] };
        });
      },

      reset: () => {
        set({
          dust: 0, shards: 0, level: 1, xp: 0,
          xpToNextLevel: XP_PER_LEVEL, progressPercent: 0,
          totalFocusTimeMs: 0, totalItemsBought: 0, totalBossesDefeated: 0,
          currentStreak: 0, longestStreak: 0, streakFreezes: 0,
          inventory: {}, activeBoosts: [], entitlements: [], weeklyRecap: null,
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
