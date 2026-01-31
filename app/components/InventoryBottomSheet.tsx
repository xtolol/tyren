import BoostIcon from "@/assets/images/booster-48px.svg";
import Chainbreaker from "@/assets/images/chainbreaker-48px.svg";
import GoldPass from "@/assets/images/goldpass-48px.svg";
import RightArrowIcon from "@/assets/images/right-32px.svg";
import CloseIcon from "@/assets/images/x-24px.svg";

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
} from "react";
import {
  Dimensions,
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

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

const InventoryBottomSheet = React.forwardRef<
  InventoryBottomSheetRef,
  InventoryBottomSheetProps
>(({ isOpen, onClose }, ref) => {
  // Ref to control the sheet programmatically (open/close/snapTo)
  const bottomSheetRef = useRef<BottomSheetModal | null>(null);

  // Set ref callback to ensure ref is properly initialized
  const setBottomSheetRef = useCallback((node: BottomSheetModal | null) => {
    bottomSheetRef.current = node;
  }, []);

  // Snap points: Add a very small snap point (5%) that will trigger close
  // When dragged below 50%, it will snap to this small point and we'll close it immediately
  const snapPoints = useMemo(() => ["80%"], []);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    close: () => {
      if (bottomSheetRef.current) {
        bottomSheetRef.current.close();
      }
    },
    present: () => {
      if (bottomSheetRef.current) {
        const modal = bottomSheetRef.current as any;
        // Use snapToIndex to open the modal to 80% position (index 1)
        if (modal.snapToIndex) {
          modal.snapToIndex(1);
        } else if (modal.present) {
          // Fallback to present if it exists
          modal.present();
        }
      }
    },
  }));

  // Control sheet open/close based on isOpen prop
  useEffect(() => {
    if (!bottomSheetRef.current) return;

    if (isOpen) {
      // Small delay to ensure ref is mounted
      const timer = setTimeout(() => {
        if (bottomSheetRef.current) {
          const modal = bottomSheetRef.current as any;
          // Use snapToIndex to open to the 80% position (index 1)
          if (modal.snapToIndex) {
            modal.snapToIndex(1);
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

  // Callback when sheet changes state
  const handleSheetChanges = useCallback(
    (index: number) => {
      console.log("handleSheetChanges", index);
      if (index === -1) {
        // Sheet is closed
        onClose();
      } else if (index === 0) {
        // Sheet reached the small snap point (5%), close it immediately
        // No delay needed - close right away
        bottomSheetRef.current?.close();
      }
    },
    [onClose]
  );

  // Renders the backdrop (dimmed background)
  // appearsOnIndex={0} means it appears when sheet is at the first snap point
  // disappearsOnIndex={-1} means it disappears when sheet is closed
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    []
  );

  return (
    <BottomSheetModal
      ref={setBottomSheetRef}
      snapPoints={snapPoints}
      index={0} // Start at the 80% snap point (index 1)
      enablePanDownToClose={true} // Allow user to swipe down to close
      backdropComponent={renderBackdrop} // Custom backdrop
      onChange={handleSheetChanges}
      backgroundStyle={{ backgroundColor: "#061013" }} // Custom background color
      handleIndicatorStyle={{ backgroundColor: "#CCCCCC", width: 40 }} // Custom handle
    >
      {/* Use BottomSheetView for simple content that doesn't scroll */}
      {/* Use BottomSheetFlatList or BottomSheetScrollView for scrollable content */}
      <BottomSheetView style={styles.sheetContent}>
        <View style={styles.contentContainer}>
          <View style={styles.TopBar}>
            <View style={styles.placeholderLeft}></View>
            <Text style={styles.title}>Inventory</Text>
            <TouchableOpacity style={styles.closeButton}>
              <CloseIcon width={24} height={24} />
            </TouchableOpacity>
          </View>
          <View style={styles.statusContainer}>
            <View style={styles.boostContainer}>
              <View style={styles.boostIconContainer}>
                <BoostIcon width={32} height={32} />
                <View style={styles.boostTextContainer}>
                  <Text style={styles.boostLabel}>2X BOOST ACTIVE: </Text>
                  <Text style={styles.boostTime}>3:24:34 remaining</Text>
                </View>
              </View>
            </View>
            <View style={styles.passContainer}>
              <View style={styles.passIconContainer}>
                <GoldPass width={48} height={48} />
              </View>
              <View style={styles.passTextContainer}>
                <Text style={styles.passLabel}>GOLD PASS</Text>
                <Text style={styles.passDescription}>
                  20% boost to all progression for 30 days
                </Text>
              </View>
              <RightArrowIcon width={32} height={32} />
            </View>
            <View>
              <View style={styles.chainbreakerContainer}>
                <View style={styles.passIconContainer}>
                  <Chainbreaker width={48} height={48} />
                </View>
                <View style={styles.passTextContainer}>
                  <Text style={styles.passLabel}>NO LEVEL ITEM</Text>
                  <Text style={styles.passDescription}>
                    Unlock a level exclusive boost
                  </Text>
                </View>
                <RightArrowIcon width={32} height={32} />
              </View>
            </View>
          </View>
        </View>
        <View style={styles.gridContainer}>
          {Array.from({ length: 12 }).map((_, i) => (
            <GridCell key={i} boostRate={2} boostTime={4} Icon={BoostIcon} />
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
  boostHeader: {
    fontSize: 16,
    fontWeight: "regular",
    color: "#FFFFFF",
    fontFamily: "OpenSans",
  },
  boostIconTextContainer: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    gap: 8,
  },
  boostIconHeader: {
    fontSize: 16,
    fontWeight: "regular",
    color: "#FFFFFF",
    fontFamily: "OpenSans",
  },
  boostIconSubheader: {
    fontSize: 12,
    fontWeight: "regular",
    color: "#FFFFFF",
    fontFamily: "OpenSans",
  },
  passContainer: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    width: "100%",
    backgroundColor: "#006E93",
    gap: 4,
    borderRadius: 16,
    height: 104,
    paddingVertical: 8,
    paddingHorizontal: 8,
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

  passArrowContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: "100%",
  },
  passArrowPlaceholder: {
    width: 37,
    height: 16,
  },
  chainbreakerContainer: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    width: "100%",
    backgroundColor: "#4C0093",
    gap: 4,
    borderRadius: 16,
    height: 104,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
    marginTop: 24,
  },
});
