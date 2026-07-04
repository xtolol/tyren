import Crest from "@/app/components/sigil/Crest";
import RankTrack from "@/app/components/sigil/RankTrack";
import RelicCard from "@/app/components/sigil/RelicCard";
import {
  formatPerkBonus,
  nextSeal,
  RELIC_LOADOUT_SLOTS,
  SEAL_LABELS,
  sessionsToNextSeal,
} from "@/src/core/relics";
import { useMapStore } from "@/src/stores/useMapStore";
import { equippedRelics, useRelicStore } from "@/src/stores/useRelicStore";
import { fonts, levelAccent, palette, sealColors } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// The Relic Detail (design 2A, second panel): the card as an artifact —
// seal, crest, flavor, and the perk with its seal journey. Equipping from
// here fills the first free loadout slot.

export default function RelicDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const locations = useMapStore((s) => s.locations);
  const relics = useRelicStore((s) => s.relics);
  const setLoadout = useRelicStore((s) => s.setLoadout);
  const [busy, setBusy] = useState(false);

  const location = locations.find((l) => l.id === id);
  const relic = id ? relics[id] : undefined;

  if (!location || !relic) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={28} color={palette.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Relic</Text>
          <View style={{ width: 28 }} />
        </View>
        <Text style={styles.missing}>This relic has not been claimed yet.</Text>
      </View>
    );
  }

  // The relic wears its home level's colors; the seal metal marks the rank.
  const level = levelAccent(location.sort_order);
  const sealColor = sealColors[relic.seal];
  const upcoming = nextSeal(relic.seal);
  const toNext = sessionsToNextSeal(relic.seal, relic.sealSessions);
  const equipped = relic.equippedSlot != null;

  const toggleEquip = async () => {
    const currentSlots = equippedRelics(relics).map(([locationId]) => locationId);
    const slots = equipped
      ? currentSlots.filter((locationId) => locationId !== location.id)
      : [...currentSlots, location.id];

    if (!equipped && slots.length > RELIC_LOADOUT_SLOTS) {
      Alert.alert(
        "Loadout full",
        "You can equip at most two perks. Manage your loadout to swap one out.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Loadout", onPress: () => router.push("/loadout" as never) },
        ],
      );
      return;
    }

    setBusy(true);
    try {
      await setLoadout(slots);
    } catch (err) {
      Alert.alert("Could not update loadout", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={28} color={palette.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Relic</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <RelicCard
          label={SEAL_LABELS[relic.seal].toUpperCase()}
          accent={sealColor}
          borderColor={level.border}
          backgroundColor={level.card}
        >
          <Crest
            size={170}
            color={level.accent}
            dimColor={level.faint}
            glyphIndex={location.sort_order}
          />
          <Text style={styles.relicName}>{location.relic_name}</Text>
          <Text style={styles.relicLevel}>LEVEL {location.sort_order + 1}</Text>
        </RelicCard>

        {location.relic_flavor ? (
          <View style={styles.flavorBox}>
            <Text style={styles.flavor}>&ldquo;{location.relic_flavor}&rdquo;</Text>
          </View>
        ) : null}

        <View style={[styles.perkBox, { borderColor: level.border, backgroundColor: level.card }]}>
          <View style={styles.perkHeader}>
            <View style={styles.perkTitleRow}>
              <View style={[styles.perkDiamond, { backgroundColor: level.accent }]} />
              <Text style={styles.perkName}>{location.perk_name}</Text>
            </View>
            <Text style={[styles.perkBonus, { color: sealColor }]}>{formatPerkBonus(relic.seal)}</Text>
          </View>
          <Text style={styles.perkDescription}>
            Passive progress multiplier while equipped. Rises with every rank —
            reaches {formatPerkBonus("mythic")} at Mythic Seal.
          </Text>
        </View>

        <RankTrack seal={relic.seal} />
        <Text style={styles.sealHint}>
          {upcoming && toNext != null
            ? `${toNext} more focus session${toNext === 1 ? "" : "s"} to ${SEAL_LABELS[upcoming]}`
            : "This relic has reached its final seal"}
        </Text>

        <TouchableOpacity
          style={[styles.equipButton, { borderColor: level.accent }, equipped && styles.unequipButton]}
          onPress={toggleEquip}
          disabled={busy}
          activeOpacity={0.8}
        >
          <Text style={[styles.equipText, equipped && { color: palette.textDim }]}>
            {busy ? "…" : equipped ? "Unequip" : "Equip perk"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  header: {
    paddingTop: 65,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 30,
    fontFamily: fonts.serif,
    color: palette.text,
  },
  missing: {
    fontSize: 14,
    fontFamily: fonts.ui,
    color: palette.textDim,
    textAlign: "center",
    marginTop: 48,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 48,
    gap: 18,
    alignItems: "center",
  },
  relicName: {
    fontSize: 28,
    fontFamily: fonts.serif,
    color: palette.text,
    marginTop: 10,
  },
  relicLevel: {
    fontSize: 8,
    fontFamily: fonts.pixel,
    letterSpacing: 2,
    color: palette.textFaint,
    marginTop: 4,
  },
  flavorBox: {
    width: "100%",
    borderWidth: 1,
    borderColor: palette.hairline,
    borderRadius: 16,
    padding: 18,
    backgroundColor: palette.bgRaised,
  },
  flavor: {
    fontSize: 15,
    fontFamily: fonts.serif,
    fontStyle: "italic",
    color: palette.textDim,
    lineHeight: 22,
    textAlign: "center",
  },
  perkBox: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 8,
    backgroundColor: palette.bgRaised,
  },
  perkHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  perkTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  perkDiamond: {
    width: 7,
    height: 7,
    transform: [{ rotate: "45deg" }],
  },
  perkName: {
    fontSize: 16,
    fontFamily: fonts.ui,
    fontWeight: "700",
    color: palette.text,
  },
  perkBonus: {
    fontSize: 11,
    fontFamily: fonts.pixelBold,
  },
  perkDescription: {
    fontSize: 13,
    fontFamily: fonts.ui,
    color: palette.textDim,
    lineHeight: 19,
  },
  sealHint: {
    fontSize: 12,
    fontFamily: fonts.ui,
    color: palette.textFaint,
    textAlign: "center",
  },
  equipButton: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 32,
    paddingVertical: 15,
    alignItems: "center",
    backgroundColor: palette.bgRaised,
    marginTop: 6,
  },
  unequipButton: {
    borderColor: palette.hairline,
  },
  equipText: {
    fontSize: 16,
    fontFamily: fonts.ui,
    color: palette.text,
  },
});
