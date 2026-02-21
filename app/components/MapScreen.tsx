import { usePlayerStore } from "@/src/stores/usePlayerStore";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("screen");

const LEVELS = [
  { id: 1, name: "ZALTHAR'S CHAINS" },
  { id: 2, name: "YAWNING DEPTHS" },
  { id: 3, name: "WITHERED PLAINS" },
];

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
      <Rect
        x="0"
        y="0"
        width={SCREEN_WIDTH}
        height={SCREEN_HEIGHT}
        fill="url(#bg)"
      />
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
  const { level, progressPercent } = usePlayerStore();

  return (
    <View style={styles.container}>
      <Background />

      {/* Header */}
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
        {LEVELS.map((lvl, index) => {
          const isUnlocked = lvl.id <= level;
          const isActive = lvl.id === level;
          const progress = isActive ? progressPercent : isUnlocked ? 100 : 0;

          return (
            <View key={lvl.id}>
              <TouchableOpacity
                style={[
                  styles.card,
                  isActive && styles.cardActive,
                  !isUnlocked && styles.cardLocked,
                ]}
                disabled={!isUnlocked}
                activeOpacity={0.8}
              >
                {/* Centered text + progress, icon to the right */}
                <View style={styles.cardRow}>
                  <View style={styles.iconWrapper} />
                  <View style={styles.cardCenter}>
                    <Text style={styles.levelLabel}>LEVEL {lvl.id}:</Text>
                    <Text style={styles.levelName}>{lvl.name}</Text>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${progress}%` },
                          !isUnlocked && styles.progressFillLocked,
                        ]}
                      />
                    </View>
                  </View>
                  <View style={styles.iconWrapper}>
                    {isUnlocked ? (
                      <Ionicons name="chevron-forward" size={24} color="#fff" />
                    ) : (
                      <Ionicons
                        name="lock-closed-outline"
                        size={24}
                        color="rgba(255,255,255,0.35)"
                      />
                    )}
                  </View>
                </View>
              </TouchableOpacity>

              {index < LEVELS.length - 1 && <DashedConnector />}
            </View>
          );
        })}
      </ScrollView>
    </View>
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 20,
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
  levelLabel: {
    fontSize: 12,
    fontFamily: "OpenSans",
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 1,
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
  progressFill: {
    height: "100%",
    backgroundColor: "#39A5C9",
    borderRadius: 2,
  },
  progressFillLocked: {
    backgroundColor: "rgba(57,165,201,0.35)",
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
