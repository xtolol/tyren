import { useFocusTimerStore } from '../stores/useFocusTimerStore';
import type { SessionRewards } from '../core/rewards/types';
import { calculateRewards } from '../core/rewards/types';
import { DEFAULT_BOOSTS } from '../core/boosts/types';
import { usePlayerStore } from '../stores/usePlayerStore';

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function useFocusTimer() {
  const {
    status,
    mode,
    elapsedMs,
    targetDurationMs,
    start,
    pause,
    resume,
    stop: stopTimer,
    reset,
  } = useFocusTimerStore();

  const { level } = usePlayerStore();

  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isCompleted = status === 'completed';

  const formattedTime = formatTime(elapsedMs);

  // Progress: 0-100
  // For target mode: based on elapsed vs target
  // For freeform: we use elapsed minutes as percentage (caps at 100)
  const progress = (() => {
    if (targetDurationMs) {
      return Math.min(100, (elapsedMs / targetDurationMs) * 100);
    }
    // Freeform: 1% per minute, max 100%
    const minutes = elapsedMs / 60000;
    return Math.min(100, minutes);
  })();

  const startFreeform = () => {
    start('freeform');
  };

  const startTarget = (durationMs: number) => {
    start('target', durationMs);
  };

  const stop = (): SessionRewards => {
    const summary = stopTimer();
    if (!summary) {
      return { dust: 0, shards: 0, xp: 0 };
    }

    const playerStore = usePlayerStore.getState();
    playerStore.addFocusTime(summary.totalMs);

    const rewards = calculateRewards({
      focusTimeMs: summary.totalMs,
      currentLevel: level,
      boosts: DEFAULT_BOOSTS,
      sessionCompleted: summary.completed,
    });

    if (rewards.dust > 0) playerStore.addCurrency('dust', rewards.dust);
    if (rewards.shards > 0) playerStore.addCurrency('shards', rewards.shards);
    if (rewards.xp > 0) playerStore.addXp(rewards.xp);

    return rewards;
  };

  const toggle = () => {
    if (status === 'idle') {
      startFreeform();
    } else if (isRunning) {
      pause();
    } else if (isPaused) {
      resume();
    } else if (isCompleted) {
      stop();
    }
  };

  return {
    status,
    isRunning,
    isPaused,
    isCompleted,
    elapsedMs,
    formattedTime,
    progress,
    mode,
    targetDurationMs,

    startFreeform,
    startTarget,
    pause,
    resume,
    stop,
    toggle,
    reset,
  };
}
