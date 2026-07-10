import React from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

import { OutdoorTheme } from "../../constants/theme";
import { CampfireGlyph, PineCluster } from "./OutdoorDecor";
import {
  BootPrintsIllustration,
  CampfireIllustration,
  CompassIllustration,
  LakeReflectionIllustration,
  LeavesIllustration,
  MapIllustration,
  MorningFogIllustration,
  MoonIllustration,
  MountainLayersIllustration,
  NationalParkBadgeIllustration,
  PaperTextureIllustration,
  PineForestIllustration,
  StarsIllustration,
  SunriseGlowIllustration,
  TrailIllustration,
} from "./OutdoorIllustrations";

type CardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  withPines?: boolean;
  withCampfire?: boolean;
};

type PrimitiveCardProps = CardProps & {
  artOpacity?: number;
};

type ButtonProps = PressableProps & {
  children?: React.ReactNode;
  label?: string;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  inverse?: boolean;
  style?: StyleProp<ViewStyle>;
};

type StatCardProps = {
  label: string;
  value: React.ReactNode;
  meta?: string;
  variant?: "light" | "forest";
  style?: StyleProp<ViewStyle>;
};

type CampfireBadgeProps = {
  label?: string;
  variant?: "light" | "forest";
  style?: StyleProp<ViewStyle>;
};

type PineBackgroundProps = {
  variant?: "light" | "forest";
  opacity?: number;
  style?: StyleProp<ViewStyle>;
};

type EmptyStateCardProps = {
  title: string;
  body?: string;
  children?: React.ReactNode;
  actionLabel?: string;
  onActionPress?: () => void;
  actionDisabled?: boolean;
  icon?: React.ReactNode;
  illustration?: "trail" | "campsite" | "bootprints" | "mountain" | "map" | "lake";
  style?: StyleProp<ViewStyle>;
};

type PremiumHeroProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  topSlot?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  variant?: "light" | "forest";
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

type LayeredEnvironmentProps = {
  variant?: "morning" | "forest";
  intensity?: "quiet" | "standard";
  style?: StyleProp<ViewStyle>;
};

