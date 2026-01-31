import { create } from 'zustand';
import { timerService, type TimerStatus, type SessionMode, type SessionSummary } from '../core/timer';

interface FocusTimerStore {
  status: TimerStatus;
  mode: SessionMode;
  elapsedMs: number;
  targetDurationMs: number | null;
  sessionId: string | null;

  start: (mode?: SessionMode, targetMs?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => SessionSummary | null;
  reset: () => void;

  _updateElapsed: (ms: number) => void;
  _syncFromService: () => void;
}

export const useFocusTimerStore = create<FocusTimerStore>((set, get) => {
  // Set up tick callback to update store
  timerService.setTickCallback((elapsedMs) => {
    get()._updateElapsed(elapsedMs);
    get()._syncFromService();
  });

  return {
    status: 'idle',
    mode: 'freeform',
    elapsedMs: 0,
    targetDurationMs: null,
    sessionId: null,

    start: (mode = 'freeform', targetMs) => {
      const sessionId = timerService.start(mode, targetMs);
      const state = timerService.getState();
      set({
        status: state.status,
        mode: state.mode,
        elapsedMs: 0,
        targetDurationMs: state.targetDurationMs,
        sessionId,
      });
    },

    pause: () => {
      timerService.pause();
      const state = timerService.getState();
      set({
        status: state.status,
        elapsedMs: state.accumulatedMs,
      });
    },

    resume: () => {
      timerService.resume();
      const state = timerService.getState();
      set({
        status: state.status,
      });
    },

    stop: () => {
      if (get().status === 'idle') return null;
      const summary = timerService.stop();
      set({
        status: 'idle',
        mode: 'freeform',
        elapsedMs: 0,
        targetDurationMs: null,
        sessionId: null,
      });
      return summary;
    },

    reset: () => {
      timerService.reset();
      set({
        status: 'idle',
        mode: 'freeform',
        elapsedMs: 0,
        targetDurationMs: null,
        sessionId: null,
      });
    },

    _updateElapsed: (ms) => {
      set({ elapsedMs: ms });
    },

    _syncFromService: () => {
      const state = timerService.getState();
      set({
        status: state.status,
      });
    },
  };
});
