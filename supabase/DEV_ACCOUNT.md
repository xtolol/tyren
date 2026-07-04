# Dev account & state helpers

The game is server-authoritative, so you can't cheat state from the client.
Instead, a set of `dev_*` SQL functions (migration `phase8_dev_account_helpers`)
lets you shape any account's state from the **Supabase dashboard → SQL editor**
(or by asking Claude). Clients have no EXECUTE grant on them.

## The dev account

- **Email**: `test@test.test`
- **Password**: `tyren-test`
- User id: `83bebd48-3277-4dac-9026-f7f86071c53e`

Log into the app with it like any account. After changing its data in SQL,
**sign out/in or reload the app** — state hydrates from `player-state` on
launch, not live.

## Cheat sheet

All functions take the account **email** first, so they work on any account,
not just the dev one. Strings use **single quotes** (`'...'`) — double quotes
mean column names in SQL. Level arguments accept the row id
(`swirling_depths`), the level name (`'Hollowroot'`, case-insensitive), or
the level number (`'2'`).

```sql
-- See everything at a glance
SELECT dev_snapshot('test@test.test');

-- Full wipe back to a brand-new player (keeps the login)
SELECT dev_reset('test@test.test');

-- Move levels. Earlier levels get marked completed (+ Bronze relics),
-- later progress is cleared.
SELECT dev_teleport('test@test.test', 'yawning depths');                    -- L2 gate, 0 fragments
SELECT dev_teleport('test@test.test', '2', 'gate', 6);                      -- L2 gate, 6/8 fragments
SELECT dev_teleport('test@test.test', 'yawning depths', 'boss');            -- The Undertow at full 500 HP
SELECT dev_teleport('test@test.test', 'emberfall reach', 'boss', 0, 400);   -- L5 boss at 400 HP
SELECT dev_teleport('test@test.test', 'zalthar unbound', 'boss');           -- the final boss

-- Relics & seals (p_slot 1|2 equips, bumping the previous holder)
SELECT dev_set_relic('test@test.test', 'zalthars_hold', 'gold', 4, 1);
SELECT dev_set_relic('test@test.test', 'swirling_depths', 'mythic', 0, 2);
SELECT dev_remove_relic('test@test.test', 'swirling_depths');

-- Currencies (absolute values; goes through currency_ledger)
SELECT dev_set_currency('test@test.test', 50000, 200);

-- Player level / XP
SELECT dev_set_level('test@test.test', 12, 850);

-- Streak: current, longest (optional), freezes (optional)
SELECT dev_set_streak('test@test.test', 30, NULL, 3);

-- Items (negative qty removes)
SELECT dev_grant_item('test@test.test', 'boost_2x', 3);
SELECT dev_grant_item('test@test.test', 'chain_draught', 1);

-- Activate a boost directly (default duration from the item; or pass hours)
SELECT dev_grant_boost('test@test.test', 'boost_5x');
SELECT dev_grant_boost('test@test.test', 'boost_2x', 0.1);  -- 6 minutes
```

## Reference ids

Locations (in path order — names and level numbers also work as arguments):
`zalthars_hold` (L1 Zalthar's Chains) · `swirling_depths` (L2 Yawning
Depths) · `withered_plains` (L3) · `the_vexed_ruins` (L4 Hollowroot) ·
`emberfall_reach` (L5) · `zalthars_throne` (L6 Zalthar Unbound, final).

Seals: `bronze` · `silver` · `gold` · `mythic` (rank-ups at 3/6/12 sessions).

Items: boosters `boost_2x`/`boost_3x`/`boost_5x`; dust packs
`dust_1k`/`dust_4k`/`dust_25k`; level items `chain_draught` (L1 Bronze),
`ironbind_totem` (L1 Silver), `sundering_sigil` (L1 Gold), `abyssal_tonic`
(L2 Bronze), `depthstone` (L2 Silver).

## Notes

- `dev_teleport` grants Bronze relics for completed levels by default; pass
  `p_grant_relics => false` to skip, then set seals precisely with
  `dev_set_relic`.
- The account `christobing673@gmail.com` (176edfee…) is the automated
  smoke-test fixture — prefer `test@test.test` for manual poking so scripted
  verifications stay reproducible.
