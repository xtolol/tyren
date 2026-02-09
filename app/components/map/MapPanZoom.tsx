import React, { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDecay,
} from "react-native-reanimated";

const MAP_WIDTH = 687;
const MAP_HEIGHT = 1024;

const MAX_SCALE = 3;

interface MapPanZoomProps {
  children: React.ReactNode;
  isOpen: boolean;
}

function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.min(Math.max(value, min), max);
}

function getTranslateBounds(viewportWidth: number, viewportHeight: number, currentScale: number) {
  "worklet";
  const scaledWidth = MAP_WIDTH * currentScale;
  const scaledHeight = MAP_HEIGHT * currentScale;

  return {
    minX: Math.min(0, viewportWidth - scaledWidth),
    maxX: 0,
    minY: Math.min(0, viewportHeight - scaledHeight),
    maxY: 0,
  };
}

export default function MapPanZoom({ children, isOpen }: MapPanZoomProps) {
  const [viewport, setViewport] = useState(() => ({
    width: 0,
    height: 0,
  }));

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);

  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const savedScale = useSharedValue(1);

  const minScale = useMemo(() => {
    if (viewport.width <= 0 || viewport.height <= 0) {
      return 1;
    }

    // Prevent zooming out far enough to reveal blank space around the map.
    return Math.min(
      MAX_SCALE,
      Math.max(viewport.width / MAP_WIDTH, viewport.height / MAP_HEIGHT)
    );
  }, [viewport.height, viewport.width]);
  const isViewportReady = viewport.width > 0 && viewport.height > 0;

  const handleViewportLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setViewport({ width, height });
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !isViewportReady) {
      return;
    }

    scale.value = minScale;
    translateX.value = 0;
    translateY.value = 0;
    savedScale.value = minScale;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [
    isViewportReady,
    isOpen,
    minScale,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    scale,
    translateX,
    translateY,
  ]);

  useEffect(() => {
    if (!isViewportReady) {
      return;
    }

    const clampedScale = clamp(scale.value, minScale, MAX_SCALE);
    const bounds = getTranslateBounds(viewport.width, viewport.height, clampedScale);

    scale.value = clampedScale;
    translateX.value = clamp(translateX.value, bounds.minX, bounds.maxX);
    translateY.value = clamp(translateY.value, bounds.minY, bounds.maxY);
  }, [
    isViewportReady,
    minScale,
    scale,
    translateX,
    translateY,
    viewport.height,
    viewport.width,
  ]);

  const pan = Gesture.Pan()
    .onStart(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((event) => {
      const bounds = getTranslateBounds(viewport.width, viewport.height, scale.value);

      translateX.value = clamp(
        savedTranslateX.value + event.translationX,
        bounds.minX,
        bounds.maxX
      );
      translateY.value = clamp(
        savedTranslateY.value + event.translationY,
        bounds.minY,
        bounds.maxY
      );
    })
    .onEnd((event) => {
      const bounds = getTranslateBounds(viewport.width, viewport.height, scale.value);

      translateX.value = withDecay({
        velocity: event.velocityX,
        clamp: [bounds.minX, bounds.maxX],
      });
      translateY.value = withDecay({
        velocity: event.velocityY,
        clamp: [bounds.minY, bounds.maxY],
      });
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((event) => {
      scale.value = clamp(
        savedScale.value * event.scale,
        minScale,
        MAX_SCALE
      );

      const bounds = getTranslateBounds(viewport.width, viewport.height, scale.value);
      translateX.value = clamp(translateX.value, bounds.minX, bounds.maxX);
      translateY.value = clamp(translateY.value, bounds.minY, bounds.maxY);
    })
    .onEnd(() => {
      const bounds = getTranslateBounds(viewport.width, viewport.height, scale.value);

      translateX.value = clamp(
        translateX.value,
        bounds.minX,
        bounds.maxX
      );
      translateY.value = clamp(
        translateY.value,
        bounds.minY,
        bounds.maxY
      );
    });

  const composed = Gesture.Simultaneous(pan, pinch);

  const animatedStyle = useAnimatedStyle(() => ({
    width: MAP_WIDTH * scale.value,
    height: MAP_HEIGHT * scale.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <View style={styles.viewport} onLayout={handleViewportLayout}>
      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.mapContainer, animatedStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    overflow: "hidden",
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  mapContainer: {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    backgroundColor: "#050a0d",
  },
});
