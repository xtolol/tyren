import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Local device preferences — never server state. Notification toggles gate
// the schedulers in src/lib/notifications.ts; the focus prefs are saved
// now and picked up by the target-session UI when it ships.

interface SettingsStore {
  // Evening nudge when the streak is at risk (20:00 local).
  streakReminderEnabled: boolean;
  // "You left mid-session" warning fired from the background.
  breakWarningEnabled: boolean;
  // Default target length in minutes; null = freeform.
  defaultSessionMinutes: number | null;
  // Start the next session automatically when one completes.
  autoStart: boolean;

  setStreakReminderEnabled: (enabled: boolean) => void;
  setBreakWarningEnabled: (enabled: boolean) => void;
  setDefaultSessionMinutes: (minutes: number | null) => void;
  setAutoStart: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      streakReminderEnabled: true,
      breakWarningEnabled: true,
      defaultSessionMinutes: null,
      autoStart: false,

      setStreakReminderEnabled: (enabled) => set({ streakReminderEnabled: enabled }),
      setBreakWarningEnabled: (enabled) => set({ breakWarningEnabled: enabled }),
      setDefaultSessionMinutes: (minutes) => set({ defaultSessionMinutes: minutes }),
      setAutoStart: (enabled) => set({ autoStart: enabled }),
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
