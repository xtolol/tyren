export type TimerStatus = 'idle' | 'running' | 'paused' | 'completed';
export type SessionMode = 'freeform' | 'target';

export interface TimerState {
  status: TimerStatus;
  mode: SessionMode;
  startedAt: number | null;
  pausedAt: number | null;
  accumulatedMs: number;
  targetDurationMs: number | null;
  sessionId: string | null;
}

export interface SessionSummary {
  sessionId: string;
  totalMs: number;
  completed: boolean;
  mode: SessionMode;
}
