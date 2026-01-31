import InventoryIcon from "@/assets/images/inventory-32px.svg";
import ShareIcon from "@/assets/images/share-24px.svg";
import ShopIcon from "@/assets/images/shop-32px.svg";
import { useFocusTimer } from "@/src/hooks/useFocusTimer";
import { useFonts } from "expo-font";
import { VideoView, useVideoPlayer } from "expo-video";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import InventoryBottomSheet, {
  InventoryBottomSheetRef,
} from "./InventoryBottomSheet";
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
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const inventorySheetRef = useRef<InventoryBottomSheetRef>(null);
  const [fontsLoaded] = useFonts({
    "InstrumentSerif-Regular": require("@/assets/images/fonts/InstrumentSerif-Regular.ttf"),
  });

  function handleInventoryPress() {
    setIsInventoryOpen(true);
  }

  function handleInventoryClose() {
    setIsInventoryOpen(false);
  }

  const player = useVideoPlayer(
    require("@/assets/images/videos/1.mp4"),
    (player) => {
      player.loop = true;
      player.muted = true;
    }
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
      <ProgressBar percentage={displayedProgress} />
      <View style={styles.bottomContainer}>
        <View style={styles.levelContainer}>
          <View style={styles.shareContainer}>
            <Text style={styles.levelTitle}>Zalthar's Chains</Text>
            <ShareIcon width={24} height={24} />
          </View>
          <Text style={styles.levelnumber}>LVL 1</Text>
        </View>
        <View style={styles.botbuttonsContainer}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => console.log("Shop pressed")}
          >
            <ShopIcon width={32} height={32} />
          </TouchableOpacity>

          {/* Focus Time Button with Radial Gradient */}
          <TouchableOpacity
            style={styles.textButton}
            onPress={handleToggle}
            activeOpacity={0.8}
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
                    <Stop offset="0%" stopColor="#004156" />
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
              <Text style={styles.buttonText}>
                {isRunning ? "Stop" : "Focus Time"}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => handleInventoryPress()}
          >
            <InventoryIcon width={32} height={32} />
          </TouchableOpacity>
        </View>
      </View>
      <InventoryBottomSheet
        ref={inventorySheetRef}
        isOpen={isInventoryOpen}
        onClose={handleInventoryClose}
      />
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
});