function FadeUpView({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const progress = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 820,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [6, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function PineBackground({ variant = "light", opacity, style }: PineBackgroundProps) {
  return (
    <View pointerEvents="none" style={[styles.pineBackground, style]}>
      <PineCluster
        opacity={opacity ?? (variant === "forest" ? 0.13 : 0.08)}
        style={styles.pineBackgroundCluster}
      />
    </View>
  );
}

export const LayeredEnvironment = React.memo(function LayeredEnvironment({ variant = "morning", intensity = "standard", style }: LayeredEnvironmentProps) {
  const isForest = variant === "forest";
  const quiet = intensity === "quiet";
  const sun = React.useRef(new Animated.Value(0)).current;
  const fog = React.useRef(new Animated.Value(0)).current;
  const leaves = React.useRef(new Animated.Value(0)).current;
  const stars = React.useRef(new Animated.Value(0)).current;

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
    const leavesLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(4000),
        Animated.timing(leaves, {
          toValue: 1,
          duration: 18000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    const starsLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(stars, {
          toValue: 1,
          duration: 5000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(stars, {
          toValue: 0,
          duration: 6200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    sunLoop.start();
    fogLoop.start();
    leavesLoop.start();
    if (isForest) {
      starsLoop.start();
    }

    return () => {
      sunLoop.stop();
      fogLoop.stop();
      leavesLoop.stop();
      starsLoop.stop();
    };
  }, [fog, isForest, leaves, stars, sun]);

  return (
    <View pointerEvents="none" style={[styles.layeredEnvironment, isForest ? styles.layeredEnvironmentForest : null, style]}>
      <Animated.View
        style={[
          styles.environmentGlow,
          {
            opacity: sun.interpolate({
              inputRange: [0, 1],
              outputRange: [quiet ? 0.78 : 0.86, quiet ? 0.94 : 0.98],
            }),
            transform: [
              {
                scale: sun.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.995, 1.015],
                }),
              },
            ],
          },
        ]}
      >
        <SunriseGlowIllustration
          size={260}
          opacity={quiet ? 0.12 : 0.18}
          variant={isForest ? "forest" : "light"}
        />
      </Animated.View>
      <PaperTextureIllustration
        width={320}
        height={210}
        opacity={quiet ? 0.12 : 0.2}
        variant={isForest ? "forest" : "light"}
        style={styles.environmentPaper}
      />
      <MountainLayersIllustration
        width={330}
        height={210}
        opacity={quiet ? 0.06 : 0.09}
        variant={isForest ? "forest" : "light"}
        style={styles.environmentMountains}
      />
      <Animated.View
        style={[
          styles.environmentMist,
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
          width={320}
          height={120}
          opacity={quiet ? 0.22 : 0.34}
          variant={isForest ? "forest" : "light"}
        />
      </Animated.View>
      <PineForestIllustration
        width={330}
        height={166}
        opacity={quiet ? 0.05 : 0.08}
        variant={isForest ? "forest" : "light"}
        style={styles.environmentTrees}
      />
      <Animated.View
        style={[
          styles.environmentLeaves,
          {
            opacity: leaves.interpolate({
              inputRange: [0, 0.18, 0.82, 1],
              outputRange: [0, quiet ? 0.08 : 0.12, quiet ? 0.08 : 0.12, 0],
            }),
            transform: [
              {
                translateX: leaves.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-14, 18],
                }),
              },
              {
                translateY: leaves.interpolate({
                  inputRange: [0, 1],
                  outputRange: [8, -12],
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
        <LeavesIllustration size={92} opacity={1} variant={isForest ? "forest" : "light"} />
      </Animated.View>
      {isForest ? (
        <Animated.View
          style={[
            styles.environmentStars,
            {
              opacity: stars.interpolate({
                inputRange: [0, 1],
                outputRange: [0.12, 0.22],
              }),
            },
          ]}
        >
          <StarsIllustration width={160} height={120} variant="forest" />
        </Animated.View>
      ) : null}
    </View>
  );
});

export function BrandCard({ children, style, contentStyle, withPines, withCampfire }: CardProps) {
  return (
    <FadeUpView style={[styles.brandCard, style]}>
      {withPines ? <PineBackground /> : null}
      {withCampfire ? <CampfireGlyph size={52} opacity={0.14} style={styles.cardFire} /> : null}
      <View style={contentStyle}>{children}</View>
    </FadeUpView>
  );
}

export function ForestCard({ children, style, contentStyle, withPines = true, withCampfire }: CardProps) {
  return (
    <FadeUpView style={[styles.forestCard, style]}>
      {withPines ? <PineBackground variant="forest" style={styles.forestPines} /> : null}
      {withCampfire ? <CampfireGlyph size={64} opacity={0.24} style={styles.forestFire} /> : null}
      <View style={contentStyle}>{children}</View>
    </FadeUpView>
  );
}

function PrimitiveCard({
  children,
  style,
  contentStyle,
  surfaceStyle,
  art,
  accent,
}: CardProps & {
  surfaceStyle?: StyleProp<ViewStyle>;
  art?: React.ReactNode;
  accent?: React.ReactNode;
}) {
  return (
    <FadeUpView style={[styles.primitiveCard, surfaceStyle, style]}>
      {art ? <View pointerEvents="none" style={styles.primitiveArt}>{art}</View> : null}
      {accent ? <View pointerEvents="none" style={styles.primitiveAccent}>{accent}</View> : null}
      <View style={[styles.primitiveContent, contentStyle]}>{children}</View>
    </FadeUpView>
  );
}

export function CampfireCard({ children, style, contentStyle, artOpacity = 0.16 }: PrimitiveCardProps) {
  return (
    <PrimitiveCard
      style={style}
      contentStyle={contentStyle}
      surfaceStyle={styles.campfireCard}
      art={<CampfireIllustration size={104} opacity={artOpacity} />}
      accent={<SunriseGlowIllustration size={150} opacity={0.16} />}
    >
      {children}
    </PrimitiveCard>
  );
}

export function TrailCard({ children, style, contentStyle, artOpacity = 0.16 }: PrimitiveCardProps) {
  return (
    <PrimitiveCard
      style={style}
      contentStyle={contentStyle}
      surfaceStyle={styles.trailCard}
      art={<TrailIllustration width={156} height={112} opacity={artOpacity} />}
    >
      {children}
    </PrimitiveCard>
  );
}

export function AdventureCard({ children, style, contentStyle, artOpacity = 0.18 }: PrimitiveCardProps) {
  return (
    <PrimitiveCard
      style={style}
      contentStyle={contentStyle}
      surfaceStyle={styles.adventureCard}
      art={<MountainLayersIllustration width={170} height={108} variant="forest" opacity={artOpacity} />}
    >
      {children}
    </PrimitiveCard>
  );
}

export function WeatherCard({ children, style, contentStyle, artOpacity = 0.18 }: PrimitiveCardProps) {
  return (
    <PrimitiveCard
      style={style}
      contentStyle={contentStyle}
      surfaceStyle={styles.weatherCard}
      art={<SunriseGlowIllustration size={124} opacity={artOpacity} />}
    >
      {children}
    </PrimitiveCard>
  );
}

export function JourneyCard({ children, style, contentStyle, artOpacity = 0.14 }: PrimitiveCardProps) {
  return (
    <PrimitiveCard
      style={style}
      contentStyle={contentStyle}
      surfaceStyle={styles.journeyCard}
      art={<MapIllustration size={116} opacity={artOpacity} />}
      accent={<BootPrintsIllustration width={126} height={104} opacity={0.1} />}
    >
      {children}
    </PrimitiveCard>
  );
}

export function ReflectionCard({ children, style, contentStyle, artOpacity = 0.16 }: PrimitiveCardProps) {
  return (
    <PrimitiveCard
      style={style}
      contentStyle={contentStyle}
      surfaceStyle={styles.reflectionCard}
      art={<LakeReflectionIllustration width={168} height={106} opacity={artOpacity} />}
    >
      {children}
    </PrimitiveCard>
  );
}

export function StoryCard({ children, style, contentStyle, artOpacity = 0.14 }: PrimitiveCardProps) {
  return (
    <PrimitiveCard
      style={style}
      contentStyle={contentStyle}
      surfaceStyle={styles.storyCard}
      art={<MoonIllustration size={106} opacity={artOpacity} />}
    >
      {children}
    </PrimitiveCard>
  );
}

export function MilestoneCard({ children, style, contentStyle, artOpacity = 0.14 }: PrimitiveCardProps) {
  return (
    <PrimitiveCard
      style={style}
      contentStyle={contentStyle}
      surfaceStyle={styles.milestoneCard}
      art={<CompassIllustration size={112} opacity={artOpacity} />}
    >
      {children}
    </PrimitiveCard>
  );
}

export function BadgeCard({ children, style, contentStyle, artOpacity = 0.16 }: PrimitiveCardProps) {
  return (
    <PrimitiveCard
      style={style}
      contentStyle={contentStyle}
      surfaceStyle={styles.badgeCard}
      art={<NationalParkBadgeIllustration size={104} opacity={artOpacity} />}
    >
      {children}
    </PrimitiveCard>
  );
}

export function PremiumHero({
  eyebrow,
  title,
  subtitle,
  topSlot,
  children,
  footer,
  variant = "light",
  style,
  contentStyle,
}: PremiumHeroProps) {
  const isForest = variant === "forest";

  return (
    <FadeUpView style={[styles.premiumHero, isForest ? styles.premiumHeroForest : styles.premiumHeroLight, style]}>
      <View pointerEvents="none" style={styles.heroGradientLayer}>
        <SunriseGlowIllustration size={210} opacity={isForest ? 0.24 : 0.3} variant={isForest ? "forest" : "light"} />
      </View>
      <PaperTextureIllustration
        width={260}
        height={168}
        opacity={isForest ? 0.16 : 0.24}
        variant={isForest ? "forest" : "light"}
        style={styles.heroTexture}
      />
      <MountainLayersIllustration
        width={230}
        height={142}
        opacity={isForest ? 0.18 : 0.16}
        variant={isForest ? "forest" : "light"}
        style={styles.heroMountains}
      />
      <PineForestIllustration
        width={220}
        height={122}
        opacity={isForest ? 0.16 : 0.1}
        variant={isForest ? "forest" : "light"}
        style={styles.heroForestLine}
      />
      <MorningFogIllustration
        width={220}
        height={86}
        opacity={isForest ? 0.32 : 0.5}
        variant={isForest ? "forest" : "light"}
        style={styles.heroFog}
      />

      <View style={[styles.premiumHeroContent, contentStyle]}>
        {topSlot ? <View style={styles.premiumHeroTop}>{topSlot}</View> : null}
        {eyebrow ? <Text style={[styles.premiumHeroEyebrow, isForest ? styles.premiumHeroEyebrowForest : null]}>{eyebrow}</Text> : null}
        <Text style={[styles.premiumHeroTitle, isForest ? styles.premiumHeroTitleForest : null]}>{title}</Text>
        {subtitle ? <Text style={[styles.premiumHeroSubtitle, isForest ? styles.premiumHeroSubtitleForest : null]}>{subtitle}</Text> : null}
        {children ? <View style={styles.premiumHeroBody}>{children}</View> : null}
        {footer ? <View style={styles.premiumHeroFooter}>{footer}</View> : null}
      </View>
    </FadeUpView>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  actionLabel,
  onActionPress,
  inverse,
  style,
}: SectionHeaderProps) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionCopy}>
        {eyebrow ? <Text style={[styles.eyebrow, inverse ? styles.eyebrowInverse : null]}>{eyebrow}</Text> : null}
        <Text style={[styles.sectionTitle, inverse ? styles.sectionTitleInverse : null]}>{title}</Text>
        {subtitle ? <Text style={[styles.sectionSubtitle, inverse ? styles.sectionSubtitleInverse : null]}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onActionPress ? (
        <Pressable onPress={onActionPress} style={({ pressed }) => [styles.sectionAction, pressed ? styles.pressed : null]}>
          <Text style={[styles.sectionActionText, inverse ? styles.sectionActionTextInverse : null]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function StatCard({ label, value, meta, variant = "light", style }: StatCardProps) {
  const isForest = variant === "forest";
  return (
    <FadeUpView style={[styles.statCard, isForest ? styles.statCardForest : null, style]}>
      <Text style={[styles.statLabel, isForest ? styles.statLabelForest : null]}>{label}</Text>
      <Text style={[styles.statValue, isForest ? styles.statValueForest : null]}>{value}</Text>
      {meta ? <Text style={[styles.statMeta, isForest ? styles.statMetaForest : null]}>{meta}</Text> : null}
    </FadeUpView>
  );
}

export function CampfireBadge({ label, variant = "light", style }: CampfireBadgeProps) {
  const isForest = variant === "forest";
  return (
    <View style={[styles.badge, isForest ? styles.badgeForest : null, style]}>
      <CampfireGlyph size={20} opacity={0.95} />
      {label ? <Text style={[styles.badgeText, isForest ? styles.badgeTextForest : null]}>{label}</Text> : null}
    </View>
  );
}

export function PrimaryButton({ children, label, loading, disabled, style, textStyle, ...props }: ButtonProps) {
  return (
    <Pressable
      {...props}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled || loading ? styles.disabled : null,
        pressed ? styles.buttonPressed : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={OutdoorTheme.colors.paper} />
      ) : children ? (
        children
      ) : (
        <Text style={[styles.primaryButtonText, textStyle]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function SecondaryButton({ children, label, loading, disabled, style, textStyle, ...props }: ButtonProps) {
  return (
    <Pressable
      {...props}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.secondaryButton,
        disabled || loading ? styles.disabled : null,
        pressed ? styles.buttonPressed : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={OutdoorTheme.colors.forest} />
      ) : children ? (
        children
      ) : (
        <Text style={[styles.secondaryButtonText, textStyle]}>{label}</Text>
      )}
    </Pressable>
  );
}

function EmptyStateIllustration({ illustration }: { illustration?: EmptyStateCardProps["illustration"] }) {
  if (illustration === "trail") {
    return (
      <>
        <TrailIllustration width={168} height={106} opacity={0.22} />
        <PineForestIllustration width={190} height={104} opacity={0.08} style={styles.emptyIllustrationForest} />
      </>
    );
  }

  if (illustration === "bootprints") {
    return (
      <>
        <BootPrintsIllustration width={150} height={98} opacity={0.2} />
        <MorningFogIllustration width={190} height={74} opacity={0.3} style={styles.emptyIllustrationFog} />
      </>
    );
  }

  if (illustration === "mountain") {
    return (
      <>
        <MountainLayersIllustration width={190} height={112} opacity={0.2} />
        <SunriseGlowIllustration size={122} opacity={0.18} style={styles.emptyIllustrationGlow} />
      </>
    );
  }

  if (illustration === "map") {
    return <MapIllustration width={146} height={106} opacity={0.2} />;
  }

  if (illustration === "lake") {
    return <LakeReflectionIllustration width={180} height={106} opacity={0.22} />;
  }

  return (
    <>
      <CampfireIllustration size={118} opacity={0.22} />
      <StarsIllustration width={150} height={92} opacity={0.14} style={styles.emptyIllustrationStars} />
    </>
  );
}

export function EmptyStateCard({ title, body, children, actionLabel, onActionPress, actionDisabled, icon, illustration, style }: EmptyStateCardProps) {
  return (
    <BrandCard withPines withCampfire style={[styles.emptyCard, style]}>
      <View pointerEvents="none" style={styles.emptyIllustration}>
        <EmptyStateIllustration illustration={illustration} />
      </View>
      <View style={styles.emptyCopy}>
        {icon ? <View style={styles.emptyIcon}>{icon}</View> : null}
        <Text style={styles.emptyTitle}>{title}</Text>
        {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
        {children}
        {actionLabel && onActionPress ? (
          <SecondaryButton label={actionLabel} onPress={onActionPress} disabled={actionDisabled} style={styles.emptyAction} />
        ) : null}
      </View>
    </BrandCard>
  );
}

const styles = StyleSheet.create({
  brandCard: {
    borderRadius: OutdoorTheme.radii.xl,
    padding: 18,
    backgroundColor: OutdoorTheme.colors.paperTranslucent,
    borderWidth: 1,
    borderColor: OutdoorTheme.colors.lineSoft,
    overflow: "hidden",
    ...OutdoorTheme.shadows.soft,
  },
  layeredEnvironment: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    backgroundColor: OutdoorTheme.colors.cream,
  },
  layeredEnvironmentForest: {
    backgroundColor: OutdoorTheme.colors.pine,
  },
  environmentGlow: {
    position: "absolute",
    right: -92,
    top: -82,
  },
  environmentPaper: {
    position: "absolute",
    left: -44,
    top: 20,
  },
  environmentMountains: {
    position: "absolute",
    right: -82,
    bottom: 82,
  },
  environmentMist: {
    position: "absolute",
    left: -44,
    bottom: 132,
  },
  environmentTrees: {
    position: "absolute",
    right: -72,
    bottom: -34,
  },
  environmentLeaves: {
    position: "absolute",
    left: 18,
    top: "28%",
  },
  environmentStars: {
    position: "absolute",
    right: 18,
    top: 34,
  },
  forestCard: {
    borderRadius: OutdoorTheme.radii.xl,
    padding: 18,
    backgroundColor: OutdoorTheme.colors.forest,
    borderWidth: 1,
    borderColor: "rgba(255,249,239,0.14)",
    overflow: "hidden",
    ...OutdoorTheme.shadows.card,
  },
  primitiveCard: {
    minHeight: 118,
    borderRadius: OutdoorTheme.radii.xl,
    padding: 18,
    borderWidth: 1,
    overflow: "hidden",
    ...OutdoorTheme.shadows.soft,
  },
  primitiveContent: {
    position: "relative",
    zIndex: 1,
  },
  primitiveArt: {
    position: "absolute",
    right: -18,
    bottom: -18,
  },
  primitiveAccent: {
    position: "absolute",
    right: -48,
    top: -56,
  },
  campfireCard: {
    backgroundColor: OutdoorTheme.colors.paper,
    borderColor: "rgba(217,132,47,0.18)",
  },
  trailCard: {
    backgroundColor: OutdoorTheme.colors.paperTranslucent,
    borderColor: "rgba(198,155,66,0.22)",
  },
  adventureCard: {
    backgroundColor: OutdoorTheme.colors.forest,
    borderColor: "rgba(255,249,239,0.16)",
    ...OutdoorTheme.shadows.card,
  },
  weatherCard: {
    backgroundColor: "rgba(255,249,239,0.88)",
    borderColor: "rgba(75,107,82,0.16)",
  },
  journeyCard: {
    backgroundColor: OutdoorTheme.colors.paper,
    borderColor: OutdoorTheme.colors.line,
  },
  reflectionCard: {
    backgroundColor: "rgba(247,244,236,0.84)",
    borderColor: "rgba(75,107,82,0.18)",
  },
  storyCard: {
    backgroundColor: OutdoorTheme.colors.pine,
    borderColor: "rgba(255,249,239,0.14)",
    ...OutdoorTheme.shadows.card,
  },
  milestoneCard: {
    backgroundColor: "rgba(198,155,66,0.13)",
    borderColor: "rgba(198,155,66,0.24)",
  },
  badgeCard: {
    backgroundColor: OutdoorTheme.colors.paperTranslucent,
    borderColor: OutdoorTheme.colors.line,
  },
  premiumHero: {
    minHeight: 250,
    borderRadius: OutdoorTheme.radii.xxl,
    padding: 26,
    borderWidth: 1,
    overflow: "hidden",
    ...OutdoorTheme.shadows.card,
  },
  premiumHeroLight: {
    backgroundColor: OutdoorTheme.colors.paper,
    borderColor: OutdoorTheme.colors.line,
  },
  premiumHeroForest: {
    backgroundColor: OutdoorTheme.colors.forest,
    borderColor: "rgba(255,249,239,0.16)",
  },
  heroGradientLayer: {
    position: "absolute",
    right: -72,
    top: -82,
  },
  heroTexture: {
    position: "absolute",
    left: -18,
    top: -10,
  },
  heroMountains: {
    position: "absolute",
    right: -34,
    bottom: 20,
  },
  heroForestLine: {
    position: "absolute",
    right: -36,
    bottom: -18,
  },
  heroFog: {
    position: "absolute",
    left: 18,
    right: 0,
    bottom: 40,
  },
  premiumHeroContent: {
    position: "relative",
    zIndex: 1,
    minHeight: 206,
  },
  premiumHeroTop: {
    marginBottom: 22,
  },
  premiumHeroEyebrow: {
    color: OutdoorTheme.colors.goldText,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  premiumHeroEyebrowForest: {
    color: OutdoorTheme.colors.gold,
  },
  premiumHeroTitle: {
    marginTop: 10,
    maxWidth: 430,
    color: OutdoorTheme.colors.charcoal,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    fontSize: 36,
    lineHeight: 43,
    fontWeight: "700",
    letterSpacing: 0,
  },
  premiumHeroTitleForest: {
    color: OutdoorTheme.colors.paper,
  },
  premiumHeroSubtitle: {
    marginTop: 14,
    maxWidth: 390,
    color: OutdoorTheme.colors.mutedText,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "700",
  },
  premiumHeroSubtitleForest: {
    color: OutdoorTheme.colors.onForestMuted,
  },
  premiumHeroBody: {
    marginTop: 12,
  },
  premiumHeroFooter: {
    marginTop: 22,
  },
  pineBackground: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  pineBackgroundCluster: {
    position: "absolute",
    right: -24,
    bottom: -18,
  },
  forestPines: {
    right: -8,
    bottom: -8,
  },
  cardFire: {
    position: "absolute",
    right: 18,
    top: 16,
  },
  forestFire: {
    position: "absolute",
    right: 20,
    top: 44,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 4,
  },
  sectionCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: OutdoorTheme.colors.goldText,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  eyebrowInverse: {
    color: OutdoorTheme.colors.gold,
  },
  sectionTitle: {
    marginTop: 6,
    color: OutdoorTheme.colors.charcoal,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "700",
  },
  sectionTitleInverse: {
    color: OutdoorTheme.colors.paper,
  },
  sectionSubtitle: {
    marginTop: 7,
    color: OutdoorTheme.colors.mutedText,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
  },
  sectionSubtitleInverse: {
    color: OutdoorTheme.colors.onForestMuted,
  },
  sectionAction: {
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  sectionActionText: {
    color: OutdoorTheme.colors.forest,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  sectionActionTextInverse: {
    color: OutdoorTheme.colors.gold,
  },
  statCard: {
    flexGrow: 1,
    flexBasis: "47%",
    minHeight: 88,
    borderRadius: OutdoorTheme.radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: OutdoorTheme.colors.paper,
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.10)",
    justifyContent: "space-between",
  },
  statCardForest: {
    backgroundColor: "rgba(247,244,236,0.12)",
    borderColor: "rgba(247,244,236,0.16)",
  },
  statLabel: {
    color: OutdoorTheme.colors.faintText,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  statLabelForest: {
    color: "rgba(255,249,239,0.72)",
  },
  statValue: {
    marginTop: 6,
    color: OutdoorTheme.colors.forest,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
  },
  statValueForest: {
    color: OutdoorTheme.colors.paper,
  },
  statMeta: {
    marginTop: 4,
    color: OutdoorTheme.colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  statMetaForest: {
    color: OutdoorTheme.colors.onForestMuted,
  },
  badge: {
    alignSelf: "flex-start",
    minHeight: 34,
    borderRadius: OutdoorTheme.radii.pill,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: OutdoorTheme.colors.goldTint,
    borderWidth: 1,
    borderColor: "rgba(198,155,66,0.24)",
  },
  badgeForest: {
    backgroundColor: "rgba(255,249,239,0.12)",
    borderColor: "rgba(255,249,239,0.16)",
  },
  badgeText: {
    color: OutdoorTheme.colors.goldText,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  badgeTextForest: {
    color: OutdoorTheme.colors.gold,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: OutdoorTheme.radii.lg,
    backgroundColor: OutdoorTheme.colors.forest,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    ...OutdoorTheme.shadows.button,
  },
  primaryButtonText: {
    color: OutdoorTheme.colors.white,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: OutdoorTheme.radii.lg,
    backgroundColor: "rgba(255,249,239,0.74)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.14)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: OutdoorTheme.colors.forest,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  emptyCard: {
    minHeight: 188,
    padding: 22,
    justifyContent: "flex-end",
    backgroundColor: "rgba(255,249,239,0.86)",
  },
  emptyIllustration: {
    position: "absolute",
    right: -6,
    top: 6,
    width: 194,
    height: 126,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIllustrationForest: {
    position: "absolute",
    right: -22,
    bottom: -18,
  },
  emptyIllustrationFog: {
    position: "absolute",
    right: -28,
    bottom: 6,
  },
  emptyIllustrationGlow: {
    position: "absolute",
    right: 22,
    top: -8,
  },
  emptyIllustrationStars: {
    position: "absolute",
    right: 4,
    top: -10,
  },
  emptyCopy: {
    position: "relative",
    zIndex: 1,
    maxWidth: 300,
    gap: 9,
  },
  emptyIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: OutdoorTheme.colors.goldTint,
  },
  emptyTitle: {
    color: OutdoorTheme.colors.charcoal,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "700",
  },
  emptyBody: {
    color: OutdoorTheme.colors.mutedText,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "700",
  },
  emptyAction: {
    marginTop: 8,
    alignSelf: "flex-start",
    minHeight: 44,
  },
  pressed: {
    opacity: 0.88,
  },
  buttonPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.992 }],
  },
  disabled: {
    opacity: 0.56,
  },
});
