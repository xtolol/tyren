-- Daily focus streaks: a session of 25+ minutes advances the player's
-- streak (UTC days). Streaks feed a dust bonus computed in the
-- sessions-stop edge function. complete_focus_session persists streak
-- state atomically with rewards and returns it to the client.

ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS current_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_focus_date date;

CREATE OR REPLACE FUNCTION public.complete_focus_session(p_session_id uuid, p_user_id uuid, p_ended_at timestamp with time zone, p_elapsed_ms bigint, p_dust integer, p_shards integer, p_xp integer, p_progress integer DEFAULT 0, p_streak integer DEFAULT NULL, p_focus_date date DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_xp               INTEGER;
  v_new_level            INTEGER;
  v_new_xp_to_next_level INTEGER;
  v_cur_progress         INTEGER;
  v_new_progress         INTEGER;
  v_new_dust             INTEGER;
  v_new_shards           INTEGER;
  v_new_total_focus_ms   BIGINT;
  v_cur_streak           INTEGER;
  v_longest_streak       INTEGER;
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

  SELECT xp, level, xp_to_next_level, progress_percent
  INTO v_new_xp, v_new_level, v_new_xp_to_next_level, v_cur_progress
  FROM public.player_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_new_xp := v_new_xp + p_xp;
  WHILE v_new_xp >= v_new_xp_to_next_level LOOP
    v_new_xp              := v_new_xp - v_new_xp_to_next_level;
    v_new_level           := v_new_level + 1;
    v_new_xp_to_next_level := 1000 * v_new_level;
  END LOOP;

  v_new_progress := LEAST(100, v_cur_progress + p_progress);

  UPDATE public.player_profiles SET
    dust                = dust + p_dust,
    shards              = shards + p_shards,
    xp                  = v_new_xp,
    level               = v_new_level,
    xp_to_next_level    = v_new_xp_to_next_level,
    total_focus_time_ms = total_focus_time_ms + p_elapsed_ms,
    progress_percent    = v_new_progress,
    current_streak      = CASE WHEN p_focus_date IS NOT NULL THEN COALESCE(p_streak, current_streak) ELSE current_streak END,
    longest_streak      = CASE WHEN p_focus_date IS NOT NULL THEN GREATEST(longest_streak, COALESCE(p_streak, 0)) ELSE longest_streak END,
    last_focus_date     = COALESCE(p_focus_date, last_focus_date),
    updated_at          = now()
  WHERE user_id = p_user_id
  RETURNING dust, shards, total_focus_time_ms, current_streak, longest_streak
  INTO v_new_dust, v_new_shards, v_new_total_focus_ms, v_cur_streak, v_longest_streak;

  RETURN jsonb_build_object(
    'level',               v_new_level,
    'new_xp',              v_new_xp,
    'xp_to_next_level',    v_new_xp_to_next_level,
    'progress_percent',    v_new_progress,
    'dust',                v_new_dust,
    'shards',              v_new_shards,
    'total_focus_time_ms', v_new_total_focus_ms,
    'current_streak',      v_cur_streak,
    'longest_streak',      v_longest_streak
  );
END;
$function$
