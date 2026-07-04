-- Quality-of-life for the dev helpers: accept a level by id, name (case-
-- insensitive), or 1-based level number ('2'), so `dev_teleport(...,
-- 'hollowroot', ...)` works even though the row id is still swirling_depths.

CREATE OR REPLACE FUNCTION public.dev_location(p_location text)
RETURNS text
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_id text;
BEGIN
  SELECT id INTO v_id FROM map_locations
  WHERE id = p_location
     OR lower(name) = lower(p_location)
     OR (p_location ~ '^[0-9]+$' AND sort_order = p_location::int - 1);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'no map location matching "%" — use an id (zalthars_hold, swirling_depths, ...), a name (Hollowroot), or a level number (2)', p_location;
  END IF;
  RETURN v_id;
END;
$$;

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
  v_location text := public.dev_location(p_location_id);
  v_sort int;
  v_max_hp int;
BEGIN
  IF p_stage NOT IN ('gate', 'boss') THEN
    RAISE EXCEPTION 'stage must be gate or boss';
  END IF;
  SELECT sort_order, (boss->>'maxHp')::int INTO v_sort, v_max_hp
  FROM map_locations WHERE id = v_location;

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
    v_user, v_location, 'current', p_stage, p_fragments, 0,
    CASE WHEN p_stage = 'boss' THEN COALESCE(p_boss_hp, v_max_hp) ELSE NULL END
  );

  IF p_grant_relics THEN
    INSERT INTO player_relics (user_id, location_id)
    SELECT v_user, id FROM map_locations WHERE sort_order < v_sort
    ON CONFLICT (user_id, location_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('location', v_location, 'stage', p_stage, 'fragments', p_fragments);
END;
$$;

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
  v_location text := public.dev_location(p_location_id);
BEGIN
  IF p_slot IS NOT NULL THEN
    UPDATE player_relics SET equipped_slot = NULL, updated_at = now()
    WHERE user_id = v_user AND equipped_slot = p_slot AND location_id <> v_location;
  END IF;
  INSERT INTO player_relics (user_id, location_id, seal, seal_sessions, equipped_slot)
  VALUES (v_user, v_location, p_seal, p_sessions, p_slot)
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
  WHERE user_id = public.dev_user(p_email)
    AND location_id = public.dev_location(p_location_id);
END;
$$;

REVOKE ALL ON FUNCTION public.dev_location(text) FROM PUBLIC, anon, authenticated;
