import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
Deno.serve(() => new Response(JSON.stringify({ error: 'Resume is not supported.' }), {
  status: 410,
  headers: { 'Content-Type': 'application/json' },
}))
