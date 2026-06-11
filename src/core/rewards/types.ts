// Reward amounts are server-authoritative: the formula lives in
// supabase/functions/sessions-stop (dust/XP per minute, target-completion
// bonus, streak bonus, shard payout). The client only displays what the
// server returns — never calculate rewards locally.

export type CurrencyType = "dust" | "shards";

export interface SessionRewards {
  dust: number;
  shards: number;
  xp: number;
}
