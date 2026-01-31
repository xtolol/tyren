import React from "react";
import {
  Image,
  ImageSourcePropType,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

const CELL_SIZE = 83.5;
const CELL_BG = "#00222D";

/** SVG component from an import (e.g. import MyIcon from './icon.svg') */
type SvgComponent = React.ComponentType<{
  width?: number;
  height?: number;
  [key: string]: unknown;
}>;

interface GridCellProps {
  style?: ViewStyle;
  children?: React.ReactNode;
  /** Image source for the item (e.g. require('./icon.png') or { uri: '...' }) */
  imageSource?: ImageSourcePropType;
  /** SVG component from an import (e.g. import ItemIcon from '@/assets/images/item.svg') */
  Icon?: SvgComponent;
  boostRate?: number;
  boostTime?: number;
}

const DEFAULT_ICON_SIZE = 40;

const GridCell = ({
  style,
  children,
  imageSource,
  Icon,
  boostRate,
  boostTime,
}: GridCellProps) => {
  return (
    <View style={[styles.cell, style]}>
      {boostTime != null ? (
        <Text style={styles.boostTimeText} numberOfLines={1}>
          {boostTime}h
        </Text>
      ) : null}
      <View style={styles.contentArea}>
        <View style={styles.imageAndBoostRow}>
          {boostRate != null ? (
            <Text style={styles.boostRateText} numberOfLines={1}>
              {boostRate}X
            </Text>
          ) : null}
          {Icon ? (
            <Icon width={DEFAULT_ICON_SIZE} height={DEFAULT_ICON_SIZE} />
          ) : imageSource ? (
            <Image
              source={imageSource}
              style={styles.image}
              resizeMode="contain"
            />
          ) : null}
        </View>
        {children}
      </View>
    </View>
  );
};

GridCell.displayName = "GridCell";

export default GridCell;

const styles = StyleSheet.create({
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    backgroundColor: CELL_BG,
    borderRadius: 16,
    padding: 8,
    overflow: "hidden",
    flexDirection: "column",
    alignItems: "stretch",
  },
  boostTimeText: {
    width: "100%",
    fontSize: 14,
    fontWeight: "regular",
    color: "#CCCCCC",
    fontFamily: "OpenSans",
    lineHeight: 20,
    textAlign: "right",
  },
  contentArea: {
    flex: 1,
    width: "100%",
    minHeight: 0,
  },
  imageAndBoostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
    padding: 4,
    width: "100%",
  },
  image: {
    width: DEFAULT_ICON_SIZE,
    height: DEFAULT_ICON_SIZE,
  },
  boostRateText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#FFFFFF",
    fontFamily: "OpenSans",
    lineHeight: 16,
    letterSpacing: 0.6,
  },
});
