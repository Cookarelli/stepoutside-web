import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { getBadgeArtSourceForBadge } from "../lib/challenges/badgeArt";
import type { NextUpMilestone } from "../lib/challenges/nextUp";
import { PREMIUM, alpha } from "../lib/premiumTheme";

type NextUpCardProps = {
  nextUp: NextUpMilestone;
  compact?: boolean;
};

export function NextUpCard({ nextUp, compact = false }: NextUpCardProps) {
  return (
    <View style={[styles.card, compact ? styles.cardCompact : null]}>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>Next up</Text>
        <Text style={[styles.title, compact ? styles.titleCompact : null]}>{nextUp.badge.title}</Text>
        <Text style={[styles.body, compact ? styles.bodyCompact : null]}>{nextUp.encouragement}</Text>
        <Text style={[styles.meta, compact ? styles.metaCompact : null]}>{nextUp.supportingLabel}</Text>
      </View>

      <View style={[styles.artWrap, compact ? styles.artWrapCompact : null]}>
        <View style={styles.artGlow} />
        <Image source={getBadgeArtSourceForBadge(nextUp.badge)} resizeMode="contain" style={[styles.art, compact ? styles.artCompact : null]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: PREMIUM.spacing.md,
    borderRadius: PREMIUM.radius.lg,
    padding: PREMIUM.spacing.lg,
    backgroundColor: alpha(PREMIUM.colors.offWhite, 0.12),
    borderWidth: 1,
    borderColor: alpha(PREMIUM.colors.offWhite, 0.14),
  },
  cardCompact: {
    width: "100%",
    backgroundColor: alpha(PREMIUM.colors.forest, 0.04),
    borderColor: PREMIUM.colors.line,
    padding: PREMIUM.spacing.md,
  },
  copy: {
    flex: 1,
    gap: 6,
  },
  eyebrow: {
    color: PREMIUM.colors.gold,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: {
    color: PREMIUM.colors.offWhite,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "700",
    fontFamily: PREMIUM.type.serifFamily,
  },
  titleCompact: {
    color: PREMIUM.colors.text,
    fontSize: 20,
    lineHeight: 24,
  },
  body: {
    color: alpha(PREMIUM.colors.offWhite, 0.78),
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  meta: {
    color: PREMIUM.colors.offWhite,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },
  bodyCompact: {
    color: PREMIUM.colors.textMuted,
  },
  metaCompact: {
    color: PREMIUM.colors.text,
  },
  artWrap: {
    width: 92,
    height: 92,
    alignItems: "center",
    justifyContent: "center",
  },
  artWrapCompact: {
    width: 82,
    height: 82,
  },
  artGlow: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: alpha(PREMIUM.colors.gold, 0.16),
  },
  art: {
    width: 90,
    height: 90,
  },
  artCompact: {
    width: 78,
    height: 78,
  },
});
