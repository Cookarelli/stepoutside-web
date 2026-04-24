import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

const BRAND = {
  forest: "#255E36",
  bone: "#F8F4EE",
  charcoal: "#0B0F0E",
} as const;

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
  const fontSize = Math.max(12, Math.round(size * 0.34));

  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.3),
          backgroundColor: isInverse ? "rgba(248,244,238,0.14)" : "rgba(37,94,54,0.10)",
          borderColor: isInverse ? "rgba(248,244,238,0.16)" : "rgba(37,94,54,0.14)",
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.mark,
          {
            fontSize,
            color: isInverse ? BRAND.bone : BRAND.forest,
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
            backgroundColor: isInverse ? "rgba(248,244,238,0.78)" : "rgba(37,94,54,0.62)",
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
  },
  dot: {
    position: "absolute",
    bottom: 10,
    width: 6,
    height: 6,
    borderRadius: 999,
  },
});
