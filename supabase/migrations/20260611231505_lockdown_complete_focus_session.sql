-- Phase 0 security hardening (see PLAN.md).
--
-- complete_focus_session is SECURITY DEFINER and trusts its reward
-- parameters; it must only ever be callable by the service role (edge
-- functions). CREATE OR REPLACE in the streaks migration re-applied
-- Postgres's default EXECUTE grant to PUBLIC, which exposed it to any
-- signed-in user via /rest/v1/rpc/complete_focus_session.

-- Drop the superseded 8-arg overload entirely.
DROP FUNCTION IF EXISTS public.complete_focus_session(
  uuid, uuid, timestamp with time zone, bigint, integer, integer, integer, integer);

-- Lock the current overload down to service_role (postgres keeps access as owner).
REVOKE EXECUTE ON FUNCTION public.complete_focus_session(
  uuid, uuid, timestamp with time zone, bigint, integer, integer, integer, integer, integer, date)
FROM PUBLIC, anon, authenticated;

-- Future functions in public must opt in to client access explicitly
-- instead of inheriting EXECUTE via PUBLIC.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- idempotency_keys is written and read exclusively by edge functions
-- using the service role; RLS stays enabled with no policies (deny all)
-- by design.
COMMENT ON TABLE public.idempotency_keys IS
  'Service-role only (edge function idempotency cache). RLS enabled with no policies intentionally: clients must never read or write this table.';
