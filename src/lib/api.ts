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
  completed: boolean;
  forfeited: boolean;
  rewarded_ms: number;
  rewards: SessionRewards;
  level: number;
  new_xp: number;
  xp_to_next_level: number;
  progress_percent: number;
  dust: number;
  shards: number;
  total_focus_time_ms: number;
  current_streak: number;
  longest_streak: number;
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
  current_streak: number;
  longest_streak: number;
  last_focus_date: string | null;
  updated_at: string;
}

export interface ActiveSession {
  id: string;
  mode: 'freeform' | 'target';
  status: 'active';
  target_ms: number | null;
  started_at: string;
}

export type ShopCategory = 'pass' | 'level_item' | 'booster' | 'dust_pack' | 'shard_pack';

export interface ShopItemEffect {
  type?: 'reward_multiplier' | 'grant_dust' | 'grant_shards' | 'key_item';
  value?: number;
  amount?: number;
  duration_ms?: number;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  category: ShopCategory;
  price: number;
  currency: 'dust' | 'shards' | 'gbp';
  effect: ShopItemEffect;
  sort_order: number;
}

export interface InventoryEntry {
  item_id: string;
  quantity: number;
}

export interface ActiveBoost {
  id: string;
  item_id: string;
  effect: ShopItemEffect;
  started_at: string;
  expires_at: string;
}

export interface PurchaseResponse {
  item_id: string;
  dust: number;
  shards: number;
  quantity: number;
}

export interface ActivateBoostResponse {
  item_id: string;
  quantity: number;
  boost: ActiveBoost;
}

export interface PlayerStateResponse {
  profile: PlayerProfile;
  active_session: ActiveSession | null;
  inventory: InventoryEntry[];
  active_boosts: ActiveBoost[];
}

// ---- API client ----

export const api = {
  sessions: {
    start: (mode: 'freeform' | 'target', target_ms?: number, idempotencyKey?: string) =>
      invoke<StartSessionResponse>('sessions-start', { mode, target_ms }, idempotencyKey),

    stop: (session_id: string, idempotencyKey?: string, forfeited = false) =>
      invoke<StopSessionResponse>(
        'sessions-stop',
        // getTimezoneOffset lets the server count streak days in the
        // user's local calendar instead of UTC.
        { session_id, tz_offset_minutes: new Date().getTimezoneOffset(), forfeited },
        idempotencyKey,
      ),

    heartbeat: (session_id: string) =>
      invoke<{ ok: boolean }>('sessions-heartbeat', { session_id }),
  },

  player: {
    state: () => invoke<PlayerStateResponse>('player-state'),
  },

  shop: {
    // Catalog reads go straight through RLS (active items only); all
    // mutations go through edge functions.
    catalog: async (): Promise<ShopItem[]> => {
      const { data, error } = await supabase
        .from('shop_items')
        .select('id, name, description, category, price, currency, effect, sort_order')
        .order('sort_order');
      if (error) throw new Error(error.message);
      return (data ?? []) as ShopItem[];
    },

    purchase: (item_id: string, idempotencyKey?: string) =>
      invoke<PurchaseResponse>('shop-purchase', { item_id }, idempotencyKey),
  },

  boosts: {
    activate: (item_id: string) =>
      invoke<ActivateBoostResponse>('boosts-activate', { item_id }),
  },
};
