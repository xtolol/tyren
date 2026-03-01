import DustIcon from "@/assets/images/dust-16px.svg";
import InventoryIcon from "@/assets/images/inventory-32px.svg";
import ShardIcon from "@/assets/images/shard-16px.svg";
import ShareIcon from "@/assets/images/share-24px.svg";
import ShopIcon from "@/assets/images/shop-32px.svg";
import type { SessionRewards } from "@/src/core/rewards/types";
import { useFocusTimer } from "@/src/hooks/useFocusTimer";
import { usePlayerStore } from "@/src/stores/usePlayerStore";
import { useFonts } from "expo-font";
import { VideoView, useVideoPlayer } from "expo-video";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import InventoryBottomSheet, {
  InventoryBottomSheetRef,
} from "./InventoryBottomSheet";
import ShopBottomSheet, { ShopBottomSheetRef } from "./ShopBottomSheet";
import SessionSummaryPopup from "./SessionSummaryPopup";
import { useRouter } from "expo-router";
import NavBar from "./NavBar";
import ProgressBar from "./ProgressBar";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("screen");

// Radial Gradient Component
function RadialGradientButton() {
  return (
    <Svg
      width="100%"
      height="100%"
      style={{ position: "absolute", top: 0, left: 0 }}
    >
      <Defs>
        <RadialGradient id="radial" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <Stop offset="0%" stopColor="#004156" />
          <Stop offset="100%" stopColor="#00222D" />
        </RadialGradient>
      </Defs>
      <Rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        rx="100"
        ry="100"
        fill="url(#radial)"
      />
    </Svg>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const inventorySheetRef = useRef<InventoryBottomSheetRef>(null);
  const shopSheetRef = useRef<ShopBottomSheetRef>(null);
  const [fontsLoaded] = useFonts({
    "InstrumentSerif-Regular": require("@/assets/images/fonts/InstrumentSerif-Regular.ttf"),
  });

  function handleInventoryPress() {
    setIsInventoryOpen(true);
  }
  function handleShopPress() {
    setIsShopOpen(true);
  }

  function handleInventoryClose() {
    setIsInventoryOpen(false);
  }
  function handleShopClose() {
    setIsShopOpen(false);
  }

  const { isRunning, loading, error: timerError, progress, elapsedMs, stop, startFreeform } = useFocusTimer();
  const { progressPercent, addProgressPercent } = usePlayerStore();

  type SessionResult = { elapsedMs: number; dust: number; shards: number; xp: number };
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);

  const handleToggle = async () => {
    if (isRunning) {
      const snapshotMs = elapsedMs;
      const finalProgress = Math.round(progress);
      const rewards = await stop();
      addProgressPercent(finalProgress);
      if (rewards) {
        setSessionResult({ elapsedMs: snapshotMs, ...rewards });
      }
    } else {
      startFreeform();
    }
  };

  function formatElapsed(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  const player = useVideoPlayer(
    require("@/assets/images/videos/1.mp4"),
    (player) => {
      player.loop = true;
      player.muted = true;
    },
  );

  useEffect(() => {
    player.play();
    return () => {
      try {
        if (player) {
          player.pause();
        }
      } catch (error) {
        // Player may have already been cleaned up
      }
    };
  }, [player]);

  return (
    <View style={styles.container}>
      <VideoView
        style={styles.backgroundVideo}
        player={player}
        contentFit="cover"
        nativeControls={false}
      />
      <NavBar />
      <ProgressBar percentage={progressPercent} onMapPress={() => router.push('/map' as never)} />
      <View style={styles.bottomContainer}>
        <View style={styles.levelContainer}>
          <View style={styles.shareContainer}>
            <Text style={styles.levelTitle}>Zalthar&apos;s Chains</Text>
            <ShareIcon width={24} height={24} />
          </View>
          <Text style={styles.levelnumber}>LVL 1</Text>
        </View>
        <View style={styles.botbuttonsContainer}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => handleShopPress()}
          >
            <ShopIcon width={32} height={32} />
          </TouchableOpacity>

          {/* Focus Time Button with Radial Gradient */}
          <TouchableOpacity
            style={[styles.textButton, loading && styles.textButtonDisabled]}
            onPress={handleToggle}
            activeOpacity={0.8}
            disabled={loading}
          >
            <View style={styles.gradientContainer}>
              <Svg
                width="100%"
                height="100%"
                viewBox="0 0 200 64"
                style={{ position: "absolute" }}
              >
                <Defs>
                  <RadialGradient
                    id="radial"
                    cx="50%"
                    cy="5%"
                    r="50%"
                    fx="50%"
                    fy="0%"
                    gradientTransform="scale(1, 1.6)"
                  >
                    <Stop offset="0%" stopColor={loading ? "#002030" : "#004156"} />
                    <Stop offset="100%" stopColor="#00222D" />
                  </RadialGradient>
                </Defs>
                <Rect
                  x="0"
                  y="0"
                  width="200"
                  height="64"
                  rx="32"
                  ry="32"
                  fill="url(#radial)"
                />
              </Svg>
              {loading ? (
                <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
              ) : (
                <Text style={styles.buttonText}>
                  {isRunning ? "Stop" : "Focus Time"}
                </Text>
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => handleInventoryPress()}
          >
            <InventoryIcon width={32} height={32} />
          </TouchableOpacity>
        </View>
        {timerError ? (
          <Text style={styles.timerError}>{timerError}</Text>
        ) : null}
      </View>
      <InventoryBottomSheet
        ref={inventorySheetRef}
        isOpen={isInventoryOpen}
        onClose={handleInventoryClose}
      />
      <ShopBottomSheet
        ref={shopSheetRef}
        isOpen={isShopOpen}
        onClose={handleShopClose}
      />

      <Modal
        visible={sessionResult !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSessionResult(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Session Complete</Text>
            <Text style={styles.modalTime}>{sessionResult ? formatElapsed(sessionResult.elapsedMs) : ""}</Text>

            <View style={styles.modalDivider} />

            <View style={styles.modalRewards}>
              <View style={styles.modalRewardRow}>
                <DustIcon width={16} height={16} />
                <Text style={styles.modalRewardLabel}>Time Dust</Text>
                <Text style={[styles.modalRewardValue, styles.dustColor]}>
                  +{sessionResult?.dust ?? 0}
                </Text>
              </View>
              <View style={styles.modalRewardRow}>
                <ShardIcon width={16} height={16} />
                <Text style={styles.modalRewardLabel}>Time Shards</Text>
                <Text style={[styles.modalRewardValue, styles.shardColor]}>
                  +{sessionResult?.shards ?? 0}
                </Text>
              </View>
              <View style={styles.modalRewardRow}>
                <Text style={styles.modalRewardLabel}>XP</Text>
                <Text style={styles.modalRewardValue}>
                  +{sessionResult?.xp ?? 0}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setSessionResult(null)}
            >
              <Text style={styles.modalButtonText}>Collect</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: "black",
    gap: 24,
  },
  backgroundVideo: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  bottomContainer: {
    gap: 24,
    paddingHorizontal: 16,
    paddingBottom: 24,
    flex: 1,
    flexDirection: "column",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  levelContainer: {
    width: "100%",
    alignItems: "center",
    flexDirection: "column",
    justifyContent: "center",
  },
  shareContainer: {
    width: "100%",
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  levelTitle: {
    fontSize: 40,
    fontWeight: "regular",
    fontFamily: "InstrumentSerif-Regular",
    color: "white",
  },
  levelnumber: {
    fontSize: 16,
    fontWeight: "regular",
    fontFamily: "OpenSans",
    color: "white",
  },
  timerError: {
    fontSize: 12,
    fontFamily: 'OpenSans',
    color: '#FF6B6B',
    textAlign: 'center',
    marginTop: -16,
  },
  botbuttonsContainer: {
    width: "100%",
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    height: 64,
  },
  iconButton: {
    height: 64,
    width: 64,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 100,
  },
  textButton: {
    height: 64,
    width: 200,
    borderRadius: 32,
  },
  textButtonDisabled: {
    opacity: 0.6,
  },
  gradientContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    color: "white",
    fontSize: 20,
    fontWeight: "regular",
    fontFamily: "OpenSans",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#0A1A1F",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 14,
    fontFamily: "OpenSans",
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  modalTime: {
    fontSize: 48,
    fontFamily: "InstrumentSerif-Regular",
    color: "white",
    marginBottom: 24,
  },
  modalDivider: {
    width: "100%",
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: 24,
  },
  modalRewards: {
    width: "100%",
    gap: 16,
    marginBottom: 28,
  },
  modalRewardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalRewardLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: "OpenSans",
    color: "rgba(255,255,255,0.6)",
  },
  modalRewardValue: {
    fontSize: 14,
    fontFamily: "OpenSans",
    color: "white",
  },
  dustColor: {
    color: "#FBC647",
  },
  shardColor: {
    color: "#C34DB0",
  },
  modalButton: {
    width: "100%",
    paddingVertical: 16,
    backgroundColor: "#1A1A1A",
    borderRadius: 100,
    alignItems: "center",
  },
  modalButtonText: {
    fontSize: 16,
    fontFamily: "OpenSans",
    color: "white",
  },
});
