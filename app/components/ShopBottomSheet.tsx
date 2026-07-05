import DustIcon from "@/assets/images/dust-16px.svg";
import ShardIcon from "@/assets/images/shard-16px.svg";
import { SEAL_LABELS, sealAtLeast } from "@/src/core/relics";
import { useCurrentLevelAccent } from "@/src/hooks/useLevelAccent";
import type { ShopItem } from "@/src/lib/api";
import { api } from "@/src/lib/api";
import { useMapStore } from "@/src/stores/useMapStore";
import { usePlayerStore } from "@/src/stores/usePlayerStore";
import { useRelicStore } from "@/src/stores/useRelicStore";
import type { LevelAccent } from "@/src/theme";
import { fonts, levelAccent, palette, sealColors } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import Crest from "./sigil/Crest";

import BottomSheetModal, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import * as Crypto from "expo-crypto";
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface ShopBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface ShopBottomSheetRef {
  close: () => void;
  present: () => void;
}

function formatCurrencyValue(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return value.toString();
}

function formatBoostDuration(durationMs?: number): string {
  return `${Math.round((durationMs ?? 0) / 3_600_000)}h`;
}

function currencyLabel(currency: ShopItem["currency"]): string {
  return currency === "dust" ? "Time Dust" : "Time Shards";
}

function PriceTag({ item }: { item: ShopItem }) {
  const Icon = item.currency === "dust" ? DustIcon : ShardIcon;
  const color = item.currency === "dust" ? palette.dust : palette.shards;
  return (
    <View style={styles.priceRow}>
      <Icon width={12} height={12} />
      <Text style={[styles.priceText, { color }]}>
        {formatCurrencyValue(item.price)}
      </Text>
    </View>
  );
}

// A level-exclusive item row: the seal rank on the location's relic
// decides whether it's buyable or still sealed away.
function LevelItemRow({
  item,
  glyphIndex,
  meetsSeal,
}: {
  item: ShopItem;
  glyphIndex: number;
  meetsSeal: boolean;
}) {
  const sealColor = item.required_seal ? sealColors[item.required_seal] : palette.gold;
  const level = levelAccent(glyphIndex);

  return (
    <View
      style={[
        styles.levelItemCard,
        { backgroundColor: level.card, borderColor: level.border },
        !meetsSeal && styles.dimmed,
      ]}
    >
      <View style={styles.levelItemIcon}>
        <Crest
          size={40}
          color={meetsSeal ? level.accent : palette.textFaint}
          dimColor="transparent"
          glyphIndex={glyphIndex}
        />
      </View>
      <View style={styles.levelItemText}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemDescription}>{item.description}</Text>
      </View>
      {meetsSeal ? (
        <PriceTag item={item} />
      ) : (
        <View style={styles.lockColumn}>
          <Ionicons name="lock-closed-outline" size={14} color={palette.textFaint} />
          <Text style={[styles.lockText, { color: sealColor }]}>
            {item.required_seal ? SEAL_LABELS[item.required_seal].toUpperCase() : ""}
          </Text>
        </View>
      )}
    </View>
  );
}

function BoosterCard({
  item,
  affordable,
  theme,
}: {
  item: ShopItem;
  affordable: boolean;
  theme: LevelAccent;
}) {
  return (
    <View
      style={[
        styles.gridCard,
        { backgroundColor: theme.glow, borderColor: theme.faint },
        !affordable && styles.dimmed,
      ]}
    >
      <Ionicons name="hourglass-outline" size={26} color={theme.accent} />
      <Text style={styles.gridItemDuration}>
        {formatBoostDuration(item.effect.duration_ms)}
      </Text>
      <Text style={styles.gridItemName}>{item.name}</Text>
      <PriceTag item={item} />
    </View>
  );
}

function TimeDustCard({
  item,
  affordable,
  theme,
}: {
  item: ShopItem;
  affordable: boolean;
  theme: LevelAccent;
}) {
  return (
    <View
      style={[
        styles.gridCard,
        { backgroundColor: theme.glow, borderColor: theme.faint },
        !affordable && styles.dimmed,
      ]}
    >
      <View style={styles.timeDustIconContainer}>
        <DustIcon width={28} height={28} />
        <Text style={styles.timeDustAmount}>
          {formatCurrencyValue(item.effect.amount ?? 0)}
        </Text>
      </View>
      <Text style={styles.gridItemNameSmall}>{item.name}</Text>
      <PriceTag item={item} />
    </View>
  );
}

