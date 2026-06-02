import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NextUpCard } from "./NextUpCard";
import { StepButton } from "./StepButton";
import { getBadgeArtSourceForBadge } from "../lib/challenges/badgeArt";
import type { NextUpMilestone } from "../lib/challenges/nextUp";
import type { BadgeDefinition } from "../lib/challenges/types";
import { PREMIUM, alpha } from "../lib/premiumTheme";

type BadgeRevealSplashProps = {
  badge: BadgeDefinition | null;
  nextUp?: NextUpMilestone | null;
  queuePosition?: number;
  queueTotal?: number;
  onContinue: () => void;
};

export function BadgeRevealSplash({
  badge,
  nextUp = null,
  queuePosition = 1,
  queueTotal = 1,
  onContinue,
}: BadgeRevealSplashProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;
  const translateY = useRef(new Animated.Value(18)).current;
  const glow = useRef(new Animated.Value(0.24)).current;

  const source: ImageSourcePropType | null = useMemo(
    () => (badge ? getBadgeArtSourceForBadge(badge) : null),
    [badge]
  );

  useEffect(() => {
    if (!badge) return;

    opacity.setValue(0);
    scale.setValue(0.85);
    translateY.setValue(18);
    glow.setValue(0.24);

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const intro = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        damping: 12,
        stiffness: 150,
        mass: 0.9,
        useNativeDriver: true,
      }),
      Animated.timing(glow, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    const settle = Animated.spring(glow, {
      toValue: 0.9,
      damping: 14,
      stiffness: 130,
      mass: 1,
      useNativeDriver: true,
    });

    Animated.sequence([intro, settle]).start(({ finished }) => {
      if (finished) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
    });
  }, [badge, glow, opacity, scale, translateY]);

  if (!badge || !source) return null;

  const glowScale = glow.interpolate({
    inputRange: [0.24, 1],
    outputRange: [0.88, 1.12],
  });

  const glowOpacity = glow.interpolate({
    inputRange: [0.24, 1],
    outputRange: [0.2, 0.44],
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
                transform: [{ translateY }, { scale }],
              },
            ]}
          >
            <Text style={styles.eyebrow}>Badge unlocked</Text>
            <Text style={styles.title}>{badge.title} earned</Text>
            <Text style={styles.body}>You showed up. That counts.</Text>
            <View style={styles.artStage}>
              <Animated.View
                style={[
                  styles.innerGlow,
                  badge.accent === "sunrise" ? styles.innerGlowSunrise : styles.innerGlowForest,
                  { opacity: glowOpacity, transform: [{ scale: glowScale }] },
                ]}
              />
              <Animated.Image source={source} resizeMode="contain" style={styles.art} />
            </View>
            {nextUp ? <NextUpCard nextUp={nextUp} compact /> : null}
            {queueTotal > 1 ? (
              <Text style={styles.queueLabel}>
                Badge {queuePosition} of {queueTotal}
              </Text>
            ) : null}
          </Animated.View>

          <StepButton
            label={queuePosition < queueTotal ? "SEE NEXT UNLOCK" : "KEEP GOING"}
            onPress={onContinue}
            fullWidth
            style={styles.cta}
          />
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
    gap: 18,
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
  artStage: {
    width: "100%",
    minHeight: 212,
    alignItems: "center",
    justifyContent: "center",
  },
  innerGlow: {
    position: "absolute",
    width: 184,
    height: 184,
    borderRadius: 999,
  },
  innerGlowForest: {
    backgroundColor: alpha(PREMIUM.colors.gold, 0.16),
  },
  innerGlowSunrise: {
    backgroundColor: alpha(PREMIUM.colors.gold, 0.24),
  },
  art: {
    width: 230,
    height: 230,
    backgroundColor: "transparent",
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
    maxWidth: 320,
  },
});
