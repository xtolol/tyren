-- Phase 8: the Relic system (see PLAN.md — approach 2 "Sigil" redesign).
-- Every location's boss, once defeated, leaves behind a relic at Bronze Seal.
-- Relics rank up on their own journey (Bronze → Silver → Gold → Mythic) fed by
-- qualifying focus sessions, their perk (a passive map-progression multiplier)
-- strengthens with every seal, the player runs a two-perk loadout drawn from
-- any relics they own, and seal rank gates level-exclusive shop items.

-- ---- Relic definitions live on the location ----

ALTER TABLE public.map_locations
  ADD COLUMN relic_name   text NOT NULL DEFAULT 'Relic',
  ADD COLUMN perk_name    text NOT NULL DEFAULT 'Perk',
  ADD COLUMN relic_flavor text NOT NULL DEFAULT '';

UPDATE public.map_locations SET
  relic_name = 'Zalthar''s Chains', perk_name = 'Chainbreaker',
  relic_flavor = 'Bound in iron since the Sundering, the Chains remember every hour you did not rest.'
WHERE id = 'zalthars_hold';

UPDATE public.map_locations SET
  relic_name = 'Seal of the Depths', perk_name = 'Depth Ward',
  relic_flavor = 'It hums with the pressure of drowned hours, and holds the surface steady.'
WHERE id = 'swirling_depths';

UPDATE public.map_locations SET
  relic_name = 'Runebound Crest', perk_name = 'Runecaller',
  relic_flavor = 'Every rune was cut by a hand that refused to stop before the work was done.'
WHERE id = 'the_vexed_ruins';

UPDATE public.map_locations SET
  relic_name = 'Ward of the Plains', perk_name = 'Bloomcaller',
  relic_flavor = 'Where the Revenant walked, nothing grew. Where you sat in stillness, it does.'
WHERE id = 'withered_plains';

UPDATE public.map_locations SET
  relic_name = 'Crown of Zalthar', perk_name = 'Kingslayer',
  relic_flavor = 'The tyrant of wasted time is gone. Wear what remains of his dominion.'
WHERE id = 'zalthars_throne';

-- ---- Player relics ----
-- seal_sessions counts qualifying sessions inside the current seal; rank-ups
-- subtract the threshold so the progress bar restarts each seal.

CREATE TABLE public.player_relics (
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id   text NOT NULL REFERENCES public.map_locations(id),
  seal          text NOT NULL DEFAULT 'bronze' CHECK (seal IN ('bronze','silver','gold','mythic')),
  seal_sessions integer NOT NULL DEFAULT 0 CHECK (seal_sessions >= 0),
  equipped_slot smallint CHECK (equipped_slot IN (1, 2)),
  earned_at     timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, location_id)
);

CREATE UNIQUE INDEX player_relics_one_per_slot
  ON public.player_relics (user_id, equipped_slot)
  WHERE equipped_slot IS NOT NULL;

ALTER TABLE public.player_relics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "player_relics: own rows select" ON public.player_relics
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- ---- Seal math helpers (keep in sync with shared/economy.ts) ----
-- Perk bonus by seal: Bronze +0.05×, Silver +0.08×, Gold +0.12×, Mythic +0.20×.
-- Rank-up thresholds (qualifying sessions inside the seal): 3 / 6 / 12.

CREATE FUNCTION public.relic_seal_bonus(p_seal text)
RETURNS numeric LANGUAGE sql IMMUTABLE
AS $$ SELECT CASE p_seal
  WHEN 'bronze' THEN 0.05 WHEN 'silver' THEN 0.08
  WHEN 'gold'   THEN 0.12 WHEN 'mythic' THEN 0.20 ELSE 0 END $$;

CREATE FUNCTION public.relic_seal_order(p_seal text)
RETURNS integer LANGUAGE sql IMMUTABLE
AS $$ SELECT CASE p_seal
  WHEN 'bronze' THEN 0 WHEN 'silver' THEN 1
  WHEN 'gold'   THEN 2 WHEN 'mythic' THEN 3 ELSE -1 END $$;

