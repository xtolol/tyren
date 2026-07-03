import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { adminClient } from './shared/client.ts'
import { corsResponse, jsonResponse, errorResponse } from './shared/http.ts'
import { getUserId } from './shared/auth.ts'

// Sets the player's two-perk relic loadout. The body carries `slots`: an
// ordered array of 0–2 owned location ids (slot 1 first). The RPC owns the
// invariants atomically: ownership, distinctness, and the slot cap. Naturally
// idempotent — setting the same loadout twice is a no-op — so there is no
// idempotency-key plumbing here.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const userId = getUserId(req)
  if (!userId) return errorResponse('Unauthorized', 401)

  const body = await req.json().catch(() => ({}))
  const slots: unknown = body.slots
  if (!Array.isArray(slots) || slots.some((s) => typeof s !== 'string')) {
    return errorResponse('slots must be an array of location ids')
  }

  const db = adminClient()
  const { data, error } = await db.rpc('set_relic_loadout', {
    p_user_id: userId,
    p_slots: slots,
  })

  if (error) {
    const known: Record<string, string> = {
      too_many_slots: 'You can equip at most two perks.',
      duplicate_relic: 'The same relic cannot fill both slots.',
      relic_not_owned: 'You do not own that relic yet.',
    }
    return errorResponse(known[error.message] ?? error.message, 400)
  }

  return jsonResponse(data)
})
