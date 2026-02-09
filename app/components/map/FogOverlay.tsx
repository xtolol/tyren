import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useMapStore } from "@/src/stores/useMapStore";

const FOG_REGIONS = [
  { id: "zalreth", top: "0%", left: "0%", width: "100%", height: "100%" },
] as const;

export default function FogOverlay() {
  const revealedRegionIds = useMapStore((s) => s.revealedRegionIds);

  return (
    <>
      {FOG_REGIONS.map((region) => {
        const isRevealed = revealedRegionIds.includes(region.id);
        return (
          <FogRegion
            key={region.id}
            isRevealed={isRevealed}
            top={region.top}
            left={region.left}
            width={region.width}
            height={region.height}
          />
        );
      })}
    </>
  );
}

interface FogRegionProps {
  isRevealed: boolean;
  top: string;
  left: string;
  width: string;
  height: string;
}

function FogRegion({ isRevealed, top, left, width, height }: FogRegionProps) {
  const opacity = useSharedValue(isRevealed ? 0 : 1);

  useEffect(() => {
    if (isRevealed) {
      opacity.value = withTiming(0, { duration: 1500 });
    }
  }, [isRevealed, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.fog,
        {
          top: top as any,
          left: left as any,
          width: width as any,
          height: height as any,
        },
        animatedStyle,
      ]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  fog: {
    position: "absolute",
    backgroundColor: "rgba(0, 0, 0, 0.85)",
  },
});
