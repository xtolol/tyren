import type { MapLocation } from "@/src/lib/api";
import { api } from "@/src/lib/api";
import { deriveLocationState, useMapStore } from "@/src/stores/useMapStore";
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("screen");

function Background() {
  return (
    <Svg
      width={SCREEN_WIDTH}
      height={SCREEN_HEIGHT}
      style={StyleSheet.absoluteFillObject}
    >
      <Defs>
        <RadialGradient id="bg" cx="70%" cy="80%" r="80%" fx="10%" fy="15%">
          <Stop offset="0%" stopColor="#4C0093" />
          <Stop offset="100%" stopColor="#17002D" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={SCREEN_WIDTH} height={SCREEN_HEIGHT} fill="url(#bg)" />
    </Svg>
  );
}

function DashedConnector() {
  return (
    <View style={styles.connector}>
      {Array.from({ length: 5 }).map((_, i) => (
        <View key={i} style={styles.dash} />
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
      <Background />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={28} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Game Map</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {locations.map((location, index) => {
          const state = deriveLocationState(location, locations, progress);
          const entry = progress[location.id];
          const boss = location.boss;

          return (
            <View key={location.id}>
              <View
                style={[
                  styles.card,
                  state === "current" && styles.cardActive,
                  state === "locked" && styles.cardLocked,
                ]}
              >
                <View style={styles.cardRow}>
                  <View style={styles.iconWrapper} />
                  <View style={styles.cardCenter}>
                    <Text style={styles.levelName}>
                      {location.name.toUpperCase()}
                    </Text>

                    {state === "current" && entry?.stage === "boss" && boss ? (
                      <>
                        <View style={styles.progressTrack}>
                          <View
                            style={[
                              styles.bossFill,
                              {
                                width: `${
                                  ((entry.bossHpRemaining ?? boss.maxHp) /
                                    boss.maxHp) *
                                  100
                                }%`,
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.subLabel}>
                          {boss.bossName} — {entry.bossHpRemaining ?? boss.maxHp}/
                          {boss.maxHp} HP
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
                      <Text style={styles.subLabel}>Cleared</Text>
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
                      <Ionicons name="checkmark-circle" size={24} color="#39A5C9" />
                    ) : state === "current" ? (
                      <Ionicons name="navigate" size={22} color="#39A5C9" />
                    ) : (
                      <Ionicons
                        name="lock-closed-outline"
                        size={24}
                        color="rgba(255,255,255,0.35)"
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
    backgroundColor: "#07030F",
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
    fontFamily: "InstrumentSerif-Regular",
    color: "white",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 48,
  },
  card: {
    backgroundColor: "#071E2E",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 20,
  },
  cardActive: {
    borderColor: "#39A5C9",
    borderWidth: 1.5,
    backgroundColor: "#082535",
  },
  cardLocked: {
    opacity: 0.75,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardCenter: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  levelName: {
    fontSize: 18,
    fontFamily: "OpenSans",
    color: "white",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  progressTrack: {
    width: "75%",
    height: 11,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 5,
    overflow: "hidden",
  },
  fragmentFill: {
    height: "100%",
    backgroundColor: "#39A5C9",
    borderRadius: 5,
  },
  bossFill: {
    height: "100%",
    backgroundColor: "#C34DB0",
    borderRadius: 5,
  },
  subLabel: {
    fontSize: 12,
    fontFamily: "OpenSans",
    color: "rgba(255,255,255,0.55)",
  },
  hintLabel: {
    fontSize: 12,
    fontFamily: "OpenSans",
    color: "rgba(255,255,255,0.4)",
  },
  advanceButton: {
    marginTop: 4,
    backgroundColor: "#0E3A4D",
    borderColor: "#39A5C9",
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  advanceButtonText: {
    color: "white",
    fontSize: 14,
    fontFamily: "OpenSans",
  },
  iconWrapper: {
    width: 28,
    alignItems: "flex-end",
  },
  connector: {
    alignItems: "center",
    paddingVertical: 4,
    gap: 5,
  },
  dash: {
    width: 1.5,
    height: 8,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 1,
  },
});
