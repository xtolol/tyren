# Tyren — Implementation Plan

Ordered roadmap from the June 2026 codebase/backend review. Phases are dependency-ordered;
tasks inside a phase are grouped so that one phase = one coherent set of changes across
DB + edge functions + client. Don't start a phase until the previous phase's
**Done when** criteria pass (Phase 0 excepted — it ships immediately).

Legend: 🔴 critical · 🟠 important · 🟢 enhancement

---

## Phase 0 — Security hardening (do immediately, independent of everything)

The economy is currently bypassable. No feature work matters until this is closed.

### 0.1 🔴 Lock down `complete_focus_session`
Any authenticated user can call `/rest/v1/rpc/complete_focus_session` with arbitrary
`p_dust`/`p_shards`/`p_xp` and pay themselves. Edge functions use the service role, so
revoking client access breaks nothing.

- [x] Migration: `REVOKE EXECUTE ON FUNCTION public.complete_focus_session(uuid, uuid, timestamptz, bigint, integer, integer, integer, integer, integer, date) FROM PUBLIC, anon, authenticated;` *(applied 2026-06-12: `20260611231505_lockdown_complete_focus_session`)*
- [x] Same revoke for any other `SECURITY DEFINER` helper added later — make this a standing rule: **new DB functions get an explicit GRANT/REVOKE block in the same migration.** *(enforced via `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated` — new functions now need an explicit GRANT to be client-callable. Root cause: the 2026-06-11 `lock_down_rpc_and_table_grants` migration had locked the old signature, but the streaks migration created a new signature that picked up fresh default grants.)*
- [x] Drop the superseded 8-arg overload of `complete_focus_session` if it still exists in the DB (two overloads = two attack surfaces). *(dropped in same migration)*

### 0.2 🟠 Auth + config hygiene
- [ ] Enable leaked-password protection (Supabase dashboard → Auth → Passwords). **Blocked: Pro Plan feature — enable when upgrading (likely alongside Phase 6 launch prep).** Free-tier mitigation now: set minimum password length to 8+ in the same dashboard section, and the advisor warning can be ignored until then.
- [x] Pin `verify_jwt = true` for every edge function — verified all 5 deployed functions have it enabled. No `config.toml` exists yet; create one with `[functions.*] verify_jwt = true` blocks when local dev is set up so redeploys can't silently flip it.
- [x] `idempotency_keys`: documented as service-role-only via `COMMENT ON TABLE` in the lockdown migration; RLS-no-policy (deny all) is intentional.

### 0.3 Verify
- [x] Curl `/rest/v1/rpc/complete_focus_session` with client key → `42501 permission denied` (2026-06-12).
- [x] MCP `get_advisors` (security) → both `security_definer_function_executable` warnings gone. Remaining advisors are intentional (own-row RLS GraphQL visibility, idempotency_keys deny-all) plus the leaked-password toggle above.
- [ ] Start/stop a session in the app → rewards still pay out normally. **← do a smoke test on next app run** (service_role grant retained, so no breakage expected)

**Done when:** advisor warnings cleared, exploit curl fails, app session loop still works.

---

## Phase 1 — Session integrity & correctness

Fixes the known-wrong behaviors in the existing loop before building on top of it.
All of these touch `sessions-stop` + `complete_focus_session` + client, so do them as one unit.

### 1.1 🟠 Timezone-correct streaks
UTC day boundaries break streaks for anyone west of UTC (a 7pm New York session counts as "tomorrow").

- [x] Client sends `tz_offset_minutes` (from `new Date().getTimezoneOffset()`) in the `sessions-stop` body (`src/lib/api.ts`).
- [x] `sessions-stop`: streak days computed in user-local time via `advanceStreak`/`localDateString` in `shared/economy.ts`. Offset clamped ±14h; missing/invalid offset falls back to UTC.
- [x] Storage unchanged: `player_profiles.last_focus_date` now means "the user's local focus day".

### 1.2 🟠 Abandoned-session sweeper
Nothing ever sets `status = 'abandoned'`. A dead client's session sits `active` forever
and inflates `elapsed_ms` to the 4h cap if eventually stopped.

