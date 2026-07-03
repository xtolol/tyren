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

// ---- Relics (Phase 8) ----

export type SealRank = 'bronze' | 'silver' | 'gold' | 'mythic';

// A relic the player owns, as stored in player_relics.
export interface PlayerRelicEntry {
  location_id: string;
  seal: SealRank;
  seal_sessions: number;
  equipped_slot: 1 | 2 | null;
  earned_at: string;
}

// Per-relic outcome of a session stop (all owned relics, post-attunement).
export interface RelicResult {
  location_id: string;
  relic_name: string;
  perk_name: string;
  seal: SealRank;
  seal_sessions: number;
  equipped_slot: 1 | 2 | null;
  ranked_up: boolean;
}

// The relic left behind by a freshly defeated boss.
export interface RelicEarned {
  location_id: string;
  relic_name: string;
  perk_name: string;
  seal: SealRank;
  auto_equipped: boolean;
}

// The map outcome of a session. In the gate stage it reports fragment
// accrual; in the boss stage, damage dealt and (on the kill) the auto-advance
// to the next location. null only on a forfeited session.
export interface MapResult {
  location_id: string;
  stage: 'gate' | 'boss';
  gate_label: string;
  fragment_name: string;
  fragments_collected: number;
  fragments_required: number;
  fragments_gained: number;
  fragment_progress_ms: number;
  fragment_interval_ms: number;
  gate_ready: boolean;
  boss_name: string | null;
  damage_dealt: number;
  hp_remaining: number | null;
  max_hp: number | null;
  defeated: boolean;
  // Set to the next location id when the killing blow auto-advanced the path.
  advanced_to: string | null;
  // The equipped-perk multiplier applied to this session's map progress.
  perk_multiplier: number;
  // Set when the killing blow granted this location's relic.
  relic_earned: RelicEarned | null;
  rewards: SessionRewards;
}

export interface StopSessionResponse {
  session_id: string;
  elapsed_ms: number;
  completed: boolean;
  forfeited: boolean;
  rewarded_ms: number;
  rewards: SessionRewards;
  // Map progress at the current location; null when forfeited.
  map: MapResult | null;
  // All owned relics after this session's attunement; [] when forfeited.
  relics: RelicResult[];
  level: number;
  new_xp: number;
  xp_to_next_level: number;
  progress_percent: number;
  dust: number;
  shards: number;
  total_focus_time_ms: number;
  current_streak: number;
  longest_streak: number;
  streak_freezes: number;
  total_bosses_defeated: number;
  // Whether this session met the streak bar (≥ verified 25 min).
  qualifies: boolean;
  // How many banked freezes this session spent / banked (for UI nudges).
  freezes_consumed: number;
  freezes_earned: number;
  // The user-local focus day persisted by this session, or null if it
  // didn't qualify / was forfeited.
  streak_focus_date: string | null;
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
  streak_freezes: number;
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
  type?: 'reward_multiplier' | 'grant_dust' | 'grant_shards' | 'grant_streak_freeze' | 'key_item';
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
  // Level-exclusive items: buying demands this location's relic at the seal.
  required_location_id: string | null;
  required_seal: SealRank | null;
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
  streak_freezes: number;
}

export interface ActivateBoostResponse {
  item_id: string;
  quantity: number;
  boost: ActiveBoost;
}

export interface MapBoss {
  bossName: string;
  maxHp: number;
  rewardDust: number;
  rewardShards: number;
  rewardXp: number;
}

export interface MapLocation {
  id: string;
  name: string;
  region_id: string;
  position_x: number;
  position_y: number;
  unlock_level: number;
  sort_order: number;
  // The gate that binds this location: its verb (e.g. "Break the Chains"),
  // the themed fragment focus drips to open it, and how many are needed.
  gate_label: string;
  fragment_name: string;
  fragments_required: number;
  boss: MapBoss | null;
  // The relic this location leaves behind (and its perk + codex flavor text).
  relic_name: string;
  perk_name: string;
  relic_flavor: string;
}

// Only reached locations have an entry; everything else is locked or
// up-next, derived client-side from path order. `stage` is which beat of the
// location the player is on: collecting fragments ('gate') or fighting the
// boss ('boss').
export interface MapProgressEntry {
  location_id: string;
  status: 'current' | 'completed';
  stage: 'gate' | 'boss';
  fragments_collected: number;
  fragment_progress_ms: number;
  boss_hp_remaining: number | null;
}

// Result of breaking the current gate (gate → boss, full HP).
export interface BreakGateResponse {
  location_id: string;
  stage: 'boss';
  boss_name: string;
  max_hp: number;
  hp_remaining: number;
  progress_percent: number;
}

// Rolling 7-day recap, derived server-side from the ledgers.
export interface WeeklyRecap {
  window_days: number;
  dust: number;
  shards: number;
  xp: number;
  focus_ms: number;
  damage: number;
  sessions: number;
}

// An active entitlement (e.g. the Crystal Pass). Granted only server-side
// from a verified store purchase; expired rows are filtered out.
export interface Entitlement {
  entitlement: string;
  expires_at: string | null;
}

export interface PlayerStateResponse {
  profile: PlayerProfile;
  active_session: ActiveSession | null;
  inventory: InventoryEntry[];
  active_boosts: ActiveBoost[];
  map_progress: MapProgressEntry[];
  relics: PlayerRelicEntry[];
  entitlements: Entitlement[];
  recap: WeeklyRecap;
}

// Result of setting the perk loadout: all owned relics with fresh slots.
export interface LoadoutResponse {
  relics: {
    location_id: string;
    relic_name: string;
    perk_name: string;
    seal: SealRank;
    seal_sessions: number;
    equipped_slot: 1 | 2 | null;
  }[];
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
        .select('id, name, description, category, price, currency, effect, sort_order, required_location_id, required_seal')
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

  map: {
    // Catalog reads go straight through RLS (active locations only),
    // same pattern as the shop catalog.
    locations: async (): Promise<MapLocation[]> => {
      const { data, error } = await supabase
        .from('map_locations')
        .select('id, name, region_id, position_x, position_y, unlock_level, sort_order, gate_label, fragment_name, fragments_required, boss, relic_name, perk_name, relic_flavor')
        .order('sort_order');
      if (error) throw new Error(error.message);
      return (data ?? []) as MapLocation[];
    },

    // Breaks the gate at the player's current location (gate → boss). Takes
    // no target — the server acts on wherever the player currently stands.
    breakGate: (idempotencyKey?: string) =>
      invoke<BreakGateResponse>('map-break-gate', {}, idempotencyKey),
  },

  relics: {
    // Sets the two-perk loadout: an ordered array of 0–2 owned location
    // ids (slot 1 first). Naturally idempotent, so no idempotency key.
    setLoadout: (slots: string[]) =>
      invoke<LoadoutResponse>('relics-loadout', { slots }),
  },
};
