import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

const PRIVACY_URL = "https://stepoutside.app/privacy-policy";
const TERMS_URL = "https://stepoutside.app/terms";

export default function ExploreScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Privacy & Terms</Text>
      <Text style={styles.body}>
        Step Outside is local-first. Walk sessions, streaks, reflections, and reminder preferences are stored on-device.
        Location is used while tracking a walk, showing nearby reset routes, and supporting local Golden Hour timing.
      </Text>

      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            void Linking.openURL(PRIVACY_URL);
          }}
          style={({ pressed }) => [styles.button, pressed ? { opacity: 0.9 } : null]}
        >
          <Text style={styles.buttonText}>OPEN PRIVACY POLICY</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            void Linking.openURL(TERMS_URL);
          }}
          style={({ pressed }) => [styles.secondaryButton, pressed ? { opacity: 0.9 } : null]}
        >
          <Text style={styles.secondaryButtonText}>OPEN TERMS</Text>
        </Pressable>
      </View>

      <Text style={styles.caption}>Use your live stepoutside.app privacy and terms pages here before submission.</Text>
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
  actions: {
    marginTop: 4,
    alignItems: "center",
    gap: 10,
  },
  secondaryButton: {
    alignSelf: "center",
    backgroundColor: "rgba(11,15,14,0.06)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.1)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  secondaryButtonText: { color: "#0B0F0E", fontWeight: "900", letterSpacing: 0.4 },
  caption: {
    marginTop: 12,
    textAlign: "center",
    color: "rgba(11,15,14,0.55)",
    fontSize: 12,
    fontWeight: "700",
  },
});
