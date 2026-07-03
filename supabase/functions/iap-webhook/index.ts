import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { adminClient } from './shared/client.ts'
import { jsonResponse } from './shared/http.ts'

// RevenueCat webhook adapter — the ONLY non-JWT function in the project.
// RevenueCat authenticates with a static bearer token you set on the
// webhook in their dashboard; we check it against REVENUECAT_WEBHOOK_SECRET.
// Real value is granted by the redeem_iap_purchase RPC (idempotent,
// ledgered); this function is a thin, fail-closed translator.
//
// Deploy with verify_jwt: false. Set the secret with:
//   supabase secrets set REVENUECAT_WEBHOOK_SECRET=<random-string>
// and paste the same value into RevenueCat → Project → Webhooks → Authorization.

// RevenueCat event types that represent value to grant. Renewals and
// uncancellations re-extend a subscription; non-renewing covers consumables
// (shard packs). Everything else (CANCELLATION, EXPIRATION, BILLING_ISSUE,
// TEST, …) is acked but not acted on — entitlement expiry handles lapses.
const GRANTING_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
])

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET')
  // Fail closed: an unconfigured webhook accepts nothing.
  if (!secret) return jsonResponse({ error: 'Webhook not configured' }, 503)

  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${secret}` && auth !== secret) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const body = await req.json().catch(() => null)
  const event = body?.event
  if (!event || typeof event !== 'object') {
    return jsonResponse({ error: 'Malformed event' }, 400)
  }

  // Non-granting events: acknowledge so RevenueCat stops retrying.
  if (!GRANTING_EVENTS.has(event.type)) {
    return jsonResponse({ status: 'ignored', type: event.type ?? null })
  }

  const userId: string | undefined = event.app_user_id
  const productId: string | undefined = event.product_id
  // RevenueCat sends transaction_id for store purchases; fall back to the
  // event id so every event still dedups to exactly one fulfilment.
  const transactionId: string | undefined = event.transaction_id ?? event.id
  if (!userId || !productId || !transactionId) {
    return jsonResponse({ error: 'Missing app_user_id / product_id / transaction_id' }, 400)
  }

  const expiresAt =
    typeof event.expiration_at_ms === 'number'
      ? new Date(event.expiration_at_ms).toISOString()
      : null

  const db = adminClient()
  const { data, error } = await db.rpc('redeem_iap_purchase', {
    p_user_id: userId,
    p_transaction_id: transactionId,
    p_product_id: productId,
    p_expires_at: expiresAt,
  })

  if (error) {
    // 500 so RevenueCat retries a genuinely failed grant.
    return jsonResponse({ error: error.message }, 500)
  }

  return jsonResponse({ status: 'ok', result: data })
})
