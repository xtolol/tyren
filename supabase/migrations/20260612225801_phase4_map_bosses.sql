-- Phase 4: map, bosses, progression (see PLAN.md).
-- The server owns the map: a catalog seeded from the old
-- assets/data/mapData.json, per-player progress rows, boss damage paid
-- inside complete_focus_session, and a chainbreaker-gated advance.

-- ---- Tables ----

CREATE TABLE public.map_locations (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  region_id    text NOT NULL,
  position_x   numeric NOT NULL,
  position_y   numeric NOT NULL,
  unlock_level integer NOT NULL DEFAULT 1,
  sort_order   integer NOT NULL UNIQUE,
  -- e.g. {"bossName":"Chain Warden","maxHp":500,
  --       "rewardDust":200,"rewardShards":10,"rewardXp":500}
  boss         jsonb,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Only locations the player has reached get a row; locked/discovered
-- are derived at read time from unlock_level + predecessor completion,
-- so level-ups never need progress-row maintenance.
CREATE TABLE public.player_map_progress (
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id       text NOT NULL REFERENCES public.map_locations(id),
  status            text NOT NULL CHECK (status IN ('current', 'completed')),
  boss_hp_remaining integer,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, location_id)
);

-- ---- RLS ----

ALTER TABLE public.map_locations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_map_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "map_locations: active catalog select" ON public.map_locations
  FOR SELECT TO authenticated USING (active);
CREATE POLICY "player_map_progress: own rows select" ON public.player_map_progress
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- ---- Seed (from assets/data/mapData.json) ----

INSERT INTO public.map_locations (id, name, region_id, position_x, position_y, unlock_level, sort_order, boss) VALUES
('zalthars_hold',   'Zalthar''s Hold',   'zalreth', 0.5, 0.7,  1, 0, NULL),
('zalthars_chains', 'Zalthar''s Chains', 'zalreth', 0.3, 0.5,  3, 1, '{"bossName":"Chain Warden","maxHp":500,"rewardDust":200,"rewardShards":10,"rewardXp":500}'),
('swirling_depths', 'Swirling Depths',   'zalreth', 0.7, 0.4,  5, 2, '{"bossName":"Depth Lurker","maxHp":800,"rewardDust":350,"rewardShards":15,"rewardXp":750}'),
('the_vexed_ruins', 'The Vexed Ruins',   'zalreth', 0.4, 0.25, 8, 3, '{"bossName":"Ruin Shade","maxHp":1200,"rewardDust":500,"rewardShards":25,"rewardXp":1000}'),
('withered_plains', 'Withered Plains',   'zalreth', 0.6, 0.1, 12, 4, '{"bossName":"Plains Revenant","maxHp":2000,"rewardDust":800,"rewardShards":40,"rewardXp":1500}');

-- ---- Lazy start: first progress row (service-role only) ----