CREATE FUNCTION public.relic_seal_sessions_required(p_seal text)
RETURNS integer LANGUAGE sql IMMUTABLE
AS $$ SELECT CASE p_seal
  WHEN 'bronze' THEN 3 WHEN 'silver' THEN 6 WHEN 'gold' THEN 12 ELSE NULL END $$;

-- ---- Loadout (service-role only, called by the relics-loadout function) ----
-- p_slots holds 0–2 owned location ids; order is slot order.

CREATE FUNCTION public.set_relic_loadout(p_user_id uuid, p_slots text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owned integer;
  v_out   jsonb;
BEGIN
  IF p_slots IS NULL THEN p_slots := '{}'; END IF;
  IF array_length(p_slots, 1) > 2 THEN RAISE EXCEPTION 'too_many_slots'; END IF;
  IF array_length(p_slots, 1) = 2 AND p_slots[1] = p_slots[2] THEN
    RAISE EXCEPTION 'duplicate_relic';
  END IF;

  SELECT count(*) INTO v_owned FROM player_relics
  WHERE user_id = p_user_id AND location_id = ANY(p_slots);
  IF v_owned <> COALESCE(array_length(p_slots, 1), 0) THEN
    RAISE EXCEPTION 'relic_not_owned';
  END IF;

  UPDATE player_relics SET equipped_slot = NULL, updated_at = now()
  WHERE user_id = p_user_id AND equipped_slot IS NOT NULL;

  UPDATE player_relics pr SET equipped_slot = s.slot, updated_at = now()
  FROM unnest(p_slots) WITH ORDINALITY AS s(location_id, slot)
  WHERE pr.user_id = p_user_id AND pr.location_id = s.location_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'location_id', pr.location_id, 'relic_name', l.relic_name,
    'perk_name', l.perk_name, 'seal', pr.seal,
    'seal_sessions', pr.seal_sessions, 'equipped_slot', pr.equipped_slot
  ) ORDER BY l.sort_order), '[]'::jsonb) INTO v_out
  FROM player_relics pr
  JOIN map_locations l ON l.id = pr.location_id
  WHERE pr.user_id = p_user_id;

  RETURN jsonb_build_object('relics', v_out);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_relic_loadout(uuid, text[]) FROM PUBLIC, anon, authenticated;

-- ---- complete_focus_session: perk multiplier + relic grant + attunement ----
-- New p_qualifies arg (the streak bar: ≥25 verified min). The equipped perks
-- multiply the ms used for MAP progress only (fragments / boss damage) — never
-- currency, never total_focus_time_ms. A boss kill grants the location's relic
-- at Bronze (auto-equipping into a free slot), and a qualifying session credits
-- +1 attuned session to each equipped relic, rank-ups cascading.

