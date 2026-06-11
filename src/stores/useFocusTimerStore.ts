import { create } from 'zustand';
import { api } from '../lib/api';
import type { StopSessionResponse } from '../lib/api';

// Module-level ticker — kept outside Zustand to avoid spurious re-renders
let _tickInterval: ReturnType<typeof setInterval> | null = null;

function startTicking(onTick: (ms: number) => void, offsetMs = 0) {
  stopTicking();
  const origin = Date.now() - offsetMs;
  _tickInterval = setInterval(() => onTick(Date.now() - origin), 1000);
}

function stopTicking() {
  if (_tickInterval) {
    clearInterval(_tickInterval);
    _tickInterval = null;
  }
}

type TimerStatus = 'idle' | 'running';

interface FocusTimerStore {
  status: TimerStatus;
  sessionId: string | null;
  elapsedMs: number;
  targetDurationMs: number | null;
  loading: boolean;
  error: string | null;

  start: (mode?: 'freeform' | 'target', targetMs?: number) => Promise<void>;
  stop: () => Promise<StopSessionResponse | null>;
  resumeFromServer: (sessionId: string, startedAt: string, targetMs: number | null) => void;
  reset: () => void;
}

export const useFocusTimerStore = create<FocusTimerStore>((set, get) => ({
  status: 'idle',
  sessionId: null,
  elapsedMs: 0,
  targetDurationMs: null,
  loading: false,
  error: null,

  start: async (mode = 'freeform', targetMs) => {
    if (get().status !== 'idle' || get().loading) return;
    set({ loading: true, error: null });

    try {
      const session = await api.sessions.start(mode, targetMs);
      set({
        status: 'running',
        sessionId: session.session_id,
        targetDurationMs: targetMs ?? null,
        elapsedMs: 0,
        loading: false,
      });
      startTicking((ms) => set({ elapsedMs: ms }));
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },

  stop: async () => {
    const { sessionId, status, elapsedMs } = get();
    if (status !== 'running' || !sessionId) return null;

    stopTicking();
    set({ loading: true });

    try {
      const result = await api.sessions.stop(sessionId);
      set({ status: 'idle', sessionId: null, elapsedMs: 0, targetDurationMs: null, loading: false });
      return result;
    } catch (err) {
      // Resume the local display timer from where it stopped
      startTicking((ms) => set({ elapsedMs: ms }), elapsedMs);
      set({ loading: false, error: (err as Error).message });
      return null;
    }
  },

  resumeFromServer: (sessionId, startedAt, targetMs) => {
    if (_tickInterval) return; // already ticking
    const elapsedMs = Math.max(0, Date.now() - new Date(startedAt).getTime());
    set({ status: 'running', sessionId, targetDurationMs: targetMs, elapsedMs, loading: false, error: null });
    startTicking((ms) => set({ elapsedMs: ms }), elapsedMs);
  },

  reset: () => {
    stopTicking();
    set({ status: 'idle', sessionId: null, elapsedMs: 0, targetDurationMs: null, loading: false, error: null });
  },
}));
