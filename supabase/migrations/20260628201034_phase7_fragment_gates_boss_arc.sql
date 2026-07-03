-- Phase 7: per-location two-stage loop (see PLAN.md).
-- Each location is now GATE → BOSS. In the gate stage, verified focus time
-- drips location-themed "fragments" (a per-location progress counter, not a
-- wallet currency — unbuyable, earned only by focus). When the player has
-- collected enough, they manually break the gate, revealing the boss. In the
-- boss stage, verified focus drains boss HP; the killing blow auto-advances
-- to the next location's gate. This replaces the old single progress_percent
-- bar, the level-gated advance, and the chainbreaker item.

-- ---- Schema additions ----

ALTER TABLE public.map_locations
  ADD COLUMN gate_label         text    NOT NULL DEFAULT 'Break the Chains',
  ADD COLUMN fragment_name      text    NOT NULL DEFAULT 'Fragment',
  ADD COLUMN fragments_required integer NOT NULL DEFAULT 4;

ALTER TABLE public.player_map_progress
  ADD COLUMN stage                text   NOT NULL DEFAULT 'gate' CHECK (stage IN ('gate','boss')),
  ADD COLUMN fragments_collected  integer NOT NULL DEFAULT 0,
  ADD COLUMN fragment_progress_ms bigint  NOT NULL DEFAULT 0;

-- ---- Rebuild the location ladder as a journey ending at Zalthar ----
-- "Zalthar's Chains" is no longer a place — the chains are the Hold's gate.
-- Clean slate for progress since the gate/boss model makes old rows moot.

DELETE FROM public.player_map_progress;
DELETE FROM public.map_locations WHERE id = 'zalthars_chains';

-- Re-number survivors into a clean 0..3 path (sort_order is UNIQUE, so the
-- freed slot 1 cascades down without collisions).
UPDATE public.map_locations SET sort_order = 1 WHERE id = 'swirling_depths';
UPDATE public.map_locations SET sort_order = 2 WHERE id = 'the_vexed_ruins';
UPDATE public.map_locations SET sort_order = 3 WHERE id = 'withered_plains';

UPDATE public.map_locations SET
  name = 'Zalthar''s Hold', unlock_level = 1,
  gate_label = 'Break the Chains', fragment_name = 'Chainbreaker Fragment', fragments_required = 4,
  boss = '{"bossName":"The Warden","maxHp":180,"rewardDust":150,"rewardShards":5,"rewardXp":300}'::jsonb
WHERE id = 'zalthars_hold';

UPDATE public.map_locations SET
  unlock_level = 1,
  gate_label = 'Break the Seal', fragment_name = 'Sigil Fragment', fragments_required = 8,
  boss = '{"bossName":"Depth Lurker","maxHp":480,"rewardDust":350,"rewardShards":10,"rewardXp":700}'::jsonb
WHERE id = 'swirling_depths';

UPDATE public.map_locations SET
  unlock_level = 1,
  gate_label = 'Raise the Portcullis', fragment_name = 'Rune Fragment', fragments_required = 12,
  boss = '{"bossName":"Ruin Shade","maxHp":840,"rewardDust":600,"rewardShards":18,"rewardXp":1200}'::jsonb
WHERE id = 'the_vexed_ruins';

UPDATE public.map_locations SET
  unlock_level = 1,
  gate_label = 'Shatter the Ward', fragment_name = 'Ward Fragment', fragments_required = 16,
  boss = '{"bossName":"Plains Revenant","maxHp":1320,"rewardDust":1000,"rewardShards":28,"rewardXp":2000}'::jsonb
WHERE id = 'withered_plains';

INSERT INTO public.map_locations
  (id, name, region_id, position_x, position_y, unlock_level, sort_order, gate_label, fragment_name, fragments_required, boss)
