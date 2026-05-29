import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { usePremiumAccess } from "../../hooks/use-premium-access";
import { PREMIUM, alpha } from "../lib/premiumTheme";

type PremiumFeatureGateProps = {
  children: React.ReactNode;
  title?: string;
  body?: string;
  ctaLabel?: string;
  style?: StyleProp<ViewStyle>;
  tone?: "default" | "forest";
};

export function PremiumFeatureGate({
  children,
  title = "Premium feature",
  body = "Unlock Premium to access this feature.",
  ctaLabel = "Unlock Premium",
  style,
  tone = "default",
}: PremiumFeatureGateProps) {
  const router = useRouter();
  const { isPremium, isLoading } = usePremiumAccess();
  const palette = tone === "forest" ? forestPalette : defaultPalette;

  if (isLoading) {
    return (
      <View style={[styles.stateCard, style]}>
        <ActivityIndicator color={palette.spinner} />
        <Text style={[styles.stateText, { color: palette.stateText }]}>Checking Premium access…</Text>
      </View>
    );
  }

  if (isPremium) {
    return <>{children}</>;
  }

  return (
    <View
      style={[
        styles.lockedCard,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
        },
        style,
      ]}
    >
      <Text style={[styles.eyebrow, { color: palette.eyebrow }]}>Premium feature</Text>
      <Text style={[styles.title, { color: palette.title }]}>{title}</Text>
      <Text style={[styles.body, { color: palette.body }]}>{body}</Text>
      <Pressable style={[styles.button, { backgroundColor: palette.buttonBg }]} onPress={() => router.push("/pro")}>
        <Text style={[styles.buttonText, { color: palette.buttonText }]}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

const defaultPalette = {
  spinner: PREMIUM.colors.forest,
  stateText: PREMIUM.colors.textMuted,
  background: alpha(PREMIUM.colors.creamSoft, 0.78),
  border: PREMIUM.colors.line,
  eyebrow: PREMIUM.colors.forest,
  title: PREMIUM.colors.text,
  body: PREMIUM.colors.textMuted,
  buttonBg: PREMIUM.colors.forest,
  buttonText: PREMIUM.colors.offWhite,
} as const;

const forestPalette = {
  spinner: PREMIUM.colors.gold,
  stateText: alpha(PREMIUM.colors.offWhite, 0.72),
  background: alpha(PREMIUM.colors.offWhite, 0.08),
  border: alpha(PREMIUM.colors.offWhite, 0.14),
  eyebrow: PREMIUM.colors.gold,
  title: PREMIUM.colors.offWhite,
  body: alpha(PREMIUM.colors.offWhite, 0.76),
  buttonBg: PREMIUM.colors.gold,
  buttonText: PREMIUM.colors.ink,
} as const;

const styles = StyleSheet.create({
  stateCard: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  stateText: {
    color: "rgba(11,15,14,0.62)",
    fontWeight: "700",
  },
  lockedCard: {
    marginTop: 12,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    shadowColor: PREMIUM.colors.forestDeep,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 8,
    fontWeight: "700",
    fontSize: 22,
    lineHeight: 26,
    fontFamily: PREMIUM.type.serifFamily,
  },
  body: {
    marginTop: 8,
    fontWeight: "600",
    lineHeight: 21,
    fontSize: 14,
  },
  button: {
    marginTop: 14,
    alignSelf: "flex-start",
    minHeight: 48,
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  buttonText: {
    fontWeight: "900",
    letterSpacing: 0.4,
  },
});
