import DustIcon from "@/assets/images/dust-16px.svg";
import ShardIcon from "@/assets/images/shard-16px.svg";
import type { SessionRewards } from "@/src/core/rewards/types";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface SessionSummaryPopupProps {
  visible: boolean;
  elapsedMs: number;
  rewards: SessionRewards;
  onContinue: () => void;
}

function formatSessionTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export default function SessionSummaryPopup({
  visible,
  elapsedMs,
  rewards,
  onContinue,
}: SessionSummaryPopupProps) {
  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onContinue}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Session Complete</Text>
          <Text style={styles.time}>{formatSessionTime(elapsedMs)}</Text>

          <View style={styles.divider} />

          <View style={styles.rewards}>
            <View style={styles.rewardRow}>
              <DustIcon width={16} height={16} />
              <Text style={styles.rewardLabel}>Time Dust</Text>
              <Text style={[styles.rewardValue, styles.dustColor]}>
                +{rewards.dust}
              </Text>
            </View>
            <View style={styles.rewardRow}>
              <ShardIcon width={16} height={16} />
              <Text style={styles.rewardLabel}>Time Shards</Text>
              <Text style={[styles.rewardValue, styles.shardColor]}>
                +{rewards.shards}
              </Text>
            </View>
            <View style={styles.rewardRow}>
              <Text style={styles.rewardLabel}>XP</Text>
              <Text style={styles.rewardValue}>+{rewards.xp}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.button}
            onPress={onContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Collect</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    backgroundColor: "#0A1A1F",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
  },
  title: {
    fontSize: 14,
    fontFamily: "OpenSans",
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  time: {
    fontSize: 48,
    fontFamily: "InstrumentSerif-Regular",
    color: "white",
    marginBottom: 24,
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: 24,
  },
  rewards: {
    width: "100%",
    gap: 16,
    marginBottom: 28,
  },
  rewardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rewardLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: "OpenSans",
    color: "rgba(255,255,255,0.75)",
  },
  rewardValue: {
    fontSize: 16,
    fontFamily: "OpenSans",
    color: "white",
  },
  dustColor: {
    color: "#FBC647",
  },
  shardColor: {
    color: "#C34DB0",
  },
  button: {
    backgroundColor: "#071820",
    borderRadius: 32,
    paddingVertical: 14,
    width: "100%",
    alignItems: "center",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontFamily: "OpenSans",
  },
});
