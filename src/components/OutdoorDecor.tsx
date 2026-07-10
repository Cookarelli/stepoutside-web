import React from "react";
import { Animated, Easing, StyleProp, View, ViewStyle } from "react-native";

import {
  CampfireIllustration,
  PineForestIllustration,
  PineTreeIllustration,
  SunsetStreaksIllustration,
} from "./OutdoorIllustrations";

type DecorProps = {
  style?: StyleProp<ViewStyle>;
  color?: string;
  opacity?: number;
  size?: number;
};

export const PineSilhouette = React.memo(function PineSilhouette({
  style,
  opacity = 0.12,
  size = 78,
}: DecorProps) {
  return <PineTreeIllustration size={size} opacity={opacity} style={style} />;
});

export const PineCluster = React.memo(function PineCluster({ style, opacity = 0.11 }: Pick<DecorProps, "style" | "opacity">) {
  return (
    <View pointerEvents="none" style={style}>
      <PineForestIllustration width={132} height={96} opacity={opacity} />
    </View>
  );
});

export const CampfireGlyph = React.memo(function CampfireGlyph({ style, size = 42, opacity = 1 }: DecorProps) {
  const flicker = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(flicker, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(flicker, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [flicker]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        style,
        {
          opacity: flicker.interpolate({
            inputRange: [0, 1],
            outputRange: [opacity * 0.9, opacity],
          }),
          transform: [
            {
              scale: flicker.interpolate({
                inputRange: [0, 1],
                outputRange: [0.995, 1.01],
              }),
            },
          ],
        },
      ]}
    >
      <CampfireIllustration size={size} />
    </Animated.View>
  );
});

export const SunsetStreaks = React.memo(function SunsetStreaks({ style, opacity = 1 }: Pick<DecorProps, "style" | "opacity">) {
  return <SunsetStreaksIllustration width={132} height={30} opacity={opacity} style={style} />;
});
