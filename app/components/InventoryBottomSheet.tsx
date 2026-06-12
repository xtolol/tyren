import BoostIcon from "@/assets/images/booster-48px.svg";
import ChainbreakerGrey from "@/assets/images/chainbreaker-48px-grey.png";
import Chainbreaker from "@/assets/images/chainbreaker-48px.png";
import GoldPass from "@/assets/images/goldpass-48px-grey.png";
import RightArrowIcon from "@/assets/images/right-32px.svg";
import CloseIcon from "@/assets/images/x-24px.svg";
import type { ActiveBoost, ShopItem } from "@/src/lib/api";
import { api } from "@/src/lib/api";
import { usePlayerStore } from "@/src/stores/usePlayerStore";

import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import GridCell from "./GridCell";

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
  Image,
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

const GRID_SLOTS = 12;

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

// Live countdown for the active boost banner; ticks only while mounted
// (i.e. while the sheet is open).
function BoostBanner({ boost }: { boost: ActiveBoost | null }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!boost) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [boost]);

  const remainingMs = boost ? new Date(boost.expires_at).getTime() - now : 0;

  return (
    <View style={styles.boostContainer}>
      <View style={styles.boostIconContainer}>
        <BoostIcon width={32} height={32} />
        {boost && remainingMs > 0 ? (
          <View style={styles.boostTextContainer}>
            <Text style={styles.boostLabel}>
              {boost.effect.value ?? "?"}X BOOST ACTIVE:{" "}
            </Text>
            <Text style={styles.boostTime}>
              {formatRemaining(remainingMs)} remaining
            </Text>
          </View>
        ) : (
          <Text style={styles.boostLabel}>NO ACTIVE BOOST</Text>
        )}
      </View>
    </View>
  );
}

const InventoryBottomSheet = React.forwardRef<
  InventoryBottomSheetRef,
  InventoryBottomSheetProps
