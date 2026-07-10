import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { BrandHeaderMark } from "../src/components/BrandBadge";
import { LayeredEnvironment } from "../src/components/OutdoorUI";
import { getInitialAppRoute } from "../src/lib/authFlow";
import { refreshScheduledReminders } from "../src/lib/notifications";

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
  const logoScale = useRef(new Animated.Value(0.82)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const quoteOpacity = useRef(new Animated.Value(0)).current;
  const quoteShift = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    let alive = true;

    void refreshScheduledReminders();

    Animated.parallel([
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 920,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 560,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(quoteOpacity, {
        toValue: 1,
        duration: 520,
        delay: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(quoteShift, {
        toValue: 0,
        duration: 520,
        delay: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const t = setTimeout(() => {
      void (async () => {
        const nextRoute = await getInitialAppRoute();
        if (!alive) return;
        router.replace(nextRoute as never);
      })();
    }, 2500); // 2–3 seconds hold

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [logoOpacity, logoScale, quoteOpacity, quoteShift, router]);

  return (
    <View style={styles.container}>
      <LayeredEnvironment intensity="quiet" />
      <View style={styles.glowOne} />
      <View style={styles.glowTwo} />

      <Animated.View
        style={[
          styles.logoShell,
          {
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          },
        ]}
      >
        <View style={styles.logoHalo} />
        <BrandHeaderMark size={92} showTagline style={styles.logoMark} />
      </Animated.View>

      <Animated.Text
        style={[
          styles.quote,
          {
            opacity: quoteOpacity,
            transform: [{ translateY: quoteShift }],
          },
        ]}
      >
        {quote}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 26,
    overflow: "hidden",
  },
  glowOne: {
    position: "absolute",
    top: "17%",
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: "rgba(24,68,47,0.08)",
  },
  glowTwo: {
    position: "absolute",
    bottom: "20%",
    left: -54,
    width: 160,
    height: 160,
    borderRadius: 999,
    backgroundColor: "rgba(198,155,66,0.10)",
  },
  logoShell: {
    width: 248,
    height: 248,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 26,
  },
  logoHalo: {
    position: "absolute",
    width: 210,
    height: 210,
    borderRadius: 999,
    backgroundColor: "rgba(255,249,239,0.64)",
  },
  logoMark: {
    transform: [{ scale: 1.18 }],
  },
  quote: {
    color: "rgba(30,42,36,0.86)",
    fontSize: 22,
    lineHeight: 30,
    textAlign: "center",
    fontWeight: "800",
    maxWidth: 310,
  },
});
