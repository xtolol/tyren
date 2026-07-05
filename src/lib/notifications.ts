import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useSettingsStore } from '../stores/useSettingsStore';

// Local notifications only (no push): a warning while a live session is
// about to break in the background, and an evening nudge when a streak
// is at risk. Scheduling is gated on already-granted permission — the
// only prompt happens contextually, on the first session start — and on
// the user's toggles in the settings store.

const SESSION_BREAK_ID = 'session-break';
const STREAK_REMINDER_ID = 'streak-reminder';
const REMINDER_HOUR = 20; // 20:00 local — late enough to matter, early enough to act
const LEAVE_GRACE_SECONDS = 30; // mirrors LEAVE_GRACE_MS in shared/economy.ts

// Notifications exist to pull the user back in, never to interrupt the
// app while it is open and foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function hasPermission(): Promise<boolean> {
  try {
    const settings = await Notifications.getPermissionsAsync();
    return settings.granted;
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Tyren',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

// Fires if the user stays away past the leave grace while a session is
// running; cancelled the moment they come back in time.
export async function scheduleSessionBreakWarning() {
  if (!useSettingsStore.getState().breakWarningEnabled) return;
  if (!(await hasPermission())) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: SESSION_BREAK_ID,
      content: {
        title: 'Your focus session broke',
        body: 'You left Tyren too long — Zalthar reclaimed the session.',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: LEAVE_GRACE_SECONDS,
      },
    });
  } catch {
    // Notification scheduling is best-effort
  }
}

export async function cancelSessionBreakWarning() {
  try {
    await Notifications.cancelScheduledNotificationAsync(SESSION_BREAK_ID);
  } catch {
    // Nothing scheduled
  }
}

export async function cancelStreakReminder() {
  try {
    await Notifications.cancelScheduledNotificationAsync(STREAK_REMINDER_ID);
  } catch {
    // Nothing scheduled
  }
}

function localDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Evening nudge while a streak is at risk. `lastFocusDate` is the
// server's user-local focus day, comparable with the local calendar.
export async function scheduleStreakReminder(args: {
  streak: number;
  lastFocusDate: string | null;
}) {
  try {
    await Notifications.cancelScheduledNotificationAsync(STREAK_REMINDER_ID);
  } catch {
    // Nothing scheduled
  }
  const { streak, lastFocusDate } = args;
  if (!useSettingsStore.getState().streakReminderEnabled) return;
  if (streak <= 0 || !(await hasPermission())) return;

  const now = new Date();
  const qualifiedToday = lastFocusDate === localDateString(now);

  const target = new Date(now);
  target.setHours(REMINDER_HOUR, 0, 0, 0);
  if (qualifiedToday) {
    target.setDate(target.getDate() + 1);
  } else if (target <= now) {
    // The evening slot already passed: nudge soon, but never past
    // midnight (a dead streak isn't worth waking anyone for).
    const lastCall = new Date(now);
    lastCall.setHours(23, 30, 0, 0);
    target.setTime(Math.min(now.getTime() + 30 * 60_000, lastCall.getTime()));
    if (target <= now) return;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: STREAK_REMINDER_ID,
      content: {
        title: `${streak}-day streak at risk`,
        body: '25 focused minutes keeps your streak alive. Zalthar is counting on you skipping it.',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: target },
    });
  } catch {
    // Notification scheduling is best-effort
  }
}