- [x] `pg_cron` job `sweep-abandoned-focus-sessions` (hourly): `active` sessions older than 5h (cap + grace) → `abandoned`, `ended_at = started_at + 4h`, no rewards. *(migration `20260611233857_phase1_session_integrity`)*
- [x] `sessions-start`: stale active session (>5h) is abandoned inline and the new session proceeds instead of 409.
- [x] Client: stopping a session the sweeper already abandoned resets the timer and shows a "session expired" message (silent rehydrate is kept for the lost-response/already-completed case).
- [x] **Found live during Phase 0 smoke test:** `sessions-stop` passed *uncapped* wall-clock `elapsed_ms` into the RPC, so a session left active for 102 days inflated `total_focus_time_ms` by 102 days on stop (rewards were correctly capped). Fixed: `p_elapsed_ms` is now `cappedMs`; corrupted totals repaired in the migration by recomputing from completed sessions with a per-session 4h cap.

### 1.3 🟠 Extract & test the economy math
The reward/streak constants keep changing; right now a regression is invisible.

- [x] `calculateRewards`, `calculateProgress`, and streak logic extracted to `supabase/functions/sessions-stop/shared/economy.ts` (pure, no I/O); `index.ts` is a thin wrapper.
- [x] 18 Deno tests in `shared/economy_test.ts`: caps, min-minutes floor, completion bonus, shard tiers, streak alive/dead/same-day/gap, multiplier cap, tz boundaries (incl. a regression test for the UTC-streak bug). All passing.
- [x] CI: `.github/workflows/ci.yml` runs lint + `tsc --noEmit` + `deno test` on every push/PR. (`supabase/functions/deno.json` added so Deno stops resolving the app's React Native tsconfig.)

### 1.4 🟢 Heartbeat schema (groundwork for Phase 2)
- [x] Migration: `'heartbeat'` allowed in the `focus_session_events` check constraint.
- [x] No behavior change yet — Phase 2 consumes it.

**Done when:** economy tests green in CI; a pre-midnight local session extends (not resets) the streak; killing the app mid-session no longer strands an active session past 5h.

**Status (2026-06-12):** all items shipped — migration applied remotely, `sessions-stop` v8 and `sessions-start` v5 deployed, tests passing locally. Remaining: push to GitHub so CI gets its first run, and an in-app smoke test (start/stop a session; also confirms the Phase 0 box).

---

## Phase 2 — Verifiable focus (the make-or-break mechanic)

The product's core promise. Without this, rewards are disconnected from behavior.
Two tracks: Track A works in Expo today; Track B needs a dev build — start A now, schedule B.

### Track A — App-leave detection (Forest model) — ✅ shipped 2026-06-12

**The contract (decided):** keep Tyren open while focusing; the screen stays awake
(`expo-keep-awake`) so "phone face-up on the desk" works. Backgrounding/locking past the
grace forfeits the session. Pure-JS AppState can't tell locking from leaving — keep-awake
is what makes the policy fair. Track B's native APIs can relax this later.

- [x] **Client** (`useFocusTimerStore` owns the whole focus guard):
  - `AppState` listener; backgrounding notes the timestamp (JS suspends, so the grace decision happens on return: away >30s → auto-stop with `forfeited: true`).
  - Heartbeats every 60s of foreground time via the new `sessions-heartbeat` function (RLS forbids direct event inserts — cross-cutting rule #1 holds).
  - Keep-awake active for the duration of every session (start/restore/stop/reset paths all covered; server-totals mirroring moved into the store so the AppState path updates the player store too).
- [x] **Server**:
  - New `sessions-heartbeat` edge function (v1): validates ownership + active status, records the beat, ignores beats <30s apart so retries/spam can't densify evidence.
  - `sessions-stop` (v9): `forfeited: true` → session `abandoned`, zero rewards, no streak credit (streak itself untouched), idempotent, same response shape. Normal stops pay `rewardableMs = min(wall, beats × 60s × 1.5 + 30s grace, 4h)`; streak qualification and `total_focus_time_ms` also use verified time; **target completion still judges wall clock** so lost packets can't void an honest target.
- [x] **UI**: stake hint under the running timer; "Session Broken" forfeit variant of `SessionSummaryPopup` driven by `forfeitNotice` in the store.
- [x] Tunables decided: grace 30s, forfeit does **not** break the streak (the lost session is the stake), freeform **not** exempt (otherwise it's the farming loophole).
- [ ] Local notification "return in 30s or your session breaks" — deferred to Phase 5 notifications (needs `expo-notifications` setup; the mechanic works without it).

> Note for the smoke test: the previous app build sends no heartbeats, so sessions stopped
> with an old client now pay at most the 30s grace (≈ nothing). Test with the updated client.

### Track B — Real app blocking (Opal model) — separate branch, dev build required

- [ ] Move off Expo Go: `expo prebuild` / EAS dev build (prerequisite for Phase 5 widgets and Phase 6 IAP too — do it once, here).
- [ ] iOS: FamilyControls + ManagedSettings + DeviceActivity via a config plugin (e.g. `react-native-device-activity`). Requires the Family Controls entitlement from Apple — **apply for the entitlement now; approval takes weeks.**
- [ ] Android: UsageStats permission for usage detection; blocking via overlay/accessibility comes later.
- [ ] Feature-flag it: app must remain fully functional with Track A only.

**Done when:** leaving the app mid-session forfeits rewards ✅; payouts require heartbeats ✅; entitlement application submitted ⬅ **user action: apply for Apple's Family Controls entitlement now — approval takes weeks** (developer.apple.com → account → entitlement request).

---

## Phase 3 — Real economy: server-side shop & boosters

The shop is currently a static JSON facade with hardcoded `owned` flags and no purchase
logic. Build the whole vertical slice in one pass: catalog → purchase → inventory → effect.

### 3.1 Schema — ✅ shipped 2026-06-12 (migration `20260612000743_phase3_shop_economy`)
- [x] `shop_items` catalog seeded with the agreed monetization decisions baked in: GBP items (passes + shard packs) exist but `active = false` until real IAP (Phase 6); shard packs above £19.99 dropped; Crystal Pass copy now gates content ("exclusive regions, quests and themes"), not progression power.
- [x] `player_inventory` (PK user+item, quantity), `active_boosts` (effect snapshot + expiry, indexed), `purchase_ledger`.
- [x] RLS: own-row SELECT on inventory/boosts/purchases; catalog SELECT for authenticated `USING (active)`; zero client write policies.

### 3.2 Purchase + activation flow — ✅
- [x] `purchase_item` RPC: locks profile, checks funds, debits via `currency_ledger`, credits inventory — or grants dust directly for dust packs — writes `purchase_ledger`, bumps `total_items_bought`. Atomic; raises `insufficient_funds` etc. Service-role only (verified absent from advisor's SECURITY DEFINER lints — the Phase 0 default-privileges revoke is doing its job).
- [x] `activate_boost` RPC: atomic inventory decrement → `active_boosts` row (duration from effect).
- [x] Edge functions `shop-purchase` + `boosts-activate` (both v1, idempotency-key support, friendly error mapping).
- [x] `sessions-stop` (v10): loads unexpired boosts, **highest wins** (decided — no stacking), multiplies dust and XP, **never shards**; `boost_multiplier` included in response + event metadata. Covered by tests (27 passing).
- [x] End-to-end SQL verification on the throwaway test account: chainbreaker purchase (shards debited, inventory credited), boost_2x purchase + activation (4h live boost, quantity consumed), `insufficient_funds` / `not_activatable` / `not_owned` all raise.

### 3.3 Client wiring — ✅
- [x] `api.shop.catalog()` (direct RLS read), `api.shop.purchase()`, `api.boosts.activate()`; `player-state` (v6) returns inventory + unexpired boosts; `usePlayerStore` mirrors them (`setInventoryState`/`applyPurchase`/`applyBoostActivation`).
- [x] `ShopBottomSheet`: server catalog, confirm-to-buy with idempotency key, unaffordable items dimmed, chainbreaker shows OWNED, empty GBP sections simply don't render.
- [x] `InventoryBottomSheet`: live boost banner with countdown, real chainbreaker state, owned boosters in the grid with ×quantity badges, tap-to-activate.
- [x] `assets/data/shopItems.json` deleted — the catalog lives in `shop_items`, seeded by the migration.

**Done when:** buying a 2X booster debits 1,500 dust in `currency_ledger` ✅ (verified in DB), activating it doubles the next session's dust ✅ (unit-tested; boost application live in sessions-stop), and balances survive app restart from server state ✅ (player-state hydration).

> Smoke test note: the throwaway test account (176edfee…) now owns a chainbreaker and has a live 2X boost from verification, plus a +2000 dust `test_fixture` ledger entry.

---

## Phase 4 — The game: map, bosses, progression — ✅ SHIPPED (server + core client; onboarding deferred)

The differentiator. The server now owns the map.

### 4.1 Schema + server loop — ✅
- [x] `map_locations` (seeded by migration from the old `mapData.json`, which is deleted) and `player_map_progress`. Only *reached* locations get a progress row (`current`/`completed`); locked/discovered are derived at read time from `unlock_level` + path order, so level-ups need no row maintenance. RLS: catalog readable by authenticated (like `shop_items`), progress own-row.
- [x] `complete_focus_session` rebuilt: `p_progress` → `p_damage` (1 HP per **verified** minute, computed in `shared/economy.ts` `bossDamage()`; deliberately boost-immune — boosters buy currency, not world progress). Damage hits the boss at the `current` location; at 0 HP it pays `rewardDust/Shards/Xp` through `reward_ledger` (+`currency_ledger`, reason `boss_defeated:<loc>`), increments `total_bosses_defeated`, and returns a `boss` block in the response. Follow-up migration re-scoped `reward_ledger`'s double-payout guard to `(session_id, reason)` since a kill session legitimately writes two rows.
- [x] **`progress_percent` redefined:** boss HP dealt / max HP at the current location (absolute, reset on advance; 0 where there's no boss). Backfill reset all rows to 0.
- [x] Chainbreaker is consumed by `advance_map_location` RPC (+ `map-advance` edge function, idempotent): advancing requires the immediate-next location, current boss down, level ≥ `unlock_level`, and 1 chainbreaker — first real item effect, proves the Phase 3 inventory plumbing. Errors: `not_next_location`/`boss_not_defeated`/`level_too_low`/`chainbreaker_required`, all verified live.

### 4.2 Client — ✅ (onboarding deferred)
- [x] `player-state` (v7) calls `ensure_map_start` and returns `map_progress`; `useMapStore` rewritten as a server mirror (catalog via RLS read + progress rows, `deriveLocationState()` helper) — the old local-simulation store is gone.
- [x] `MapScreen` card list driven by server state: boss HP bars, defeated checkmarks, "Break the chains" advance flow (confirm → consume chainbreaker → server), lock/level/boss gating messages. The HomeScreen location title is live too. *(The never-wired `MapPanZoom`/`FogOverlay`/`LocationMarkers` prototype was dead code importing the old store — deleted; resurrect from git history when building the real pan-zoom map.)*
- [x] `SessionSummaryPopup`: "You struck Chain Warden for 47 damage" + HP remaining; defeat shows "{boss} has fallen!" with the bonus payout.
- [ ] **Deferred:** narrative onboarding screen (3 panels: premise, stake, first target session) — needs design input; do alongside the pan-zoom map.

**Done when:** a focus session visibly damages a boss ✅ (verified live: 47-min session → 47 damage, progress 9%), defeating one pays ledgered rewards ✅ (Chain Warden kill verified in both ledgers, clamped damage, no re-kill/double-pay), and `progress_percent` has a single documented meaning ✅.

> Smoke test note: the throwaway test account (176edfee…) was advanced to Zalthar's Chains (consumed its chainbreaker) and has killed Chain Warden; it sits at level 4, progress 100%.

---

## Phase 5 — Retention & ambient presence — ✅ SHIPPED (server-dependent track; widgets deferred to Track B)

Independent items; ship incrementally in any order after Phase 2.

- [x] 🟠 **Streak freezes:** `streak_freezes` column on `player_profiles` (cap 2). The freeze math lives in `advanceStreak` (`shared/economy.ts`): one banked every 7th consecutive day; missed days covered **retroactively** when the player returns, and a freeze is only *spent* when it actually saves the streak (a gap wider than the bank still resets). `sessions-stop` computes the new balance and the RPC persists it (new `p_streak_freezes` arg). 12 new freeze unit tests (33 total). Earnable now; purchasable is Phase 6. Verified live: a 6-day streak with a 2-day gap + 1 freeze resets; with the gap frozen it extends to 7 and re-banks.
- [x] 🟠 **Notifications** (`expo-notifications`, `src/lib/notifications.ts`): local-only. Permission requested contextually on first session start. **Session-broken warning** scheduled on background (fires after the 30s grace, cancelled on timely return) since suspended JS can't pop its own UI. **Streak-at-risk reminder** at 20:00 local, rescheduled from the server's `last_focus_date` on every sync and after each qualifying session. Plugin added to `app.json`.
- [x] 🟢 **Weekly recap:** `player-state` returns a rolling 7-day `recap` (dust/shards/xp from `reward_ledger`, verified focus-ms + boss damage + session count from stop-event metadata) — derived server-side, never from client state. Surfaced as a "This week — You reclaimed Xh Ym" card on the profile page. The session summary also now calls out freezes banked/spent.
- [ ] 🟢 **Widgets / Live Activity** (needs Track B dev build): home-screen streak + today's minutes; Dynamic Island session timer. **Deferred** — blocked on the dev build (Expo Go can't host widgets).
- [x] 🟢 **Profile stats page polish:** streak-freeze balance row + the weekly recap card added. A full ledger-fed history graph is still a 🟢 nice-to-have, deferred.

> Smoke test note: the throwaway account (176edfee…) was used to verify freeze persistence; it currently sits at level 4 with a 7-day streak and 1 banked freeze from the fixture. Recap focus-ms/damage populate only from real edge-function stops (direct-RPC test fixtures don't write stop events).

---

## Phase 6 — Monetization — 🟡 SERVER BACKBONE SHIPPED (client IAP gated on the Track B dev build)

> **Track B is *not* a prerequisite for the monetization *server*.** The split: the ledgered grant path, entitlements, and webhook are pure-server and testable on Track A (done below). Only the *client* IAP SDK + paywall need a custom dev build (native modules absent from Expo Go) — that's the same dev-build prerequisite Track B shares, **not** the app-blocking work itself.

### Server backbone — ✅ (Track A, verified live)
- [x] **`entitlements` table** (own-row RLS) for subscription/pass state; **`iap_receipts`** dedup table (service-role only, all client grants revoked); **`store_product_id`** column on `shop_items` mapping StoreKit/RevenueCat ids → catalog ids.
- [x] **`redeem_iap_purchase` RPC** (service-role only): credits shards through `currency_ledger` **or** sets a pass entitlement, idempotent on `transaction_id` so webhook redelivery is a no-op, logs to `purchase_ledger`. **Never** credit IAP client-side — this is the only path. Verified live: shard grant (+20 → ledger + wallet), redelivery no-op, Crystal Pass entitlement with 30-day expiry, unknown-product safe-ack.
- [x] **`iap-webhook` edge function** (`verify_jwt: false` — the only non-JWT function; fail-closed on missing `REVENUECAT_WEBHOOK_SECRET`, bearer-checked, acks non-granting events to stop retries). RevenueCat v1 event shape. Auth gate verified live (503 until configured, 401 bad bearer, 405 GET).
- [x] **`player-state` returns `entitlements`**; client `usePlayerStore` mirrors them with a `hasEntitlement()` gate ready for Crystal Pass content.

### Client IAP + go-live — ⏳ DEFERRED to the Track B dev build
- [ ] **RevenueCat client SDK** (`react-native-purchases`) — needs a dev build; configure `app_user_id` = Supabase user id so webhook `app_user_id` resolves. Set `REVENUECAT_WEBHOOK_SECRET` (`supabase secrets set`) + paste into the RevenueCat dashboard webhook.
- [ ] **Create store products**, then fill `shop_items.store_product_id` and flip the GBP rows `active = true` (currently inactive; shard packs already capped at £19.99 in the seed).
- [ ] **Crystal Pass** (£5.99/mo): gate breadth not power — exclusive regions/themes/quests, advanced stats, unlimited block-lists (2B). Copy already content-gated in the seed.
- [ ] **Streak-repair SKU:** one-tap restore of a just-lost streak (pair with the Phase 5 streak-at-risk notification). Server: a small `restore_streak` RPC; client: paywall entry.
- [ ] **Paywall + App Store hygiene:** restore purchases, manage-subscription link, GDPR-clean conversion analytics.

**Done when:** a sandbox IAP credits shards through the ledger via webhook ✅ *(grant path + idempotency verified live via the RPC; full sandbox round-trip pending the dev build + RevenueCat config)*, and entitlement state survives reinstall via restore ⏳ *(client restore, dev build)*.

---

## Phase 7 — Fragment gates & the two-stage location loop — ✅ SHIPPED (server + client)

Replaces the abstract single `progress_percent` bar (and the level-gated, chainbreaker advance that stranded players at 100% — see the "first two levels share one location" dead-zone) with a concrete two-beat loop per location. Migration `20260628201034_phase7_fragment_gates_boss_arc`.

### Design
- **GATE → BOSS per location.** In the **gate** stage, verified focus drips location-themed **fragments** (1 per 30 verified min, carry-over banked in `fragment_progress_ms`). Fragments are a **per-location progress counter, not a wallet currency** — unbuyable, earned only by focus, reset each location. When full, the player taps the gate's verb ("Break the Chains") to enter the **boss** stage; verified focus then drains boss HP (1/min). The killing blow auto-advances to the next location's gate.
- **Currencies untouched:** dust still drips per minute; shards stay premium (shop/IAP + boss-kill milestones). Nothing in the core loop spends the currency we sell.
- **Map arc rebuilt into a journey ending at Zalthar:** Hold (Break the Chains / Chainbreaker Fragment ×4 / The Warden 180hp) → Swirling Depths (Break the Seal / Sigil ×8 / 480) → The Vexed Ruins (Raise the Portcullis / Rune ×12 / 840) → Withered Plains (Shatter the Ward / Ward ×16 / 1320) → **Zalthar's Throne** (Breach the Throne / Throne Key ×24 / Zalthar 2280). The redundant "Zalthar's Chains" location is gone (the chains are now the Hold's gate). The `unlock_level` gate is removed entirely — pacing is fragments + boss HP.

### Server — ✅ (verified live)
- [x] `map_locations` gains `gate_label`/`fragment_name`/`fragments_required`; `player_map_progress` gains `stage`/`fragments_collected`/`fragment_progress_ms`. Ladder reseeded; all progress wiped to a clean gate start.
- [x] `complete_focus_session` rewritten: drops `p_damage` (derives fragments **and** boss damage from the verified `p_elapsed_ms`), branches on stage, pays boss rewards + auto-advances on kill, returns a `map` block (replaces `boss`). `break_gate(p_user_id)` RPC for the one manual action (gate → boss). `advance_map_location` + the `map-advance` function dropped/retired; new `map-break-gate` edge function. `ensure_map_start` seeds a gate.
- [x] Verified live end-to-end on a test account: 2h gate session → 4 fragments (capped) + `gate_ready`; `break_gate` → boss 180hp; 3h boss session → 180 damage → kill + ledgered rewards (150/5/300) → auto-advance to Swirling Depths gate; 50-min partial → 1 fragment + 20 min banked (carry-over exact). Test fixtures cleaned up.

### Client — ✅
- [x] `MapProgressHeader` replaces the `ProgressBar` arc on Home: live "xxh xxm xxs until next {fragment}" countdown + fragment pips in the gate stage, live boss healthbar in the boss stage (both tick off the running session's elapsed). `MapScreen` rewritten for gate/boss state + the "Break the gate" button. `SessionSummaryPopup` shows fragments collected / gate ready / boss struck / defeated + path opens. `api.ts`, `useMapStore` (fragment/stage fields, `applyMapResult`/`applyBreakGate`), `useFocusTimerStore`, `profile.tsx` updated. `tsc`/lint/deno (30 tests) green.

### Follow-ups
- [ ] **Retire the Chainbreaker inventory/shop UI** (`InventoryBottomSheet` key-item card + `ShopBottomSheet` asset) — the item is fully removed from the loop; the card now always renders greyed. Left in place to keep this change focused; remove deliberately.
- [ ] **Victory state** for clearing Zalthar's Throne (no next location): currently `MapProgressHeader` shows "The realm lies quiet" and there's no current location. Design a proper end-of-arc screen.
- [ ] Rename/retune any of the placeholder gate labels, fragment names, counts, or boss HP — all data-only on `map_locations`.

---

## Phase 8 — The Relic redesign (approach 2: Sigil) — ✅ SHIPPED 2026-07-04

Design pivot agreed 2026-07-03 (Hassan + Marcus): visual direction **1B "Sigil"** (gold
relic-crest cards, procedural SVG — no illustrator), extended with the **Relic system**
(mock 2A). No leaderboard for MVP; the backend stays server-authoritative (anti-cheat).

### Mechanics
- **Relics.** Defeating a location's boss leaves behind that location's relic at
  **Bronze Seal**, auto-equipped if a loadout slot is free. One relic per location,
  defined on `map_locations` (`relic_name`, `perk_name`, `relic_flavor`).
- **Seals (mini-progression).** Bronze → Silver → Gold → Mythic. Each *qualifying*
  session (≥25 verified min — the streak bar) credits +1 attuned session to every
  **equipped** relic. Rank-up thresholds: Silver 3, Gold 6, Mythic 12 sessions.
- **Perks.** A relic's perk is a passive **map-progression multiplier while equipped**
  (fragments + boss damage, never currency): Bronze +0.05×, Silver +0.08×,
  Gold +0.12×, Mythic +0.20×. Purchased boosters stay currency-only — money buys
  currency, mastery buys progression.
- **Loadout.** 2 slots, any owned relics; bonuses sum (2 Mythics = 1.40×).
  `set_relic_loadout` RPC + `relics-loadout` edge function.
- **Seal-gated shop.** `shop_items` gains `required_location_id` + `required_seal`;
  `purchase_item` refuses below-rank buys (`seal_rank_required`). Level-exclusive items
  seeded per location; old `chainbreaker` item retired (`active = false`).

### Server
- `player_relics` (user, location, rank, rank_sessions, equipped_slot 1|2, RLS own-row
  select, zero client writes). `complete_focus_session` applies the equipped perk
  multiplier to the map-progress ms, grants the relic on a boss kill, credits attuned
  sessions on qualifying stops, and returns a `relics` block (+ `relic_earned` in `map`).
  `player-state` returns `relics`. Seal constants live in `shared/economy.ts` with tests.

### Client (visual refactor — gold Sigil direction)
- `src/theme.ts` gold palette + Silkscreen pixel font (numerals/labels) + Instrument Serif.
- **Home**: procedural relic-crest card centerpiece (hex crest + rays + progress seal),
  pixel top bar (dust · TYREN · shards), rank track (BRZ/SLV/GLD/MYT), equipped-perk chip,
  gold Focus button; **boss stage** flips to the ember-red variant (HP in pixel numerals,
  segmented header). Video background dropped.
- **Screens**: Game Map (gold card list), Relic detail, Relic Codex, Loadout,
  Rank-up moment. Shop/Inventory sheets restyled (level-item section w/ seal locks,
  equipped-perks row). Session summary reports relic earned / attunement / rank-ups.

### Status (2026-07-04) — all shipped & verified
- Migrations `phase8_relic_system` + `phase8_pin_seal_helper_search_path` applied
  remotely; `sessions-stop` v15, `player-state` v11, `relics-loadout` v1 deployed.
- Live-verified on the test account (176edfee…): Warden kill → Bronze relic
  auto-equip + auto-advance; 1.05× perk on gate accrual (30 min → 1 fragment + 90s
  banked); 3rd qualifying session → Silver rank-up; loadout RPC; `chain_draught`
  purchasable at Silver while `sundering_sigil` (Gold) and `abyssal_tonic`
  (unowned relic) correctly raise `seal_rank_required`.
- 38 deno tests green (seal math added); `tsc` + lint clean; advisors at baseline.
- Client: Home rebuilt around the procedural crest card (gate/boss states, ember
  boss variant, rank-up moment queue); Map/Codex/Loadout/Relic-detail/Profile/Auth
  all in the Sigil system; Silkscreen pixel font bundled (OFL); video background,
  `MapProgressHeader`, `ProgressBar`, `GridCell`, chainbreaker UI all removed.

### Status addendum (2026-07-04, per-level theming + the six-level world)
- Gold is Level 1's identity, not the app's. `levelAccent(sort_order)` in
  `src/theme.ts` gives each level a color world; seal metals (`sealColors`)
  are reserved for the rank track + seal-rank labels and never used as relic
  identity. Boss stage always overrides with the universal ember-red variant.
- The world map is now the six-level codex ladder (migration
  `phase8_world_map_yawning_depths_to_zalthar_unbound`, ids stable):
  L1 Zalthar's Chains (gold, spark) · L2 Yawning Depths (`swirling_depths`,
  teal, rings, relic The Fathom Eye/Depth Ward) · L3 Withered Plains (sage,
  sprig, The Last Sprig/Bloomcaller) · L4 Hollowroot (`the_vexed_ruins`,
  root-ember, its original face design, relic Hollowroot/Root Ward — restored
  per Hassan after briefly being "Hollow Vigil") · L5 Emberfall Reach (new
  row, molten red, drop, The First Ember/Emberguard) · L6 Zalthar Unbound
  (`zalthars_throne`, bone white, starburst, The Broken Crown/Kingslayer).
- Map page shows completed levels + the current one + only the next two
  (0.55 / 0.3 opacity fade); the rest stays hidden until reached. Codex shows
  all six with colored glyphs even when locked, per the design.
- Home carries the in-card PROGRESS/HP bar from the level designs; Crest has
  one bespoke glyph per level and no `progress` prop. `tsc` + lint clean.
- Gold is no longer the app chrome: `LevelAccent` gained `dim` + `card`
  (tinted surface), map/codex/relic cards sit on their level's surface, and
  player-following screens (profile "Your Results", shop, inventory, session
  summary) theme via `useCurrentLevelAccent()` (src/hooks/useLevelAccent.ts)
  the way Home does. Gold remains only as L1's accent, the auth screen brand,
  and neutral fallbacks.
- Relic seal journeys live only on the relic detail page (`/relic/[id]`),
  reached from the codex or the loadout (row tap → detail; the EQUIP badge
  toggles). Home shows just the equipped perk chips + total multiplier.

### Follow-ups
- [ ] Settings screen from the design set (blocked apps, session length,
  auto-start, notifications toggles) — most rows need Track B / notification prefs.
- [ ] In-app smoke test on a device (start/stop, relic moment, loadout swap).
- [ ] Target-session UI (server supports `mode: 'target'`; Home only starts freeform).
- [ ] Retune seal thresholds (3/6/12) and level-item prices after playtesting —
  data-only (`relic_seal_sessions_required` + `shop_items`).
- [ ] Victory state for clearing Zalthar's Throne (carried from Phase 7).
- [ ] Designs for levels 3+ — each needs a name/relic pass (data migration),
  a `LevelAccent` entry, and a bespoke Crest glyph (placeholders render until then).

## Cross-cutting rules (apply from Phase 0 onward)

1. **Every currency/XP mutation goes through `currency_ledger`/`reward_ledger`** via a locked-down RPC. No exceptions — this is already the codebase's best property; keep it.
2. **New DB functions/tables ship with explicit GRANT/REVOKE + RLS in the same migration.** Run `get_advisors` after every migration.
3. **Client never computes rewards** — it mirrors server responses (`hydrate`/`applySessionResult` pattern). Any new feature follows it.
4. **Pure-function economy logic lives in the shared tested module** (Phase 1.3); edge functions stay thin I/O wrappers.
5. **Idempotency keys on every mutating edge function** (pattern already exists in sessions — reuse `shared/`).
6. Run `npx tsc --noEmit` + `npm run lint` + deno tests before merging; regenerate types (`supabase gen types`) after schema changes.

## Suggested sequence at a glance

| Order | Phase | Size | Blocks |
|-------|-------|------|--------|
| 1 | 0 — Security | hours | everything |
| 2 | 1 — Session integrity | ~1 week | 2, 3 |
| 3 | 2A — App-leave detection | ~1 week | product viability |
| 4 | 3 — Server-side shop | 1–2 weeks | 4, 6 |
| 5 | 4 — Map & bosses | 2–3 weeks | 6 (content) |
| 6 | 2B — Real blocking (parallel track once dev build exists) | ongoing | 5 widgets, 6 IAP |
| 7 | 5 — Retention | incremental | — |
| 8 | 6 — Monetization | 1–2 weeks | launch |
