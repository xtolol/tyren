import MapIcon from "@/assets/images/map-24px.svg";
import { useFocusTimerStore } from "@/src/stores/useFocusTimerStore";
import { useMapStore } from "@/src/stores/useMapStore";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

// Mirrors complete_focus_session's fragment cadence (1 fragment / 30 verified
// min). Used only to render a live, provisional countdown while a session is
// running; the server stays authoritative and corrects on the next sync.
const FRAGMENT_INTERVAL_MS = 1_800_000;

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

export default function MapProgressHeader({
  onMapPress,
}: {
  onMapPress?: () => void;
}) {
  const locations = useMapStore((s) => s.locations);
  const progress = useMapStore((s) => s.progress);
  const elapsedMs = useFocusTimerStore((s) => s.elapsedMs);
  const isRunning = useFocusTimerStore((s) => s.status === "running");

  const current = locations.find((l) => progress[l.id]?.status === "current");
  const entry = current ? progress[current.id] : undefined;

  const mapButton = (
    <TouchableOpacity style={styles.iconButton} onPress={onMapPress} hitSlop={8}>
      <MapIcon width={24} height={24} />
    </TouchableOpacity>
  );

  // The whole realm is cleared (Zalthar has fallen) — or the catalog hasn't
  // synced yet. Either way, nothing to drain or collect.
  if (!current || !entry) {
    return (
      <View style={styles.container}>
        {mapButton}
        <Text style={styles.caption}>The realm lies quiet</Text>
      </View>
    );
  }

  // ---- Boss stage: a healthbar that drains with focus ----
  if (entry.stage === "boss" && current.boss) {
    const maxHp = current.boss.maxHp;
    const liveDamage = isRunning ? Math.floor(elapsedMs / 60_000) : 0;
    const hp = Math.max(0, (entry.bossHpRemaining ?? maxHp) - liveDamage);
    const pct = maxHp > 0 ? (hp / maxHp) * 100 : 0;

    return (
      <View style={styles.container}>
        {mapButton}
        <Text style={styles.caption}>{current.boss.bossName.toUpperCase()}</Text>
        <View style={styles.barTrack}>
          <View style={[styles.bossFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.value}>
          {hp} / {maxHp} HP
        </Text>
      </View>
    );
  }

  // ---- Gate stage: a countdown to the next fragment ----
  const required = current.fragments_required;
  const liveMs = entry.fragmentProgressMs + (isRunning ? elapsedMs : 0);
  const collected = Math.min(
    required,
    entry.fragmentsCollected + Math.floor(liveMs / FRAGMENT_INTERVAL_MS),
  );
  const ready = collected >= required;
  const remaining = ready ? 0 : FRAGMENT_INTERVAL_MS - (liveMs % FRAGMENT_INTERVAL_MS);

  return (
    <View style={styles.container}>
      {mapButton}
      {ready ? (
        <>
          <Text style={styles.caption}>{current.gate_label.toUpperCase()}</Text>
          <Text style={styles.value}>Gate ready</Text>
          <Text style={styles.hint}>Break it on the map →</Text>
        </>
      ) : (
        <>
          <Text style={styles.caption}>
            UNTIL NEXT {current.fragment_name.toUpperCase()}
          </Text>
          <Text style={styles.value}>{formatCountdown(remaining)}</Text>
        </>
      )}
      <View style={styles.pips}>
        {Array.from({ length: required }).map((_, i) => (
          <View
            key={i}
            style={[styles.pip, i < collected && styles.pipFilled]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
  },
  iconButton: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 100,
    marginBottom: 6,
  },
  caption: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    letterSpacing: 1,
    fontFamily: "OpenSans",
  },
  value: {
    fontSize: 32,
    fontFamily: "InstrumentSerif-Regular",
    color: "white",
  },
  hint: {
    color: "#39A5C9",
    fontSize: 12,
    fontFamily: "OpenSans",
  },
  barTrack: {
    width: 220,
    height: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 5,
    overflow: "hidden",
  },
  bossFill: {
    height: "100%",
    backgroundColor: "#C34DB0",
    borderRadius: 5,
  },
  pips: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "center",
    maxWidth: 260,
  },
  pip: {
    width: 14,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  pipFilled: {
    backgroundColor: "#39A5C9",
  },
});