CREATE OR REPLACE FUNCTION public.ensure_map_start(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO player_map_progress (user_id, location_id, status, boss_hp_remaining)
  SELECT p_user_id, l.id, 'current', (l.boss->>'maxHp')::integer
  FROM map_locations l
  WHERE l.active
    AND NOT EXISTS (SELECT 1 FROM player_map_progress p WHERE p.user_id = ensure_map_start.p_user_id)
  ORDER BY l.sort_order
  LIMIT 1
  ON CONFLICT (user_id, location_id) DO NOTHING;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ensure_map_start(uuid) FROM PUBLIC, anon, authenticated;

-- ---- complete_focus_session: boss damage + progress redefinition ----
-- p_progress is gone: progress_percent now means "boss HP dealt at the
-- player's current map location / max HP" (absolute, reset on advance)
-- instead of the old saturate-at-100-forever accumulator. p_damage is
-- the server-computed boss damage for this session (verified minutes).
-- Same arg types as before but a renamed parameter, so DROP + CREATE.

DROP FUNCTION public.complete_focus_session(uuid, uuid, timestamptz, bigint, integer, integer, integer, integer, integer, date);

CREATE FUNCTION public.complete_focus_session(
  p_session_id uuid,
  p_user_id    uuid,
  p_ended_at   timestamptz,
  p_elapsed_ms bigint,
  p_dust       integer,
  p_shards     integer,
  p_xp         integer,
  p_damage     integer DEFAULT 0,
  p_streak     integer DEFAULT NULL,
  p_focus_date date    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_xp               INTEGER;
  v_new_level            INTEGER;
  v_new_xp_to_next_level INTEGER;
  v_new_progress         INTEGER := 0;
  v_new_dust             INTEGER;
  v_new_shards           INTEGER;
  v_new_total_focus_ms   BIGINT;
  v_cur_streak           INTEGER;
  v_longest_streak       INTEGER;
  v_total_bosses         INTEGER;
  v_loc_id               TEXT;
  v_loc_boss             JSONB;
  v_hp                   INTEGER;
  v_max_hp               INTEGER;
  v_damage_dealt         INTEGER := 0;
  v_defeated             BOOLEAN := false;
  v_boss_dust            INTEGER := 0;
  v_boss_shards          INTEGER := 0;
  v_boss_xp              INTEGER := 0;
  v_boss                 JSONB   := NULL;
BEGIN
  PERFORM id FROM public.focus_sessions
  WHERE id = p_session_id AND user_id = p_user_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;

  UPDATE public.focus_sessions
  SET status = 'completed', ended_at = p_ended_at
  WHERE id = p_session_id;

  INSERT INTO public.reward_ledger (user_id, session_id, dust, shards, xp, reason)
  VALUES (p_user_id, p_session_id, p_dust, p_shards, p_xp, 'session_complete');

  IF p_dust > 0 THEN
    INSERT INTO public.currency_ledger (user_id, currency, delta, reason)
    VALUES (p_user_id, 'dust', p_dust, 'session_complete');
  END IF;
  IF p_shards > 0 THEN
    INSERT INTO public.currency_ledger (user_id, currency, delta, reason)
    VALUES (p_user_id, 'shards', p_shards, 'session_complete');
  END IF;

  -- ---- Boss damage at the player's current map location ----
  PERFORM public.ensure_map_start(p_user_id);

  SELECT l.id, l.boss, p.boss_hp_remaining
  INTO v_loc_id, v_loc_boss, v_hp
  FROM public.player_map_progress p
  JOIN public.map_locations l ON l.id = p.location_id
  WHERE p.user_id = p_user_id AND p.status = 'current'
  FOR UPDATE OF p;

  IF v_loc_boss IS NOT NULL THEN
    v_max_hp := (v_loc_boss->>'maxHp')::integer;
    v_hp     := COALESCE(v_hp, v_max_hp);

    IF p_damage > 0 AND v_hp > 0 THEN
      v_damage_dealt := LEAST(p_damage, v_hp);
      v_hp := v_hp - v_damage_dealt;

      UPDATE public.player_map_progress
      SET boss_hp_remaining = v_hp, updated_at = now()
      WHERE user_id = p_user_id AND location_id = v_loc_id;

      IF v_hp = 0 THEN
        v_defeated    := true;
        v_boss_dust   := COALESCE((v_loc_boss->>'rewardDust')::integer, 0);
        v_boss_shards := COALESCE((v_loc_boss->>'rewardShards')::integer, 0);
        v_boss_xp     := COALESCE((v_loc_boss->>'rewardXp')::integer, 0);

        INSERT INTO public.reward_ledger (user_id, session_id, dust, shards, xp, reason)
        VALUES (p_user_id, p_session_id, v_boss_dust, v_boss_shards, v_boss_xp, 'boss_defeated');

        IF v_boss_dust > 0 THEN
          INSERT INTO public.currency_ledger (user_id, currency, delta, reason)
          VALUES (p_user_id, 'dust', v_boss_dust, 'boss_defeated:' || v_loc_id);
        END IF;
        IF v_boss_shards > 0 THEN
          INSERT INTO public.currency_ledger (user_id, currency, delta, reason)
          VALUES (p_user_id, 'shards', v_boss_shards, 'boss_defeated:' || v_loc_id);
        END IF;
      END IF;
    END IF;

    v_new_progress := ((v_max_hp - v_hp) * 100) / v_max_hp;
    v_boss := jsonb_build_object(
      'location_id',  v_loc_id,
      'boss_name',    v_loc_boss->>'bossName',
      'damage_dealt', v_damage_dealt,
      'hp_remaining', v_hp,
      'max_hp',       v_max_hp,
      'defeated',     v_defeated,
      'rewards',      jsonb_build_object('dust', v_boss_dust, 'shards', v_boss_shards, 'xp', v_boss_xp)
    );
  END IF;

  SELECT xp, level, xp_to_next_level
  INTO v_new_xp, v_new_level, v_new_xp_to_next_level
  FROM public.player_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_new_xp := v_new_xp + p_xp + v_boss_xp;
  WHILE v_new_xp >= v_new_xp_to_next_level LOOP
    v_new_xp              := v_new_xp - v_new_xp_to_next_level;
    v_new_level           := v_new_level + 1;
    v_new_xp_to_next_level := 1000 * v_new_level;
  END LOOP;

  UPDATE public.player_profiles SET
    dust                  = dust + p_dust + v_boss_dust,
    shards                = shards + p_shards + v_boss_shards,
    xp                    = v_new_xp,
    level                 = v_new_level,
    xp_to_next_level      = v_new_xp_to_next_level,
    total_focus_time_ms   = total_focus_time_ms + p_elapsed_ms,
    progress_percent      = v_new_progress,
    total_bosses_defeated = total_bosses_defeated + CASE WHEN v_defeated THEN 1 ELSE 0 END,
    current_streak        = CASE WHEN p_focus_date IS NOT NULL THEN COALESCE(p_streak, current_streak) ELSE current_streak END,
    longest_streak        = CASE WHEN p_focus_date IS NOT NULL THEN GREATEST(longest_streak, COALESCE(p_streak, 0)) ELSE longest_streak END,
    last_focus_date       = COALESCE(p_focus_date, last_focus_date),
    updated_at            = now()
  WHERE user_id = p_user_id
  RETURNING dust, shards, total_focus_time_ms, current_streak, longest_streak, total_bosses_defeated
  INTO v_new_dust, v_new_shards, v_new_total_focus_ms, v_cur_streak, v_longest_streak, v_total_bosses;

  RETURN jsonb_build_object(
    'level',                 v_new_level,
    'new_xp',                v_new_xp,
    'xp_to_next_level',      v_new_xp_to_next_level,
    'progress_percent',      v_new_progress,
    'dust',                  v_new_dust,
    'shards',                v_new_shards,
    'total_focus_time_ms',   v_new_total_focus_ms,
    'current_streak',        v_cur_streak,
    'longest_streak',        v_longest_streak,
    'total_bosses_defeated', v_total_bosses,
    'boss',                  v_boss
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.complete_focus_session(uuid, uuid, timestamptz, bigint, integer, integer, integer, integer, integer, date) FROM PUBLIC, anon, authenticated;

-- ---- Advance to the next location (service-role only) ----
-- Requirements: target is the immediate next active location, the
-- current location's boss is down (or it has none), player level meets
-- unlock_level, and one chainbreaker is consumed from the inventory —
-- every location is chained; the chainbreaker is what breaks the path
-- open. progress_percent resets with the new location's fresh boss.

CREATE OR REPLACE FUNCTION public.advance_map_location(p_user_id uuid, p_location_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_level    integer;
  v_cur_id   text;
  v_cur_sort integer;
  v_cur_boss jsonb;
  v_cur_hp   integer;
  v_target   map_locations%ROWTYPE;
  v_next_hp  integer;
  v_quantity integer;
BEGIN
  PERFORM public.ensure_map_start(p_user_id);

  SELECT level INTO v_level
  FROM player_profiles WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;

  SELECT l.id, l.sort_order, l.boss, p.boss_hp_remaining
  INTO v_cur_id, v_cur_sort, v_cur_boss, v_cur_hp
  FROM player_map_progress p
  JOIN map_locations l ON l.id = p.location_id
  WHERE p.user_id = p_user_id AND p.status = 'current'
  FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_current_location'; END IF;

  SELECT * INTO v_target FROM map_locations WHERE id = p_location_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'location_not_found'; END IF;

  IF v_target.sort_order <= v_cur_sort THEN RAISE EXCEPTION 'not_next_location'; END IF;
  PERFORM 1 FROM map_locations
  WHERE active AND sort_order > v_cur_sort AND sort_order < v_target.sort_order;
  IF FOUND THEN RAISE EXCEPTION 'not_next_location'; END IF;

  IF v_cur_boss IS NOT NULL AND COALESCE(v_cur_hp, 1) > 0 THEN
    RAISE EXCEPTION 'boss_not_defeated';
  END IF;
  IF v_level < v_target.unlock_level THEN RAISE EXCEPTION 'level_too_low'; END IF;

  UPDATE player_inventory
  SET quantity = quantity - 1, updated_at = now()
  WHERE user_id = p_user_id AND item_id = 'chainbreaker' AND quantity > 0
  RETURNING quantity INTO v_quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'chainbreaker_required'; END IF;

  UPDATE player_map_progress
  SET status = 'completed', updated_at = now()
  WHERE user_id = p_user_id AND location_id = v_cur_id;

  v_next_hp := (v_target.boss->>'maxHp')::integer;
  INSERT INTO player_map_progress (user_id, location_id, status, boss_hp_remaining)
  VALUES (p_user_id, p_location_id, 'current', v_next_hp)
  ON CONFLICT (user_id, location_id)
  DO UPDATE SET status = 'current', boss_hp_remaining = EXCLUDED.boss_hp_remaining, updated_at = now();

  UPDATE player_profiles
  SET progress_percent = 0, updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'location_id',           p_location_id,
    'status',                'current',
    'boss_hp_remaining',     v_next_hp,
    'completed_location_id', v_cur_id,
    'chainbreaker_quantity', v_quantity,
    'progress_percent',      0
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.advance_map_location(uuid, text) FROM PUBLIC, anon, authenticated;

-- ---- progress_percent backfill ----
-- Under the new definition every existing player is at Zalthar's Hold
-- (no boss), so their boss progress is 0. The old accumulated values
-- are meaningless under the new semantics.

UPDATE public.player_profiles SET progress_percent = 0;
