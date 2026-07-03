-- Phase 5: streak freezes (see PLAN.md).
-- Banked freezes (cap 2) earned every 7th consecutive day and spent
-- retroactively when missed days are covered. The freeze math lives in
-- shared/economy.ts (advanceStreak); the RPC just persists the balance
-- the edge function computed, exactly like p_streak.

ALTER TABLE public.player_profiles
  ADD COLUMN streak_freezes integer NOT NULL DEFAULT 0 CHECK (streak_freezes >= 0);

-- New trailing parameter, so DROP + CREATE (names are part of the
-- PostgREST call contract).
DROP FUNCTION public.complete_focus_session(uuid, uuid, timestamptz, bigint, integer, integer, integer, integer, integer, date);

CREATE FUNCTION public.complete_focus_session(
  p_session_id     uuid,
  p_user_id        uuid,
  p_ended_at       timestamptz,
  p_elapsed_ms     bigint,
  p_dust           integer,
  p_shards         integer,
  p_xp             integer,
  p_damage         integer DEFAULT 0,
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
  v_streak_freezes       INTEGER;
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
    streak_freezes        = CASE WHEN p_focus_date IS NOT NULL THEN COALESCE(p_streak_freezes, streak_freezes) ELSE streak_freezes END,
    last_focus_date       = COALESCE(p_focus_date, last_focus_date),
    updated_at            = now()
  WHERE user_id = p_user_id
  RETURNING dust, shards, total_focus_time_ms, current_streak, longest_streak, streak_freezes, total_bosses_defeated
  INTO v_new_dust, v_new_shards, v_new_total_focus_ms, v_cur_streak, v_longest_streak, v_streak_freezes, v_total_bosses;

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
    'boss',                  v_boss
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.complete_focus_session(uuid, uuid, timestamptz, bigint, integer, integer, integer, integer, integer, date, integer) FROM PUBLIC, anon, authenticated;
