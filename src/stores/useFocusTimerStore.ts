import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { api } from '../lib/api';
import type { StopSessionResponse } from '../lib/api';
import { usePlayerStore } from './usePlayerStore';

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

// One key per stop *intent*, reused across retries so the server can
// return the cached response if the first attempt committed but the
// reply was lost in transit.
let _stopIdempotencyKey: string | null = null;

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

    if (!_stopIdempotencyKey) _stopIdempotencyKey = Crypto.randomUUID();

    try {
      const result = await api.sessions.stop(sessionId, _stopIdempotencyKey);
      _stopIdempotencyKey = null;
      set({ status: 'idle', sessionId: null, elapsedMs: 0, targetDurationMs: null, loading: false });
      return result;
    } catch (err) {
      const message = (err as Error).message;

      // The server already closed this session (e.g. our first attempt
      // committed but the response was lost). Local state is stale —
      // drop the session and pull fresh totals from the server.
      if (message.startsWith('Session already')) {
        _stopIdempotencyKey = null;
        set({ status: 'idle', sessionId: null, elapsedMs: 0, targetDurationMs: null, loading: false, error: null });
        try {
          const { profile } = await api.player.state();
          usePlayerStore.getState().hydrate(profile);
        } catch {
          // Network unavailable — totals refresh on next sync
        }
        return null;
      }

      // Resume the local display timer from where it stopped
      startTicking((ms) => set({ elapsedMs: ms }), elapsedMs);
      set({ loading: false, error: message });
      return null;
    }
  },

  resumeFromServer: (sessionId, startedAt, targetMs) => {
    if (get().sessionId === sessionId && _tickInterval) return; // already tracking this session
    const elapsedMs = Math.max(0, Date.now() - new Date(startedAt).getTime());
    set({ status: 'running', sessionId, targetDurationMs: targetMs, elapsedMs, loading: false, error: null });
    startTicking((ms) => set({ elapsedMs: ms }), elapsedMs);
  },

  reset: () => {
    stopTicking();
    _stopIdempotencyKey = null;
    set({ status: 'idle', sessionId: null, elapsedMs: 0, targetDurationMs: null, loading: false, error: null });
  },
}));
