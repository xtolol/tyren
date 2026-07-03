-- Phase 6: server-authoritative monetization backbone (see PLAN.md).
-- The provider-agnostic half that's fully testable on Track A: an
-- entitlements table, idempotent receipt dedup, and a ledgered grant
-- RPC. Real-money value is ONLY ever credited here, server-side, from a
-- verified store event — never by the client. The RevenueCat webhook is
-- a thin adapter on top (iap-webhook edge function); the client SDK and
-- paywall are deferred to the Track B dev build.

-- ---- Store product mapping ----
-- RevenueCat/StoreKit identify products by their store id (e.g.
-- "com.tyren.shards_20"); map it to our catalog id. Filled in once the
-- App Store / Play products exist.
ALTER TABLE public.shop_items
  ADD COLUMN store_product_id text UNIQUE;

-- ---- Entitlements (subscriptions / passes) ----
CREATE TABLE public.entitlements (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entitlement text NOT NULL,            -- e.g. 'crystal_pass'
  expires_at  timestamptz,              -- null = lifetime; subs carry the period end
  source      text NOT NULL DEFAULT 'iap',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entitlement)
);

ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entitlements: own rows select" ON public.entitlements
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- ---- IAP receipt dedup ----
-- One row per store transaction. Webhooks retry, so the grant RPC keys
-- off this to stay idempotent. Service-role only (RLS on, no policy).
CREATE TABLE public.iap_receipts (
  transaction_id text PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id     text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.iap_receipts ENABLE ROW LEVEL SECURITY;
CREATE INDEX iap_receipts_user ON public.iap_receipts (user_id, created_at);

-- ---- Grant RPC (service-role only) ----
-- Credits a verified store purchase exactly once: shards through the
-- ledger, or a pass entitlement. Idempotent on transaction_id so webhook
-- redelivery is a no-op. Looks products up by store_product_id and
-- fulfils regardless of `active` (the purchase already happened).
CREATE OR REPLACE FUNCTION public.redeem_iap_purchase(
  p_user_id        uuid,
  p_transaction_id text,
  p_product_id     text,
  p_expires_at     timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item        shop_items%ROWTYPE;
  v_shards      integer := 0;
  v_new_shards  integer;
  v_entitlement text := NULL;
  v_expires     timestamptz;
  v_rowcount    integer := 0;
BEGIN
  -- Dedup: one fulfilment per store transaction.
  INSERT INTO iap_receipts (transaction_id, user_id, product_id)
  VALUES (p_transaction_id, p_user_id, p_product_id)
  ON CONFLICT (transaction_id) DO NOTHING;
  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RETURN jsonb_build_object('status', 'already_processed', 'transaction_id', p_transaction_id);
  END IF;

  SELECT * INTO v_item FROM shop_items WHERE store_product_id = p_product_id;
  IF NOT FOUND THEN
    -- Receipt is recorded so we don't reprocess; nothing to grant until
    -- the catalog row is mapped. The webhook acks regardless.
    RETURN jsonb_build_object('status', 'unknown_product', 'product_id', p_product_id);
  END IF;

  IF v_item.effect->>'type' = 'grant_shards' THEN
    v_shards := (v_item.effect->>'amount')::integer;
    INSERT INTO currency_ledger (user_id, currency, delta, reason)
    VALUES (p_user_id, 'shards', v_shards, 'iap:' || v_item.id);
    UPDATE player_profiles SET shards = shards + v_shards, updated_at = now()
    WHERE user_id = p_user_id
    RETURNING shards INTO v_new_shards;

  ELSIF v_item.category = 'pass' THEN
    v_entitlement := v_item.id;
    v_expires := COALESCE(p_expires_at, now() + interval '30 days');
    INSERT INTO entitlements (user_id, entitlement, expires_at, source)
    VALUES (p_user_id, v_entitlement, v_expires, 'iap')
    ON CONFLICT (user_id, entitlement)
    DO UPDATE SET expires_at = GREATEST(entitlements.expires_at, EXCLUDED.expires_at), updated_at = now();
  END IF;

  INSERT INTO purchase_ledger (user_id, item_id, currency, amount)
  VALUES (p_user_id, v_item.id, v_item.currency, v_item.price);

  RETURN jsonb_build_object(
    'status',      'granted',
    'product_id',  p_product_id,
    'item_id',     v_item.id,
    'shards',      v_shards,
    'new_shards',  v_new_shards,
    'entitlement', v_entitlement,
    'expires_at',  v_expires
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.redeem_iap_purchase(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
