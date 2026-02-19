import { useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { completeOnboarding } from "../../src/lib/onboarding";

const BRAND = {
  forest: "#255E36",
  sunrise: "#F2B541",
  bone: "#F8F4EE",
  charcoal: "#0B0F0E",
} as const;

export default function Welcome3() {
  const router = useRouter();

  const finish = async () => {
    await completeOnboarding();
    router.replace("/(tabs)");
  };

  return (
    <View style={styles.container}>
      <Image source={require("../../assets/images/icon.png")} style={styles.bgLogo} />
      <View style={styles.content}>
        <Text style={styles.eyebrow}>HOW TO USE IT</Text>
        <Text style={styles.title}>Start. Walk. Track your streak.</Text>
        <Text style={styles.body}>
          Tap Start, complete your walk, and StepOutside logs your progress so you can build momentum day by day.
        </Text>

        <View style={styles.dots}>
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={[styles.dot, styles.dotActive]} />
        </View>

        <View style={styles.rowSingle}>
          <Pressable onPress={finish} style={styles.primaryBtn}>
            <Text style={styles.primaryText}>Get Started</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.bone,
    paddingHorizontal: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    width: "100%",
    maxWidth: 560,
  },
  bgLogo: {
    position: "absolute",
    width: 351,
    height: 351,
    top: -20,
    alignSelf: "center",
    opacity: 0.35,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
    color: BRAND.forest,
  },
  title: {
    marginTop: 14,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "900",
    color: BRAND.charcoal,
  },
  body: {
    marginTop: 14,
    fontSize: 17,
    lineHeight: 25,
    color: "rgba(11,15,14,0.72)",
    fontWeight: "600",
  },
  dots: {
    marginTop: 34,
    flexDirection: "row",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(11,15,14,0.20)",
  },
  dotActive: {
    width: 20,
    backgroundColor: BRAND.forest,
  },
  rowSingle: {
    marginTop: 28,
    alignItems: "flex-start",
  },
  primaryBtn: {
    backgroundColor: BRAND.forest,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  primaryText: {
    color: "white",
    fontWeight: "900",
    fontSize: 16,
  },
});
