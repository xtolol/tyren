import { fonts, palette } from "@/src/theme";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

// The relic-card frame (design 1B): a bordered artifact card with corner
// diamonds and a pixel seal label riding the top edge. Content is whatever
// the screen puts inside — the crest on Home, the full detail on /relic.

function CornerDiamond({ color, position }: { color: string; position: object }) {
  return <View style={[styles.diamond, { backgroundColor: color }, position]} />;
}

export default function RelicCard({
  label,
  accent,
  borderColor,
  backgroundColor = palette.card,
  children,
}: {
  label: string;
  accent: string;
  borderColor: string;
  backgroundColor?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.card, { borderColor, backgroundColor }]}>
      <CornerDiamond color={accent} position={{ top: 10, left: 10 }} />
      <CornerDiamond color={accent} position={{ top: 10, right: 10 }} />
      <CornerDiamond color={accent} position={{ bottom: 10, left: 10 }} />
      <CornerDiamond color={accent} position={{ bottom: 10, right: 10 }} />
      <View style={styles.labelRow}>
        <View style={[styles.labelDiamond, { backgroundColor: accent }]} />
        <Text style={[styles.label, { color: accent }]}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderWidth: 1.5,
    borderRadius: 24,
    backgroundColor: palette.card,
    alignItems: "center",
    paddingVertical: 22,
    paddingHorizontal: 20,
  },
  diamond: {
    position: "absolute",
    width: 7,
    height: 7,
    transform: [{ rotate: "45deg" }],
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  labelDiamond: {
    width: 6,
    height: 6,
    transform: [{ rotate: "45deg" }],
  },
  label: {
    fontSize: 10,
    fontFamily: fonts.pixel,
    letterSpacing: 2,
  },
});
