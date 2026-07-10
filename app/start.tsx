import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { OutdoorTheme } from "../constants/theme";
import { BrandHeaderMark } from "../src/components/BrandBadge";
import { LayeredEnvironment, PremiumHero } from "../src/components/OutdoorUI";
import { hasActiveWalkSnapshot } from "../src/lib/activeWalk";

export default function StartScreen() {
  const router = useRouter();

  useEffect(() => {
    let alive = true;

    void (async () => {
      const hasActiveWalk = await hasActiveWalkSnapshot();
      if (alive && hasActiveWalk) {
        router.replace("/walk");
      }
    })();

    return () => {
      alive = false;
    };
  }, [router]);

  return (
    <View style={styles.container}>
      <LayeredEnvironment />
      <PremiumHero
        style={styles.content}
        topSlot={<BrandHeaderMark size={58} showTagline style={styles.brand} />}
        eyebrow="Step Outside"
        title="Start"
        subtitle="10 minutes is enough."
      >
        <Pressable
          onPress={() => router.push("/walk")}
          style={({ pressed }) => [styles.btn, pressed ? { opacity: 0.9 } : null]}
        >
          <Text style={styles.btnText}>START WALK</Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace("/(tabs)")}
          style={({ pressed }) => [styles.btnAlt, pressed ? { opacity: 0.9 } : null]}
        >
          <Text style={styles.btnAltText}>BACK TO HOME</Text>
        </Pressable>
      </PremiumHero>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    overflow: "hidden",
  },
  content: {
    width: "100%",
    maxWidth: 560,
    minHeight: 390,
  },
  brand: {
    alignSelf: "center",
  },
  title: { fontSize: 28, fontWeight: "900", color: OutdoorTheme.colors.charcoal },
  sub: { marginTop: 10, fontSize: 14, fontWeight: "700", color: "rgba(30,42,36,0.65)" },
  btn: {
    marginTop: 22,
    backgroundColor: OutdoorTheme.colors.forest,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 16,
  },
  btnText: { color: "white", fontWeight: "900", letterSpacing: 1 },
  btnAlt: {
    marginTop: 10,
    backgroundColor: "rgba(30,42,36,0.08)",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(30,42,36,0.12)",
  },
  btnAltText: { color: OutdoorTheme.colors.forest, fontWeight: "900", letterSpacing: 0.8 },
});
