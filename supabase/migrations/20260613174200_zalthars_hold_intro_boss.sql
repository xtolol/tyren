-- Onboarding fix: the starting location had no boss, so under the Phase 4
-- boss-HP-driven progress model a new player's bar never moved on their
-- first sessions (dust/xp accrued, progress stayed 0). Give Zalthar's Hold
-- an intro boss so the focus → damage → progress loop works from minute
-- one. Its 3-shard drop exactly funds the first Chainbreaker, teaching the
-- advance mechanic.
UPDATE public.map_locations
SET boss = '{"bossName":"Zalthar''s Shade","maxHp":100,"rewardDust":100,"rewardShards":3,"rewardXp":200}'::jsonb
WHERE id = 'zalthars_hold';

-- Players already standing at the Hold have a NULL boss_hp_remaining (the
-- RPC treats NULL as full via COALESCE, but set it explicitly so the HP
-- bar reads right on the next sync without waiting for a session).
UPDATE public.player_map_progress
SET boss_hp_remaining = 100, updated_at = now()
WHERE location_id = 'zalthars_hold' AND status = 'current' AND boss_hp_remaining IS NULL;
