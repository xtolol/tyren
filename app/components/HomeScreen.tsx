import InventoryIcon from "@/assets/images/inventory-32px.svg";
import ShareIcon from "@/assets/images/share-24px.svg";
import ShopIcon from "@/assets/images/shop-32px.svg";
import { useFonts } from "expo-font";
import { LinearGradient } from "expo-linear-gradient";
import { VideoView, useVideoPlayer } from "expo-video";
import React, { useEffect } from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import NavBar from "./NavBar";
import ProgressBar from "./ProgressBar";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("screen");

export default function HomeScreen() {
  const [fontsLoaded] = useFonts({
    "InstrumentSerif-Regular": require("@/assets/images/fonts/InstrumentSerif-Regular.ttf"),
  });

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
        // Player may have already been cleaned up by useVideoPlayer hook
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
      <ProgressBar />
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
          <TouchableOpacity
            style={styles.textButton}
            onPress={() => console.log("Focus Time pressed")}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={["#004156", "#00222D"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.gradientContainer}
            >
              <Text style={styles.buttonText}>Focus Time</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => console.log("Inventory pressed")}
          >
            <InventoryIcon width={32} height={32} />
          </TouchableOpacity>
        </View>
      </View>
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
  placeholder: {
    width: "100%",
    paddingHorizontal: 16,
    height: 124,
    backgroundColor: "yellow",
    alignSelf: "center",
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
  levelContainer: {
    width: "100%",
    alignItems: "center",
    flexDirection: "column",
    justifyContent: "center",
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
    justifyContent: "center",
    gap: 16,
  },
  iconButton: {
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch", // Stretch to match parent/sibling height
    backgroundColor: "#1A1A1A",
    borderRadius: 100,
    // Add any additional styling you want (background, border, etc.)
  },
  textButton: {
    flex: 1,
    borderRadius: 100,
    alignSelf: "stretch", // Stretch to match parent/sibling height
    overflow: "hidden", // Important for rounded corners with gradient
  },
  gradientContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    width: "100%",
  },
  buttonText: {
    color: "white",
    fontSize: 20,
    fontWeight: "regular",
    fontFamily: "OpenSans",
  },
});

