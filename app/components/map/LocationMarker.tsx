import React from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import type { LocationStatus, MapLocation } from "@/src/core/map/types";

interface LocationMarkerProps {
  location: MapLocation;
  status: LocationStatus;
  onPress: (location: MapLocation) => void;
}

const MAP_WIDTH = 687;
const MAP_HEIGHT = 1024;

export default function LocationMarker({
  location,
  status,
  onPress,
}: LocationMarkerProps) {
  const pulseOpacity = useSharedValue(0.4);
  const pulseScale = useSharedValue(1);

  React.useEffect(() => {
    if (status === "current") {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.8, { duration: 1000 }),
          withTiming(0.4, { duration: 1000 })
        ),
        -1,
        false
      );
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.4, { duration: 1000 }),
          withTiming(1, { duration: 1000 })
        ),
        -1,
        false
      );
    }
  }, [status, pulseOpacity, pulseScale]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
    transform: [{ scale: pulseScale.value }],
  }));

  const markerColor =
    status === "current"
      ? "#39A5C9"
      : status === "completed"
        ? "#4CAF50"
        : "#C7E3ED";

  const left = location.positionX * MAP_WIDTH - 20;
  const top = location.positionY * MAP_HEIGHT - 20;

  return (
    <TouchableOpacity
      style={[styles.container, { left, top }]}
      onPress={() => onPress(location)}
      activeOpacity={0.7}
    >
      {status === "current" && (
        <Animated.View
          style={[
            styles.glow,
            { backgroundColor: "#39A5C9" },
            glowStyle,
          ]}
        />
      )}
      <Animated.View
        style={[styles.dot, { backgroundColor: markerColor }]}
      />
      <Text style={styles.label}>{location.name}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    alignItems: "center",
    width: 120,
    marginLeft: -40,
  },
  glow: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    top: 0,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    marginTop: 12,
  },
  label: {
    marginTop: 6,
    fontSize: 12,
    color: "#FFFFFF",
    fontFamily: "OpenSans",
    textAlign: "center",
    textShadowColor: "#000000",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
