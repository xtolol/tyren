-- Phase 8.1: align the ladder with the shipped level designs. Level 1 is
-- "Zalthar's Chains" (the gold card) and level 2 is "Hollowroot" (the ember
-- root-creature — the level IS its boss). Location ids stay stable so every
-- FK (progress, relics, shop gating) is untouched; levels 3+ keep their
-- placeholder identities until they get designs.

UPDATE public.map_locations SET
  name = 'Zalthar''s Chains'
WHERE id = 'zalthars_hold';

UPDATE public.map_locations SET
  name = 'Hollowroot',
  gate_label = 'Sever the Roots',
  fragment_name = 'Root Fragment',
  boss = '{"bossName":"Hollowroot","maxHp":500,"rewardDust":350,"rewardShards":10,"rewardXp":700}'::jsonb,
  relic_name = 'Hollowroot',
  perk_name = 'Root Ward',
  relic_flavor = 'It grew fat in the dark on hours left unattended. Cut it out, and take back the soil.'
WHERE id = 'swirling_depths';

-- Retheme level 2's exclusive items to match (ids stay stable).
UPDATE public.shop_items SET name = 'ROOT TONIC'   WHERE id = 'abyssal_tonic';
UPDATE public.shop_items SET name = 'HOLLOWSTONE'  WHERE id = 'depthstone';
