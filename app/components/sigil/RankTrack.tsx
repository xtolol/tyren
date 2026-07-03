import { SEAL_RANKS, SEAL_SHORT } from "@/src/core/relics";
import type { SealRank } from "@/src/core/relics";
import { fonts, palette, sealColors } from "@/src/theme";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

// The BRZ · SLV · GLD · MYT seal track under a relic (design 2A). Filled
// up to the current seal; the current node glows in its seal color.

export default function RankTrack({ seal }: { seal: SealRank }) {
  const currentIndex = SEAL_RANKS.indexOf(seal);

  return (
    <View style={styles.container}>
      <View style={styles.line} />
      <View style={styles.nodes}>
        {SEAL_RANKS.map((rank, i) => {
          const reached = i <= currentIndex;
          const current = i === currentIndex;
          return (
            <View key={rank} style={styles.node}>
              <View
                style={[
                  styles.dot,
                  reached && { backgroundColor: sealColors[rank] },
                  current && [styles.dotCurrent, { shadowColor: sealColors[rank], borderColor: sealColors[rank] }],
                ]}
              />
              <Text style={[styles.label, reached && { color: sealColors[rank] }]}>
                {SEAL_SHORT[rank]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    paddingHorizontal: 24,
  },
  line: {
    position: "absolute",
    left: 44,
    right: 44,
    top: 6,
    height: 2,
    backgroundColor: palette.hairline,
  },
  nodes: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  node: {
    alignItems: "center",
    gap: 6,
    width: 40,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: palette.bgRaised,
    borderWidth: 1.5,
    borderColor: palette.hairline,
  },
  dotCurrent: {
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  label: {
    fontSize: 8,
    fontFamily: fonts.pixel,
    color: palette.textFaint,
    letterSpacing: 1,
  },
});
