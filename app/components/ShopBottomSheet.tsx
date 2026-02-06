import BoostIcon from "@/assets/images/booster-48px.svg";
import Chainbreaker from "@/assets/images/chainbreaker-48px.png";
import DustIcon from "@/assets/images/dust-16px.svg";
import GoldPass from "@/assets/images/goldpass-48px.png";
import CrystalPass from "@/assets/images/crystalpass-48px.png";
import RightArrowIcon from "@/assets/images/right-32px.svg";
import ShardIcon from "@/assets/images/shard-16px.svg";
import CloseIcon from "@/assets/images/x-24px.svg";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";

import shopItemsData from "@/assets/data/shopItems.json";

import BottomSheetModal, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import {
  Dimensions,
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

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// Type definitions for shop data
type CurrencyType = "dust" | "shards" | "GBP" | "owned";

interface GradientCoords {
  cx: number;
  cy: number;
  r: number;
}

interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: CurrencyType;
  owned: boolean;
  iconName: string;
  gradient?: GradientCoords;
}

interface ShopData {
  monthlyPasses: ShopItem[];
  levelItems: ShopItem[];
  boosters: ShopItem[];
  timeDust: ShopItem[];
  timeShards: ShopItem[];
}

const shopData: ShopData = shopItemsData as ShopData;
const DEFAULT_SHARD_GRADIENT_COORDS: GradientCoords = {
  cx: 50,
  cy: 8,
  r: 85,
};
const SHARD_GRADIENT_COLORS = {
  center: "#C34DB0",
  edge: "#22002D",
};

// Helper function to format currency values
function formatCurrencyValue(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toString();
}

