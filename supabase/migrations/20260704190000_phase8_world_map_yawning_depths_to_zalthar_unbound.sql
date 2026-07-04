-- The six-level world map from the codex design: Zalthar's Chains, then
-- Yawning Depths → Withered Plains → Hollow Vigil → Emberfall Reach →
-- Zalthar Unbound. Hollowroot is retired as a level (its ember boss-card
-- styling lives on as the universal fight variant). Row ids stay stable so
-- progress/relic/shop FKs survive; only names, order, and tuning move.

-- Clear the way for the re-sort (sort_order is unique).
UPDATE public.map_locations SET sort_order = sort_order + 100
WHERE id IN ('the_vexed_ruins', 'withered_plains', 'zalthars_throne');

-- Level 2 — Yawning Depths (was Hollowroot; keeps the L2 tuning).
UPDATE public.map_locations SET
  name = 'Yawning Depths',
  gate_label = 'Still the Waters',
  fragment_name = 'Depth Fragment',
  boss = '{"bossName":"The Undertow","maxHp":500,"rewardDust":350,"rewardShards":10,"rewardXp":700}'::jsonb,
  relic_name = 'The Fathom Eye',
  perk_name = 'Depth Ward',
  relic_flavor = 'The deep swallowed every hour you threw away. Stare back, and it gives them up.'
WHERE id = 'swirling_depths';

-- Level 3 — Withered Plains (moves up a rung; takes the L3 tuning).
UPDATE public.map_locations SET
  sort_order = 2,
  gate_label = 'Wake the Fields',
  fragment_name = 'Seed Fragment',
  fragments_required = 12,
  boss = '{"bossName":"Plains Revenant","maxHp":840,"rewardDust":600,"rewardShards":18,"rewardXp":1200}'::jsonb,
  relic_name = 'The Last Sprig',
  perk_name = 'Bloomcaller',
  relic_flavor = 'Where the Revenant walked, nothing grew. Where you sat in stillness, it does.'
WHERE id = 'withered_plains';

-- Level 4 — Hollow Vigil (was The Vexed Ruins; takes the L4 tuning).
UPDATE public.map_locations SET
  sort_order = 3,
  name = 'Hollow Vigil',
  gate_label = 'Light the Beacon',
  fragment_name = 'Vigil Fragment',
  fragments_required = 16,
  boss = '{"bossName":"The Hollow Warden","maxHp":1320,"rewardDust":1000,"rewardShards":28,"rewardXp":2000}'::jsonb,
  relic_name = 'Warden''s Halo',
  perk_name = 'Night Vigil',
  relic_flavor = 'A watch kept for no one, by no one, forever. Take up the ring and keep your own.'
WHERE id = 'the_vexed_ruins';

-- Level 5 — Emberfall Reach (new rung on the established curve).
INSERT INTO public.map_locations
  (id, name, region_id, position_x, position_y, unlock_level, sort_order,
   gate_label, fragment_name, fragments_required, boss,
   relic_name, perk_name, relic_flavor, active)
SELECT
  'emberfall_reach', 'Emberfall Reach', region_id, 0, 0, 1, 4,
  'Part the Ashfall', 'Cinder Fragment', 20,
  '{"bossName":"The Cinderwraith","maxHp":1800,"rewardDust":1450,"rewardShards":38,"rewardXp":2900}'::jsonb,
  'The First Ember', 'Emberguard',
  'It has fallen for a hundred years and never gone out. Neither, now, will you.',
  true
FROM public.map_locations WHERE id = 'zalthars_hold'
ON CONFLICT (id) DO NOTHING;

-- Level 6 — Zalthar Unbound (was Zalthar's Throne; the final boss).
UPDATE public.map_locations SET
  sort_order = 5,
  name = 'Zalthar Unbound',
  gate_label = 'Break the Last Seal',
  fragment_name = 'Seal Fragment',
  boss = '{"bossName":"Zalthar Unbound","maxHp":2280,"rewardDust":2000,"rewardShards":50,"rewardXp":4000}'::jsonb,
  relic_name = 'The Broken Crown',
  perk_name = 'Kingslayer',
  relic_flavor = 'The tyrant of wasted time is gone. Wear what remains of his dominion.'
WHERE id = 'zalthars_throne';

-- The old Hollowroot-themed level items go back to depth names (ids stable).
UPDATE public.shop_items SET name = 'ABYSSAL TONIC' WHERE id = 'abyssal_tonic';
UPDATE public.shop_items SET name = 'DEPTHSTONE'    WHERE id = 'depthstone';
