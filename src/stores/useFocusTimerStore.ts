import * as Crypto from 'expo-crypto';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { api } from '../lib/api';
import type { StopSessionResponse } from '../lib/api';
import {
  cancelSessionBreakWarning,
  requestNotificationPermission,
  scheduleSessionBreakWarning,
  scheduleStreakReminder,
} from '../lib/notifications';
import { useMapStore } from './useMapStore';
import { usePlayerStore } from './usePlayerStore';

// ---- Focus contract (Track A — see PLAN.md Phase 2) ----
// The deal: keep Tyren open while you focus. The screen stays awake so
// "phone face-up on the desk" works; backgrounding the app (or locking
// the phone) longer than the grace forfeits the session. While
// foregrounded the client heartbeats so the server only pays for time it
// has liveness evidence for.
const LEAVE_GRACE_MS = 30_000; // mirrors LEAVE_GRACE_MS in shared/economy.ts
const HEARTBEAT_INTERVAL_MS = 60_000; // mirrors HEARTBEAT_INTERVAL_MS
const KEEP_AWAKE_TAG = 'focus-session';

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

let _heartbeatInterval: ReturnType<typeof setInterval> | null = null;

function startHeartbeats(sessionId: string) {
  stopHeartbeats();
  _heartbeatInterval = setInterval(() => {
    // Best-effort: a lost beat costs nothing thanks to the server's
    // tolerance; sustained failure correctly limits the payout.
    api.sessions.heartbeat(sessionId).catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeats() {
  if (_heartbeatInterval) {
    clearInterval(_heartbeatInterval);
    _heartbeatInterval = null;
  }
}

function guardSession(sessionId: string) {
  startHeartbeats(sessionId);
  activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
}

function unguardSession() {
  stopHeartbeats();
  deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
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
  // Set when a session was forfeited (left the app too long) so the UI
  // can explain what happened; cleared via clearForfeitNotice.
  forfeitNotice: { elapsedMs: number } | null;

  start: (mode?: 'freeform' | 'target', targetMs?: number) => Promise<void>;
  stop: (forfeited?: boolean) => Promise<StopSessionResponse | null>;
  resumeFromServer: (sessionId: string, startedAt: string, targetMs: number | null) => void;
  clearForfeitNotice: () => void;
  reset: () => void;
}

export const useFocusTimerStore = create<FocusTimerStore>((set, get) => ({
  status: 'idle',
  sessionId: null,
  elapsedMs: 0,
  targetDurationMs: null,
  loading: false,
  error: null,
  forfeitNotice: null,

  start: async (mode = 'freeform', targetMs) => {
    if (get().status !== 'idle' || get().loading) return;
    set({ loading: true, error: null, forfeitNotice: null });

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
      guardSession(session.session_id);
      // Ask for notification permission contextually, on the first
      // session — this is what powers the leave-warning and streak nudge.
      requestNotificationPermission();
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },

  stop: async (forfeited = false) => {
    const { sessionId, status, elapsedMs } = get();
    if (status !== 'running' || !sessionId) return null;

    stopTicking();
    unguardSession();
    set({ loading: true });

    if (!_stopIdempotencyKey) _stopIdempotencyKey = Crypto.randomUUID();

    try {
      const result = await api.sessions.stop(sessionId, _stopIdempotencyKey, forfeited);
      _stopIdempotencyKey = null;
      set({
        status: 'idle', sessionId: null, elapsedMs: 0, targetDurationMs: null, loading: false,
        forfeitNotice: result.forfeited ? { elapsedMs } : null,
      });
      // The server applied (or zeroed) rewards atomically — mirror its
      // totals instead of re-deriving them with a client-side curve.
      usePlayerStore.getState().applySessionResult(result);
      if (result.map) useMapStore.getState().applyMapResult(result.map);
      // A qualifying session today satisfies the streak, so the server
      // returns today as the focus day and the reminder moves to tomorrow
      // evening. A short session leaves last_focus_date untouched.
      if (!result.forfeited && result.qualifies) {
        scheduleStreakReminder({
          streak: result.current_streak,
          lastFocusDate: result.streak_focus_date,
        });
      }
      return result;
    } catch (err) {
      const message = (err as Error).message;

      // The server already closed this session. Either our first attempt
      // committed but the response was lost (completed — stay silent), or
      // the sweeper expired a session left running too long (abandoned —
      // tell the user why there are no rewards). Local state is stale in
      // both cases: drop the session and pull fresh totals.
      if (message.startsWith('Session already')) {
        _stopIdempotencyKey = null;
        const expired = message.includes('abandoned');
        set({
          status: 'idle', sessionId: null, elapsedMs: 0, targetDurationMs: null, loading: false,
          error: expired ? 'Session expired — sessions left running longer than 5 hours earn no rewards.' : null,
        });
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
      guardSession(sessionId);
      set({ loading: false, error: message });
      return null;
    }
  },

  resumeFromServer: (sessionId, startedAt, targetMs) => {
    if (get().sessionId === sessionId && _tickInterval) return; // already tracking this session
    const elapsedMs = Math.max(0, Date.now() - new Date(startedAt).getTime());
    set({ status: 'running', sessionId, targetDurationMs: targetMs, elapsedMs, loading: false, error: null });
    startTicking((ms) => set({ elapsedMs: ms }), elapsedMs);
    guardSession(sessionId);
  },

  clearForfeitNotice: () => set({ forfeitNotice: null }),

  reset: () => {
    stopTicking();
    unguardSession();
    _stopIdempotencyKey = null;
    set({ status: 'idle', sessionId: null, elapsedMs: 0, targetDurationMs: null, loading: false, error: null, forfeitNotice: null });
  },
}));

// ---- Leave detection ----
// Backgrounding suspends JS, so the grace decision happens on return:
// note when we left, and on becoming active again either forfeit (away
// too long) or resume the heartbeats. If the app is killed instead of
// resumed, heartbeats simply stop and the server bounds the payout.
let _backgroundedAt: number | null = null;

AppState.addEventListener('change', (state) => {
  const { status, sessionId, stop } = useFocusTimerStore.getState();

  if (state === 'background') {
    if (status === 'running') {
      _backgroundedAt = Date.now();
      // Warn from outside the app, since JS is suspended and can't pop
      // its own UI. Cancelled the instant we come back within grace.
      scheduleSessionBreakWarning();
    }
    stopHeartbeats();
    return;
  }

  if (state === 'active') {
    cancelSessionBreakWarning();
    const awayMs = _backgroundedAt ? Date.now() - _backgroundedAt : 0;
    _backgroundedAt = null;
    if (status !== 'running' || !sessionId) return;

    if (awayMs > LEAVE_GRACE_MS) {
      stop(true); // forfeit: left the app past the grace window
    } else {
      startHeartbeats(sessionId);
    }
  }
});
