import type { SealRank } from "@/src/core/relics";
import { formatPerkBonus, SEAL_LABELS, SEAL_RANKS } from "@/src/core/relics";
import { fonts, levelAccent, palette, sealColors } from "@/src/theme";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Crest from "./sigil/Crest";
import RelicCard from "./sigil/RelicCard";

// The rank-up moment (design 2A, fourth panel) — also serves as the
// "relic claimed" moment when a boss falls. One event per showing; Home
// queues them up after the session summary.

export interface RelicMoment {
  kind: "earned" | "rankup";
  relicName: string;
  perkName: string;
  seal: SealRank;
  glyphIndex: number;
}

export default function RankUpModal({
  moment,
  onContinue,
}: {
  moment: RelicMoment | null;
  onContinue: () => void;
}) {
  if (!moment) {
    return null;
  }

  // The relic wears its home level's colors; the seal metal marks the rank.
  const level = levelAccent(moment.glyphIndex);
  const sealColor = sealColors[moment.seal];
  const prevIndex = SEAL_RANKS.indexOf(moment.seal) - 1;
  const prevSeal = prevIndex >= 0 ? SEAL_RANKS[prevIndex] : null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onContinue}>
      <View style={styles.overlay}>
        <Text style={[styles.header, { color: level.bright }]}>
          {moment.kind === "earned" ? "RELIC CLAIMED" : "RANK UP"}
        </Text>

        <View style={styles.cardWrap}>
          <RelicCard
            label={SEAL_LABELS[moment.seal].toUpperCase()}
            accent={sealColor}
            borderColor={level.border}
            backgroundColor={level.card}
          >
            <Crest size={180} color={level.accent} dimColor={level.faint} glyphIndex={moment.glyphIndex} />
            <Text style={styles.relicName}>{moment.relicName}</Text>
          </RelicCard>
        </View>

        <View style={[styles.perkChip, { borderColor: level.border }]}>
          <Text style={styles.perkName}>{moment.perkName.toUpperCase()}</Text>
          {moment.kind === "rankup" && prevSeal ? (
            <Text style={styles.perkBonus}>
              <Text style={styles.perkBonusOld}>{formatPerkBonus(prevSeal)}</Text>
              {"  →  "}
              <Text style={{ color: sealColor }}>{formatPerkBonus(moment.seal)}</Text>
            </Text>
          ) : (
            <Text style={[styles.perkBonus, { color: sealColor }]}>{formatPerkBonus(moment.seal)}</Text>
          )}
        </View>

        <TouchableOpacity style={[styles.button, { borderColor: level.border }]} onPress={onContinue} activeOpacity={0.8}>
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(5, 3, 1, 0.94)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 36,
    gap: 28,
  },
  header: {
    fontSize: 16,
    fontFamily: fonts.pixelBold,
    letterSpacing: 6,
  },
  cardWrap: {
    width: "100%",
  },
  relicName: {
    fontSize: 30,
    fontFamily: fonts.serif,
    color: palette.text,
    marginTop: 12,
  },
  perkChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: palette.bgRaised,
  },
  perkName: {
    fontSize: 12,
    fontFamily: fonts.pixelBold,
    color: palette.text,
    letterSpacing: 1,
  },
  perkBonus: {
    fontSize: 11,
    fontFamily: fonts.pixel,
    color: palette.textDim,
  },
  perkBonusOld: {
    color: palette.textFaint,
    textDecorationLine: "line-through",
  },
  button: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 32,
    paddingVertical: 15,
    alignItems: "center",
    backgroundColor: palette.bgRaised,
  },
  buttonText: {
    color: palette.text,
    fontSize: 17,
    fontFamily: fonts.ui,
  },
});
