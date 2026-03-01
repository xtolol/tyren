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

  if (hours > 0) return `${hours}hr ${minutes}m`;
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
    <Modal transparent animationType="fade" visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.title}>Session Summary</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.sessionTime}>
            Session Time: {formatSessionTime(elapsedMs)}
          </Text>
          <View style={styles.rewardsRow}>
            <Text style={styles.rewardAmount}>{rewards.dust}</Text>
            <DustIcon width={16} height={16} />
            {rewards.shards > 0 && (
              <>
                <Text style={styles.rewardAmount}>{rewards.shards}</Text>
                <ShardIcon width={16} height={16} />
              </>
            )}
          </View>
          <TouchableOpacity
            style={styles.continueButton}
            onPress={onContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.continueText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    paddingHorizontal: 10,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#004156",
    width: 300,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  card: {
    backgroundColor: "#00222D",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    width: 300,
    alignItems: "center",
    gap: 10,
  },
  title: {
    color: "white",
    fontSize: 22,
    fontFamily: "InstrumentSerif-Regular",
    textAlign: "center",
  },
  sessionTime: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 14,
    fontFamily: "OpenSans",
  },
  rewardsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  rewardAmount: {
    color: "white",
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "OpenSans",
  },
  continueButton: {
    backgroundColor: "#071820",
    borderRadius: 32,
    paddingVertical: 14,
    width: "100%",
    alignItems: "center",
    marginTop: 4,
  },
  continueText: {
    color: "white",
    fontSize: 16,
    fontFamily: "OpenSans",
  },
});
