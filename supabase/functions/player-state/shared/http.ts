export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-idempotency-key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
export function corsResponse() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
export function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status)
}
