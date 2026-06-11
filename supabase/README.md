# Supabase backend

Mirror of the code deployed to the Supabase project (edge functions via the
dashboard/MCP, SQL via migrations). The base schema (tables, RLS policies,
the original `complete_focus_session`) predates this directory and exists
only in the live project; `migrations/` starts from June 2026.

- `functions/` — Deno edge functions. Each function bundles its own copy of
  `shared/` because they are deployed as standalone bundles.
  `sessions-pause` and `sessions-resume` are intentional tombstones (410):
  pause is unsupported because elapsed time is computed server-side as
  `ended_at - started_at`.
- `migrations/` — applied with `mcp__supabase__apply_migration`.

These files are excluded from the app's `tsconfig.json` (they are Deno,
not React Native).
