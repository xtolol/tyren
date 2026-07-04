import {
  formatPerkBonus,
  RELIC_LOADOUT_SLOTS,
} from "@/src/core/relics";
import { useMapStore } from "@/src/stores/useMapStore";
import { equippedRelics, useRelicStore } from "@/src/stores/useRelicStore";
import { fonts, levelAccent, palette } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// The perk loadout (design Q2): two equipped slots up top, every perk from
// any owned relic below. Locked rows are relics still waiting on the map.
// Tapping a slot or row opens that relic's detail page (its seal journey
// lives there, not on Home); the EQUIP/EQUIPPED badge is the toggle.

export default function LoadoutScreen() {
  const router = useRouter();
  const locations = useMapStore((s) => s.locations);
  const relics = useRelicStore((s) => s.relics);
  const setLoadout = useRelicStore((s) => s.setLoadout);
  const [busy, setBusy] = useState(false);

  const equipped = equippedRelics(relics);
  const slots = equipped.map(([locationId]) => locationId);

  const apply = async (next: string[]) => {
    setBusy(true);
    try {
      await setLoadout(next);
    } catch (err) {
      Alert.alert("Could not update loadout", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (locationId: string) => {
    if (busy) return;
    if (slots.includes(locationId)) {
      apply(slots.filter((id) => id !== locationId));
    } else if (slots.length < RELIC_LOADOUT_SLOTS) {
      apply([...slots, locationId]);
    } else {
      Alert.alert(
        "Loadout full",
        "Both slots are taken — unequip a perk first.",
      );
    }
  };

  const openRelic = (locationId: string) =>
    router.push({ pathname: "/relic/[id]", params: { id: locationId } } as never);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={28} color={palette.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Loadout</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionCaption}>
          EQUIPPED · {RELIC_LOADOUT_SLOTS} SLOTS
        </Text>
        <View style={styles.slotRow}>
          {Array.from({ length: RELIC_LOADOUT_SLOTS }).map((_, i) => {
            const entry = equipped[i];
            if (!entry) {
              return (
                <View key={`empty-${i}`} style={[styles.slot, styles.slotEmpty]}>
                  <Text style={styles.slotEmptyText}>Empty slot</Text>
                </View>
              );
            }
            const [locationId, relic] = entry;
            const location = locations.find((l) => l.id === locationId);
            const level = levelAccent(location?.sort_order ?? 0);
            return (
              <TouchableOpacity
                key={locationId}
                style={[styles.slot, { borderColor: level.accent, backgroundColor: level.card }]}
                onPress={() => openRelic(locationId)}
                activeOpacity={0.8}
              >
                <View style={[styles.diamond, { backgroundColor: level.accent }]} />
                <Text style={styles.slotName}>{location?.perk_name ?? "Perk"}</Text>
                <Text style={[styles.slotMeta, { color: level.accent }]}>
                  L{(location?.sort_order ?? 0) + 1} · {formatPerkBonus(relic.seal)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionCaption}>ALL PERKS · FROM ANY RELIC</Text>
        <View style={styles.list}>
          {locations.map((location) => {
            const relic = relics[location.id];
            const isEquipped = relic?.equippedSlot != null;
            const level = levelAccent(location.sort_order);
            const color = relic ? level.accent : palette.textFaint;

            return (
              <TouchableOpacity
                key={location.id}
                style={[
                  styles.row,
                  {
                    backgroundColor: level.card,
                    borderColor: isEquipped ? level.border : level.faint,
                  },
                  !relic && styles.rowLocked,
                ]}
                disabled={!relic}
                onPress={() => openRelic(location.id)}
                activeOpacity={0.8}
              >
                <View style={[styles.diamond, { backgroundColor: color }]} />
                <View style={styles.rowText}>
                  <Text style={[styles.rowName, !relic && { color: palette.textDim }]}>
                    {location.perk_name}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {location.relic_name} · LVL {location.sort_order + 1}
                    {relic ? ` · ${formatPerkBonus(relic.seal)}` : ""}
                  </Text>
                </View>
                {relic ? (
                  <TouchableOpacity
                    style={[
                      styles.badge,
                      isEquipped
                        ? { backgroundColor: color }
                        : { borderColor: level.border, borderWidth: 1 },
                    ]}
                    onPress={() => toggle(location.id)}
                    disabled={busy}
                    hitSlop={10}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        isEquipped ? { color: palette.bg } : { color: palette.textDim },
                      ]}
                    >
                      {isEquipped ? "EQUIPPED" : "EQUIP"}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.lockedText}>LOCKED</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: 12,
  },
  sectionCaption: {
    fontSize: 8,
    fontFamily: fonts.pixel,
    letterSpacing: 2,
    color: palette.textDim,
    marginTop: 10,
  },
  slotRow: {
    flexDirection: "row",
    gap: 12,
  },
  slot: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
    gap: 6,
  },
  slotEmpty: {
    borderColor: 'rgba(244, 234, 218, 0.14)',
    borderStyle: "dashed",
    justifyContent: "center",
  },
  slotEmptyText: {
    fontSize: 12,
    fontFamily: fonts.ui,
    color: palette.textFaint,
  },
  slotName: {
    fontSize: 15,
    fontFamily: fonts.ui,
    fontWeight: "700",
    color: palette.text,
  },
  slotMeta: {
    fontSize: 9,
    fontFamily: fonts.pixel,
  },
  diamond: {
    width: 8,
    height: 8,
    transform: [{ rotate: "45deg" }],
  },
  list: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  rowLocked: {
    opacity: 0.6,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontSize: 15,
    fontFamily: fonts.ui,
    fontWeight: "700",
    color: palette.text,
  },
  rowMeta: {
    fontSize: 12,
    fontFamily: fonts.ui,
    color: palette.textDim,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 7,
    fontFamily: fonts.pixelBold,
    letterSpacing: 1,
  },
  lockedText: {
    fontSize: 7,
    fontFamily: fonts.pixel,
    letterSpacing: 1,
    color: palette.textFaint,
  },
});
