-- Dev/test-account helpers: mutate any account's state directly for design
-- and QA work (teleport levels, set seals, grant currency/items, reset).
-- Service-role/SQL-editor only — clients get no grants, so the game stays
-- server-authoritative. Every function takes the account email for
-- convenience in the dashboard SQL editor.

CREATE OR REPLACE FUNCTION public.dev_user(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_user uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users WHERE email = p_email;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'no auth user with email %', p_email;
  END IF;
  RETURN v_user;
END;
$$;

-- Set absolute currency balances (writes the delta through currency_ledger
-- so the ledger invariant holds even for dev edits).
CREATE OR REPLACE FUNCTION public.dev_set_currency(p_email text, p_dust int, p_shards int)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_user uuid := public.dev_user(p_email);
  v_dust int;
  v_shards int;
BEGIN
  SELECT dust, shards INTO v_dust, v_shards FROM player_profiles WHERE user_id = v_user;
  IF p_dust <> v_dust THEN
    INSERT INTO currency_ledger (user_id, currency, delta, reason)
    VALUES (v_user, 'dust', p_dust - v_dust, 'dev_adjust');
  END IF;
  IF p_shards <> v_shards THEN
    INSERT INTO currency_ledger (user_id, currency, delta, reason)
    VALUES (v_user, 'shards', p_shards - v_shards, 'dev_adjust');
  END IF;
  UPDATE player_profiles SET dust = p_dust, shards = p_shards, updated_at = now()
  WHERE user_id = v_user;
  RETURN jsonb_build_object('dust', p_dust, 'shards', p_shards);
END;
$$;

CREATE OR REPLACE FUNCTION public.dev_set_level(p_email text, p_level int, p_xp int DEFAULT 0, p_xp_to_next int DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  UPDATE player_profiles SET
    level = p_level,
    xp = p_xp,
    xp_to_next_level = COALESCE(p_xp_to_next, xp_to_next_level),
    updated_at = now()
  WHERE user_id = public.dev_user(p_email);
END;
$$;

-- Move an account to any point on the map. Marks every earlier location
-- completed, puts the target at 'gate' or 'boss' (boss HP defaults to full),
-- and clears progress past it. Optionally auto-grants a Bronze relic for
-- each completed level so the codex/loadout match the map.
CREATE OR REPLACE FUNCTION public.dev_teleport(
  p_email text,
  p_location_id text,
  p_stage text DEFAULT 'gate',
  p_fragments int DEFAULT 0,
  p_boss_hp int DEFAULT NULL,
  p_grant_relics boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_user uuid := public.dev_user(p_email);
  v_sort int;
  v_max_hp int;
BEGIN
  IF p_stage NOT IN ('gate', 'boss') THEN
    RAISE EXCEPTION 'stage must be gate or boss';
  END IF;
  SELECT sort_order, (boss->>'maxHp')::int INTO v_sort, v_max_hp
  FROM map_locations WHERE id = p_location_id;
  IF v_sort IS NULL THEN
    RAISE EXCEPTION 'no map location with id %', p_location_id;
  END IF;

  DELETE FROM player_map_progress
  WHERE user_id = v_user
    AND location_id IN (SELECT id FROM map_locations WHERE sort_order >= v_sort);

  INSERT INTO player_map_progress (user_id, location_id, status, stage, fragments_collected, fragment_progress_ms, boss_hp_remaining)
  SELECT v_user, id, 'completed', 'boss', fragments_required, 0, 0
  FROM map_locations WHERE sort_order < v_sort
  ON CONFLICT (user_id, location_id) DO UPDATE SET
    status = 'completed', stage = 'boss',
    fragments_collected = EXCLUDED.fragments_collected,
    fragment_progress_ms = 0, boss_hp_remaining = 0, updated_at = now();

  INSERT INTO player_map_progress (user_id, location_id, status, stage, fragments_collected, fragment_progress_ms, boss_hp_remaining)
  VALUES (
    v_user, p_location_id, 'current', p_stage, p_fragments, 0,
    CASE WHEN p_stage = 'boss' THEN COALESCE(p_boss_hp, v_max_hp) ELSE NULL END
  );

  IF p_grant_relics THEN
    INSERT INTO player_relics (user_id, location_id)
    SELECT v_user, id FROM map_locations WHERE sort_order < v_sort
    ON CONFLICT (user_id, location_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('location', p_location_id, 'stage', p_stage, 'fragments', p_fragments);
END;
$$;

-- Upsert a relic at any seal/session count; p_slot 1|2 equips it (bumping
-- whatever held that slot), NULL leaves the loadout untouched.
CREATE OR REPLACE FUNCTION public.dev_set_relic(
  p_email text,
  p_location_id text,
  p_seal text DEFAULT 'bronze',
  p_sessions int DEFAULT 0,
  p_slot int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_user uuid := public.dev_user(p_email);
BEGIN
  IF p_slot IS NOT NULL THEN
    UPDATE player_relics SET equipped_slot = NULL, updated_at = now()
    WHERE user_id = v_user AND equipped_slot = p_slot AND location_id <> p_location_id;
  END IF;
  INSERT INTO player_relics (user_id, location_id, seal, seal_sessions, equipped_slot)
  VALUES (v_user, p_location_id, p_seal, p_sessions, p_slot)
  ON CONFLICT (user_id, location_id) DO UPDATE SET
    seal = EXCLUDED.seal,
    seal_sessions = EXCLUDED.seal_sessions,
    equipped_slot = COALESCE(EXCLUDED.equipped_slot, player_relics.equipped_slot),
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.dev_remove_relic(p_email text, p_location_id text)
RETURNS void
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM player_relics
  WHERE user_id = public.dev_user(p_email) AND location_id = p_location_id;
END;
$$;

-- Add (or with a negative qty, remove) inventory items.
CREATE OR REPLACE FUNCTION public.dev_grant_item(p_email text, p_item_id text, p_qty int DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_user uuid := public.dev_user(p_email);
BEGIN
  INSERT INTO player_inventory (user_id, item_id, quantity)
  VALUES (v_user, p_item_id, GREATEST(p_qty, 0))
  ON CONFLICT (user_id, item_id) DO UPDATE SET
    quantity = GREATEST(player_inventory.quantity + p_qty, 0),
    updated_at = now();
END;
$$;

-- Start a boost as if the item had been activated, without owning it.
CREATE OR REPLACE FUNCTION public.dev_grant_boost(p_email text, p_item_id text, p_hours numeric DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_user uuid := public.dev_user(p_email);
  v_effect jsonb;
BEGIN
  SELECT effect INTO v_effect FROM shop_items WHERE id = p_item_id;
  IF v_effect IS NULL THEN
    RAISE EXCEPTION 'no shop item with id %', p_item_id;
  END IF;
  INSERT INTO active_boosts (user_id, item_id, effect, expires_at)
  VALUES (
    v_user, p_item_id, v_effect,
    now() + COALESCE(p_hours * interval '1 hour', ((v_effect->>'duration_ms')::bigint / 1000.0) * interval '1 second')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.dev_set_streak(p_email text, p_current int, p_longest int DEFAULT NULL, p_freezes int DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  UPDATE player_profiles SET
    current_streak = p_current,
    longest_streak = GREATEST(COALESCE(p_longest, longest_streak), p_current),
    streak_freezes = COALESCE(p_freezes, streak_freezes),
    last_focus_date = CASE WHEN p_current > 0 THEN current_date ELSE NULL END,
    updated_at = now()
  WHERE user_id = public.dev_user(p_email);
END;
$$;

-- Wipe the account back to a fresh start (keeps the auth user).
CREATE OR REPLACE FUNCTION public.dev_reset(p_email text)
RETURNS void
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_user uuid := public.dev_user(p_email);
  v_first text;
BEGIN
  DELETE FROM focus_session_events WHERE user_id = v_user;
  DELETE FROM reward_ledger WHERE user_id = v_user;
  DELETE FROM focus_sessions WHERE user_id = v_user;
  DELETE FROM currency_ledger WHERE user_id = v_user;
  DELETE FROM purchase_ledger WHERE user_id = v_user;
  DELETE FROM player_inventory WHERE user_id = v_user;
  DELETE FROM active_boosts WHERE user_id = v_user;
  DELETE FROM player_relics WHERE user_id = v_user;
  DELETE FROM player_map_progress WHERE user_id = v_user;
  DELETE FROM idempotency_keys WHERE user_id = v_user;

  UPDATE player_profiles SET
    dust = 0, shards = 0, level = 1, xp = 0, xp_to_next_level = 1000,
    progress_percent = 0, total_focus_time_ms = 0, total_items_bought = 0,
    total_bosses_defeated = 0, current_streak = 0, longest_streak = 0,
    last_focus_date = NULL, streak_freezes = 0, updated_at = now()
  WHERE user_id = v_user;

  SELECT id INTO v_first FROM map_locations WHERE active ORDER BY sort_order LIMIT 1;
  INSERT INTO player_map_progress (user_id, location_id, status, stage)
  VALUES (v_user, v_first, 'current', 'gate');
END;
$$;

-- One-glance dump of an account's state.
CREATE OR REPLACE FUNCTION public.dev_snapshot(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_user uuid := public.dev_user(p_email);
BEGIN
  RETURN jsonb_build_object(
    'profile', (SELECT to_jsonb(p) - 'user_id' FROM player_profiles p WHERE user_id = v_user),
    'progress', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'location', location_id, 'status', status, 'stage', stage,
        'fragments', fragments_collected, 'banked_ms', fragment_progress_ms,
        'boss_hp', boss_hp_remaining) ORDER BY location_id), '[]'::jsonb)
      FROM player_map_progress WHERE user_id = v_user),
    'relics', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'location', location_id, 'seal', seal, 'sessions', seal_sessions,
        'slot', equipped_slot) ORDER BY location_id), '[]'::jsonb)
      FROM player_relics WHERE user_id = v_user),
    'inventory', (
      SELECT COALESCE(jsonb_object_agg(item_id, quantity), '{}'::jsonb)
      FROM player_inventory WHERE user_id = v_user AND quantity > 0),
    'boosts', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'item', item_id, 'expires_at', expires_at)), '[]'::jsonb)
      FROM active_boosts WHERE user_id = v_user AND expires_at > now())
  );
END;
$$;

-- Clients never call these: no grants for anon/authenticated.
REVOKE ALL ON FUNCTION
  public.dev_user(text),
  public.dev_set_currency(text, int, int),
  public.dev_set_level(text, int, int, int),
  public.dev_teleport(text, text, text, int, int, boolean),
  public.dev_set_relic(text, text, text, int, int),
  public.dev_remove_relic(text, text),
  public.dev_grant_item(text, text, int),
  public.dev_grant_boost(text, text, numeric),
  public.dev_set_streak(text, int, int, int),
  public.dev_reset(text),
  public.dev_snapshot(text)
FROM PUBLIC, anon, authenticated;
