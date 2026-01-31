import React, { useEffect, useRef } from "react";
import { Animated, View, Easing } from "react-native";
import Svg, { Path } from "react-native-svg";
import MapIcon from "@/assets/images/map-24px.svg";
import { Dimensions, StyleSheet, Text, TouchableOpacity } from "react-native";

const AnimatedPath = Animated.createAnimatedComponent(Path);

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const a = (angle * Math.PI) / 180; // SVG 0° is →, top is -90°
  return {
    x: cx + r * Math.cos(a),
    y: cy + r * Math.sin(a),
  };
}

// Generate arc path
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

export default function ArcProgress({
  percentage = 34,
  radius = 190,
  backgroundStrokeWidth = 1, // width of the grey track
  progressStrokeWidth = 7, // width of the colored progress arc
  color = "#39A5C9",
  opacity = 0.8,
  sweepAngle = 110,
  multiplier = 1.0,
}) {
  const animated = useRef(new Animated.Value(0)).current;

  // Make sure the SVG container can fit the largest stroke
  const size =
    (radius + Math.max(backgroundStrokeWidth, progressStrokeWidth)) * 2;
  const center = size / 2;

  const startAngle = -90 - sweepAngle / 2;
  const endAngle = startAngle + sweepAngle;

  const path = describeArc(center, center, radius, startAngle, endAngle);

  const arcLength = (Math.PI * radius * sweepAngle) / 180;

  const strokeDashoffset = animated.interpolate({
    inputRange: [0, 100],
    outputRange: [arcLength, 0],
  });

  useEffect(() => {
    animated.setValue(0);
    Animated.timing(animated, {
      toValue: percentage,
      duration: 1000,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [percentage]);
  return (
    <View
      style={{
        width: size,
        height: size,
        alignSelf: "center",
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
      }}
    >
      <View
        style={{
          flexDirection: "column",
          alignItems: "center",
          transform: [{ translateY: -110 }],
        }}
      >
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => console.log("Map pressed")}
        >
          <MapIcon width={24} height={24} />
        </TouchableOpacity>

        <Text style={styles.label}>
          {multiplier.toFixed(1)}x progress multiplier
        </Text>
        <Text style={styles.value}>{percentage}%</Text>
      </View>
      {/* Progress arc — floats above the icon */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: size,
          height: size / 2, // only top half
          alignItems: "center",
          pointerEvents: "none",
        }}
      >
        <Svg width={size} height={size}>
          {/* Background track */}
          <Path
            d={path}
            stroke="#FFFFFF"
            strokeWidth={backgroundStrokeWidth}
            fill="none"
            strokeLinecap="round"
          />

          {/* Progress */}
          <AnimatedPath
            d={path}
            stroke={color}
            strokeWidth={progressStrokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={arcLength}
            strokeDashoffset={strokeDashoffset}
            strokeOpacity={opacity}
          />
        </Svg>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  iconButton: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 100,
  },
  label: {
    marginTop: 11,
    color: "#CCCCCC",
    fontSize: 14,
    fontFamily: "OpenSans",
  },
  value: {
    marginTop: 2,
    fontSize: 32,
    fontWeight: "regular",
    fontFamily: "InstrumentSerif-Regular",
    color: "white",
  },
});