const ShopBottomSheet = React.forwardRef<
  ShopBottomSheetRef,
  ShopBottomSheetProps
>(({ isOpen, onClose }, ref) => {
  const bottomSheetRef = useRef<BottomSheetModal | null>(null);

  const setBottomSheetRef = useCallback((node: BottomSheetModal | null) => {
    bottomSheetRef.current = node;
  }, []);

  const snapPoints = useMemo(() => ["90%"], []);

  // Server-authoritative catalog (only active items are visible through
  // RLS — GBP passes and shard packs stay hidden until real IAP exists).
  const [catalog, setCatalog] = useState<ShopItem[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  const dust = usePlayerStore((s) => s.dust);
  const shards = usePlayerStore((s) => s.shards);
  const locations = useMapStore((s) => s.locations);
  const relics = useRelicStore((s) => s.relics);
  // Sheet chrome follows the current level, like Home.
  const theme = useCurrentLevelAccent();

  useEffect(() => {
    if (!isOpen || catalog !== null) return;
    api.shop
      .catalog()
      .then((items) => {
        setCatalog(items);
        setCatalogError(null);
      })
      .catch((err: Error) => setCatalogError(err.message));
  }, [isOpen, catalog]);

  const byCategory = useMemo(() => {
    const groups: Partial<Record<ShopItem["category"], ShopItem[]>> = {};
    for (const item of catalog ?? []) {
      (groups[item.category] ??= []).push(item);
    }
    return groups;
  }, [catalog]);

  const canAfford = useCallback(
    (item: ShopItem) =>
      item.currency === "dust"
        ? dust >= item.price
        : item.currency === "shards"
          ? shards >= item.price
          : false,
    [dust, shards],
  );

  // Does the player's relic for this item's location meet the seal bar?
  const meetsSeal = useCallback(
    (item: ShopItem) => {
      if (!item.required_location_id) return true;
      const relic = relics[item.required_location_id];
      if (!relic) return false;
      return sealAtLeast(relic.seal, item.required_seal ?? "bronze");
    },
    [relics],
  );

  const handlePurchase = useCallback(
    (item: ShopItem) => {
      if (item.currency === "gbp" || purchasingId) return;
      if (!meetsSeal(item)) {
        const location = locations.find((l) => l.id === item.required_location_id);
        Alert.alert(
          "Sealed away",
          `${item.name} unlocks once ${location?.relic_name ?? "the level's relic"} reaches the ${SEAL_LABELS[item.required_seal ?? "bronze"]}.`,
        );
        return;
      }
      if (!canAfford(item)) {
        Alert.alert(
          "Not enough " + currencyLabel(item.currency),
          `${item.name} costs ${item.price} ${currencyLabel(item.currency).toLowerCase()}.`,
        );
        return;
      }
      Alert.alert(
        item.name,
        `Buy for ${formatCurrencyValue(item.price)} ${currencyLabel(item.currency).toLowerCase()}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Buy",
            onPress: async () => {
              setPurchasingId(item.id);
              try {
                const result = await api.shop.purchase(item.id, Crypto.randomUUID());
                usePlayerStore.getState().applyPurchase(result);
              } catch (err) {
                Alert.alert("Purchase failed", (err as Error).message);
              } finally {
                setPurchasingId(null);
              }
            },
          },
        ],
      );
    },
    [canAfford, meetsSeal, locations, purchasingId],
  );

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

  // Level items grouped by their location, in path order.
  const levelItemGroups = useMemo(() => {
    const items = (byCategory.level_item ?? []).filter(
      (item) => item.required_location_id,
    );
    const groups = new Map<string, ShopItem[]>();
    for (const item of items) {
      const key = item.required_location_id!;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()]
      .map(([locationId, groupItems]) => ({
        location: locations.find((l) => l.id === locationId),
        items: groupItems,
      }))
      .sort((a, b) => (a.location?.sort_order ?? 99) - (b.location?.sort_order ?? 99));
  }, [byCategory.level_item, locations]);

  const boosters = byCategory.booster ?? [];
  const dustPacks = byCategory.dust_pack ?? [];

  return (
    <BottomSheetModal
      ref={setBottomSheetRef}
      snapPoints={snapPoints}
      index={-1}
      enableDynamicSizing={false}
      enableContentPanningGesture={false}
      enablePanDownToClose={true}
      backdropComponent={renderBackdrop}
      onChange={handleSheetChanges}
      backgroundStyle={{ backgroundColor: theme.card }}
      handleIndicatorStyle={{ backgroundColor: theme.dim, width: 40 }}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.placeholderLeft} />
        <Text style={styles.title}>Item Shop</Text>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={20} color={palette.text} />
        </TouchableOpacity>
      </View>

      <BottomSheetScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {catalog === null ? (
          catalogError ? (
            <Text style={styles.catalogError}>{catalogError}</Text>
          ) : (
            <ActivityIndicator color={theme.accent} style={{ marginTop: 48 }} />
          )
        ) : (
          <>
            {/* Level-exclusive items, gated by each relic's seal rank */}
            {levelItemGroups.map(({ location, items }) => (
              <View style={styles.section} key={location?.id ?? "unknown"}>
                <Text style={styles.sectionTitle}>Level items</Text>
                <Text style={styles.sectionSubtitle}>
                  Exclusive to {location?.name ?? "the realm"} — what you can
                  buy is gated by {location?.relic_name ?? "its relic"}&apos;s seal
                </Text>
                {items.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.8}
                    onPress={() => handlePurchase(item)}
                  >
                    <LevelItemRow
                      item={item}
                      glyphIndex={location?.sort_order ?? 0}
                      meetsSeal={meetsSeal(item)}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            ))}

            {/* Boosters */}
            {boosters.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Boosters</Text>
                <Text style={styles.sectionSubtitle}>
                  Temporary boosts to dust and XP
                </Text>
                <View style={styles.threeColumnGrid}>
                  {boosters.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.gridTouchable}
                      activeOpacity={0.8}
                      onPress={() => handlePurchase(item)}
                    >
                      <BoosterCard item={item} affordable={canAfford(item)} theme={theme} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Time Dust */}
            {dustPacks.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Time dust</Text>
                <Text style={styles.sectionSubtitle}>
                  Convert time shards into time dust
                </Text>
                <View style={styles.threeColumnGrid}>
                  {dustPacks.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.gridTouchable}
                      activeOpacity={0.8}
                      onPress={() => handlePurchase(item)}
                    >
                      <TimeDustCard item={item} affordable={canAfford(item)} theme={theme} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

ShopBottomSheet.displayName = "ShopBottomSheet";

export default ShopBottomSheet;

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 48,
    gap: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 0,
    height: 60,
  },
  title: {
    fontSize: 32,
    color: palette.text,
    fontFamily: fonts.serif,
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
  catalogError: {
    fontSize: 14,
    fontFamily: fonts.ui,
    color: palette.danger,
    textAlign: "center",
    marginTop: 48,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 22,
    color: palette.text,
    fontFamily: fonts.serif,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: palette.textDim,
    fontFamily: fonts.ui,
  },
  levelItemCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
  },
  dimmed: {
    opacity: 0.55,
  },
  levelItemIcon: {
    width: 44,
    alignItems: "center",
  },
  levelItemText: {
    flex: 1,
    gap: 3,
  },
  itemName: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.text,
    fontFamily: fonts.ui,
    letterSpacing: 0.6,
  },
  itemDescription: {
    fontSize: 12,
    color: palette.textDim,
    fontFamily: fonts.ui,
  },
  lockColumn: {
    alignItems: "center",
    gap: 3,
  },
  lockText: {
    fontSize: 6,
    fontFamily: fonts.pixel,
    letterSpacing: 1,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  priceText: {
    fontSize: 11,
    fontFamily: fonts.pixelBold,
  },
  threeColumnGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    justifyContent: "space-between",
  },
  gridTouchable: {
    width: "31%",
  },
  gridCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  gridItemDuration: {
    fontSize: 8,
    color: palette.textFaint,
    fontFamily: fonts.pixel,
  },
  gridItemName: {
    fontSize: 11,
    fontWeight: "700",
    color: palette.text,
    fontFamily: fonts.ui,
  },
  gridItemNameSmall: {
    fontSize: 10,
    fontWeight: "700",
    color: palette.text,
    fontFamily: fonts.ui,
  },
  timeDustIconContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  timeDustAmount: {
    fontSize: 12,
    fontFamily: fonts.pixelBold,
    color: palette.dust,
  },
});
