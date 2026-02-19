import { Link } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function ModalScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Step Outside</Text>
      <Text style={styles.sub}>No additional actions here right now.</Text>
      <Link href="/(tabs)" style={styles.link}>
        Back to home
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#F8F4EE",
  },
  title: { fontSize: 24, fontWeight: "900", color: "#0B0F0E" },
  sub: { marginTop: 10, color: "rgba(11,15,14,0.64)", fontWeight: "700" },
  link: {
    marginTop: 15,
    paddingVertical: 15,
    color: "#255E36",
    fontWeight: "800",
  },
});
