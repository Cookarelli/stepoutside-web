import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

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
      <View style={styles.content}>
        <Text style={styles.title}>Start</Text>
        <Text style={styles.sub}>10 minutes is enough.</Text>

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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F4EE",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  content: {
    width: "100%",
    maxWidth: 560,
    alignItems: "center",
  },
  title: { fontSize: 28, fontWeight: "900", color: "#0B0F0E" },
  sub: { marginTop: 10, fontSize: 14, fontWeight: "700", color: "rgba(11,15,14,0.65)" },
  btn: {
    marginTop: 22,
    backgroundColor: "#255E36",
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 16,
  },
  btnText: { color: "white", fontWeight: "900", letterSpacing: 1 },
  btnAlt: {
    marginTop: 10,
    backgroundColor: "rgba(11,15,14,0.08)",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.12)",
  },
  btnAltText: { color: "rgba(11,15,14,0.72)", fontWeight: "900", letterSpacing: 0.8 },
});
