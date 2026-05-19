import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { usePremiumAccess } from "../../hooks/use-premium-access";

type PremiumFeatureGateProps = {
  children: React.ReactNode;
  title?: string;
  body?: string;
  ctaLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function PremiumFeatureGate({
  children,
  title = "Premium feature",
  body = "Unlock Premium to access this feature.",
  ctaLabel = "Unlock Premium",
  style,
}: PremiumFeatureGateProps) {
  const router = useRouter();
  const { isPremium, isLoading } = usePremiumAccess();

  if (isLoading) {
    return (
      <View style={[styles.stateCard, style]}>
        <ActivityIndicator color="#255E36" />
        <Text style={styles.stateText}>Checking Premium access…</Text>
      </View>
    );
  }

  if (isPremium) {
    return <>{children}</>;
  }

  return (
    <View style={[styles.lockedCard, style]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <Pressable style={styles.button} onPress={() => router.push("/pro")}>
        <Text style={styles.buttonText}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

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
    borderRadius: 16,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.48)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.10)",
  },
  title: {
    color: "#0B0F0E",
    fontWeight: "900",
    fontSize: 16,
  },
  body: {
    marginTop: 8,
    color: "rgba(11,15,14,0.66)",
    fontWeight: "700",
    lineHeight: 20,
  },
  button: {
    marginTop: 14,
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#255E36",
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
});
