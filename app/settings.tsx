import { useCurrentLevelAccent } from "@/src/hooks/useLevelAccent";
import {
  cancelSessionBreakWarning,
  cancelStreakReminder,
  requestNotificationPermission,
  scheduleStreakReminder,
} from "@/src/lib/notifications";
import { useAuthStore } from "@/src/stores/useAuthStore";
import { usePlayerStore } from "@/src/stores/usePlayerStore";
import { useSettingsStore } from "@/src/stores/useSettingsStore";
import { fonts, palette } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// Settings (design set) — local device preferences. The notification
// toggles are live; the focus prefs are saved for the target-session UI;
// app blocking stays locked until the Track B dev build exists.

const SESSION_LENGTHS: { label: string; minutes: number | null }[] = [
  { label: "Freeform", minutes: null },
  { label: "25m", minutes: 25 },
  { label: "50m", minutes: 50 },
  { label: "90m", minutes: 90 },
];

// Turning a notification on is the moment to ask for permission; if the
// OS-level ask is spent, point at system settings instead of failing mute.
async function ensurePermission(): Promise<boolean> {
  const granted = await requestNotificationPermission();
  if (!granted) {
    Alert.alert(
      "Notifications are off",
      "Tyren can't notify you until notifications are enabled in system settings.",
      [
        { text: "Not now", style: "cancel" },
        { text: "Open settings", onPress: () => Linking.openSettings() },
      ],
    );
  }
  return granted;
}

export default function SettingsScreen() {
  const router = useRouter();
  const theme = useCurrentLevelAccent();
  const { signOut, user } = useAuthStore();

  const streakReminderEnabled = useSettingsStore((s) => s.streakReminderEnabled);
  const breakWarningEnabled = useSettingsStore((s) => s.breakWarningEnabled);
  const defaultSessionMinutes = useSettingsStore((s) => s.defaultSessionMinutes);
  const autoStart = useSettingsStore((s) => s.autoStart);
  const {
    setStreakReminderEnabled,
    setBreakWarningEnabled,
    setDefaultSessionMinutes,
    setAutoStart,
  } = useSettingsStore.getState();

  const currentStreak = usePlayerStore((s) => s.currentStreak);
  const lastFocusDate = usePlayerStore((s) => s.lastFocusDate);

  const toggleStreakReminder = async (enabled: boolean) => {
    setStreakReminderEnabled(enabled);
    if (enabled) {
      if (await ensurePermission()) {
        scheduleStreakReminder({ streak: currentStreak, lastFocusDate });
      }
    } else {
      cancelStreakReminder();
    }
  };

  const toggleBreakWarning = async (enabled: boolean) => {
    setBreakWarningEnabled(enabled);
    if (enabled) {
      await ensurePermission();
    } else {
      // Nothing should be pending while the app is open, but be thorough.
      cancelSessionBreakWarning();
    }
  };

  const switchColors = {
    trackColor: { false: "rgba(244, 234, 218, 0.15)", true: theme.dim },
    thumbColor: palette.text,
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={28} color={palette.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Focus ---- */}
        <Text style={[styles.sectionCaption, { color: theme.dim }]}>FOCUS</Text>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.faint }]}>
          <View style={styles.rowColumn}>
            <Text style={styles.rowTitle}>Default session</Text>
            <Text style={styles.rowSubtitle}>
              Saved for target sessions — the timer runs freeform until they ship
            </Text>
            <View style={styles.chipRow}>
              {SESSION_LENGTHS.map(({ label, minutes }) => {
                const selected = defaultSessionMinutes === minutes;
                return (
                  <TouchableOpacity
                    key={label}
                    style={[
                      styles.chip,
                      selected
                        ? { borderColor: theme.accent, backgroundColor: theme.glow }
                        : { borderColor: "rgba(244, 234, 218, 0.15)" },
                    ]}
                    onPress={() => setDefaultSessionMinutes(minutes)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selected && { color: theme.bright },
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Auto-start next session</Text>
              <Text style={styles.rowSubtitle}>Coming with target sessions</Text>
            </View>
            <Switch value={autoStart} onValueChange={setAutoStart} {...switchColors} />
          </View>
        </View>

        {/* ---- Notifications ---- */}
        <Text style={[styles.sectionCaption, { color: theme.dim }]}>NOTIFICATIONS</Text>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.faint }]}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Streak reminder</Text>
              <Text style={styles.rowSubtitle}>
                An evening nudge when your streak is at risk
              </Text>
            </View>
            <Switch
              value={streakReminderEnabled}
              onValueChange={toggleStreakReminder}
              {...switchColors}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Session-break warning</Text>
              <Text style={styles.rowSubtitle}>
                Warns you when leaving the app is about to break a session
              </Text>
            </View>
            <Switch
              value={breakWarningEnabled}
              onValueChange={toggleBreakWarning}
              {...switchColors}
            />
          </View>
        </View>

        {/* ---- App blocking (Track B) ---- */}
        <Text style={[styles.sectionCaption, { color: theme.dim }]}>APP BLOCKING</Text>
        <View
          style={[
            styles.card,
            styles.cardLocked,
            { backgroundColor: theme.card, borderColor: theme.faint },
          ]}
        >
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Blocked apps</Text>
              <Text style={styles.rowSubtitle}>
                Block distracting apps during focus — requires the full app
                build, coming soon
              </Text>
            </View>
            <Ionicons name="lock-closed-outline" size={18} color={palette.textFaint} />
          </View>
        </View>

        {/* ---- Account ---- */}
        <Text style={[styles.sectionCaption, { color: theme.dim }]}>ACCOUNT</Text>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.faint }]}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Signed in</Text>
              <Text style={styles.rowSubtitle}>{user?.email ?? "—"}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.row}
            onPress={async () => {
              await signOut();
              router.replace("/auth" as never);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.rowTitle, { color: palette.danger }]}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  header: {
    paddingTop: 65,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 30,
    fontFamily: fonts.serif,
    color: palette.text,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: 8,
  },
  sectionCaption: {
    fontSize: 8,
    fontFamily: fonts.pixel,
    letterSpacing: 2,
    marginTop: 14,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  cardLocked: {
    opacity: 0.65,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 14,
  },
  rowColumn: {
    paddingVertical: 14,
    gap: 4,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontFamily: fonts.ui,
    fontWeight: "600",
    color: palette.text,
  },
  rowSubtitle: {
    fontSize: 12,
    fontFamily: fonts.ui,
    color: palette.textDim,
    lineHeight: 17,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(244, 234, 218, 0.08)",
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  chipText: {
    fontSize: 13,
    fontFamily: fonts.ui,
    color: palette.textDim,
  },
});
