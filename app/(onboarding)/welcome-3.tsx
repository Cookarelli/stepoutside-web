import { useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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
    <SafeAreaView style={styles.container}>
      <Image source={require("../../assets/images/icon.png")} style={styles.bgLogo} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text style={styles.eyebrow}>HOW TO USE IT</Text>
          <Text style={styles.title}>Start. Walk. Track your streak.</Text>
          <Text style={styles.body}>
            Tap Start, complete your walk, and StepOutside logs your progress so you can build momentum day by day.
          </Text>
          <Text style={styles.support}>If location is off, the app can still track your time and let you finish safely.</Text>

          <View style={styles.dots}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={[styles.dot, styles.dotActive]} />
          </View>
          <Text style={styles.stepLabel}>3 of 3</Text>

          <View style={styles.rowSingle}>
            <Pressable onPress={finish} style={styles.primaryBtn}>
              <Text style={styles.primaryText}>Get Started</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.bone,
    paddingHorizontal: 24,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 28,
  },
  content: {
    width: "100%",
    maxWidth: 560,
  },
  bgLogo: {
    position: "absolute",
    width: 260,
    height: 260,
    top: 28,
    alignSelf: "center",
    opacity: 0.22,
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
  support: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(11,15,14,0.58)",
    fontWeight: "700",
  },
  dots: {
    marginTop: 34,
    flexDirection: "row",
    gap: 8,
  },
  stepLabel: {
    marginTop: 10,
    color: "rgba(11,15,14,0.52)",
    fontSize: 12,
    fontWeight: "800",
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
    alignItems: "stretch",
  },
  primaryBtn: {
    backgroundColor: BRAND.forest,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    justifyContent: "center",
  },
  primaryText: {
    color: "white",
    fontWeight: "900",
    fontSize: 16,
  },
});