// Price display component
function PriceDisplay({
  price,
  currency,
}: {
  price: number;
  currency: CurrencyType;
}) {
  if (currency === "owned") {
    return (
      <MaskedView maskElement={<Text style={styles.ownedText}>OWNED</Text>}>
        <LinearGradient
          colors={["#C7E3ED", "#39A5C9"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={[styles.ownedText, { opacity: 0 }]}>OWNED</Text>
        </LinearGradient>
      </MaskedView>
    );
  }

  if (currency === "GBP") {
    return <Text style={styles.priceText}>£{price.toFixed(2)}</Text>;
  }

  return (
    <View style={styles.priceWithIcon}>
      {currency === "dust" ? (
        <DustIcon width={12} height={12} />
      ) : (
        <ShardIcon width={12} height={12} />
      )}
      <Text
        style={[
          styles.priceText,
          { color: currency === "dust" ? "#FBC647" : "#C34DB0" },
        ]}
      >
        {formatCurrencyValue(price)}
      </Text>
    </View>
  );
}

// Monthly Pass Card
function PassCard({ item }: { item: ShopItem }) {
  const isGoldPass = item.id === "gold_pass";
  const centerColor = "#006E93";
  const edgeColor = "#00222D";
  const gradientId = `passGrad-${item.id}`;

  return (
    <View style={styles.passCard}>
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
            <Stop offset="0%" stopColor={centerColor} />
            <Stop offset="100%" stopColor={edgeColor} />
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
      <View style={styles.passCardContent}>
        <View style={styles.passIconContainer}>
          <Image
            source={item.id === "gold_pass" ? GoldPass : CrystalPass}
            style={{ width: 48, height: 48 }}
          />
        </View>
        <View style={styles.passTextContainer}>
          <Text style={styles.passLabel}>{item.name}</Text>
          <Text style={styles.passDescription}>{item.description}</Text>
        </View>
        <PriceDisplay price={item.price} currency={item.currency} />
      </View>
    </View>
  );
}

// Level Item Card
function LevelItemCard({ item }: { item: ShopItem }) {
  const gradientId = `levelGrad-${item.id}`;

  return (
    <View style={styles.levelItemCard}>
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
        <View style={styles.levelItemPrice}>
          <ShardIcon width={16} height={16} />
          <Text style={[styles.priceText, { color: "#C34DB0" }]}>
            {item.price}
          </Text>
        </View>
      </View>
    </View>
  );
}

// Booster Card
function BoosterCard({ item }: { item: ShopItem }) {
  return (
    <View style={styles.gridCard}>
      <BoostIcon width={32} height={32} />
      <Text style={styles.gridItemDuration}>{item.description}</Text>
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
function TimeDustCard({ item }: { item: ShopItem }) {
  return (
    <View style={styles.gridCard}>
      <View style={styles.timeDustIconContainer}>
        <DustIcon width={32} height={32} />
        <Text style={styles.timeDustAmount}>{item.description}</Text>
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

// Time Shard Card
function TimeShardCard({ item }: { item: ShopItem }) {
  const gradientId = `shardSlotGrad-${item.id}`;
  const gradient = item.gradient ?? DEFAULT_SHARD_GRADIENT_COORDS;

  return (
    <View style={[styles.gridCard, styles.shardCardSlot]}>
      <Svg
        style={styles.slotGradientOverlay}
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        pointerEvents="none"
      >
        <Defs>
          <RadialGradient
            id={gradientId}
            cx={String(gradient.cx)}
            cy={String(gradient.cy)}
            r={String(gradient.r)}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0%" stopColor={SHARD_GRADIENT_COLORS.center} />
            <Stop offset="100%" stopColor={SHARD_GRADIENT_COLORS.edge} />
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
      <View style={styles.shardCardContent}>
        <View style={styles.shardIconContainer}>
          <ShardIcon width={40} height={40} />
          <Text style={styles.shardAmount}>{item.description}</Text>
        </View>
        <Text style={styles.shardPrice}>£{item.price.toFixed(2)}</Text>
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

  return (
    <BottomSheetModal
      ref={setBottomSheetRef}
      snapPoints={snapPoints}
      index={0}
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
        {/* Monthly Passes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Monthly passes</Text>
          <Text style={styles.sectionSubtitle}>
            Give yourself a boost to all progression
          </Text>
          <View style={styles.passesContainer}>
            {shopData.monthlyPasses.map((item) => (
              <PassCard key={item.id} item={item} />
            ))}
          </View>
        </View>

        {/* Level Item */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Level item</Text>
          <Text style={styles.sectionSubtitle}>
            Get a level exclusive item for Zalthar's Chains
          </Text>
          <LevelItemCard item={shopData.levelItems[0]} />
        </View>

        {/* Boosters */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Boosters</Text>
          <Text style={styles.sectionSubtitle}>
            Gain temporary boosts to all progression
          </Text>
          <View style={styles.threeColumnGrid}>
            {shopData.boosters.map((item) => (
              <BoosterCard key={item.id} item={item} />
            ))}
          </View>
        </View>

        {/* Time Dust */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Time dust</Text>
          <Text style={styles.sectionSubtitle}>
            Convert time shards into time dust
          </Text>
          <View style={styles.threeColumnGrid}>
            {shopData.timeDust.map((item) => (
              <TimeDustCard key={item.id} item={item} />
            ))}
          </View>
        </View>

        {/* Time Shards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Time shards</Text>
          <Text style={styles.sectionSubtitle}>Purchase rare time shards</Text>
          <View style={styles.threeColumnGrid}>
            {shopData.timeShards.map((item) => (
              <TimeShardCard key={item.id} item={item} />
            ))}
          </View>
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

ShopBottomSheet.displayName = "ShopBottomSheet";

export default ShopBottomSheet;

const styles = StyleSheet.create({
  sheetContent: {
    flex: 1,
    flexDirection: "column",
  },
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
  passesContainer: {
    gap: 8,
    marginTop: 8,
  },
  passCard: {
    borderRadius: 12,
    overflow: "hidden",
  },
  passCardContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
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
  priceWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
  threeColumnGridNoMargin: {
    marginTop: 0,
  },
  gridCard: {
    width: "31%",
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  shardCardSlot: {
    padding: 0,
    gap: 0,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#200234",
  },
  shardCardContent: {
    flex: 1,
    width: "100%",
    padding: 12,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  slotGradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  shardIconContainer: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  shardAmount: {
    position: "absolute",
    fontSize: 14,
    fontWeight: "bold",
    color: "#FFFFFF",
    fontFamily: "OpenSans",
  },
  shardPrice: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#FFFFFF",
    fontFamily: "OpenSans",
  },
});
