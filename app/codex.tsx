import Crest from "@/app/components/sigil/Crest";
import { formatPerkBonus, SEAL_LABELS } from "@/src/core/relics";
import { useMapStore } from "@/src/stores/useMapStore";
import { useRelicStore } from "@/src/stores/useRelicStore";
import { fonts, levelAccent, palette, sealColors } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// The Relic Codex (design 2A, third panel): every level's relic as a
// collectible card — claimed ones glow in their seal color, unclaimed ones
// wait in the dark with their unlock condition.

export default function CodexScreen() {
  const router = useRouter();
  const locations = useMapStore((s) => s.locations);
  const progress = useMapStore((s) => s.progress);
  const loadLocations = useMapStore((s) => s.loadLocations);
  const relics = useRelicStore((s) => s.relics);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const owned = Object.keys(relics).length;
  const isFinal = (sortOrder: number) =>
    sortOrder === Math.max(...locations.map((l) => l.sort_order));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={28} color={palette.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Relic Codex</Text>
        <Text style={styles.count}>
          {owned}/{locations.length}
        </Text>
      </View>
      <Text style={styles.subtitle}>
        Every level of Zalthar&apos;s story leaves behind a relic. Clear it to
        claim the seal — master it to rank it up.
      </Text>

      <ScrollView
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      >
        {locations.map((location) => {
          const relic = relics[location.id];
          const reached = !!progress[location.id];

          if (relic) {
            const level = levelAccent(location.sort_order);
            return (
              <TouchableOpacity
                key={location.id}
                style={[styles.card, { borderColor: level.border, backgroundColor: level.card }]}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({ pathname: "/relic/[id]", params: { id: location.id } } as never)
                }
              >
                {relic.equippedSlot != null && (
                  <View style={[styles.equipBadge, { backgroundColor: level.accent }]}>
                    <Text style={styles.equipBadgeText}>EQUIPPED</Text>
                  </View>
                )}
                <Crest
                  size={72}
                  color={level.accent}
                  dimColor={level.faint}
                  glyphIndex={location.sort_order}
                />
                <Text style={styles.cardCaption}>LEVEL {location.sort_order + 1}</Text>
                <Text style={styles.cardName}>{location.relic_name}</Text>
                <Text style={[styles.cardSeal, { color: sealColors[relic.seal] }]}>
                  {SEAL_LABELS[relic.seal].toUpperCase()}
                </Text>
                <Text style={styles.cardPerk}>
                  {location.perk_name} {formatPerkBonus(relic.seal)}
                </Text>
              </TouchableOpacity>
            );
          }

          const level = levelAccent(location.sort_order);
          return (
            <View
              key={location.id}
              style={[
                styles.card,
                styles.cardLocked,
                { backgroundColor: level.card, borderColor: level.faint },
              ]}
            >
              <Crest
                size={72}
                color={level.accent}
                dimColor={level.faint}
                glyphIndex={location.sort_order}
              />
              <Text style={styles.cardCaption}>LEVEL {location.sort_order + 1}</Text>
              <Text style={[styles.cardName, { color: palette.textDim }]}>
                {location.relic_name}
              </Text>
              <Ionicons
                name="lock-closed-outline"
                size={16}
                color={palette.textFaint}
                style={{ marginTop: 4 }}
              />
              <Text style={styles.cardUnlock}>
                {isFinal(location.sort_order)
                  ? "Defeat the final boss"
                  : reached && location.boss
                    ? `Fell ${location.boss.bossName}`
                    : `Reach Level ${location.sort_order + 1}`}
              </Text>
            </View>
          );
        })}
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
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 30,
    fontFamily: fonts.serif,
    color: palette.text,
  },
  count: {
    fontSize: 10,
    fontFamily: fonts.pixel,
    color: palette.textDim,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: fonts.ui,
    color: palette.textDim,
    lineHeight: 19,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  card: {
    width: "47.5%",
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 3,
  },
  cardLocked: {
    opacity: 0.75,
  },
  equipBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  equipBadgeText: {
    fontSize: 6,
    fontFamily: fonts.pixelBold,
    color: palette.bg,
    letterSpacing: 1,
  },
  cardCaption: {
    fontSize: 7,
    fontFamily: fonts.pixel,
    letterSpacing: 2,
    color: palette.textFaint,
    marginTop: 8,
  },
  cardName: {
    fontSize: 16,
    fontFamily: fonts.serif,
    color: palette.text,
    textAlign: "center",
  },
  cardSeal: {
    fontSize: 8,
    fontFamily: fonts.pixel,
    letterSpacing: 1.5,
  },
  cardPerk: {
    fontSize: 11,
    fontFamily: fonts.ui,
    color: palette.textDim,
    textAlign: "center",
  },
  cardUnlock: {
    fontSize: 11,
    fontFamily: fonts.ui,
    color: palette.textFaint,
    textAlign: "center",
  },
});
