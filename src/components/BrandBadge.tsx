import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { PREMIUM, alpha } from "../lib/premiumTheme";

type BrandBadgeProps = {
  size?: number;
  variant?: "default" | "inverse";
  style?: StyleProp<ViewStyle>;
};

export function BrandBadge({
  size = 52,
  variant = "default",
  style,
}: BrandBadgeProps) {
  const isInverse = variant === "inverse";

  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.34),
          backgroundColor: isInverse ? alpha(PREMIUM.colors.offWhite, 0.14) : alpha(PREMIUM.colors.forest, 0.10),
          borderColor: isInverse ? alpha(PREMIUM.colors.offWhite, 0.18) : alpha(PREMIUM.colors.forest, 0.14),
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.mark,
          {
            fontSize: Math.max(12, Math.round(size * 0.3)),
            color: isInverse ? PREMIUM.colors.offWhite : PREMIUM.colors.forest,
            letterSpacing: Math.max(0.4, size * 0.03),
          },
        ]}
      >
        SO
      </Text>
      <View
        style={[
          styles.dot,
          {
            backgroundColor: isInverse ? alpha(PREMIUM.colors.offWhite, 0.8) : alpha(PREMIUM.colors.forest, 0.65),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
  },
  mark: {
    fontWeight: "900",
    lineHeight: 24,
    fontFamily: PREMIUM.type.serifFamily,
  },
  dot: {
    position: "absolute",
    bottom: 10,
    width: 6,
    height: 6,
    borderRadius: 999,
  },
});
