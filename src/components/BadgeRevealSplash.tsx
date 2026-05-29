import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getBadgeArtSourceForBadge } from "../lib/challenges/badgeArt";
import type { BadgeDefinition } from "../lib/challenges/types";
import { PREMIUM, alpha } from "../lib/premiumTheme";

type BadgeRevealSplashProps = {
  badge: BadgeDefinition | null;
  queuePosition?: number;
  queueTotal?: number;
  onContinue: () => void;
};

export function BadgeRevealSplash({ badge, queuePosition = 1, queueTotal = 1, onContinue }: BadgeRevealSplashProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.35)).current;
  const rotation = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.4)).current;

  const source: ImageSourcePropType | null = useMemo(
    () => (badge ? getBadgeArtSourceForBadge(badge) : null),
    [badge]
  );

  useEffect(() => {
    if (!badge) return;

    opacity.setValue(0);
    scale.setValue(0.35);
    rotation.setValue(0);
    glow.setValue(0.4);

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const intro = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(rotation, {
        toValue: 1,
        duration: 920,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1.04,
        speed: 10,
        bounciness: 4,
        useNativeDriver: true,
      }),
      Animated.timing(glow, {
        toValue: 1,
        duration: 640,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    const settle = Animated.spring(scale, {
      toValue: 1,
      speed: 10,
      bounciness: 5,
      useNativeDriver: true,
    });

    Animated.sequence([intro, settle]).start(({ finished }) => {
      if (finished) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
    });
  }, [badge, glow, opacity, rotation, scale]);

  if (!badge || !source) return null;

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "540deg"],
  });

  const glowScale = glow.interpolate({
    inputRange: [0.4, 1],
    outputRange: [0.88, 1.16],
  });

  const glowOpacity = glow.interpolate({
    inputRange: [0.4, 1],
    outputRange: [0.24, 0.54],
  });

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.overlay}>
          <Animated.View
            style={[
              styles.glow,
              badge.accent === "sunrise" ? styles.glowSunrise : styles.glowForest,
              { opacity: glowOpacity, transform: [{ scale: glowScale }] },
            ]}
          />

          <Animated.View
            style={[
              styles.card,
              {
                opacity,
                transform: [{ scale }, { rotate }],
              },
            ]}
          >
            <Text style={styles.eyebrow}>Badge unlocked</Text>
            <Text style={styles.title}>{badge.title}</Text>
            <View style={styles.artPlate}>
              <Animated.Image source={source} resizeMode="contain" style={styles.art} />
            </View>
            <Text style={styles.body}>{badge.description}</Text>
            {queueTotal > 1 ? (
              <Text style={styles.queueLabel}>
                Badge {queuePosition} of {queueTotal}
              </Text>
            ) : null}
          </Animated.View>

          <Pressable style={styles.cta} onPress={onContinue}>
            <Text style={styles.ctaText}>{queuePosition < queueTotal ? "NEXT BADGE" : "CONTINUE"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "rgba(11,15,14,0.74)",
  },
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 22,
    backgroundColor: "rgba(11,15,14,0.74)",
  },
  glow: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 999,
  },
  glowForest: {
    backgroundColor: alpha(PREMIUM.colors.forest, 0.72),
  },
  glowSunrise: {
    backgroundColor: alpha(PREMIUM.colors.gold, 0.7),
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 34,
    backgroundColor: PREMIUM.colors.cream,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: "center",
    gap: 12,
    shadowColor: PREMIUM.colors.forestDeep,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  eyebrow: {
    color: PREMIUM.colors.textMuted,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  title: {
    color: PREMIUM.colors.text,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "700",
    textAlign: "center",
    fontFamily: PREMIUM.type.serifFamily,
  },
  artPlate: {
    width: "100%",
    minHeight: 240,
    borderRadius: 26,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: alpha(PREMIUM.colors.forestSoft, 0.08),
  },
  art: {
    width: "100%",
    height: 220,
  },
  body: {
    color: PREMIUM.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    textAlign: "center",
  },
  queueLabel: {
    color: alpha(PREMIUM.colors.text, 0.56),
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  cta: {
    minWidth: 220,
    borderRadius: 999,
    backgroundColor: PREMIUM.colors.forest,
    paddingVertical: 15,
    paddingHorizontal: 26,
    alignItems: "center",
  },
  ctaText: {
    color: PREMIUM.colors.offWhite,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
  },
});
