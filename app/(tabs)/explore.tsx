import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

const PRIVACY_URL = "https://stepoutside.app/privacy-policy";

export default function ExploreScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Privacy & Data</Text>
      <Text style={styles.body}>
        Step Outside stores your walk sessions on-device. Location is used only while you are actively tracking a walk.
      </Text>

      <Pressable
        onPress={() => {
          void Linking.openURL(PRIVACY_URL);
        }}
        style={({ pressed }) => [styles.button, pressed ? { opacity: 0.9 } : null]}
      >
        <Text style={styles.buttonText}>OPEN PRIVACY POLICY</Text>
      </Pressable>

      <Text style={styles.caption}>Replace the URL with your published privacy policy before submission.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F4EE",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  title: { fontSize: 28, fontWeight: "900", color: "#0B0F0E", textAlign: "center" },
  body: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    color: "rgba(11,15,14,0.74)",
    textAlign: "center",
  },
  button: {
    marginTop: 20,
    alignSelf: "center",
    backgroundColor: "#255E36",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  buttonText: { color: "white", fontWeight: "900", letterSpacing: 0.6 },
  caption: {
    marginTop: 12,
    textAlign: "center",
    color: "rgba(11,15,14,0.55)",
    fontSize: 12,
    fontWeight: "700",
  },
});
