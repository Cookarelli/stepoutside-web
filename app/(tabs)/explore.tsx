import React from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { LayeredEnvironment, PremiumHero } from "../../src/components/OutdoorUI";

const PRIVACY_URL = "https://stepoutside.app/privacy-policy";
const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

async function openExternal(url: string, label: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Link unavailable", `We couldn't open the ${label} right now.`);
  }
}

export default function ExploreScreen() {
  return (
    <View style={styles.container}>
      <LayeredEnvironment />
      <PremiumHero
        style={styles.hero}
        eyebrow="Step Outside"
        title="Privacy & Terms"
        subtitle="Step Outside is local-first. Walk sessions, streaks, reflections, and reminder preferences are stored on-device. Location is used while tracking a walk, showing nearby reset routes, and supporting local Golden Hour timing."
      >

        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              void openExternal(PRIVACY_URL, "Privacy Policy");
            }}
            style={({ pressed }) => [styles.button, pressed ? { opacity: 0.9 } : null]}
          >
            <Text style={styles.buttonText}>OPEN PRIVACY POLICY</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              void openExternal(TERMS_URL, "Terms of Use");
            }}
            style={({ pressed }) => [styles.secondaryButton, pressed ? { opacity: 0.9 } : null]}
          >
            <Text style={styles.secondaryButtonText}>OPEN TERMS</Text>
          </Pressable>
        </View>

        <Text style={styles.caption}>These live links match the paywall language Apple reviews for subscriptions.</Text>
      </PremiumHero>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  hero: {
    minHeight: 440,
  },
  title: { fontSize: 28, fontWeight: "900", color: "#1E2A24", textAlign: "center" },
  body: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    color: "rgba(30,42,36,0.74)",
    textAlign: "center",
  },
  button: {
    marginTop: 20,
    alignSelf: "center",
    backgroundColor: "#18442F",
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
    backgroundColor: "rgba(30,42,36,0.06)",
    borderWidth: 1,
    borderColor: "rgba(30,42,36,0.1)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  secondaryButtonText: { color: "#1E2A24", fontWeight: "900", letterSpacing: 0.4 },
  caption: {
    marginTop: 12,
    textAlign: "center",
    color: "rgba(30,42,36,0.55)",
    fontSize: 12,
    fontWeight: "700",
  },
});
