import { useMapStore } from '@/src/stores/useMapStore';
import type { LevelAccent } from '@/src/theme';
import { levelAccent } from '@/src/theme';

// The accent of the level the player is currently on — screens that follow
// the player (profile, shop, inventory, session summary) theme with this,
// the same way Home does. Falls back to the deepest completed level once
// the whole ladder is cleared, and to level 1 before any progress exists.
export function useCurrentLevelAccent(): LevelAccent {
  const locations = useMapStore((s) => s.locations);
  const progress = useMapStore((s) => s.progress);

  const current = locations.find((l) => progress[l.id]?.status === 'current');
  if (current) return levelAccent(current.sort_order);

  const completed = locations.filter((l) => progress[l.id]?.status === 'completed');
  const deepest = completed[completed.length - 1];
  return levelAccent(deepest?.sort_order ?? 0);
}
