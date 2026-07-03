import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../lib/api';
import type {
  BreakGateResponse,
  MapLocation,
  MapProgressEntry,
  MapResult,
} from '../lib/api';

// Server-authoritative mirror of the world map: the location catalog
// (map_locations via RLS) plus this player's progress rows. The client
// never decides outcomes — it displays state and mirrors responses,
// same as the player store.

export interface LocationProgress {
  status: 'current' | 'completed';
  // Which beat of the location: collecting fragments, or fighting the boss.
  stage: 'gate' | 'boss';
  fragmentsCollected: number;
  // Banked verified ms toward the next fragment (carries between sessions).
  fragmentProgressMs: number;
  bossHpRemaining: number | null;
}

// What the UI needs per location, derived from progress + path order:
// reached states come from the server; 'next' is the upcoming location and
// 'locked' everything beyond it. Advancement is automatic (the boss kill
// rolls into the next gate), so there is no manual gate here.
export type LocationState = 'completed' | 'current' | 'next' | 'locked';

export function deriveLocationState(
  location: MapLocation,
  locations: MapLocation[],
  progress: Record<string, LocationProgress>,
): LocationState {
  const entry = progress[location.id];
  if (entry) return entry.status;

  const current = locations.find((l) => progress[l.id]?.status === 'current');
  const next = locations
    .filter((l) => current && l.sort_order > current.sort_order)
    .sort((a, b) => a.sort_order - b.sort_order)[0];

  if (current && next && next.id === location.id) return 'next';
  return 'locked';
}

const freshGate = (): LocationProgress => ({
  status: 'current',
  stage: 'gate',
  fragmentsCollected: 0,
  fragmentProgressMs: 0,
  bossHpRemaining: null,
});

interface MapStore {
  locations: MapLocation[];
  progress: Record<string, LocationProgress>;

  loadLocations: () => Promise<void>;
  setProgress: (entries: MapProgressEntry[]) => void;
  // Mirror the map block of a stop response onto the current location,
  // including the auto-advance to the next gate on a boss kill.
  applyMapResult: (map: MapResult) => void;
  // Mirror a manual gate break (gate → boss).
  applyBreakGate: (result: BreakGateResponse) => void;
  reset: () => void;
}

export const useMapStore = create<MapStore>()(
  persist(
    (set) => ({
      locations: [],
      progress: {},

      loadLocations: async () => {
        try {
          const locations = await api.map.locations();
          if (locations.length > 0) set({ locations });
        } catch {
          // Network unavailable — keep the cached catalog
        }
      },

      setProgress: (entries) => {
        set({
          progress: Object.fromEntries(
            entries.map((e) => [
              e.location_id,
              {
                status: e.status,
                stage: e.stage,
                fragmentsCollected: e.fragments_collected,
                fragmentProgressMs: e.fragment_progress_ms,
                bossHpRemaining: e.boss_hp_remaining,
              },
            ]),
          ),
        });
      },

      applyMapResult: (map) => {
        set((state) => {
          const progress = { ...state.progress };
          if (map.advanced_to) {
            // The killing blow cleared this location and opened the next gate.
            progress[map.location_id] = {
              status: 'completed',
              stage: 'boss',
              fragmentsCollected: map.fragments_required,
              fragmentProgressMs: 0,
              bossHpRemaining: 0,
            };
            progress[map.advanced_to] = freshGate();
          } else {
            progress[map.location_id] = {
              status: 'current',
              stage: map.stage,
              fragmentsCollected: map.fragments_collected,
              fragmentProgressMs: map.fragment_progress_ms,
              bossHpRemaining: map.hp_remaining,
            };
          }
          return { progress };
        });
      },

      applyBreakGate: (result) => {
        set((state) => ({
          progress: {
            ...state.progress,
            [result.location_id]: {
              ...(state.progress[result.location_id] ?? freshGate()),
              status: 'current',
              stage: 'boss',
              fragmentProgressMs: 0,
              bossHpRemaining: result.hp_remaining,
            },
          },
        }));
      },

      reset: () => set({ progress: {} }),
    }),
    {
      name: 'map-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
