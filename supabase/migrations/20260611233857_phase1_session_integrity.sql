-- Phase 1 session integrity (see PLAN.md 1.2/1.4).

-- 1.4: allow heartbeat events (consumed by Phase 2 verified-focus payouts).
ALTER TABLE public.focus_session_events
  DROP CONSTRAINT focus_session_events_event_type_check;
ALTER TABLE public.focus_session_events
  ADD CONSTRAINT focus_session_events_event_type_check
  CHECK (event_type = ANY (ARRAY['start'::text, 'pause'::text, 'resume'::text, 'stop'::text, 'heartbeat'::text]));

-- 1.2: hourly sweeper abandoning sessions left active past the 4h reward
-- cap plus 1h grace. Swept sessions earn nothing; ended_at records the cap.
-- (Named pg_cron jobs are upserted, so re-running is safe.)
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'sweep-abandoned-focus-sessions',
  '0 * * * *',
  $job$
  UPDATE public.focus_sessions
  SET status = 'abandoned',
      ended_at = started_at + interval '4 hours'
  WHERE status = 'active'
    AND started_at < now() - interval '5 hours'
  $job$
);

-- Repair: total_focus_time_ms historically absorbed uncapped wall-clock
-- elapsed time (a session left active for 102 days inflated one profile's
-- total on stop). Recompute from completed sessions, capping each at 4h
-- to match the reward cap.
UPDATE public.player_profiles p
SET total_focus_time_ms = s.capped_total,
    updated_at = now()
FROM (
  SELECT user_id,
         sum(least((extract(epoch FROM (ended_at - started_at)) * 1000)::bigint, 14400000)) AS capped_total
  FROM public.focus_sessions
  WHERE status = 'completed' AND ended_at IS NOT NULL
  GROUP BY user_id
) s
WHERE p.user_id = s.user_id
  AND p.total_focus_time_ms <> s.capped_total;
