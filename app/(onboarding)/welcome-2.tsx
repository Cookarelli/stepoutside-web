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

export default function Welcome2() {
  const router = useRouter();

  const skip = async () => {
    await completeOnboarding();
    router.replace("/(tabs)");
  };

  return (
    <View style={styles.container}>
      <Image source={require("../../assets/images/icon.png")} style={styles.bgLogo} />
      <View style={styles.content}>
        <Text style={styles.eyebrow}>WHY IT WORKS</Text>
        <Text style={styles.title}>Small walks create real momentum.</Text>
        <Text style={styles.body}>
          Keep your streak alive, stack quick wins, and make consistency feel natural—not overwhelming.
        </Text>

        <View style={styles.dots}>
          <View style={styles.dot} />
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
        </View>

        <View style={styles.row}>
          <Pressable onPress={skip} style={styles.ghostBtn}>
            <Text style={styles.ghostText}>Skip</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/(onboarding)/welcome-3")} style={styles.primaryBtn}>
            <Text style={styles.primaryText}>Next</Text>
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
  row: {
    marginTop: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  ghostBtn: {
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  ghostText: {
    color: "rgba(11,15,14,0.66)",
    fontWeight: "800",
    fontSize: 16,
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