DROP FUNCTION public.complete_focus_session(uuid, uuid, timestamptz, bigint, integer, integer, integer, integer, date, integer);

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
  p_streak_freezes integer DEFAULT NULL,
  p_qualifies      boolean DEFAULT false
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
  v_relic_name           TEXT;
  v_perk_name            TEXT;
  v_stage                TEXT;
  v_frag_collected       INTEGER;
  v_frag_progress_ms     BIGINT;
  v_hp                   INTEGER;
  v_max_hp               INTEGER;
  -- relics
  v_perk_mult            NUMERIC := 1;
  v_map_ms               BIGINT;
  v_free_slot            SMALLINT;
  v_relic_earned         JSONB   := NULL;
  v_rankups              TEXT[]  := '{}';
  v_relic                RECORD;
  v_seal                 TEXT;
  v_sessions             INTEGER;
  v_need                 INTEGER;
  v_relics               JSONB;
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

  -- ---- Equipped perks multiply map-progress time (earned, not bought) ----
  SELECT 1 + COALESCE(SUM(public.relic_seal_bonus(seal)), 0) INTO v_perk_mult
  FROM public.player_relics
  WHERE user_id = p_user_id AND equipped_slot IS NOT NULL;
  v_map_ms := FLOOR(GREATEST(p_elapsed_ms, 0) * v_perk_mult)::bigint;

  -- ---- Map progress at the player's current location ----
  PERFORM public.ensure_map_start(p_user_id);

  SELECT l.id, l.boss, l.fragments_required, l.gate_label, l.fragment_name,
         l.relic_name, l.perk_name, l.sort_order,
         p.stage, p.fragments_collected, p.fragment_progress_ms, p.boss_hp_remaining
  INTO v_loc_id, v_loc_boss, v_frags_req, v_gate_label, v_fragment_name,
       v_relic_name, v_perk_name, v_cur_sort,
       v_stage, v_frag_collected, v_frag_progress_ms, v_hp
  FROM public.player_map_progress p
  JOIN public.map_locations l ON l.id = p.location_id
  WHERE p.user_id = p_user_id AND p.status = 'current'
  FOR UPDATE OF p;

  IF FOUND AND v_stage = 'gate' THEN
    -- Accrue fragments from banked + this session's perk-boosted verified time.
    v_total_ms      := COALESCE(v_frag_progress_ms, 0) + v_map_ms;
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

  ELSIF FOUND AND v_stage = 'boss' AND v_loc_boss IS NOT NULL THEN
    v_max_hp := (v_loc_boss->>'maxHp')::integer;
    v_hp     := COALESCE(v_hp, v_max_hp);
    v_damage := (v_map_ms / 60000)::integer; -- 1 HP / perk-boosted verified min

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

        -- The fallen boss leaves its relic behind at Bronze Seal,
        -- auto-equipped when a loadout slot is free.
        SELECT s.slot INTO v_free_slot
        FROM (VALUES (1::smallint), (2::smallint)) AS s(slot)
        WHERE NOT EXISTS (
          SELECT 1 FROM public.player_relics
          WHERE user_id = p_user_id AND equipped_slot = s.slot
        )
        ORDER BY s.slot LIMIT 1;

        INSERT INTO public.player_relics (user_id, location_id, seal, seal_sessions, equipped_slot)
        VALUES (p_user_id, v_loc_id, 'bronze', 0, v_free_slot)
        ON CONFLICT (user_id, location_id) DO NOTHING;

        IF FOUND THEN
          v_relic_earned := jsonb_build_object(
            'location_id', v_loc_id, 'relic_name', v_relic_name,
            'perk_name', v_perk_name, 'seal', 'bronze',
            'auto_equipped', v_free_slot IS NOT NULL
          );
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
  END IF;

  IF v_loc_id IS NOT NULL THEN
    v_map := jsonb_build_object(
      'location_id', v_loc_id, 'stage', CASE WHEN v_stage = 'boss' THEN 'boss' ELSE 'gate' END,
      'gate_label', v_gate_label, 'fragment_name', v_fragment_name,
      'fragments_collected', CASE WHEN v_stage = 'boss' THEN v_frags_req ELSE v_new_collected END,
      'fragments_required', v_frags_req,
      'fragments_gained', v_gained,
      'fragment_progress_ms', v_new_frag_progress,
      'fragment_interval_ms', v_frag_interval,
      'gate_ready', CASE WHEN v_stage = 'boss' THEN true ELSE v_gate_ready END,
      'boss_name', v_loc_boss->>'bossName', 'damage_dealt', v_damage_dealt,
      'hp_remaining', CASE WHEN v_stage = 'boss' THEN to_jsonb(v_hp) ELSE 'null'::jsonb END,
      'max_hp', (v_loc_boss->>'maxHp')::integer,
      'defeated', v_defeated, 'advanced_to', v_advanced_to,
      'perk_multiplier', v_perk_mult,
      'relic_earned', v_relic_earned,
      'rewards', jsonb_build_object('dust', v_boss_dust, 'shards', v_boss_shards, 'xp', v_boss_xp)
    );
  END IF;

  -- ---- Attunement: a qualifying session feeds every equipped relic ----
  IF p_qualifies THEN
    FOR v_relic IN
      SELECT location_id, seal, seal_sessions FROM public.player_relics
      WHERE user_id = p_user_id AND equipped_slot IS NOT NULL
      FOR UPDATE
    LOOP
      v_seal     := v_relic.seal;
      v_sessions := v_relic.seal_sessions + 1;
      LOOP
        v_need := public.relic_seal_sessions_required(v_seal);
        EXIT WHEN v_need IS NULL OR v_sessions < v_need;
        v_sessions := v_sessions - v_need;
        v_seal := CASE v_seal WHEN 'bronze' THEN 'silver'
                              WHEN 'silver' THEN 'gold'
                              ELSE 'mythic' END;
        v_rankups := v_rankups || v_relic.location_id;
      END LOOP;

      UPDATE public.player_relics
      SET seal = v_seal, seal_sessions = v_sessions, updated_at = now()
      WHERE user_id = p_user_id AND location_id = v_relic.location_id;
    END LOOP;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'location_id', pr.location_id, 'relic_name', l.relic_name,
    'perk_name', l.perk_name, 'seal', pr.seal,
    'seal_sessions', pr.seal_sessions, 'equipped_slot', pr.equipped_slot,
    'ranked_up', pr.location_id = ANY(v_rankups)
  ) ORDER BY l.sort_order), '[]'::jsonb) INTO v_relics
  FROM public.player_relics pr
  JOIN public.map_locations l ON l.id = pr.location_id
  WHERE pr.user_id = p_user_id;

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
    'map',                   v_map,
    'relics',                v_relics
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.complete_focus_session(uuid, uuid, timestamptz, bigint, integer, integer, integer, integer, date, integer, boolean) FROM PUBLIC, anon, authenticated;