VALUES
  ('zalthars_throne', 'Zalthar''s Throne', 'zalreth', 0.5, 0.05, 1, 4,
   'Breach the Throne', 'Throne Key Fragment', 24,
   '{"bossName":"Zalthar","maxHp":2280,"rewardDust":2000,"rewardShards":50,"rewardXp":4000}'::jsonb);

UPDATE public.player_profiles SET progress_percent = 0;

-- ---- Lazy start: first progress row begins in the gate stage ----

CREATE OR REPLACE FUNCTION public.ensure_map_start(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO player_map_progress
    (user_id, location_id, status, stage, fragments_collected, fragment_progress_ms, boss_hp_remaining)
  SELECT p_user_id, l.id, 'current', 'gate', 0, 0, NULL
  FROM map_locations l
  WHERE l.active
    AND NOT EXISTS (SELECT 1 FROM player_map_progress p WHERE p.user_id = ensure_map_start.p_user_id)
  ORDER BY l.sort_order
  LIMIT 1
  ON CONFLICT (user_id, location_id) DO NOTHING;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ensure_map_start(uuid) FROM PUBLIC, anon, authenticated;

-- ---- complete_focus_session: gate accrual OR boss damage + auto-advance ----
-- p_damage is gone — the RPC derives fragments/damage from p_elapsed_ms (the
-- verified rewardable ms the edge already passes). Gate sessions accrue
-- fragments (1 per 30 verified min, carry-over banked); boss sessions drain
-- 1 HP/min and, on the kill, pay boss rewards and roll into the next gate.

DROP FUNCTION public.complete_focus_session(uuid, uuid, timestamptz, bigint, integer, integer, integer, integer, integer, date, integer);

CREATE FUNCTION public.complete_focus_session(
  p_session_id     uuid,
  p_user_id        uuid,
  p_ended_at       timestamptz,
  p_elapsed_ms     bigint,
  p_dust           integer,
  p_shards         integer,
  p_xp             integer,
  p_streak         integer DEFAULT NULL,
  p_focus_date     date    DEFAULT NULL,
  p_streak_freezes integer DEFAULT NULL
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
  v_streak_freezes       INTEGER;
  -- current location + progress
  v_loc_id               TEXT;
  v_loc_boss             JSONB;
  v_frags_req            INTEGER;
  v_gate_label           TEXT;
  v_fragment_name        TEXT;
  v_stage                TEXT;
  v_frag_collected       INTEGER;
  v_frag_progress_ms     BIGINT;
  v_hp                   INTEGER;
  v_max_hp               INTEGER;
  -- working
  v_frag_interval        CONSTANT BIGINT := 1800000; -- 30 min / fragment
  v_total_ms             BIGINT;
  v_earned               INTEGER;
  v_capacity             INTEGER;
  v_gained               INTEGER := 0;
  v_new_collected        INTEGER;
  v_new_frag_progress    BIGINT  := 0;
  v_gate_ready           BOOLEAN := false;
  v_damage               INTEGER := 0;
  v_damage_dealt         INTEGER := 0;
  v_defeated             BOOLEAN := false;
  v_advanced_to          TEXT    := NULL;
  v_next_id              TEXT;
  v_cur_sort             INTEGER;
  v_boss_dust            INTEGER := 0;
  v_boss_shards          INTEGER := 0;
  v_boss_xp              INTEGER := 0;
  v_map                  JSONB   := NULL;
BEGIN
  PERFORM id FROM public.focus_sessions
  WHERE id = p_session_id AND user_id = p_user_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;

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

  -- ---- Map progress at the player's current location ----
  PERFORM public.ensure_map_start(p_user_id);

  SELECT l.id, l.boss, l.fragments_required, l.gate_label, l.fragment_name, l.sort_order,
         p.stage, p.fragments_collected, p.fragment_progress_ms, p.boss_hp_remaining
  INTO v_loc_id, v_loc_boss, v_frags_req, v_gate_label, v_fragment_name, v_cur_sort,
       v_stage, v_frag_collected, v_frag_progress_ms, v_hp
  FROM public.player_map_progress p
  JOIN public.map_locations l ON l.id = p.location_id
  WHERE p.user_id = p_user_id AND p.status = 'current'
  FOR UPDATE OF p;

  IF FOUND AND v_stage = 'gate' THEN
    -- Accrue fragments from banked + this session's verified time.
    v_total_ms      := COALESCE(v_frag_progress_ms, 0) + GREATEST(p_elapsed_ms, 0);
    v_earned        := (v_total_ms / v_frag_interval)::integer;
    v_capacity      := GREATEST(v_frags_req - v_frag_collected, 0);
    v_gained        := LEAST(v_earned, v_capacity);
    v_new_collected := v_frag_collected + v_gained;
    v_gate_ready    := v_new_collected >= v_frags_req;
    v_new_frag_progress := CASE WHEN v_gate_ready THEN 0
                                ELSE v_total_ms - (v_earned::bigint * v_frag_interval) END;

    UPDATE public.player_map_progress
    SET fragments_collected = v_new_collected,
        fragment_progress_ms = v_new_frag_progress,
        updated_at = now()
    WHERE user_id = p_user_id AND location_id = v_loc_id;

    v_new_progress := CASE WHEN v_frags_req > 0 THEN (v_new_collected * 100) / v_frags_req ELSE 0 END;
    v_map := jsonb_build_object(
      'location_id', v_loc_id, 'stage', 'gate',
      'gate_label', v_gate_label, 'fragment_name', v_fragment_name,
      'fragments_collected', v_new_collected, 'fragments_required', v_frags_req,
      'fragments_gained', v_gained, 'fragment_progress_ms', v_new_frag_progress,
      'fragment_interval_ms', v_frag_interval, 'gate_ready', v_gate_ready,
      'boss_name', v_loc_boss->>'bossName', 'damage_dealt', 0,
      'hp_remaining', NULL, 'max_hp', (v_loc_boss->>'maxHp')::integer,
      'defeated', false, 'advanced_to', NULL,
      'rewards', jsonb_build_object('dust', 0, 'shards', 0, 'xp', 0)
    );

  ELSIF FOUND AND v_stage = 'boss' AND v_loc_boss IS NOT NULL THEN
    v_max_hp := (v_loc_boss->>'maxHp')::integer;
    v_hp     := COALESCE(v_hp, v_max_hp);
    v_damage := (GREATEST(p_elapsed_ms, 0) / 60000)::integer; -- 1 HP / verified min

    IF v_damage > 0 AND v_hp > 0 THEN
      v_damage_dealt := LEAST(v_damage, v_hp);
      v_hp := v_hp - v_damage_dealt;

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

        -- The killing blow completes this location and opens the next gate.
        UPDATE public.player_map_progress
        SET status = 'completed', updated_at = now()
        WHERE user_id = p_user_id AND location_id = v_loc_id;

        SELECT id INTO v_next_id FROM public.map_locations
        WHERE active AND sort_order > v_cur_sort
        ORDER BY sort_order LIMIT 1;

        IF v_next_id IS NOT NULL THEN
          v_advanced_to := v_next_id;
          INSERT INTO public.player_map_progress
            (user_id, location_id, status, stage, fragments_collected, fragment_progress_ms, boss_hp_remaining)
          VALUES (p_user_id, v_next_id, 'current', 'gate', 0, 0, NULL)
          ON CONFLICT (user_id, location_id)
          DO UPDATE SET status = 'current', stage = 'gate', fragments_collected = 0,
                        fragment_progress_ms = 0, boss_hp_remaining = NULL, updated_at = now();
        END IF;
      ELSE
        UPDATE public.player_map_progress
        SET boss_hp_remaining = v_hp, updated_at = now()
        WHERE user_id = p_user_id AND location_id = v_loc_id;
      END IF;
    END IF;

    v_new_progress := CASE WHEN v_max_hp > 0 THEN ((v_max_hp - v_hp) * 100) / v_max_hp ELSE 0 END;
    v_map := jsonb_build_object(
      'location_id', v_loc_id, 'stage', 'boss',
      'gate_label', v_gate_label, 'fragment_name', v_fragment_name,
      'fragments_collected', v_frags_req, 'fragments_required', v_frags_req,
      'fragments_gained', 0, 'fragment_progress_ms', 0,
      'fragment_interval_ms', v_frag_interval, 'gate_ready', true,
      'boss_name', v_loc_boss->>'bossName', 'damage_dealt', v_damage_dealt,
      'hp_remaining', v_hp, 'max_hp', v_max_hp,
      'defeated', v_defeated, 'advanced_to', v_advanced_to,
      'rewards', jsonb_build_object('dust', v_boss_dust, 'shards', v_boss_shards, 'xp', v_boss_xp)
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
    streak_freezes        = CASE WHEN p_focus_date IS NOT NULL THEN COALESCE(p_streak_freezes, streak_freezes) ELSE streak_freezes END,
    last_focus_date       = COALESCE(p_focus_date, last_focus_date),
    updated_at            = now()
  WHERE user_id = p_user_id
  RETURNING dust, shards, total_focus_time_ms, current_streak, longest_streak, total_bosses_defeated, streak_freezes
  INTO v_new_dust, v_new_shards, v_new_total_focus_ms, v_cur_streak, v_longest_streak, v_total_bosses, v_streak_freezes;

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
    'streak_freezes',        v_streak_freezes,
    'total_bosses_defeated', v_total_bosses,
    'map',                   v_map
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.complete_focus_session(uuid, uuid, timestamptz, bigint, integer, integer, integer, integer, date, integer) FROM PUBLIC, anon, authenticated;

-- ---- break_gate: the one manual action (gate → boss) ----
-- Consumes the collected fragments (which were the gate's price) and reveals
-- the boss. Idempotency is structural: it only fires from the gate stage with
-- a full fragment count, so a double call just hits not_in_gate_stage.

CREATE FUNCTION public.break_gate(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_loc_id         TEXT;
  v_boss           JSONB;
  v_stage          TEXT;
  v_frag_collected INTEGER;
  v_frags_req      INTEGER;
  v_max_hp         INTEGER;
BEGIN
  PERFORM public.ensure_map_start(p_user_id);

  SELECT l.id, l.boss, l.fragments_required, p.stage, p.fragments_collected
  INTO v_loc_id, v_boss, v_frags_req, v_stage, v_frag_collected
  FROM public.player_map_progress p
  JOIN public.map_locations l ON l.id = p.location_id
  WHERE p.user_id = p_user_id AND p.status = 'current'
  FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_current_location'; END IF;
  IF v_boss IS NULL THEN RAISE EXCEPTION 'no_boss'; END IF;
  IF v_stage <> 'gate' THEN RAISE EXCEPTION 'not_in_gate_stage'; END IF;
  IF v_frag_collected < v_frags_req THEN RAISE EXCEPTION 'gate_not_ready'; END IF;

  v_max_hp := (v_boss->>'maxHp')::integer;
  UPDATE public.player_map_progress
  SET stage = 'boss', boss_hp_remaining = v_max_hp, fragment_progress_ms = 0, updated_at = now()
  WHERE user_id = p_user_id AND location_id = v_loc_id;

  RETURN jsonb_build_object(
    'location_id',      v_loc_id,
    'stage',            'boss',
    'boss_name',        v_boss->>'bossName',
    'max_hp',           v_max_hp,
    'hp_remaining',     v_max_hp,
    'progress_percent', 0
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.break_gate(uuid) FROM PUBLIC, anon, authenticated;

-- ---- Retire the old level/chainbreaker-gated advance ----
DROP FUNCTION public.advance_map_location(uuid, text);
