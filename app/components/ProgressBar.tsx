import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function SemiCircleProgress({ 
  percentage = 40, 
  radius = 171, 
  strokeWidth = 1, 
  color = "tomato" 
}) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const halfCircle = radius + strokeWidth;
  const circleCircumference = 2 * Math.PI * radius;
  
  // Arc configuration: -18 degrees start, -40% sweep (144 degrees), 100% ratio
  const startAngle = -18; // Starting angle in degrees
  const sweepRatio = 0.40; // 40% of the circle (sweep)
  
  // Calculate the arc length (40% of circumference)
  const arcLength = circleCircumference * sweepRatio;
  
  // Calculate starting offset: -18 degrees from top (0 degrees)
  // Convert degrees to offset: (angle / 360) * circumference
  const startOffset = (Math.abs(startAngle) / 360) * circleCircumference;
  
  // Grey track offset: show the full 40% arc starting at -18 degrees
  // We want to show arcLength starting from startOffset position
  const greyTrackOffset = circleCircumference - startOffset - arcLength;
  
  // Progress offset: animate from 0% to 100% of the arc
  const progressOffset = animatedValue.interpolate({
    inputRange: [0, 100],
    outputRange: [
      circleCircumference - startOffset, // At 0%: hide everything (start at -18, show 0%)
      circleCircumference - startOffset - arcLength // At 100%: show full arc (start at -18, show 40%)
    ],
  });

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: percentage,
      duration: 1000,
      useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();
  }, [percentage]);

  return (
    <View style={{ width: radius * 2, height: radius + strokeWidth, overflow: 'hidden', alignSelf: 'center', paddingHorizontal: 8, }}>
      <Svg
        height={radius * 2 + strokeWidth * 2}
        width={radius * 2 + strokeWidth * 2}
        viewBox={`0 0 ${halfCircle * 2} ${halfCircle * 2}`}
      >
        <G rotation={startAngle} origin={`${halfCircle}, ${halfCircle}`}>
          {/* Background Grey Track */}
          <Circle
            cx="50%"
            cy="50%"
            r={radius}
            stroke="#E5E5E5"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="transparent"
            strokeDasharray={circleCircumference}
            strokeDashoffset={greyTrackOffset}
            strokeOpacity={1.0}
          />
          
          {/* Colored Progress Line */}
          <AnimatedCircle
            cx="50%"
            cy="50%"
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="transparent"
            strokeDasharray={circleCircumference}
            strokeDashoffset={progressOffset}
          />
        </G>
      </Svg>
    </View>
  );
}