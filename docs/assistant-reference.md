# Assistant Reference Notes

## Response 1: Current implemented logic, unused incorporated code, and placeholders

Current state from a code scan (no runtime execution):

**Implemented logic (actively used)**
- App routing/layout and providers are wired: [`app/_layout.tsx`](/home/zumbarak/Desktop/tyren/tyren/app/_layout.tsx:1), [`app/index.tsx`](/home/zumbarak/Desktop/tyren/tyren/app/index.tsx:1), [`app/map.tsx`](/home/zumbarak/Desktop/tyren/tyren/app/map.tsx:1), [`app/profile.tsx`](/home/zumbarak/Desktop/tyren/tyren/app/profile.tsx:45).
- Focus timer flow is live on Home: start/stop button uses hook/store and updates progress/focus time: [`HomeScreen.tsx`](/home/zumbarak/Desktop/tyren/tyren/app/components/HomeScreen.tsx:79), [`useFocusTimer.ts`](/home/zumbarak/Desktop/tyren/tyren/src/hooks/useFocusTimer.ts:14), [`useFocusTimerStore.ts`](/home/zumbarak/Desktop/tyren/tyren/src/stores/useFocusTimerStore.ts:21), [`TimerService.ts`](/home/zumbarak/Desktop/tyren/tyren/src/core/timer/TimerService.ts:28).
- Player state persistence is implemented (dust/shards/level/xp/progress/stats): [`usePlayerStore.ts`](/home/zumbarak/Desktop/tyren/tyren/src/stores/usePlayerStore.ts:27).
- Profile screen reads store stats and supports share: [`profile.tsx`](/home/zumbarak/Desktop/tyren/tyren/app/profile.tsx:78).
- Shop/Inventory sheets render fully as UI (static/data-driven visuals): [`ShopBottomSheet.tsx`](/home/zumbarak/Desktop/tyren/tyren/app/components/ShopBottomSheet.tsx:386), [`InventoryBottomSheet.tsx`](/home/zumbarak/Desktop/tyren/tyren/app/components/InventoryBottomSheet.tsx:132).
- Map page currently uses a simple level-card map UI tied to `level/progressPercent`: [`MapScreen.tsx`](/home/zumbarak/Desktop/tyren/tyren/app/components/MapScreen.tsx:57).

**Incorporated but not currently used**
- Advanced map system is present but not mounted:
  - [`app/components/map/MapContent.tsx`](/home/zumbarak/Desktop/tyren/tyren/app/components/map/MapContent.tsx:14)
  - [`MapPanZoom.tsx`](/home/zumbarak/Desktop/tyren/tyren/app/components/map/MapPanZoom.tsx:38)
  - [`LocationMarkers.tsx`](/home/zumbarak/Desktop/tyren/tyren/app/components/map/LocationMarkers.tsx:30)
  - [`FogOverlay.tsx`](/home/zumbarak/Desktop/tyren/tyren/app/components/map/FogOverlay.tsx:14)
- `useMapStore` actions exist but have no call sites (`discoverLocation/moveTo/revealRegion/damageBoss/defeatBoss`): [`useMapStore.ts`](/home/zumbarak/Desktop/tyren/tyren/src/stores/useMapStore.ts:29).
- Progression module is defined but unused: [`src/core/progression/types.ts`](/home/zumbarak/Desktop/tyren/tyren/src/core/progression/types.ts:1).
- Hook capabilities not used by UI right now: `startTarget`, `toggle`, pause/resume path: [`useFocusTimer.ts`](/home/zumbarak/Desktop/tyren/tyren/src/hooks/useFocusTimer.ts:51).
- Unused helper in Home: [`RadialGradientButton`](/home/zumbarak/Desktop/tyren/tyren/app/components/HomeScreen.tsx:29).
- Unused image assets from template: `assets/images/react-logo.png`, `react-logo@2x.png`, `react-logo@3x.png`, `partial-react-logo.png`.

**Placeholders / stubbed behavior**
- Rewards are explicit TODO + hardcoded zeros: [`calculateRewards`](/home/zumbarak/Desktop/tyren/tyren/src/core/rewards/types.ts:18).
- `stop()` computes rewards but they are not applied to currency/xp (only focus time/progress are updated): [`useFocusTimer.ts`](/home/zumbarak/Desktop/tyren/tyren/src/hooks/useFocusTimer.ts:55), [`HomeScreen.tsx`](/home/zumbarak/Desktop/tyren/tyren/app/components/HomeScreen.tsx:82).
- Shop/inventory cards are display-only (no purchase/equip handlers): [`ShopBottomSheet.tsx`](/home/zumbarak/Desktop/tyren/tyren/app/components/ShopBottomSheet.tsx:413), [`InventoryBottomSheet.tsx`](/home/zumbarak/Desktop/tyren/tyren/app/components/InventoryBottomSheet.tsx:154).
- Several values are hardcoded placeholders (e.g., `LVL 1`, boost remaining time text): [`HomeScreen.tsx`](/home/zumbarak/Desktop/tyren/tyren/app/components/HomeScreen.tsx:130), [`InventoryBottomSheet.tsx`](/home/zumbarak/Desktop/tyren/tyren/app/components/InventoryBottomSheet.tsx:159).
- Map cards currently do not navigate/open content on press (Touchable has no `onPress` action): [`MapScreen.tsx`](/home/zumbarak/Desktop/tyren/tyren/app/components/MapScreen.tsx:85).