-- ---- Seal-gated, level-exclusive shop items ----

ALTER TABLE public.shop_items
  ADD COLUMN required_location_id text REFERENCES public.map_locations(id),
  ADD COLUMN required_seal        text CHECK (required_seal IN ('bronze','silver','gold','mythic'));

-- The chainbreaker key item left the loop in Phase 7; retire it from sale.
UPDATE public.shop_items SET active = false WHERE id = 'chainbreaker';

INSERT INTO public.shop_items
  (id, name, description, category, price, currency, effect, sort_order, active, required_location_id, required_seal)
VALUES
('chain_draught',   'CHAIN DRAUGHT',   '2× dust and XP for 1h',                        'level_item', 450,  'dust',   '{"type":"reward_multiplier","value":2,"duration_ms":3600000}',  50, true, 'zalthars_hold',   'bronze'),
('ironbind_totem',  'IRONBIND TOTEM',  '2× dust and XP for 4h',                        'level_item', 900,  'dust',   '{"type":"reward_multiplier","value":2,"duration_ms":14400000}', 51, true, 'zalthars_hold',   'silver'),
('sundering_sigil', 'SUNDERING SIGIL', 'Bank a streak freeze — skip a day, keep your streak', 'level_item', 5, 'shards', '{"type":"grant_streak_freeze"}',                          52, true, 'zalthars_hold',   'gold'),
('abyssal_tonic',   'ABYSSAL TONIC',   '3× dust and XP for 2h',                        'level_item', 600,  'dust',   '{"type":"reward_multiplier","value":3,"duration_ms":7200000}',  53, true, 'swirling_depths', 'bronze'),
('depthstone',      'DEPTHSTONE',      '5× dust and XP for 1h',                        'level_item', 1200, 'dust',   '{"type":"reward_multiplier","value":5,"duration_ms":3600000}',  54, true, 'swirling_depths', 'silver');

