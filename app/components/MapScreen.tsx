import type { MapLocation } from "@/src/lib/api";
import { api } from "@/src/lib/api";
import { deriveLocationState, useMapStore } from "@/src/stores/useMapStore";
import { useRelicStore } from "@/src/stores/useRelicStore";
import { fonts, palette, sealColors } from "@/src/theme";
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
          <Ionicons name="albums-outline" size={22} color={palette.goldDim} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {locations.map((location, index) => {
          const state = deriveLocationState(location, locations, progress);
          const entry = progress[location.id];
          const boss = location.boss;
          const bossActive = state === "current" && entry?.stage === "boss" && !!boss;
          const relic = relics[location.id];

          return (
            <View key={location.id}>
              <View
                style={[
                  styles.card,
                  state === "current" && (bossActive ? styles.cardBoss : styles.cardActive),
                  state === "locked" && styles.cardLocked,
                ]}
              >
                <View style={styles.cardRow}>
                  <View style={styles.crestWrap}>
                    <Crest
                      size={44}
                      progress={null}
                      color={
                        state === "completed" && relic
                          ? sealColors[relic.seal]
                          : state === "current"
                            ? (bossActive ? palette.ember : palette.gold)
                            : "rgba(244,234,218,0.25)"
                      }
                      dimColor="transparent"
                      glyphIndex={location.sort_order}
                      hostile={bossActive}
                    />
                  </View>
                  <View style={styles.cardCenter}>
                    <Text style={styles.levelCaption}>LEVEL {location.sort_order + 1}</Text>
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
                        collected={entry?.fragmentsCollected ?? 0}
                        breaking={breaking}
                        onBreak={breakGate}
                      />
                    ) : state === "completed" ? (
                      <Text style={[styles.subLabel, relic && { color: sealColors[relic.seal] }]}>
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
                      <Ionicons name="checkmark-circle" size={22} color={palette.gold} />
                    ) : state === "current" ? (
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={bossActive ? palette.ember : palette.gold}
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

              {index < locations.length - 1 && <DashedConnector />}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function GateBody({
  location,
  collected,
  breaking,
  onBreak,
}: {
  location: MapLocation;
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
          style={[styles.fragmentFill, { width: `${(collected / required) * 100}%` }]}
        />
      </View>
      <Text style={styles.subLabel}>
        {collected}/{required} {location.fragment_name}
        {required === 1 ? "" : "s"}
      </Text>
      {ready ? (
        <TouchableOpacity
          style={styles.advanceButton}
          onPress={onBreak}
          disabled={breaking}
          activeOpacity={0.8}
        >
          <Text style={styles.advanceButtonText}>{location.gate_label}</Text>
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
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  cardActive: {
    borderColor: palette.gold,
    borderWidth: 1.5,
    backgroundColor: "#20150A",
  },
  cardBoss: {
    borderColor: palette.emberBorder,
    borderWidth: 1.5,
    backgroundColor: palette.emberCard,
  },
  cardLocked: {
    opacity: 0.6,
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
    color: palette.goldDim,
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
    backgroundColor: palette.gold,
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
    backgroundColor: "#2A1B06",
    borderColor: palette.gold,
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  advanceButtonText: {
    color: palette.goldBright,
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
    backgroundColor: palette.goldDim,
  },
});
