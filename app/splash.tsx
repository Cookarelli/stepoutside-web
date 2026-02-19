import { useRouter } from "expo-router";
import React, { useEffect, useMemo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { hasCompletedOnboarding } from "../src/lib/onboarding";

const QUOTES = [
  "You’re exactly where you should be.",
  "Ten minutes is enough.",
  "Motion changes the mind.",
  "Go outside. Everything else can wait.",
  "This counts.",
  "You showed up.",
  "No rush. Just walk.",
  "Fresh air first.",
  "Progress doesn’t announce itself.",
  "Start where you are.",
];

function getRandomQuote(): string {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

export default function SplashScreen() {
  const router = useRouter();
  const quote = useMemo(() => getRandomQuote(), []);

  useEffect(() => {
    let alive = true;

    const t = setTimeout(() => {
      void (async () => {
        const completed = await hasCompletedOnboarding();
        if (!alive) return;
        router.replace(completed ? "/(tabs)" : "/(onboarding)/welcome-1");
      })();
    }, 2500); // 2–3 seconds hold

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [router]);

  return (
    <View style={styles.container}>
      <Image source={require("../assets/images/icon.png")} style={styles.logo} />
      <Text style={styles.quote}>{quote}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F4EE",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 26,
  },
  logo: { width: 96, height: 96, borderRadius: 24, marginBottom: 18 },
  quote: {
    color: "rgba(11,15,14,0.86)",
    fontSize: 20,
    lineHeight: 28,
    textAlign: "center",
    fontWeight: "800",
  },
});