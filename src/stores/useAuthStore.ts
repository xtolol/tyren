import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { api } from '../lib/api';
import { scheduleStreakReminder } from '../lib/notifications';
import { supabase } from '../lib/supabase';
import { useFocusTimerStore } from './useFocusTimerStore';
import { useMapStore } from './useMapStore';
import { usePlayerStore } from './usePlayerStore';
import { useRelicStore } from './useRelicStore';

async function syncFromServer() {
  const localSessionId = useFocusTimerStore.getState().sessionId;
  useMapStore.getState().loadLocations();
  try {
    const { profile, active_session, inventory, active_boosts, map_progress, relics, entitlements, recap } = await api.player.state();
    usePlayerStore.getState().hydrate(profile);
    usePlayerStore.getState().setInventoryState(inventory ?? [], active_boosts ?? []);
    usePlayerStore.getState().setEntitlements(entitlements ?? []);
    if (recap) usePlayerStore.getState().setWeeklyRecap(recap);
    useMapStore.getState().setProgress(map_progress ?? []);
    useRelicStore.getState().setRelics(relics ?? []);
    // Keep the evening streak-at-risk reminder aligned with the server's
    // view of the streak each time we sync.
    scheduleStreakReminder({ streak: profile.current_streak, lastFocusDate: profile.last_focus_date });
    if (active_session) {
      useFocusTimerStore.getState().resumeFromServer(
        active_session.id,
        active_session.started_at,
        active_session.target_ms,
      );
    } else if (localSessionId && useFocusTimerStore.getState().sessionId === localSessionId) {
      // Server has no active session, yet we're still tracking one that
      // predates this fetch — it was closed elsewhere, so drop it.
      // (A session started mid-fetch changes sessionId and is left alone.)
      useFocusTimerStore.getState().reset();
    }
  } catch {
    // Network unavailable — keep local state
  }
}

interface AuthStore {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;
  initialize: () => () => void;
  signInWithEmail: (email: string, password: string) => Promise<string | null>;
  signUpWithEmail: (email: string, password: string, username: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  user: null,
  loading: false,
  initialized: false,

  initialize: () => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session, user: session?.user ?? null, initialized: true });
      if (session) syncFromServer();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      set({ session, user: session?.user ?? null, initialized: true });
      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        syncFromServer();
      }
    });

    return () => subscription.unsubscribe();
  },

  signInWithEmail: async (email, password) => {
    set({ loading: true });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    set({ loading: false });
    return error?.message ?? null;
  },

  signUpWithEmail: async (email, password, username) => {
    set({ loading: true });
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo: 'tyren://',
      },
    });
    set({ loading: false });
    return error?.message ?? null;
  },

  signOut: async () => {
    useFocusTimerStore.getState().reset();
    usePlayerStore.getState().reset();
    useMapStore.getState().reset();
    useRelicStore.getState().reset();
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },
}));
