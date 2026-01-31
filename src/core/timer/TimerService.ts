import * as Crypto from 'expo-crypto';
import type { TimerState, TimerStatus, SessionMode, SessionSummary } from './types';

const DEFAULT_TICK_INTERVAL = 1000;

export class TimerService {
  private state: TimerState;
  private tickCallback: ((elapsedMs: number) => void) | null = null;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private tickIntervalMs: number = DEFAULT_TICK_INTERVAL;

  constructor() {
    this.state = this.getInitialState();
  }

  private getInitialState(): TimerState {
    return {
      status: 'idle',
      mode: 'freeform',
      startedAt: null,
      pausedAt: null,
      accumulatedMs: 0,
      targetDurationMs: null,
      sessionId: null,
    };
  }

  start(mode: SessionMode = 'freeform', targetMs?: number): string {
    if (this.state.status === 'running') {
      return this.state.sessionId!;
    }

    const sessionId = Crypto.randomUUID();
    this.state = {
      status: 'running',
      mode,
      startedAt: Date.now(),
      pausedAt: null,
      accumulatedMs: 0,
      targetDurationMs: mode === 'target' && targetMs ? targetMs : null,
      sessionId,
    };

    this.startTicking();
    return sessionId;
  }

  pause(): void {
    if (this.state.status !== 'running') return;

    this.state.pausedAt = Date.now();
    this.state.accumulatedMs = this.getElapsedMs();
    this.state.startedAt = null;
    this.state.status = 'paused';

    this.stopTicking();
  }

  resume(): void {
    if (this.state.status !== 'paused') return;

    this.state.startedAt = Date.now();
    this.state.pausedAt = null;
    this.state.status = 'running';

    this.startTicking();
  }

  stop(): SessionSummary {
    const totalMs = this.getElapsedMs();
    const summary: SessionSummary = {
      sessionId: this.state.sessionId || Crypto.randomUUID(),
      totalMs,
      completed: this.isTargetReached(),
      mode: this.state.mode,
    };

    this.stopTicking();
    this.state = this.getInitialState();

    return summary;
  }

  reset(): void {
    this.stopTicking();
    this.state = this.getInitialState();
  }

  getElapsedMs(): number {
    if (this.state.status === 'idle') {
      return 0;
    }

    if (this.state.status === 'paused' || this.state.status === 'completed') {
      return this.state.accumulatedMs;
    }

    // Running state
    const now = Date.now();
    const runningTime = this.state.startedAt ? now - this.state.startedAt : 0;
    return this.state.accumulatedMs + runningTime;
  }

  getStatus(): TimerStatus {
    return this.state.status;
  }

  getState(): TimerState {
    return { ...this.state };
  }

  setTickCallback(
    cb: (elapsedMs: number) => void,
    intervalMs: number = DEFAULT_TICK_INTERVAL
  ): void {
    this.tickCallback = cb;
    this.tickIntervalMs = intervalMs;

    if (this.state.status === 'running') {
      this.stopTicking();
      this.startTicking();
    }
  }

  clearTickCallback(): void {
    this.tickCallback = null;
    this.stopTicking();
  }

  private startTicking(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
    }

    if (!this.tickCallback) return;

    this.tickInterval = setInterval(() => {
      const elapsed = this.getElapsedMs();

      // Check for target completion
      if (this.state.mode === 'target' && this.state.targetDurationMs) {
        if (elapsed >= this.state.targetDurationMs && this.state.status === 'running') {
          this.state.status = 'completed';
          this.state.accumulatedMs = this.state.targetDurationMs;
          this.stopTicking();
        }
      }

      this.tickCallback?.(elapsed);
    }, this.tickIntervalMs);
  }

  private stopTicking(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private isTargetReached(): boolean {
    if (this.state.mode !== 'target' || !this.state.targetDurationMs) {
      return true; // Freeform sessions are always "completed"
    }
    return this.getElapsedMs() >= this.state.targetDurationMs;
  }
}

export const timerService = new TimerService();