## Response 2: Backend/database recommendations and full plan

**Recommended stack (opinionated, fastest path for your app)**
1. **Language:** TypeScript end-to-end.
2. **Backend runtime:** **Supabase Edge Functions** (TypeScript on Deno) for timer/reward authority.
3. **Database:** **PostgreSQL (Supabase managed Postgres)**.
4. **Auth:** **Supabase Auth** (JWT-based).
5. **Hosting:** **Supabase** for DB + Auth + Functions in one platform (lowest ops for your stage).

**Why this is the best fit**
1. Your app is Expo/TypeScript already, so no context switch.
2. You get managed Postgres + auth + server logic together.
3. You can enforce per-user access in DB via RLS.
4. Timer/reward logic runs server-side, so client tampering is minimized.
5. Expo has an official Supabase integration path.

---

**Target architecture**
1. Mobile app keeps UI timer for display only.
2. Server is source of truth for session timing and rewards.
3. App calls backend endpoints: `start`, `pause`, `resume`, `stop`.
4. Backend computes elapsed using server timestamps, not client time.
5. Backend writes immutable ledgers for rewards/currency/xp.
6. App reads current player state from backend after each write.

---

**Data model (core tables)**
1. `player_profiles` (`user_id`, progression fields, stats).
2. `focus_sessions` (`id`, `user_id`, `mode`, `status`, `started_at`, `paused_total_ms`, `ended_at`, `target_ms`).
3. `focus_session_events` (`session_id`, `event_type`, `server_ts`, metadata).
4. `reward_ledger` (`id`, `user_id`, `session_id`, `dust`, `shards`, `xp`, `reason`, `created_at`).
5. `currency_ledger` (`id`, `user_id`, `currency`, `delta`, `reason`, `created_at`).
6. `idempotency_keys` (`user_id`, `key`, `request_hash`, `response`, `expires_at`).

---

**API plan**
1. `POST /v1/sessions/start`
2. `POST /v1/sessions/pause`
3. `POST /v1/sessions/resume`
4. `POST /v1/sessions/stop` (calculates rewards in one DB transaction)
5. `GET /v1/player/state`
6. `POST /v1/migration/import-local` (one-time local AsyncStorage import)

Use **idempotency keys** on all write endpoints because mobile retries are common.

---

**Timer/reward engine rules**
1. Only server timestamps count.
2. Max session length cap (anti-abuse).
3. One active session per user (DB unique constraint).
4. Reward issuance is exactly-once per session stop (unique guard in ledger).
5. Reward formulas live in backend only (client can request preview but cannot award).

---

**Security plan**
1. Supabase Auth JWT required for every user endpoint.
2. Service-role key never in mobile app.
3. RLS enabled on all user-owned tables.
4. Rate-limit session mutation endpoints.
5. Audit log all reward writes.

---

**Migration plan from local persistence**
1. Add auth and backend reads first.
2. Implement dual-write window (local + backend) behind a feature flag.
3. Run one-time import endpoint to migrate historical local stats.
4. Validate state parity for a week.
5. Remove local persistence as source of truth; keep local cache only.

---

**Delivery plan (practical timeline)**
1. **Week 1:** Schema, auth wiring, RLS, environments (dev/staging/prod).
2. **Week 2:** Session APIs + authoritative timer state machine.
3. **Week 3:** Reward engine + ledgers + tests.
4. **Week 4:** App integration + migration endpoint + rollout flags.
5. **Week 5:** Staged rollout (10% → 50% → 100%), monitor and harden.

---

**When to change stack later**
1. If logic grows heavy (matchmaking, large leaderboards), move API to **Node/Fastify on Cloud Run** and keep Postgres on Supabase/Neon.
2. Keep DB schema + ledgers unchanged so migration is low-risk.

---

Sources used:
- Expo + Supabase guide: https://docs.expo.dev/guides/using-supabase/
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase JWTs: https://supabase.com/docs/guides/auth/jwts
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase connection modes/pooling: https://supabase.com/docs/reference/postgres/connection-strings
- Expo SecureStore: https://docs.expo.dev/versions/v53.0.0/sdk/securestore/
- Cloud Run Node runtime (if/when you split backend): https://docs.cloud.google.com/run/docs/runtimes/nodejs

If you want, I can turn this into a concrete implementation blueprint for your repo (exact tables, endpoint contracts, and migration SQL).
