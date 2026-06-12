import BoostIcon from "@/assets/images/booster-48px.svg";
import Chainbreaker from "@/assets/images/chainbreaker-48px.png";
import DustIcon from "@/assets/images/dust-16px.svg";
import ShardIcon from "@/assets/images/shard-16px.svg";
import CloseIcon from "@/assets/images/x-24px.svg";
import type { ShopItem } from "@/src/lib/api";
import { api } from "@/src/lib/api";
import { usePlayerStore } from "@/src/stores/usePlayerStore";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

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
  Image,
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

// Helper function to format currency values
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

// Level Item Card
function LevelItemCard({ item, owned }: { item: ShopItem; owned: boolean }) {
  const gradientId = `levelGrad-${item.id}`;

  return (
    <View style={[styles.levelItemCard, owned && styles.ownedCard]}>
      <Svg
        style={styles.gradientOverlay}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        pointerEvents="none"
      >
        <Defs>
          <RadialGradient
            id={gradientId}
            cx="70"
            cy="100"
            r="70"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0%" stopColor="#4C0093" />
            <Stop offset="100%" stopColor="#17002D" />
          </RadialGradient>
        </Defs>
        <Rect
          x="-1"
          y="-1"
          width="102"
          height="102"
          fill={`url(#${gradientId})`}
        />
      </Svg>
      <View style={styles.levelItemContent}>
        <View style={styles.passIconContainer}>
          <Image source={Chainbreaker} style={{ width: 48, height: 48 }} />
        </View>
        <View style={styles.passTextContainer}>
          <Text style={styles.passLabel}>{item.name}</Text>
          <Text style={styles.passDescription}>{item.description}</Text>
        </View>
        {owned ? (
          <Text style={styles.ownedText}>OWNED</Text>
        ) : (
          <View style={styles.levelItemPrice}>
            <ShardIcon width={16} height={16} />
            <Text style={[styles.priceText, { color: "#C34DB0" }]}>
              {item.price}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// Booster Card
function BoosterCard({ item, affordable }: { item: ShopItem; affordable: boolean }) {
  return (
    <View style={[styles.gridCard, !affordable && styles.unaffordableCard]}>
      <BoostIcon width={32} height={32} />
      <Text style={styles.gridItemDuration}>
        {formatBoostDuration(item.effect.duration_ms)}
      </Text>
      <Text style={styles.gridItemName}>{item.name}</Text>
      <View style={styles.gridItemPrice}>
        <DustIcon width={12} height={12} />
        <Text style={[styles.gridItemPriceText, { color: "#FBC647" }]}>
          {formatCurrencyValue(item.price)}
        </Text>
      </View>
    </View>
  );
}

// Time Dust Card
function TimeDustCard({ item, affordable }: { item: ShopItem; affordable: boolean }) {
  return (
    <View style={[styles.gridCard, !affordable && styles.unaffordableCard]}>
      <View style={styles.timeDustIconContainer}>
        <DustIcon width={32} height={32} />
        <Text style={styles.timeDustAmount}>
          {formatCurrencyValue(item.effect.amount ?? 0)}
        </Text>
      </View>
      <Text style={styles.gridItemNameSmall}>{item.name}</Text>
      <View style={styles.gridItemPrice}>
        <ShardIcon width={12} height={12} />
        <Text style={[styles.gridItemPriceText, { color: "#C34DB0" }]}>
          {item.price}
        </Text>
      </View>
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
  const inventory = usePlayerStore((s) => s.inventory);

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

  const handlePurchase = useCallback(
    (item: ShopItem) => {
      if (item.currency === "gbp" || purchasingId) return;
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
    [canAfford, purchasingId],
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
        opacity={0.5}
      />
    ),
    [],
  );

  const levelItems = byCategory.level_item ?? [];
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
      backgroundStyle={{ backgroundColor: "#061013" }}
      handleIndicatorStyle={{ backgroundColor: "#CCCCCC", width: 40 }}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.placeholderLeft} />
        <Text style={styles.title}>Item Shop</Text>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <CloseIcon width={24} height={24} />
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
            <ActivityIndicator color="#39A5C9" style={{ marginTop: 48 }} />
          )
        ) : (
          <>
            {/* Level Item */}
            {levelItems.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Level item</Text>
                <Text style={styles.sectionSubtitle}>
                  Get a level exclusive item for Zalthar&apos;s Chains
                </Text>
                {levelItems.map((item) => {
                  const owned = (inventory[item.id] ?? 0) > 0;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.8}
                      disabled={owned}
                      onPress={() => handlePurchase(item)}
                    >
                      <LevelItemCard item={item} owned={owned} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Boosters */}
            {boosters.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Boosters</Text>
                <Text style={styles.sectionSubtitle}>
                  Multiply dust and XP from focus sessions
                </Text>
                <View style={styles.threeColumnGrid}>
                  {boosters.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.gridTouchable}
                      activeOpacity={0.8}
                      onPress={() => handlePurchase(item)}
                    >
                      <BoosterCard item={item} affordable={canAfford(item)} />
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
                      <TimeDustCard item={item} affordable={canAfford(item)} />
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
    fontWeight: "regular",
    color: "#FFFFFF",
    fontFamily: "InstrumentSerif-Regular",
  },
  closeButton: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    backgroundColor: "#00222D",
    borderRadius: 100,
  },
  placeholderLeft: {
    width: 32,
    height: 32,
  },
  catalogError: {
    fontSize: 14,
    fontFamily: "OpenSans",
    color: "#FF6B6B",
    textAlign: "center",
    marginTop: 48,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 20,
    color: "#FFFFFF",
    fontFamily: "OpenSans",
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: "regular",
    color: "#888888",
    fontFamily: "OpenSans",
  },
  gradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  levelItemCard: {
    borderRadius: 12,
    marginTop: 8,
    overflow: "hidden",
  },
  levelItemContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },
  ownedCard: {
    opacity: 0.7,
  },
  unaffordableCard: {
    opacity: 0.45,
  },
  passIconContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  passTextContainer: {
    flex: 1,
    gap: 4,
  },
  passLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#FFFFFF",
    fontFamily: "OpenSans",
    letterSpacing: 0.6,
  },
  passDescription: {
    fontSize: 12,
    fontWeight: "regular",
    color: "#CCCCCC",
    fontFamily: "OpenSans",
  },
  ownedText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#FFFFFF",
    fontFamily: "OpenSans",
  },
  priceText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#FFFFFF",
    fontFamily: "OpenSans",
  },
  levelItemPrice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  gridItemDuration: {
    fontSize: 12,
    fontWeight: "regular",
    color: "#888888",
    fontFamily: "OpenSans",
  },
  gridItemName: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#FFFFFF",
    fontFamily: "OpenSans",
  },
  gridItemNameSmall: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#FFFFFF",
    fontFamily: "OpenSans",
  },
  gridItemPrice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  gridItemPriceText: {
    fontSize: 12,
    fontWeight: "bold",
    fontFamily: "OpenSans",
  },
  timeDustIconContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  timeDustAmount: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#FBC647",
    fontFamily: "OpenSans",
  },
});
