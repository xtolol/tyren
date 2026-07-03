-- A session now legitimately produces two reward rows: the session
-- payout and (on a kill) the boss payout. Keep the double-payout guard
-- but scope it per reason: at most one row per (session, reason).
DROP INDEX public.reward_ledger_one_per_session;
CREATE UNIQUE INDEX reward_ledger_one_per_session_reason
  ON public.reward_ledger (session_id, reason)
  WHERE session_id IS NOT NULL;
