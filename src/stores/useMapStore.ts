import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocationId, RegionId } from '../core/map/types';

interface MapStore {
  discoveredLocationIds: LocationId[];
  currentLocationId: LocationId;
  revealedRegionIds: RegionId[];
  bossHpRemaining: Record<LocationId, number>;
  completedLocationIds: LocationId[];

  discoverLocation: (locationId: LocationId) => void;
  moveTo: (locationId: LocationId) => void;
  revealRegion: (regionId: RegionId) => void;
  damageBoss: (locationId: LocationId, damage: number) => void;
  defeatBoss: (locationId: LocationId) => void;
}

export const useMapStore = create<MapStore>()(
  persist(
    (set, get) => ({
      discoveredLocationIds: ['zalthars_hold'],
      currentLocationId: 'zalthars_hold',
      revealedRegionIds: ['zalreth'],
      bossHpRemaining: {},
      completedLocationIds: [],

      discoverLocation: (locationId) => {
        const state = get();
        if (state.discoveredLocationIds.includes(locationId)) return;
        set({
          discoveredLocationIds: [...state.discoveredLocationIds, locationId],
        });
      },

      moveTo: (locationId) => {
        set({ currentLocationId: locationId });
      },

      revealRegion: (regionId) => {
        const state = get();
        if (state.revealedRegionIds.includes(regionId)) return;
        set({
          revealedRegionIds: [...state.revealedRegionIds, regionId],
        });
      },

      damageBoss: (locationId, damage) => {
        const state = get();
        const currentHp = state.bossHpRemaining[locationId];
        if (currentHp === undefined) return;
        const newHp = Math.max(0, currentHp - damage);
        set({
          bossHpRemaining: {
            ...state.bossHpRemaining,
            [locationId]: newHp,
          },
        });
      },

      defeatBoss: (locationId) => {
        const state = get();
        if (state.completedLocationIds.includes(locationId)) return;
        const { [locationId]: _, ...remainingBossHp } = state.bossHpRemaining;
        set({
          completedLocationIds: [...state.completedLocationIds, locationId],
          bossHpRemaining: remainingBossHp,
        });
      },
    }),
    {
      name: 'map-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
