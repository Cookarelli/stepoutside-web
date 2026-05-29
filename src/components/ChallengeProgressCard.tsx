import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ChallengeDefinition, LocalChallengeProgress } from "../lib/challenges/types";
import { PREMIUM, alpha } from "../lib/premiumTheme";

type ChallengeProgressCardProps = {
  challenge: ChallengeDefinition;
  progress: LocalChallengeProgress;
  onPress?: () => void;
};

export function ChallengeProgressCard({ challenge, progress, onPress }: ChallengeProgressCardProps) {
  const warm = challenge.highlight === "sunrise";
  const cardStyle = warm ? styles.sunriseCard : styles.forestCard;
  const textColor = warm ? PREMIUM.colors.ink : PREMIUM.colors.offWhite;
  const subColor = warm ? alpha(PREMIUM.colors.ink, 0.72) : alpha(PREMIUM.colors.offWhite, 0.78);
  const barFill = warm ? PREMIUM.colors.forest : PREMIUM.colors.gold;
  const eyebrowLabel =
    challenge.type === "streak"
      ? "Streak"
      : challenge.type === "completion_percentage"
        ? "Consistency"
        : challenge.type === "time_of_day"
          ? "Golden Hour"
          : "Milestone";

  return (
    <Pressable
      style={[
        styles.card,
        cardStyle,
        progress.status === "completed" ? styles.cardComplete : null,
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.eyebrow, { color: subColor }]}>{eyebrowLabel}</Text>
        <Text style={[styles.status, { color: textColor }]}>{progress.status === "completed" ? "Complete" : `${progress.percentComplete}%`}</Text>
      </View>
      <Text style={[styles.title, { color: textColor }]}>{challenge.title}</Text>
      <Text style={[styles.body, { color: subColor }]}>{challenge.description}</Text>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.max(8, progress.percentComplete)}%`, backgroundColor: barFill }]} />
      </View>

      <Text style={[styles.label, { color: textColor }]}>{progress.supportingLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: PREMIUM.radius.xl,
    padding: PREMIUM.spacing.xl,
    gap: PREMIUM.spacing.sm,
    borderWidth: 1,
    shadowColor: PREMIUM.colors.forestDeep,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  forestCard: {
    backgroundColor: PREMIUM.colors.forest,
    borderColor: alpha(PREMIUM.colors.offWhite, 0.08),
  },
  sunriseCard: {
    backgroundColor: PREMIUM.colors.gold,
    borderColor: alpha(PREMIUM.colors.ink, 0.08),
  },
  cardComplete: {
    shadowOpacity: 0.16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eyebrow: {
    fontSize: 11,
    textTransform: "uppercase",
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  status: {
    fontSize: 13,
    fontWeight: "800",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 32,
    fontFamily: PREMIUM.type.serifFamily,
  },
  body: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
  },
  progressTrack: {
    height: 12,
    backgroundColor: alpha(PREMIUM.colors.offWhite, 0.18),
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  label: {
    fontSize: 14,
    fontWeight: "800",
  },
});
