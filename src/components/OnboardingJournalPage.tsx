import React from "react";
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { OutdoorTheme } from "../../constants/theme";
import {
  CampfireIllustration,
  LeavesIllustration,
  MorningFogIllustration,
  MountainLayersIllustration,
  PaperTextureIllustration,
  PineForestIllustration,
  StarsIllustration,
  SunriseGlowIllustration,
  TrailIllustration,
} from "./OutdoorIllustrations";
import { LayeredEnvironment } from "./OutdoorUI";

type OnboardingTone = "dawn" | "trail" | "ember" | "together" | "campfire";

type OnboardingJournalPageProps = {
  eyebrow: string;
  title: string;
  body: string;
  reflection: string;
  step: 1 | 2 | 3 | 4;
  tone: OnboardingTone;
  primaryLabel: string;
  onPrimaryPress: () => void;
  onBackPress?: () => void;
  onSkipPress?: () => void;
};

function toneLabel(tone: OnboardingTone): string {
  if (tone === "trail") return "quiet trail";
  if (tone === "ember") return "keep the fire";
  if (tone === "together") return "shared trail";
  if (tone === "campfire") return "campfire";
  return "morning field";
}

function JournalLandscape({ tone }: { tone: OnboardingTone }) {
  const isCampfire = tone === "campfire";
  const isEmber = tone === "ember";
  const isTogether = tone === "together";
  const isTrail = tone === "trail";
  const showTrail = tone !== "campfire" && tone !== "ember";
  const sun = React.useRef(new Animated.Value(0)).current;
  const fog = React.useRef(new Animated.Value(0)).current;
  const fire = React.useRef(new Animated.Value(0)).current;
  const embers = React.useRef(new Animated.Value(0)).current;
  const leaves = React.useRef(new Animated.Value(0)).current;
  const trees = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const sunLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sun, {
          toValue: 1,
          duration: 9000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(sun, {
          toValue: 0,
          duration: 10000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    const fogLoop = Animated.loop(
      Animated.timing(fog, {
        toValue: 1,
        duration: 32000,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    const fireLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(fire, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(fire, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    const emberLoop = Animated.loop(
      Animated.timing(embers, {
        toValue: 1,
        duration: 9000,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    const leavesLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(1800),
        Animated.timing(leaves, {
          toValue: 1,
          duration: 12000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    const treeLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(trees, {
          toValue: 1,
          duration: 9000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(trees, {
          toValue: 0,
          duration: 9600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    if (!isCampfire) {
      sunLoop.start();
    }
    fogLoop.start();
    if (isCampfire || isEmber) {
      fireLoop.start();
    }
    if (isEmber) {
      emberLoop.start();
    }
    if (isTogether) {
      leavesLoop.start();
      treeLoop.start();
    }

    return () => {
      sunLoop.stop();
      fogLoop.stop();
      fireLoop.stop();
      emberLoop.stop();
      leavesLoop.stop();
      treeLoop.stop();
    };
  }, [embers, fire, fog, isCampfire, isEmber, isTogether, leaves, sun, trees]);

  return (
    <View pointerEvents="none" style={styles.landscape}>
      <Svg width="100%" height="100%" viewBox="0 0 340 210" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={`onboardingSky-${tone}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={isCampfire ? "#0D2D20" : "#FFF9EF"} />
            <Stop offset="0.48" stopColor={isCampfire ? "#18442F" : "#F7F4EC"} />
            <Stop offset="1" stopColor={isCampfire ? "#123C2A" : "#EBD8B9"} />
          </LinearGradient>
          <LinearGradient id={`onboardingGlow-${tone}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#D9842F" stopOpacity={isCampfire ? "0.28" : "0.34"} />
            <Stop offset="0.6" stopColor="#C69B42" stopOpacity="0.16" />
            <Stop offset="1" stopColor="#FFF9EF" stopOpacity="0" />
          </LinearGradient>
        </Defs>

        <Rect width="340" height="210" rx="28" fill={`url(#onboardingSky-${tone})`} />
        <Circle cx={isTrail ? "72" : "258"} cy={isCampfire ? "70" : "56"} r="78" fill={`url(#onboardingGlow-${tone})`} />
        {!isCampfire ? <Circle cx={isTrail ? "72" : "258"} cy="56" r="22" fill="#D9842F" opacity="0.18" /> : null}

        <Path d="M-12 136 L48 80 L94 118 L140 62 L210 132 L258 88 L352 136 V210 H-12Z" fill="#A9A69A" opacity={isCampfire ? 0.18 : 0.26} />
        <Path d="M-18 156 L54 112 L116 148 L180 96 L246 156 L306 116 L358 154 V210 H-18Z" fill="#4B6B52" opacity={isCampfire ? 0.3 : 0.22} />
        <Path d="M-8 175 C60 158 112 184 176 168 C238 154 284 172 348 158 V210 H-8Z" fill="#18442F" opacity={isCampfire ? 0.72 : 0.2} />

        {showTrail ? (
          <Path d="M32 194 C76 162 110 176 142 140 C170 108 214 118 282 74" stroke="#C69B42" strokeWidth="7" strokeLinecap="round" fill="none" opacity={isTrail ? "0.58" : "0.44"} />
        ) : null}

        {isTogether ? (
          <>
            <Path d="M76 190 C118 158 142 164 176 132 C210 100 238 102 292 66" stroke="#FFF9EF" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.42" />
            <Path d="M152 153 C148 144 152 136 161 136 C169 136 173 144 170 153 L166 174 H154Z" fill="#18442F" />
            <Circle cx="162" cy="130" r="6" fill="#1E2A24" />
            <Path d="M169 143 C178 143 185 139 190 132" stroke="#1E2A24" strokeWidth="3" strokeLinecap="round" fill="none" />
            <Path d="M158 174 L150 192 M164 174 L171 192" stroke="#1E2A24" strokeWidth="4" strokeLinecap="round" />
            <Path d="M196 151 C192 142 196 134 205 134 C213 134 217 142 214 151 L210 173 H198Z" fill="#4B6B52" />
            <Circle cx="206" cy="128" r="6" fill="#1E2A24" />
            <Path d="M202 140 C194 139 188 135 183 128" stroke="#1E2A24" strokeWidth="3" strokeLinecap="round" fill="none" />
            <Path d="M202 173 L194 191 M209 173 L216 191" stroke="#1E2A24" strokeWidth="4" strokeLinecap="round" />
            <Path d="M210 126 C214 128 217 129 221 128" stroke="#FFF9EF" strokeWidth="2" strokeLinecap="round" opacity="0.75" />
          </>
        ) : null}

        {isCampfire ? (
          <>
            <Path d="M28 192 C78 164 116 178 156 146 C196 114 240 118 310 84" stroke="#C69B42" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.28" />
            <Circle cx="174" cy="154" r="42" fill="#D9842F" opacity="0.16" />
            <Circle cx="112" cy="150" r="18" fill="#D9842F" opacity="0.12" />
            <Path d="M106 128 C106 118 118 118 118 128" stroke="#0D2D20" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.86" />
            <Rect x="106" y="128" width="12" height="26" rx="5" fill="#18442F" opacity="0.92" />
            <Circle cx="112" cy="142" r="6" fill="#D9842F" opacity="0.72" />
            <Path d="M154 178 L198 188" stroke="#0D2D20" strokeWidth="9" strokeLinecap="round" />
            <Path d="M202 178 L158 188" stroke="#0D2D20" strokeWidth="9" strokeLinecap="round" />
            <Path d="M178 116 C194 136 196 158 181 174 C164 168 160 144 178 116Z" fill="#D9842F" opacity="0.92" />
            <Path d="M180 139 C188 151 187 166 178 174 C168 165 170 151 180 139Z" fill="#C69B42" />
          </>
        ) : null}

        {isEmber ? (
          <>
            <Circle cx="170" cy="174" r="52" fill="#D9842F" opacity="0.13" />
            <Circle cx="134" cy="190" r="7" fill="#A9A69A" opacity="0.8" />
            <Circle cx="150" cy="182" r="6" fill="#DAD8CF" opacity="0.9" />
            <Circle cx="170" cy="180" r="7" fill="#A9A69A" opacity="0.82" />
            <Circle cx="190" cy="183" r="6" fill="#DAD8CF" opacity="0.9" />
            <Circle cx="206" cy="191" r="7" fill="#A9A69A" opacity="0.8" />
          </>
        ) : null}
      </Svg>

      {!isCampfire ? (
        <Animated.View
          style={[
            styles.landscapeSunGlow,
            {
              opacity: sun.interpolate({
                inputRange: [0, 1],
                outputRange: [0.38, 0.58],
              }),
              transform: [
                {
                  scale: sun.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.99, 1.015],
                  }),
                },
              ],
            },
          ]}
        >
          <SunriseGlowIllustration size={156} opacity={0.24} />
        </Animated.View>
      ) : null}

      {isEmber || isCampfire ? (
        <>
          <Animated.View
            style={[
              isCampfire ? styles.landscapeFireGlow : styles.landscapeFire,
              {
                opacity: fire.interpolate({
                  inputRange: [0, 1],
                  outputRange: isCampfire ? [0.16, 0.26] : [0.92, 1],
                }),
                transform: [
                  {
                    scale: fire.interpolate({
                      inputRange: [0, 1],
                      outputRange: isCampfire ? [0.99, 1.035] : [0.992, 1.012],
                    }),
                  },
                ],
              },
            ]}
          >
            {isCampfire ? (
              <Svg width="138" height="138" viewBox="0 0 138 138">
                <Circle cx="69" cy="69" r="54" fill="#D9842F" opacity="0.28" />
                <Circle cx="69" cy="69" r="28" fill="#C69B42" opacity="0.18" />
              </Svg>
            ) : (
              <CampfireIllustration size={96} opacity={0.95} />
            )}
          </Animated.View>
          {isEmber ? (
            <Animated.View
              style={[
                styles.landscapeEmbers,
                {
                  opacity: embers.interpolate({
                    inputRange: [0, 0.2, 0.8, 1],
                    outputRange: [0, 0.26, 0.26, 0],
                  }),
                  transform: [
                    {
                      translateY: embers.interpolate({
                        inputRange: [0, 1],
                        outputRange: [8, -24],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Svg width="120" height="120" viewBox="0 0 120 120">
                <Circle cx="32" cy="86" r="2.5" fill="#D9842F" opacity="0.75" />
                <Circle cx="56" cy="64" r="2" fill="#C69B42" opacity="0.78" />
                <Circle cx="78" cy="92" r="2.4" fill="#D9842F" opacity="0.7" />
                <Circle cx="92" cy="54" r="1.8" fill="#C69B42" opacity="0.68" />
              </Svg>
            </Animated.View>
          ) : null}
        </>
      ) : null}

      <Animated.View
        style={[
          styles.landscapePinesLeft,
          {
            transform: [
              {
                rotate: trees.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["-0.18deg", "0.18deg"],
                }),
              },
            ],
          },
        ]}
      >
        <PineForestIllustration
          width={176}
          height={100}
          opacity={isCampfire ? 0.1 : isTogether ? 0.12 : 0.075}
          variant={isCampfire ? "forest" : "light"}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.landscapePines,
          {
            transform: [
              {
                rotate: trees.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0.18deg", "-0.18deg"],
                }),
              },
            ],
          },
        ]}
      >
        <PineForestIllustration
          width={210}
          height={116}
          opacity={isCampfire ? 0.16 : isTogether ? 0.14 : 0.1}
          variant={isCampfire ? "forest" : "light"}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.landscapeFog,
          {
            transform: [
              {
                translateX: fog.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-8, 8],
                }),
              },
            ],
          },
        ]}
      >
        <MorningFogIllustration
          width={230}
          height={82}
          opacity={isCampfire ? 0.22 : 0.42}
          variant={isCampfire ? "forest" : "light"}
        />
      </Animated.View>
      {isCampfire ? (
        <Animated.View
          style={[
            styles.landscapeStars,
            {
              opacity: fire.interpolate({
                inputRange: [0, 1],
                outputRange: [0.12, 0.22],
              }),
            },
          ]}
        >
          <StarsIllustration width={130} height={86} variant="forest" />
        </Animated.View>
      ) : null}
      {isTogether ? (
        <Animated.View
          style={[
            styles.landscapeLeaves,
            {
              opacity: leaves.interpolate({
                inputRange: [0, 0.16, 0.84, 1],
                outputRange: [0, 0.12, 0.12, 0],
              }),
              transform: [
                {
                  translateX: leaves.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-12, 18],
                  }),
                },
                {
                  translateY: leaves.interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, -14],
                  }),
                },
                {
                  rotate: leaves.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["-3deg", "4deg"],
                  }),
                },
              ],
            },
          ]}
        >
          <LeavesIllustration size={92} opacity={1} />
        </Animated.View>
      ) : null}
    </View>
  );
}

export function OnboardingJournalPage({
  eyebrow,
  title,
  body,
  reflection,
  step,
  tone,
  primaryLabel,
  onPrimaryPress,
  onBackPress,
  onSkipPress,
}: OnboardingJournalPageProps) {
  const progress = React.useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();
  const iconSize = width >= 768 ? 48 : width <= 375 ? 36 : 42;

  React.useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <LayeredEnvironment intensity="quiet" variant={tone === "campfire" ? "forest" : "morning"} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View
          style={[
            styles.page,
            {
              opacity: progress,
              transform: [
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <PaperTextureIllustration width={270} height={170} opacity={0.2} style={styles.paperTop} />
          <PaperTextureIllustration width={260} height={160} opacity={0.16} style={styles.paperBottom} />

          <View style={styles.header}>
            <View style={styles.appIconSlot}>
              <Image
                source={require("../../assets/images/icon.png")}
                resizeMode="contain"
                style={[styles.appIcon, { width: iconSize, height: iconSize, borderRadius: iconSize * 0.22 }]}
              />
            </View>
            {tone === "ember" ? null : <Text style={styles.folio}>Page {step}</Text>}
          </View>

          <JournalLandscape tone={tone} />

          <View style={styles.copy}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.body}>{body}</Text>
          </View>

          <View style={styles.reflectionCard}>
            {tone === "campfire" || tone === "ember" ? (
              <CampfireIllustration size={58} opacity={0.2} style={styles.reflectionArt} />
            ) : tone === "together" ? (
              <LeavesIllustration size={62} opacity={0.14} style={styles.reflectionArt} />
            ) : tone === "trail" ? (
              <TrailIllustration width={96} height={66} opacity={0.16} style={styles.reflectionArt} />
            ) : (
              <MountainLayersIllustration width={104} height={66} opacity={0.14} style={styles.reflectionArt} />
            )}
            <Text style={styles.reflectionLabel}>{toneLabel(tone)}</Text>
            <Text style={styles.reflection}>{reflection}</Text>
          </View>

          {tone === "ember" ? null : (
            <View style={styles.dots} accessibilityLabel={`Onboarding step ${step} of 4`}>
              {[1, 2, 3, 4].map((item) => (
                <View key={item} style={[styles.dot, item === step ? styles.dotActive : null]} />
              ))}
            </View>
          )}

          <View style={styles.actions}>
            {onBackPress || onSkipPress ? (
              <View style={styles.secondaryActions}>
                {onBackPress ? (
                  <Pressable onPress={onBackPress} style={({ pressed }) => [styles.secondaryButton, pressed ? styles.pressed : null]}>
                    <Text style={styles.secondaryText}>Back</Text>
                  </Pressable>
                ) : (
                  <View style={styles.secondaryButtonPlaceholder} />
                )}
                {onSkipPress ? (
                  <Pressable onPress={onSkipPress} style={({ pressed }) => [styles.secondaryButton, pressed ? styles.pressed : null]}>
                <Text style={styles.skipText}>Skip</Text>
              </Pressable>
                ) : null}
              </View>
            ) : null}
            <Pressable onPress={onPrimaryPress} style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null]}>
              <Text style={styles.primaryText}>{primaryLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  page: {
    width: "100%",
    maxWidth: 580,
    alignSelf: "center",
    minHeight: 650,
    borderRadius: OutdoorTheme.radii.xxl,
    backgroundColor: "rgba(255,249,239,0.9)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.12)",
    padding: 20,
    overflow: "hidden",
    ...OutdoorTheme.shadows.card,
  },
  paperTop: {
    position: "absolute",
    right: -54,
    top: -20,
  },
  paperBottom: {
    position: "absolute",
    left: -62,
    bottom: 40,
  },
  header: {
    position: "relative",
    zIndex: 2,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    minHeight: 54,
  },
  appIconSlot: {
    width: 54,
    height: 54,
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  appIcon: {
    backgroundColor: OutdoorTheme.colors.cream,
  },
  folio: {
    color: OutdoorTheme.colors.goldText,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  landscape: {
    marginTop: 22,
    height: 210,
    borderRadius: OutdoorTheme.radii.xxl,
    overflow: "hidden",
    backgroundColor: OutdoorTheme.colors.cream,
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.10)",
  },
  landscapeSunGlow: {
    position: "absolute",
    right: 12,
    top: -18,
  },
  landscapePinesLeft: {
    position: "absolute",
    left: -58,
    bottom: -24,
  },
  landscapePines: {
    position: "absolute",
    right: -18,
    bottom: -22,
  },
  landscapeFog: {
    position: "absolute",
    left: 8,
    bottom: 48,
  },
  landscapeFire: {
    position: "absolute",
    left: "50%",
    bottom: 14,
    marginLeft: -48,
  },
  landscapeFireGlow: {
    position: "absolute",
    left: "50%",
    bottom: 46,
    marginLeft: -69,
  },
  landscapeEmbers: {
    position: "absolute",
    left: "50%",
    bottom: 58,
    marginLeft: -60,
  },
  landscapeStars: {
    position: "absolute",
    right: 16,
    top: 8,
  },
  landscapeLeaves: {
    position: "absolute",
    left: 42,
    top: 42,
  },
  copy: {
    marginTop: 32,
    maxWidth: 460,
  },
  eyebrow: {
    color: OutdoorTheme.colors.goldText,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 14,
    color: OutdoorTheme.colors.charcoal,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    fontSize: 42,
    lineHeight: 50,
    fontWeight: "700",
    letterSpacing: 0,
  },
  body: {
    marginTop: 18,
    color: "rgba(30,42,36,0.72)",
    fontSize: 16,
    lineHeight: 26,
    fontWeight: "700",
  },
  reflectionCard: {
    marginTop: 28,
    minHeight: 112,
    borderRadius: OutdoorTheme.radii.xl,
    backgroundColor: "rgba(24,68,47,0.08)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.12)",
    padding: 16,
    overflow: "hidden",
  },
  reflectionArt: {
    position: "absolute",
    right: 10,
    top: 10,
  },
  reflectionLabel: {
    color: OutdoorTheme.colors.goldText,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  reflection: {
    marginTop: 10,
    maxWidth: 340,
    color: OutdoorTheme.colors.charcoal,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    fontSize: 23,
    lineHeight: 31,
    fontWeight: "700",
  },
  dots: {
    marginTop: 28,
    flexDirection: "row",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: OutdoorTheme.radii.pill,
    backgroundColor: "rgba(30,42,36,0.2)",
  },
  dotActive: {
    width: 24,
    backgroundColor: OutdoorTheme.colors.forest,
  },
  actions: {
    marginTop: 30,
    gap: 12,
  },
  secondaryActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  secondaryButton: {
    minHeight: 56,
    borderRadius: OutdoorTheme.radii.pill,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  secondaryButtonPlaceholder: {
    minHeight: 56,
    minWidth: 56,
  },
  skipText: {
    color: "rgba(30,42,36,0.62)",
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryText: {
    color: "rgba(30,42,36,0.68)",
    fontSize: 15,
    fontWeight: "900",
  },
  primaryButton: {
    minHeight: 58,
    borderRadius: OutdoorTheme.radii.pill,
    backgroundColor: OutdoorTheme.colors.forest,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 28,
    width: "100%",
    ...OutdoorTheme.shadows.button,
  },
  primaryText: {
    color: OutdoorTheme.colors.paper,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.992 }],
  },
});
