import { formatPerkBonus } from "@/src/core/relics";
import { useCurrentLevelAccent } from "@/src/hooks/useLevelAccent";
import type { ActiveBoost, ShopItem } from "@/src/lib/api";
import { api } from "@/src/lib/api";
import { useMapStore } from "@/src/stores/useMapStore";
import { usePlayerStore } from "@/src/stores/usePlayerStore";
import { equippedRelics, useRelicStore } from "@/src/stores/useRelicStore";
import type { LevelAccent } from "@/src/theme";
import { fonts, levelAccent, palette } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import BottomSheetModal, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface InventoryBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface InventoryBottomSheetRef {
  close: () => void;
  present: () => void;
}

const GRID_SLOTS = 8;

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

// Live countdown for the active boost banner; ticks only while mounted
// (i.e. while the sheet is open).
function BoostBanner({ boost, theme }: { boost: ActiveBoost | null; theme: LevelAccent }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!boost) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [boost]);

  const remainingMs = boost ? new Date(boost.expires_at).getTime() - now : 0;

  return (
    <View style={[styles.boostContainer, { backgroundColor: theme.glow, borderColor: theme.faint }]}>
      <Ionicons
        name="hourglass-outline"
        size={20}
        color={boost && remainingMs > 0 ? theme.accent : palette.textFaint}
      />
      {boost && remainingMs > 0 ? (
        <View style={styles.boostTextContainer}>
          <Text style={styles.boostLabel}>
            {boost.effect.value ?? "?"}× BOOST ACTIVE
          </Text>
          <Text style={[styles.boostTime, { color: theme.accent }]}>{formatRemaining(remainingMs)}</Text>
        </View>
      ) : (
        <Text style={[styles.boostLabel, { color: palette.textFaint }]}>
          NO ACTIVE BOOST
        </Text>
      )}
    </View>
  );
}

const InventoryBottomSheet = React.forwardRef<
  InventoryBottomSheetRef,
  InventoryBottomSheetProps
