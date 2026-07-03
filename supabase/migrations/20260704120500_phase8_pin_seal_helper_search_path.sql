-- Pin search_path on the pure seal helpers (advisor 0011). They touch no
-- tables, but the standing rule is every function ships pinned.
ALTER FUNCTION public.relic_seal_bonus(text) SET search_path = 'public';
ALTER FUNCTION public.relic_seal_order(text) SET search_path = 'public';
ALTER FUNCTION public.relic_seal_sessions_required(text) SET search_path = 'public';
