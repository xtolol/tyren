import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { usePlayerStore } from './usePlayerStore';
import { useFocusTimerStore } from './useFocusTimerStore';

async function syncFromServer() {
  const localSessionId = useFocusTimerStore.getState().sessionId;
  try {
    const { profile, active_session } = await api.player.state();
    usePlayerStore.getState().hydrate(profile);
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
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },
}));
