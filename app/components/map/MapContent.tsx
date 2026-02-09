import React from "react";
import { StyleSheet, View } from "react-native";
import MapBackground from "@/assets/images/map.svg";
import type { MapLocation } from "@/src/core/map/types";
import MapPanZoom from "./MapPanZoom";
import LocationMarkers from "./LocationMarkers";
import FogOverlay from "./FogOverlay";

interface MapContentProps {
  isOpen: boolean;
  onLocationPress: (location: MapLocation) => void;
}

export default function MapContent({ isOpen, onLocationPress }: MapContentProps) {
  return (
    <View style={styles.container}>
      <MapPanZoom isOpen={isOpen}>
        <MapBackground width="100%" height="100%" style={styles.mapBackground} />
        <LocationMarkers onLocationPress={onLocationPress} />
        <FogOverlay />
      </MapPanZoom>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050a0d",
    overflow: "hidden",
  },
  mapBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
