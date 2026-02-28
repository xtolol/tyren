import { supabase } from './supabase';

async function invoke<T>(name: string, body?: object, idempotencyKey?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) headers['x-idempotency-key'] = idempotencyKey;

  const { data, error } = await supabase.functions.invoke<T>(name, {
    body,
    headers,
  });

  if (error) {
    // Try to get the actual error body from the response
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx) {
      try {
        const json = await ctx.clone().json() as { error?: string; message?: string };
        throw new Error(json.error ?? json.message ?? error.message);
      } catch (e) {
        if (e instanceof Error && e.message !== error.message) throw e;
      }
    }
    throw new Error(error.message);
  }
  return data as T;
}

// ---- Response types ----

export interface SessionRewards {
  dust: number;
  shards: number;
  xp: number;
}

export interface StartSessionResponse {
  session_id: string;
  started_at: string;
  mode: 'freeform' | 'target';
  target_ms: number | null;
}

export interface StopSessionResponse {
  session_id: string;
  elapsed_ms: number;
  rewards: SessionRewards;
  level: number;
  new_xp: number;
  xp_to_next_level: number;
}

export interface PlayerProfile {
  user_id: string;
  dust: number;
  shards: number;
  level: number;
  xp: number;
  xp_to_next_level: number;
  progress_percent: number;
  total_focus_time_ms: number;
  total_items_bought: number;
  total_bosses_defeated: number;
  updated_at: string;
}

export interface ActiveSession {
  id: string;
  mode: 'freeform' | 'target';
  status: 'active';
  target_ms: number | null;
  started_at: string;
}

export interface PlayerStateResponse {
  profile: PlayerProfile;
  active_session: ActiveSession | null;
}

// ---- API client ----

export const api = {
  sessions: {
    start: (mode: 'freeform' | 'target', target_ms?: number, idempotencyKey?: string) =>
      invoke<StartSessionResponse>('sessions-start', { mode, target_ms }, idempotencyKey),

    stop: (session_id: string, idempotencyKey?: string) =>
      invoke<StopSessionResponse>('sessions-stop', { session_id }, idempotencyKey),
  },

  player: {
    state: () => invoke<PlayerStateResponse>('player-state'),
  },
};