>(({ isOpen, onClose }, ref) => {
  const inventory = usePlayerStore((s) => s.inventory);
  const activeBoosts = usePlayerStore((s) => s.activeBoosts);

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

  const hasChainbreaker = (inventory["chainbreaker"] ?? 0) > 0;

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
        const modal = bottomSheetRef.current as any;
        if (modal.snapToIndex) {
          modal.snapToIndex(0);
        } else if (modal.present) {
          modal.present();
        }
      }
    },
  }));

  useEffect(() => {
    if (!bottomSheetRef.current) return;

    if (isOpen) {
      const timer = setTimeout(() => {
        if (bottomSheetRef.current) {
          const modal = bottomSheetRef.current as any;
          if (modal.snapToIndex) {
            modal.snapToIndex(0);
          } else if (modal.present) {
            modal.present();
          }
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

  return (
    <BottomSheetModal
      ref={setBottomSheetRef}
      snapPoints={snapPoints}
      index={-1}
      enablePanDownToClose={true}
      backdropComponent={renderBackdrop}
      onChange={handleSheetChanges}
      backgroundStyle={{ backgroundColor: "#061013" }}
      handleIndicatorStyle={{ backgroundColor: "#CCCCCC", width: 40 }}
    >
      <BottomSheetView style={styles.sheetContent}>
        <View style={styles.contentContainer}>
          <View style={styles.TopBar}>
            <View style={styles.placeholderLeft}></View>
            <Text style={styles.title}>Inventory</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <CloseIcon width={24} height={24} />
            </TouchableOpacity>
          </View>
          <View style={styles.statusContainer}>
            <BoostBanner boost={liveBoost} />
            <View style={styles.passContainer}>
              <Svg
                style={styles.gradientOverlay}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                pointerEvents="none"
              >
                <Defs>
                  <RadialGradient
                    id={"invPassGrad"}
                    cx="70"
                    cy="100"
                    r="70"
                    gradientUnits="userSpaceOnUse"
                  >
                    <Stop offset="0%" stopColor="#006E93" />
                    <Stop offset="100%" stopColor="#00222D" />
                  </RadialGradient>
                </Defs>
                <Rect
                  x="-1"
                  y="-1"
                  width="102"
                  height="102"
                  fill="url(#invPassGrad)"
                />
              </Svg>
              <View style={styles.passContainerContent}>
                <View style={styles.passIconContainer}>
                  <Image
                    source={GoldPass}
                    style={[styles.inventoryItemIcon, styles.greyedOutIcon]}
                  />
                </View>
                <View style={styles.passTextContainer}>
                  <Text style={styles.passLabel}>NO PASS ACTIVE</Text>
                  <Text style={styles.passDescription}>
                    Passes are coming to Tyren soon
                  </Text>
                </View>
                <RightArrowIcon width={32} height={32} />
              </View>
            </View>
            <View>
              <View style={styles.chainbreakerContainer}>
                <Svg
                  style={styles.gradientOverlay}
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  pointerEvents="none"
                >
                  <Defs>
                    <RadialGradient
                      id="invChainbreakerGrad"
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
                    fill="url(#invChainbreakerGrad)"
                  />
                </Svg>
                <View style={styles.passContainerContent}>
                  <View style={styles.passIconContainer}>
                    <Image
                      source={hasChainbreaker ? Chainbreaker : ChainbreakerGrey}
                      style={[
                        styles.inventoryItemIcon,
                        !hasChainbreaker && styles.greyedOutIcon,
                      ]}
                    />
                  </View>
                  <View style={styles.passTextContainer}>
                    <Text style={styles.passLabel}>
                      {hasChainbreaker ? "CHAINBREAKER" : "NO LEVEL ITEM"}
                    </Text>
                    <Text style={styles.passDescription}>
                      {hasChainbreaker
                        ? "Break Zalthar's Chains once you complete the level"
                        : "Unlock a level exclusive boost"}
                    </Text>
                  </View>
                  <RightArrowIcon width={32} height={32} />
                </View>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.gridContainer}>
          {ownedBoosters.map(({ item, quantity }) => (
            <TouchableOpacity
              key={item.id}
              style={styles.gridCellWrapper}
              activeOpacity={0.8}
              onPress={() => handleActivate(item)}
            >
              <GridCell
                boostRate={item.effect.value}
                boostTime={Math.round((item.effect.duration_ms ?? 0) / 3_600_000)}
                Icon={BoostIcon}
              >
                {quantity > 1 ? (
                  <Text style={styles.quantityBadge}>×{quantity}</Text>
                ) : null}
              </GridCell>
            </TouchableOpacity>
          ))}
          {Array.from({
            length: Math.max(0, GRID_SLOTS - ownedBoosters.length),
          }).map((_, i) => (
            <View key={`empty-${i}`} style={styles.gridCellWrapper}>
              <GridCell />
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
    alignItems: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "regular",
    color: "#FFFFFF",
    fontFamily: "InstrumentSerif-Regular",
  },
  TopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    height: 40,
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
  contentContainer: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  statusContainer: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    gap: 8,
  },
  boostContainer: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    width: "100%",
    backgroundColor: "#1A1A1A",
    gap: 8,
    borderRadius: 100,
    height: 48,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  boostIconContainer: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: 8,
  },
  boostTextContainer: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: 0,
  },
  boostLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#FFFFFF",
    fontFamily: "OpenSans",
  },
  boostTime: {
    fontSize: 14,
    fontWeight: "regular",
    color: "#FFFFFF",
    fontFamily: "OpenSans",
  },
  passContainer: {
    borderRadius: 16,
    height: 104,
    width: "100%",
    overflow: "hidden",
  },
  passContainerContent: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    width: "100%",
    gap: 4,
    height: "100%",
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  gradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  passTextContainer: {
    flexDirection: "column",
    flex: 1,
    flexShrink: 1,
    justifyContent: "center",
  },
  passLabel: {
    fontSize: 14,
    letterSpacing: 0.6,
    fontWeight: "bold",
    color: "#FFFFFF",
    fontFamily: "OpenSans",
    lineHeight: 20,
  },
  passDescription: {
    fontSize: 14,
    fontWeight: "regular",
    color: "#CCCCCC",
    fontFamily: "OpenSans",
  },
  passIconContainer: {
    paddingHorizontal: 16,
  },
  inventoryItemIcon: {
    width: 48,
    height: 48,
  },
  greyedOutIcon: {
    opacity: 0.3,
    tintColor: "#8A8A8A",
  },
  chainbreakerContainer: {
    borderRadius: 16,
    height: 104,
    width: "100%",
    overflow: "hidden",
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
    marginTop: 24,
    justifyContent: "space-between",
  },
  gridCellWrapper: {
    width: "23%",
    alignItems: "center",
  },
  quantityBadge: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#FFFFFF",
    fontFamily: "OpenSans",
    textAlign: "right",
    width: "100%",
  },
});