-- ---- purchase_item: enforce the seal gate + grant_streak_freeze effect ----

CREATE OR REPLACE FUNCTION public.purchase_item(p_user_id uuid, p_item_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item     shop_items%ROWTYPE;
  v_price    integer;
  v_dust     integer;
  v_shards   integer;
  v_freezes  integer;
  v_seal     text;
  v_quantity integer := 0;
  v_grant    integer := 0;
  v_freeze_grant integer := 0;
BEGIN
  SELECT * INTO v_item FROM shop_items WHERE id = p_item_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_not_found'; END IF;
  IF v_item.currency NOT IN ('dust', 'shards') THEN
    RAISE EXCEPTION 'not_purchasable_with_currency';
  END IF;
  v_price := v_item.price::integer;

  -- Level-exclusive items demand the location's relic at the required seal.
  IF v_item.required_location_id IS NOT NULL THEN
    SELECT seal INTO v_seal FROM player_relics
    WHERE user_id = p_user_id AND location_id = v_item.required_location_id;
    IF NOT FOUND OR public.relic_seal_order(v_seal)
         < public.relic_seal_order(COALESCE(v_item.required_seal, 'bronze')) THEN
      RAISE EXCEPTION 'seal_rank_required';
    END IF;
  END IF;

  SELECT dust, shards, streak_freezes INTO v_dust, v_shards, v_freezes
  FROM player_profiles WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;

  IF (v_item.currency = 'dust' AND v_dust < v_price)
     OR (v_item.currency = 'shards' AND v_shards < v_price) THEN
    RAISE EXCEPTION 'insufficient_funds';
  END IF;

  IF v_item.effect->>'type' = 'grant_streak_freeze' AND v_freezes >= 2 THEN
    RAISE EXCEPTION 'freeze_cap_reached';
  END IF;

  IF v_price > 0 THEN
    INSERT INTO currency_ledger (user_id, currency, delta, reason)
    VALUES (p_user_id, v_item.currency, -v_price, 'purchase:' || p_item_id);
  END IF;

  -- Dust packs convert instantly instead of entering the inventory;
  -- streak-freeze grants bank straight onto the profile the same way.
  IF v_item.effect->>'type' = 'grant_dust' THEN
    v_grant := (v_item.effect->>'amount')::integer;
    INSERT INTO currency_ledger (user_id, currency, delta, reason)
    VALUES (p_user_id, 'dust', v_grant, 'purchase:' || p_item_id);
  ELSIF v_item.effect->>'type' = 'grant_streak_freeze' THEN
    v_freeze_grant := 1;
  ELSE
    INSERT INTO player_inventory (user_id, item_id, quantity, updated_at)
    VALUES (p_user_id, p_item_id, 1, now())
    ON CONFLICT (user_id, item_id)
    DO UPDATE SET quantity = player_inventory.quantity + 1, updated_at = now()
    RETURNING quantity INTO v_quantity;
  END IF;

  UPDATE player_profiles SET
    dust   = dust   + v_grant - CASE WHEN v_item.currency = 'dust'   THEN v_price ELSE 0 END,
    shards = shards          - CASE WHEN v_item.currency = 'shards' THEN v_price ELSE 0 END,
    streak_freezes = LEAST(streak_freezes + v_freeze_grant, 2),
    total_items_bought = total_items_bought + 1,
    updated_at = now()
  WHERE user_id = p_user_id
  RETURNING dust, shards, streak_freezes INTO v_dust, v_shards, v_freezes;

  INSERT INTO purchase_ledger (user_id, item_id, currency, amount)
  VALUES (p_user_id, p_item_id, v_item.currency, v_price);

  RETURN jsonb_build_object(
    'item_id',        p_item_id,
    'dust',           v_dust,
    'shards',         v_shards,
    'quantity',       v_quantity,
    'streak_freezes', v_freezes
  );
END;
$function$;
