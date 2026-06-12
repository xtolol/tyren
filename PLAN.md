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

## Phase 4 — The game: map, bosses, progression

The differentiator. `src/core/map/types.ts` and `mapData.json` already define the shapes — make the server own them.

### 4.1 Schema + server loop
- [ ] `map_locations` (seed from `mapData.json`: unlock_level, boss jsonb) and `player_map_progress` (user_id, location_id, status `locked|discovered|current|completed`, boss_hp_remaining).
- [ ] Extend `complete_focus_session`: focus minutes → boss damage at the player's `current` location (e.g. 1 HP/min — tune). Boss HP ≤ 0 → mark completed, pay `rewardDust/Shards/Xp` through the existing ledgers, increment `total_bosses_defeated`, advance `current` to the next unlocked location.
- [ ] **Define `progress_percent` once and for all:** per-location boss progress (HP dealt / max HP), resets when advancing. Replaces today's saturate-at-100-forever behavior. Migration to backfill/reset existing rows.
- [ ] Chainbreaker (`level_items`): consuming it from inventory is what unlocks the next region after a boss falls — first real item effect, proves the Phase 3 inventory plumbing.

### 4.2 Client
- [ ] `player-state` (or new `map-state` function) returns map progress; `useMapStore` hydrates from server instead of local data.
- [ ] `MapScreen`/`FogOverlay`/`LocationMarkers`: drive status from server state; fog reveals on discovery; boss HP bar at current location.
- [ ] `SessionSummaryPopup`: show boss damage dealt this session ("You struck Zalthar for 47 damage") — this is the line that makes sessions feel like *progress*, prioritize it.
- [ ] Narrative onboarding screen (3 panels max): the premise, the stake, the first target session.

**Done when:** a focus session visibly damages a boss, defeating one pays ledgered rewards and reveals map, and `progress_percent` has a single documented meaning.

---

## Phase 5 — Retention & ambient presence

Independent items; ship incrementally in any order after Phase 2.

- [ ] 🟠 **Streak freezes:** `streak_freezes` count on profile; earned (e.g. every 7-day streak grants one), auto-consumed in `sessions-stop` streak logic when a day is missed (extend Phase 1.3 tests). Earnable first; purchasable is Phase 6.
- [ ] 🟠 **Notifications** (`expo-notifications`): streak-at-risk reminder (local, scheduled from `last_focus_date`), session-broken warning (already needed by Phase 2A).
- [ ] 🟢 **Weekly recap:** "You reclaimed 6h 40m, dealt 400 damage, 12-day streak" — derived from `reward_ledger`/`focus_sessions`; surface in-app first, push later.
- [ ] 🟢 **Widgets / Live Activity** (needs Track B dev build): home-screen streak + today's minutes; Dynamic Island session timer.
- [ ] 🟢 **Profile stats page polish:** `profile.tsx` fed from ledgers (real history graph, not just totals).

---

## Phase 6 — Monetization

Last on purpose: requires dev build (Phase 2B), a real shop (Phase 3), and content worth paying for (Phase 4).

- [ ] **RevenueCat** (or `expo-iap` + server receipt validation — RevenueCat recommended: handles receipts, entitlements, GBP/regional pricing). Server webhook → edge function credits shards via `purchase_item`-style RPC; **never** credit IAP client-side.
- [ ] **Shard packs:** cap at £19.99 initially (drop the £49.99/£99.99 tiers from the seed until there's demand evidence).
- [ ] **Crystal Pass subscription** (£5.99/mo): `entitlements` table fed by RevenueCat webhook. Gate breadth, not power: exclusive regions/themes/quests, advanced stats, unlimited block-lists (2B). **Revisit the "50% progression boost" copy — gate content, not effectiveness.**
- [ ] **Streak repair SKU:** one-tap restore of a just-lost streak (highest-converting item in the category; pair with the streak-at-risk notification).
- [ ] **Paywall + App Store hygiene:** restore purchases, manage subscription link, GDPR-clean analytics on conversion points.

**Done when:** a sandbox IAP credits shards through the ledger via webhook, and entitlement state survives reinstall via restore.

---

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
