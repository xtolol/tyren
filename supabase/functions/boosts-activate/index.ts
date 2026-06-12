import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { adminClient } from './shared/client.ts'
import { corsResponse, jsonResponse, errorResponse } from './shared/http.ts'
import { getUserId } from './shared/auth.ts'

// Consumes one owned booster via the activate_boost RPC (atomic
// inventory decrement + active_boosts insert).
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const userId = getUserId(req)
  if (!userId) return errorResponse('Unauthorized', 401)

  const body = await req.json().catch(() => ({}))
  const itemId: string | undefined = body.item_id
  if (!itemId) return errorResponse('item_id required')

  const db = adminClient()
  const idempotencyKey = req.headers.get('x-idempotency-key')

  if (idempotencyKey) {
    const { data: cached } = await db
      .from('idempotency_keys')
      .select('response')
      .eq('user_id', userId)
      .eq('key', idempotencyKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (cached) return jsonResponse(cached.response)
  }

  const { data, error } = await db.rpc('activate_boost', {
    p_user_id: userId,
    p_item_id: itemId,
  })

  if (error) {
    const known: Record<string, string> = {
      not_activatable: 'This item cannot be activated.',
      not_owned: 'You do not own this item.',
    }
    return errorResponse(known[error.message] ?? error.message, 400)
  }

  if (idempotencyKey) {
    await db.from('idempotency_keys').upsert({
      user_id:      userId,
      key:          idempotencyKey,
      request_hash: '',
      response:     data,
      expires_at:   new Date(Date.now() + 86_400_000).toISOString(),
    })
  }

  return jsonResponse(data)
})
