import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { OutdoorTheme } from "../../constants/theme";
import { NationalParkBadgeIllustration } from "./OutdoorIllustrations";

type BrandBadgeProps = {
  size?: number;
  variant?: "default" | "inverse";
  style?: StyleProp<ViewStyle>;
};

type BrandHeaderMarkProps = BrandBadgeProps & {
  showTagline?: boolean;
};

export function BrandBadge({
  size = 52,
  variant = "default",
  style,
}: BrandBadgeProps) {
  const isInverse = variant === "inverse";
  const colors = OutdoorTheme.colors;

  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
          backgroundColor: isInverse ? "rgba(255,249,239,0.14)" : colors.forestTint,
          borderColor: isInverse ? "rgba(255,249,239,0.18)" : colors.line,
        },
        style,
      ]}
    >
      <NationalParkBadgeIllustration
        size={Math.round(size * 0.78)}
        variant={isInverse ? "forest" : "light"}
        opacity={0.98}
      />
    </View>
  );
}

export function BrandHeaderMark({
  size = 58,
  variant = "default",
  showTagline = true,
  style,
}: BrandHeaderMarkProps) {
  const isInverse = variant === "inverse";
  const colors = OutdoorTheme.colors;

  return (
    <View style={[styles.headerMark, style]}>
      <BrandBadge size={size} variant={variant} />
      <View style={styles.wordmark}>
        <Text style={[styles.word, { color: isInverse ? colors.paper : colors.forest }]}>STEP</Text>
        <Text style={[styles.word, { color: isInverse ? colors.paper : colors.forest }]}>OUTSIDE</Text>
        {showTagline ? (
          <Text style={[styles.tagline, { color: isInverse ? colors.gold : colors.sage }]}>
            DISCOVER. RESET. LIVE.
          </Text>
        ) : null}
      </View>
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
  headerMark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  wordmark: {
    minWidth: 0,
  },
  word: {
    fontSize: 17,
    lineHeight: 17,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  tagline: {
    marginTop: 5,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
});
