-- Hollow Vigil is out; Hollowroot returns with its original identity, now
-- as Level 4 (same row, id the_vexed_ruins, so nothing breaks). It keeps
-- the L4 tuning but its own name, face, and Root Ward perk.

UPDATE public.map_locations SET
  name = 'Hollowroot',
  gate_label = 'Sever the Roots',
  fragment_name = 'Root Fragment',
  boss = '{"bossName":"Hollowroot","maxHp":1320,"rewardDust":1000,"rewardShards":28,"rewardXp":2000}'::jsonb,
  relic_name = 'Hollowroot',
  perk_name = 'Root Ward',
  relic_flavor = 'It grew fat in the dark on hours left unattended. Cut it out, and take back the soil.'
WHERE id = 'the_vexed_ruins';
