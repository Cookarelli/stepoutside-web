import { useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Image source={require("../assets/images/icon.png")} style={styles.logo} />
      <Text style={styles.title}>Step Outside</Text>
      <Text style={styles.sub}>V2 foundation</Text>

      <Pressable
        onPress={() => router.push("/start")}
        style={({ pressed }) => [styles.btn, pressed ? { opacity: 0.9 } : null]}
      >
        <Text style={styles.btnText}>ENTER</Text>
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
  logo: { width: 96, height: 96, borderRadius: 24, marginBottom: 14 },
  title: { fontSize: 30, fontWeight: "900", color: "#0B0F0E" },
  sub: { marginTop: 6, fontSize: 14, fontWeight: "700", color: "rgba(11,15,14,0.65)" },
  btn: {
    marginTop: 22,
    backgroundColor: "#255E36",
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 16,
  },
  btnText: { color: "white", fontWeight: "900", letterSpacing: 1 },
});