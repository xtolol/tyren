import { useFocusTimerStore } from '../stores/useFocusTimerStore';
import { usePlayerStore } from '../stores/usePlayerStore';

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function useFocusTimer() {
  const { status, elapsedMs, targetDurationMs, loading, error, start, stop: stopTimer, reset } =
    useFocusTimerStore();

  const { addCurrency, addXp, addFocusTime, setProgressPercent } = usePlayerStore();

  const isRunning = status === 'running';

  const formattedTime = formatTime(elapsedMs);

  const progress = (() => {
    if (targetDurationMs) {
      return Math.min(100, (elapsedMs / targetDurationMs) * 100);
    }
    // Freeform: 1% per minute, max 100%
    return Math.min(100, elapsedMs / 60_000);
  })();

  const startFreeform = () => start('freeform');

  const startTarget = (durationMs: number) => start('target', durationMs);

  const stop = async () => {
    const result = await stopTimer();
    if (result) {
      const { rewards, progress_percent } = result;
      if (rewards.dust > 0) addCurrency('dust', rewards.dust);
      if (rewards.shards > 0) addCurrency('shards', rewards.shards);
      if (rewards.xp > 0) addXp(rewards.xp);
      addFocusTime(elapsedMs);
      setProgressPercent(progress_percent);
    }
    return result?.rewards ?? null;
  };

  return {
    status,
    isRunning,
    loading,
    error,
    elapsedMs,
    formattedTime,
    progress,
    targetDurationMs,

    startFreeform,
    startTarget,
    stop,
    reset,
  };
}
