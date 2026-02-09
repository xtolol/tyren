import React from "react";
import { StyleSheet, View } from "react-native";
import mapDataJson from "@/assets/data/mapData.json";
import { useMapStore } from "@/src/stores/useMapStore";
import type { LocationStatus, MapLocation } from "@/src/core/map/types";
import LocationMarker from "./LocationMarker";

const mapData = mapDataJson as {
  regions: { id: string; name: string; locationIds: string[] }[];
  locations: MapLocation[];
};
const HIDDEN_LOCATION_IDS = new Set<string>(["zalthars_hold"]);

function deriveStatus(
  locationId: string,
  currentLocationId: string,
  discoveredLocationIds: string[],
  completedLocationIds: string[]
): LocationStatus {
  if (locationId === currentLocationId) return "current";
  if (completedLocationIds.includes(locationId)) return "completed";
  if (discoveredLocationIds.includes(locationId)) return "discovered";
  return "locked";
}

interface LocationMarkersProps {
  onLocationPress: (location: MapLocation) => void;
}

export default function LocationMarkers({
  onLocationPress,
}: LocationMarkersProps) {
  const currentLocationId = useMapStore((s) => s.currentLocationId);
  const discoveredLocationIds = useMapStore((s) => s.discoveredLocationIds);
  const completedLocationIds = useMapStore((s) => s.completedLocationIds);

  return (
    <View style={styles.container}>
      {mapData.locations.map((location) => {
        if (HIDDEN_LOCATION_IDS.has(location.id)) {
          return null;
        }

        const status = deriveStatus(
          location.id,
          currentLocationId,
          discoveredLocationIds,
          completedLocationIds
        );
        if (status === "locked") return null;
        return (
          <LocationMarker
            key={location.id}
            location={location}
            status={status}
            onPress={onLocationPress}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
});
