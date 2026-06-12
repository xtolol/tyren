-- Phase 3: server-side shop (see PLAN.md).
-- Catalog, inventory, boosts, and purchases — all writes go through
-- SECURITY DEFINER RPCs callable only by the service role; clients get
-- own-row SELECT plus the active catalog.

-- ---- Tables ----

CREATE TABLE public.shop_items (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  description text NOT NULL DEFAULT '',
  category   text NOT NULL CHECK (category IN ('pass', 'level_item', 'booster', 'dust_pack', 'shard_pack')),
  price      numeric NOT NULL CHECK (price >= 0),
  currency   text NOT NULL CHECK (currency IN ('dust', 'shards', 'gbp')),
  -- e.g. {"type":"reward_multiplier","value":2,"duration_ms":14400000}
  --      {"type":"grant_dust","amount":1000}  {"type":"key_item"}
  effect     jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.player_inventory (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id    text NOT NULL REFERENCES public.shop_items(id),
  quantity   integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE public.active_boosts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id    text NOT NULL REFERENCES public.shop_items(id),
  effect     jsonb NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX active_boosts_user_expiry ON public.active_boosts (user_id, expires_at);

CREATE TABLE public.purchase_ledger (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id    text NOT NULL REFERENCES public.shop_items(id),
  currency   text NOT NULL,
  amount     numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX purchase_ledger_user ON public.purchase_ledger (user_id, created_at);

-- ---- RLS ----

ALTER TABLE public.shop_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_boosts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_ledger  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_items: active catalog select" ON public.shop_items
  FOR SELECT TO authenticated USING (active);
CREATE POLICY "player_inventory: own rows select" ON public.player_inventory
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "active_boosts: own rows select" ON public.active_boosts
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "purchase_ledger: own rows select" ON public.purchase_ledger
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- ---- Purchase RPC (service-role only) ----

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
  v_quantity integer := 0;
  v_grant    integer := 0;
BEGIN
  SELECT * INTO v_item FROM shop_items WHERE id = p_item_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_not_found'; END IF;
  IF v_item.currency NOT IN ('dust', 'shards') THEN
    RAISE EXCEPTION 'not_purchasable_with_currency';
  END IF;
  v_price := v_item.price::integer;

  SELECT dust, shards INTO v_dust, v_shards
  FROM player_profiles WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;

  IF (v_item.currency = 'dust' AND v_dust < v_price)
     OR (v_item.currency = 'shards' AND v_shards < v_price) THEN
    RAISE EXCEPTION 'insufficient_funds';
  END IF;

  IF v_price > 0 THEN
    INSERT INTO currency_ledger (user_id, currency, delta, reason)
    VALUES (p_user_id, v_item.currency, -v_price, 'purchase:' || p_item_id);
  END IF;

  -- Dust packs convert instantly instead of entering the inventory.
  IF v_item.effect->>'type' = 'grant_dust' THEN
    v_grant := (v_item.effect->>'amount')::integer;
    INSERT INTO currency_ledger (user_id, currency, delta, reason)
    VALUES (p_user_id, 'dust', v_grant, 'purchase:' || p_item_id);
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
    total_items_bought = total_items_bought + 1,
    updated_at = now()
  WHERE user_id = p_user_id
  RETURNING dust, shards INTO v_dust, v_shards;

  INSERT INTO purchase_ledger (user_id, item_id, currency, amount)
  VALUES (p_user_id, p_item_id, v_item.currency, v_price);

  RETURN jsonb_build_object(
    'item_id',  p_item_id,
    'dust',     v_dust,
    'shards',   v_shards,
    'quantity', v_quantity
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.purchase_item(uuid, text) FROM PUBLIC, anon, authenticated;

-- ---- Boost activation RPC (service-role only) ----

CREATE OR REPLACE FUNCTION public.activate_boost(p_user_id uuid, p_item_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item     shop_items%ROWTYPE;
  v_quantity integer;
  v_boost    active_boosts%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM shop_items WHERE id = p_item_id;
  IF NOT FOUND OR v_item.effect->>'type' <> 'reward_multiplier' THEN
    RAISE EXCEPTION 'not_activatable';
  END IF;

  UPDATE player_inventory
  SET quantity = quantity - 1, updated_at = now()
  WHERE user_id = p_user_id AND item_id = p_item_id AND quantity > 0
  RETURNING quantity INTO v_quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_owned'; END IF;

  INSERT INTO active_boosts (user_id, item_id, effect, expires_at)
  VALUES (
    p_user_id, p_item_id, v_item.effect,
    now() + make_interval(secs => COALESCE((v_item.effect->>'duration_ms')::bigint, 14400000) / 1000.0)
  )
  RETURNING * INTO v_boost;

  RETURN jsonb_build_object(
    'item_id',    p_item_id,
    'quantity',   v_quantity,
    'boost', jsonb_build_object(
      'id',         v_boost.id,
      'item_id',    v_boost.item_id,
      'effect',     v_boost.effect,
      'started_at', v_boost.started_at,
      'expires_at', v_boost.expires_at
    )
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.activate_boost(uuid, text) FROM PUBLIC, anon, authenticated;

-- ---- Seed catalog ----
-- GBP items ship inactive until real IAP exists (Phase 6); shard packs
-- above £19.99 are dropped per the monetization decisions; pass copy
-- gates content, not progression power.

INSERT INTO public.shop_items (id, name, description, category, price, currency, effect, sort_order, active) VALUES
('gold_pass',     'GOLD PASS',    'The standard journey through Tyren',                  'pass',       0,     'gbp',    '{}',                                                            1,  false),
('crystal_pass',  'CRYSTAL PASS', 'Exclusive regions, quests and themes for 30 days',    'pass',       5.99,  'gbp',    '{}',                                                            2,  false),
('chainbreaker',  'CHAINBREAKER', 'Break Zalthar''s Chains once you complete the level', 'level_item', 3,     'shards', '{"type":"key_item"}',                                           10, true),
('boost_2x',      '2X BOOST',     'Double dust and XP for 4h',                           'booster',    1500,  'dust',   '{"type":"reward_multiplier","value":2,"duration_ms":14400000}', 20, true),
('boost_3x',      '3X BOOST',     'Triple dust and XP for 4h',                           'booster',    4000,  'dust',   '{"type":"reward_multiplier","value":3,"duration_ms":14400000}', 21, true),
('boost_5x',      '5X BOOST',     '5x dust and XP for 4h',                               'booster',    8000,  'dust',   '{"type":"reward_multiplier","value":5,"duration_ms":14400000}', 22, true),
('dust_1k',       'TIME DUST',    '1K',                                                  'dust_pack',  6,     'shards', '{"type":"grant_dust","amount":1000}',                           30, true),
('dust_4k',       'TIME DUST',    '4K',                                                  'dust_pack',  20,    'shards', '{"type":"grant_dust","amount":4000}',                           31, true),
('dust_25k',      'TIME DUST',    '25K',                                                 'dust_pack',  100,   'shards', '{"type":"grant_dust","amount":25000}',                          32, true),
('shards_3',      'TIME SHARDS',  '3',                                                   'shard_pack', 0.99,  'gbp',    '{"type":"grant_shards","amount":3}',                            40, false),
('shards_20',     'TIME SHARDS',  '20',                                                  'shard_pack', 4.99,  'gbp',    '{"type":"grant_shards","amount":20}',                           41, false),
('shards_45',     'TIME SHARDS',  '45',                                                  'shard_pack', 9.99,  'gbp',    '{"type":"grant_shards","amount":45}',                           42, false),
('shards_100',    'TIME SHARDS',  '100',                                                 'shard_pack', 19.99, 'gbp',    '{"type":"grant_shards","amount":100}',                          43, false);