>(({ isOpen, onClose }, ref) => {
  const router = useRouter();
  const inventory = usePlayerStore((s) => s.inventory);
  const activeBoosts = usePlayerStore((s) => s.activeBoosts);
  const relics = useRelicStore((s) => s.relics);
  const locations = useMapStore((s) => s.locations);
  // Sheet chrome follows the current level, like Home.
  const theme = useCurrentLevelAccent();

  // Catalog provides names/effects for owned item ids.
  const [catalog, setCatalog] = useState<ShopItem[] | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || catalog !== null) return;
    api.shop.catalog().then(setCatalog).catch(() => {});
  }, [isOpen, catalog]);

  const itemsById = useMemo(
    () => new Map((catalog ?? []).map((item) => [item.id, item])),
    [catalog],
  );

  const liveBoost = useMemo(() => {
    const nowMs = Date.now();
    const live = activeBoosts.filter(
      (b) => new Date(b.expires_at).getTime() > nowMs,
    );
    if (live.length === 0) return null;
    return live.reduce((best, b) =>
      (b.effect.value ?? 0) > (best.effect.value ?? 0) ? b : best,
    );
  }, [activeBoosts]);

  const ownedBoosters = useMemo(
    () =>
      Object.entries(inventory)
        .filter(([itemId, quantity]) => {
          if (quantity <= 0) return false;
          const item = itemsById.get(itemId);
          return item?.effect.type === "reward_multiplier";
        })
        .map(([itemId, quantity]) => ({
          item: itemsById.get(itemId)!,
          quantity,
        })),
    [inventory, itemsById],
  );

  const equipped = equippedRelics(relics);

  const handleActivate = useCallback(
    (item: ShopItem) => {
      if (activatingId) return;
      Alert.alert(
        `Activate ${item.name}?`,
        `${item.description}. It starts the moment you confirm.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Activate",
            onPress: async () => {
              setActivatingId(item.id);
              try {
                const result = await api.boosts.activate(item.id);
                usePlayerStore.getState().applyBoostActivation(result);
              } catch (err) {
                Alert.alert("Activation failed", (err as Error).message);
              } finally {
                setActivatingId(null);
              }
            },
          },
        ],
      );
    },
    [activatingId],
  );

  // Ref to control the sheet programmatically (open/close/snapTo)
  const bottomSheetRef = useRef<BottomSheetModal | null>(null);

  const setBottomSheetRef = useCallback((node: BottomSheetModal | null) => {
    bottomSheetRef.current = node;
  }, []);

  const snapPoints = useMemo(() => ["80%"], []);

  useImperativeHandle(ref, () => ({
    close: () => {
      if (bottomSheetRef.current) {
        bottomSheetRef.current.close();
      }
    },
    present: () => {
      if (bottomSheetRef.current) {
        bottomSheetRef.current.snapToIndex(0);
      }
    },
  }));

  useEffect(() => {
    if (!bottomSheetRef.current) return;

    if (isOpen) {
      const timer = setTimeout(() => {
        if (bottomSheetRef.current) {
          bottomSheetRef.current.snapToIndex(0);
        }
      }, 10);
      return () => clearTimeout(timer);
    } else {
      bottomSheetRef.current.close();
    }
  }, [isOpen]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        onClose();
      }
    },
    [onClose],
  );

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.6}
      />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={setBottomSheetRef}
      snapPoints={snapPoints}
      index={-1}
      enablePanDownToClose={true}
      backdropComponent={renderBackdrop}
      onChange={handleSheetChanges}
      backgroundStyle={{ backgroundColor: theme.card }}
      handleIndicatorStyle={{ backgroundColor: theme.dim, width: 40 }}
    >
      <BottomSheetView style={styles.sheetContent}>
        <View style={styles.topBar}>
          <View style={styles.placeholderLeft} />
          <Text style={styles.title}>Inventory</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={20} color={palette.text} />
          </TouchableOpacity>
        </View>

        <BoostBanner boost={liveBoost} theme={theme} />

        {/* Equipped perks (the loadout, mirrored from the relic store) */}
        <Text style={[styles.sectionCaption, { color: theme.dim }]}>EQUIPPED PERKS</Text>
        {equipped.length > 0 ? (
          <View style={styles.perkRow}>
            {equipped.map(([locationId, relic]) => {
              const location = locations.find((l) => l.id === locationId);
              const level = levelAccent(location?.sort_order ?? 0);
              const color = level.accent;
              return (
                <TouchableOpacity
                  key={locationId}
                  style={[styles.perkCard, { borderColor: color, backgroundColor: level.card }]}
                  onPress={() => {
                    onClose();
                    router.push("/loadout" as never);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.perkDiamond, { backgroundColor: color }]} />
                  <Text style={styles.perkName}>{location?.perk_name ?? "Perk"}</Text>
                  <Text style={[styles.perkBonus, { color }]}>
                    {formatPerkBonus(relic.seal)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.noPerks, { backgroundColor: theme.glow, borderColor: theme.faint }]}
            onPress={() => {
              onClose();
              router.push("/codex" as never);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.noPerksText}>
              No perks equipped — claim a relic to unlock one
            </Text>
            <Ionicons name="chevron-forward" size={16} color={palette.textFaint} />
          </TouchableOpacity>
        )}

        {/* Consumables */}
        <Text style={[styles.sectionCaption, { color: theme.dim }]}>CONSUMABLES</Text>
        <View style={styles.gridContainer}>
          {ownedBoosters.map(({ item, quantity }) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.gridCell, { backgroundColor: theme.glow, borderColor: theme.faint }]}
              activeOpacity={0.8}
              onPress={() => handleActivate(item)}
            >
              <Text style={styles.gridDuration}>
                {Math.round((item.effect.duration_ms ?? 0) / 3_600_000)}h
              </Text>
              <Ionicons name="hourglass-outline" size={24} color={theme.accent} />
              <Text style={[styles.gridValue, { color: theme.bright }]}>{item.effect.value}×</Text>
              {quantity > 1 ? (
                <Text style={styles.quantityBadge}>×{quantity}</Text>
              ) : null}
            </TouchableOpacity>
          ))}
          {Array.from({
            length: Math.max(0, GRID_SLOTS - ownedBoosters.length),
          }).map((_, i) => (
            <View
              key={`empty-${i}`}
              style={[styles.gridCell, styles.gridCellEmpty, { borderColor: theme.faint }]}
            >
              <View style={styles.emptyDiamond} />
            </View>
          ))}
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

InventoryBottomSheet.displayName = "InventoryBottomSheet";

export default InventoryBottomSheet;

const styles = StyleSheet.create({
  sheetContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 48,
    gap: 14,
  },
  title: {
    fontSize: 32,
    color: palette.text,
    fontFamily: fonts.serif,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    height: 48,
  },
  closeButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    backgroundColor: "rgba(244, 234, 218, 0.08)",
    borderRadius: 16,
  },
  placeholderLeft: {
    width: 32,
    height: 32,
  },
  boostContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    borderWidth: 1,
    gap: 10,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  boostTextContainer: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  boostLabel: {
    fontSize: 11,
    fontFamily: fonts.pixelBold,
    color: palette.text,
    letterSpacing: 1,
  },
  boostTime: {
    fontSize: 11,
    fontFamily: fonts.pixel,
  },
  sectionCaption: {
    fontSize: 8,
    fontFamily: fonts.pixel,
    letterSpacing: 2,
    marginTop: 6,
  },
  perkRow: {
    flexDirection: "row",
    gap: 10,
  },
  perkCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  perkDiamond: {
    width: 7,
    height: 7,
    transform: [{ rotate: "45deg" }],
  },
  perkName: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.ui,
    fontWeight: "700",
    color: palette.text,
  },
  perkBonus: {
    fontSize: 9,
    fontFamily: fonts.pixel,
  },
  noPerks: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  noPerksText: {
    fontSize: 13,
    fontFamily: fonts.ui,
    color: palette.textDim,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
    justifyContent: "space-between",
  },
  gridCell: {
    width: "23%",
    height: 80,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  gridCellEmpty: {
    backgroundColor: "transparent",
  },
  emptyDiamond: {
    width: 8,
    height: 8,
    transform: [{ rotate: "45deg" }],
    borderWidth: 1,
    borderColor: "rgba(244, 234, 218, 0.14)",
  },
  gridDuration: {
    fontSize: 7,
    fontFamily: fonts.pixel,
    color: palette.textFaint,
  },
  gridValue: {
    fontSize: 10,
    fontFamily: fonts.pixelBold,
  },
  quantityBadge: {
    position: "absolute",
    bottom: 6,
    right: 8,
    fontSize: 8,
    fontFamily: fonts.pixel,
    color: palette.textDim,
  },
});
