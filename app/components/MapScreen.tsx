import type { MapLocation } from "@/src/lib/api";
import { api } from "@/src/lib/api";
import { deriveLocationState, useMapStore } from "@/src/stores/useMapStore";
import { useRelicStore } from "@/src/stores/useRelicStore";
import type { LevelAccent } from "@/src/theme";
import { fonts, levelAccent, palette } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Crest from "./sigil/Crest";

// The Game Map (design row 3, gold): the location ladder as relic cards
// chained by dotted connectors. The current card carries the live gate or
// boss progress and the one manual action — breaking a ready gate.

function DashedConnector() {
  return (
    <View style={styles.connector}>
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={styles.connectorDot} />
      ))}
    </View>
  );
}

export default function MapScreen() {
  const router = useRouter();
  const locations = useMapStore((s) => s.locations);
  const progress = useMapStore((s) => s.progress);
  const loadLocations = useMapStore((s) => s.loadLocations);
  const applyBreakGate = useMapStore((s) => s.applyBreakGate);
  const relics = useRelicStore((s) => s.relics);
  const [breaking, setBreaking] = useState(false);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  // The map shows the road travelled, where you stand, and only the next
  // two levels — the rest stays in the fog. Once everything is cleared the
  // whole ladder is revealed.
  const currentSort =
    locations.find((l) => progress[l.id]?.status === "current")?.sort_order ??
    (locations.some((l) => progress[l.id]?.status === "completed")
      ? Number.MAX_SAFE_INTEGER
      : 0);
  const visible = locations.filter((l) => l.sort_order <= currentSort + 2);

  const breakGate = async () => {
    setBreaking(true);
    try {
      const result = await api.map.breakGate(Crypto.randomUUID());
      applyBreakGate(result);
      Alert.alert(
        "Gate broken",
        `${result.boss_name} awakens. Every focused minute strikes it now.`,
      );
    } catch (err) {
      Alert.alert("Cannot break the gate", (err as Error).message);
    } finally {
      setBreaking(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={28} color={palette.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Game Map</Text>
        <TouchableOpacity onPress={() => router.push('/codex' as never)} hitSlop={8}>
          <Ionicons name="albums-outline" size={22} color={palette.textDim} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {visible.map((location, index) => {
          const state = deriveLocationState(location, locations, progress);
          const entry = progress[location.id];
          const boss = location.boss;
          const bossActive = state === "current" && entry?.stage === "boss" && !!boss;
          const relic = relics[location.id];
          const level = levelAccent(location.sort_order);
          // The two levels past the current one fade toward the fog.
          const ahead = location.sort_order - currentSort;
          const fade = ahead <= 0 ? 1 : ahead === 1 ? 0.55 : 0.3;

          return (
            <View key={location.id} style={{ opacity: fade }}>
              <View
                style={[
                  styles.card,
                  { backgroundColor: level.card, borderColor: level.border },
                  state === "current" &&
                    (bossActive
                      ? styles.cardBoss
                      : [styles.cardActive, { borderColor: level.accent, backgroundColor: level.glow }]),
                ]}
              >
                <View style={styles.cardRow}>
                  <View style={styles.crestWrap}>
                    <Crest
                      size={44}
                      color={bossActive ? palette.ember : level.accent}
                      dimColor="transparent"
                      glyphIndex={location.sort_order}
                      hostile={bossActive}
                    />
                  </View>
                  <View style={styles.cardCenter}>
                    <Text style={[styles.levelCaption, { color: level.dim }]}>
                      LEVEL {location.sort_order + 1}
                    </Text>
                    <Text
                      style={[
                        styles.levelName,
                        state === "locked" && { color: palette.textFaint },
                      ]}
                    >
                      {location.name.toUpperCase()}
                    </Text>

                    {bossActive && boss ? (
                      <>
                        <View style={styles.progressTrack}>
                          <View
                            style={[
                              styles.bossFill,
                              {
                                width: `${((entry?.bossHpRemaining ?? boss.maxHp) / boss.maxHp) * 100}%`,
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.subLabel}>
                          {boss.bossName} — {entry?.bossHpRemaining ?? boss.maxHp}/{boss.maxHp} HP
                        </Text>
                      </>
                    ) : state === "current" ? (
                      <GateBody
                        location={location}
                        level={level}
                        collected={entry?.fragmentsCollected ?? 0}
                        breaking={breaking}
                        onBreak={breakGate}
                      />
                    ) : state === "completed" ? (
                      <Text style={[styles.subLabel, relic && { color: level.accent }]}>
                        {relic
                          ? `Cleared · ${location.relic_name} claimed`
                          : "Cleared"}
                      </Text>
                    ) : state === "next" ? (
                      <Text style={styles.subLabel}>
                        Sealed until you breach the gate before it
                      </Text>
                    ) : (
                      <Text style={styles.subLabel}>
                        Shrouded by Zalthar&apos;s fog
                      </Text>
                    )}
                  </View>
                  <View style={styles.iconWrapper}>
                    {state === "completed" ? (
                      <Ionicons name="checkmark-circle" size={22} color={level.accent} />
                    ) : state === "current" ? (
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={bossActive ? palette.ember : level.accent}
                      />
                    ) : (
                      <Ionicons
                        name="lock-closed-outline"
                        size={20}
                        color={palette.textFaint}
                      />
                    )}
                  </View>
                </View>
              </View>

              {index < visible.length - 1 && <DashedConnector />}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function GateBody({
  location,
  level,
  collected,
  breaking,
  onBreak,
}: {
  location: MapLocation;
  level: LevelAccent;
  collected: number;
  breaking: boolean;
  onBreak: () => void;
}) {
  const required = location.fragments_required;
  const ready = collected >= required;

  return (
    <>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.fragmentFill,
            { width: `${(collected / required) * 100}%`, backgroundColor: level.accent },
          ]}
        />
      </View>
      <Text style={styles.subLabel}>
        {collected}/{required} {location.fragment_name}
        {required === 1 ? "" : "s"}
      </Text>
      {ready ? (
        <TouchableOpacity
          style={[styles.advanceButton, { borderColor: level.accent, backgroundColor: level.buttonBottom }]}
          onPress={onBreak}
          disabled={breaking}
          activeOpacity={0.8}
        >
          <Text style={[styles.advanceButtonText, { color: level.bright }]}>{location.gate_label}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.hintLabel}>Focus to collect fragments</Text>
      )}
    </>
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
    paddingBottom: 16,
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
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 48,
  },
  card: {
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
  },
  cardActive: {
    borderWidth: 1.5,
  },
  cardBoss: {
    borderColor: palette.emberBorder,
    borderWidth: 1.5,
    backgroundColor: palette.emberCard,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  crestWrap: {
    width: 48,
    alignItems: "center",
  },
  cardCenter: {
    flex: 1,
    alignItems: "flex-start",
    gap: 5,
  },
  levelCaption: {
    fontSize: 8,
    fontFamily: fonts.pixel,
    letterSpacing: 2,
  },
  levelName: {
    fontSize: 16,
    fontFamily: fonts.ui,
    color: palette.text,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  progressTrack: {
    width: "90%",
    height: 9,
    backgroundColor: "rgba(244,234,218,0.08)",
    borderRadius: 5,
    overflow: "hidden",
  },
  fragmentFill: {
    height: "100%",
    borderRadius: 5,
  },
  bossFill: {
    height: "100%",
    backgroundColor: palette.ember,
    borderRadius: 5,
  },
  subLabel: {
    fontSize: 12,
    fontFamily: fonts.ui,
    color: palette.textDim,
  },
  hintLabel: {
    fontSize: 12,
    fontFamily: fonts.ui,
    color: palette.textFaint,
  },
  advanceButton: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  advanceButtonText: {
    fontSize: 14,
    fontFamily: fonts.ui,
  },
  iconWrapper: {
    width: 26,
    alignItems: "flex-end",
  },
  connector: {
    alignItems: "center",
    paddingVertical: 6,
    gap: 5,
  },
  connectorDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(244, 234, 218, 0.3)',
  },
});
