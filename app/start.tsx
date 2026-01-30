import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function StartScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Start</Text>
      <Text style={styles.sub}>10 minutes is enough.</Text>

      <Pressable
        onPress={() => router.push("/walk")}
        style={({ pressed }) => [styles.btn, pressed ? { opacity: 0.9 } : null]}
      >
        <Text style={styles.btnText}>START WALK</Text>
      </Pressable>
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
  title: { fontSize: 28, fontWeight: "900", color: "#0B0F0E" },
  sub: { marginTop: 10, fontSize: 14, fontWeight: "700", color: "rgba(11,15,14,0.65)" },
  btn: {
    marginTop: 22,
    backgroundColor: "#F2B541",
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 16,
  },
  btnText: { color: "#0B0F0E", fontWeight: "900", letterSpacing: 1 },
});