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

export default function Welcome1() {
  const router = useRouter();

  const skip = async () => {
    await completeOnboarding();
    router.replace("/(tabs)");
  };

  return (
    <SafeAreaView style={styles.container}>
      <Image source={require("../../assets/images/icon.png")} style={styles.bgLogo} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text style={styles.eyebrow}>STEP OUTSIDE</Text>
          <Text style={styles.title}>Build a simple daily outdoor habit.</Text>
          <Text style={styles.body}>
            StepOutside helps you show up every day with small, doable walks that add up.
          </Text>
          <Text style={styles.support}>Three quick screens. Then you can start your first walk.</Text>

          <View style={styles.dots}>
            <View style={[styles.dot, styles.dotActive]} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
          <Text style={styles.stepLabel}>1 of 3</Text>

          <View style={styles.row}>
            <Pressable onPress={skip} style={styles.ghostBtn}>
              <Text style={styles.ghostText}>Skip</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/(onboarding)/welcome-2")} style={styles.primaryBtn}>
              <Text style={styles.primaryText}>Next</Text>
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
  row: {
    marginTop: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  ghostBtn: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  ghostText: {
    color: "rgba(11,15,14,0.66)",
    fontWeight: "800",
    fontSize: 16,
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
