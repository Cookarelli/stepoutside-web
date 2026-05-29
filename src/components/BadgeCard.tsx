import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { getBadgeArtSourceForBadge } from "../lib/challenges/badgeArt";
import type { BadgeUnlockState } from "../lib/challenges/types";
import { PREMIUM, alpha } from "../lib/premiumTheme";

type BadgeCardProps = {
  state: BadgeUnlockState;
};

export function BadgeCard({ state }: BadgeCardProps) {
  const warm = state.badge.accent === "sunrise";
  const earned = state.earned;
  const backgroundColor = earned
    ? warm
      ? PREMIUM.colors.gold
      : PREMIUM.colors.forest
    : PREMIUM.colors.creamSoft;
  const borderColor = earned ? "transparent" : PREMIUM.colors.line;
  const titleColor = earned ? (warm ? PREMIUM.colors.ink : PREMIUM.colors.offWhite) : PREMIUM.colors.text;
  const bodyColor = earned
    ? warm
      ? alpha(PREMIUM.colors.ink, 0.78)
      : alpha(PREMIUM.colors.offWhite, 0.78)
    : PREMIUM.colors.textMuted;
  const artPlateColor = earned
    ? warm
      ? alpha(PREMIUM.colors.offWhite, 0.16)
      : alpha(PREMIUM.colors.offWhite, 0.10)
    : alpha(PREMIUM.colors.forestSoft, 0.08);
  const metaText = earned ? `Earned${state.earnedAtLabel ? ` • ${state.earnedAtLabel}` : ""}` : state.progressHint;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor,
          borderColor,
          shadowColor: earned ? (warm ? PREMIUM.colors.goldDeep : PREMIUM.colors.forestDeep) : PREMIUM.colors.forestDeep,
          shadowOpacity: earned ? 0.12 : 0.04,
        },
      ]}
    >
      <View style={[styles.artWrap, { backgroundColor: artPlateColor }]}>
        <Image source={getBadgeArtSourceForBadge(state.badge)} resizeMode="contain" style={styles.art} />
      </View>
      <Text style={[styles.title, { color: titleColor }]}>{state.badge.title}</Text>
      <Text style={[styles.body, { color: bodyColor }]}>{state.badge.description}</Text>
      <Text style={[styles.meta, { color: titleColor }]}>{metaText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexBasis: "48%",
    flexGrow: 1,
    minWidth: 156,
    borderRadius: 28,
    borderWidth: 1,
    padding: 18,
    gap: 10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  artWrap: {
    width: "100%",
    minHeight: 110,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  art: {
    width: "100%",
    height: 94,
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22,
    fontFamily: PREMIUM.type.serifFamily,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  meta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
  },
});
