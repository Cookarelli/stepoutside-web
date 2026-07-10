import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Share, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { OutdoorTheme } from "../../constants/theme";
import { BrandHeaderMark } from "./BrandBadge";
import { CampfireGlyph } from "./OutdoorDecor";
import { LayeredEnvironment, PremiumHero } from "./OutdoorUI";
import { RoutePreview } from "../components/RoutePreview";
import { logRouteSaved } from "../lib/analytics";
import { getSessionById, saveSessionRouteForLater, type OutsideSession } from "../lib/store";
import { getPaceDisplay } from "../utils/pace";
import {
  formatDistanceMiles,
  formatDurationClock,
  formatDurationMinutesLabel,
  resolveSessionDistanceMeters,
  resolveSessionElapsedSeconds,
  resolveSessionMovingSeconds,
  resolveSessionPausedSeconds,
} from "../utils/sessionSummary";

function toBool(value: string | undefined): boolean {
  return value === "true";
}

type PostWalkSummaryScreenProps = {
  showTabShell?: boolean;
};

export function PostWalkSummaryScreen({ showTabShell = false }: PostWalkSummaryScreenProps) {
  const router = useRouter();
  const params = useLocalSearchParams<{
    walkId?: string;
    sunriseBonus?: string;
    sunsetBonus?: string;
    reflectionText?: string;
    saveWarning?: string;
  }>();

  const walkId = (params.walkId ?? "").trim();
  const sunriseBonus = toBool(params.sunriseBonus);
  const sunsetBonus = toBool(params.sunsetBonus);
  const reflectionText = (params.reflectionText ?? "").trim();
  const saveWarning = (params.saveWarning ?? "").trim();
  const [sharing, setSharing] = useState(false);
  const [savingRoute, setSavingRoute] = useState(false);
  const [saveRouteMessage, setSaveRouteMessage] = useState("");
  const [session, setSession] = useState<OutsideSession | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!walkId) {
        if (active) setSession(null);
        return;
      }

      const nextSession = await getSessionById(walkId);
      if (active) {
        setSession(nextSession);
        if (__DEV__) {
          console.log("[summary] received-activity", nextSession);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [walkId]);

  const resolvedElapsedSeconds = resolveSessionElapsedSeconds(session, null);
  const resolvedMovingSeconds = resolveSessionMovingSeconds(session, null);
  const resolvedPausedSeconds = resolveSessionPausedSeconds(session, null);
  const resolvedDistanceMeters = resolveSessionDistanceMeters(session, null);
  const summaryLine = useMemo(() => {
    const distancePart = resolvedDistanceMeters > 0 ? formatDistanceMiles(resolvedDistanceMeters, "") : "";
    return distancePart
      ? `${formatDurationMinutesLabel(resolvedElapsedSeconds)} outside • ${distancePart.replace(" mi", " miles")}`
      : `${formatDurationMinutesLabel(resolvedElapsedSeconds)} outside`;
  }, [resolvedDistanceMeters, resolvedElapsedSeconds]);
  const resolvedPace = getPaceDisplay({
    distanceM: resolvedDistanceMeters,
    elapsedSeconds: resolvedElapsedSeconds,
    movingSeconds: resolvedMovingSeconds,
    routePoints: session?.routePoints,
    preferRolling: false,
    loadingFallback: "Getting GPS...",
    emptyFallback: "-- / mi",
  });

  const shareMessage = useMemo(() => {
    const lines = [`I just took ${summaryLine} with Step Outside.`];
    if (sunriseBonus) lines.push("Caught a sunrise Golden Hour reset.");
    if (sunsetBonus) lines.push("Caught a sunset Golden Hour reset.");
    if ((session?.routePoints?.length ?? 0) > 1) lines.push("Saved the route from this walk.");
    if (reflectionText) lines.push(`Reflection: "${reflectionText}"`);
    return lines.join("\n");
  }, [reflectionText, session?.routePoints?.length, summaryLine, sunriseBonus, sunsetBonus]);

  const onShare = async () => {
    setSharing(true);
    try {
      await Share.share({ message: shareMessage });
      void Haptics.selectionAsync();
    } finally {
      setSharing(false);
    }
  };

  const onSaveRoute = async () => {
    if (!walkId || !session?.routePoints || session.routePoints.length < 2 || savingRoute) return;

    setSavingRoute(true);
    try {
      const nextSession = await saveSessionRouteForLater(walkId);
      if (nextSession) {
        setSession(nextSession);
        setSaveRouteMessage("Saved to your route history.");
        void logRouteSaved();
        void Haptics.selectionAsync();
      }
    } finally {
      setSavingRoute(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <LayeredEnvironment />
      <ScrollView
        contentContainerStyle={[
          styles.container,
          showTabShell ? styles.containerWithTabs : null,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <PremiumHero
          style={styles.summaryHero}
          topSlot={<BrandHeaderMark size={64} showTagline style={styles.logo} />}
          eyebrow="Walk complete"
          title="Let it land."
          subtitle={summaryLine}
        />

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Elapsed</Text>
            <Text style={styles.metricValue}>{formatDurationClock(resolvedElapsedSeconds)}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Moving</Text>
            <Text style={styles.metricValue}>{resolvedMovingSeconds > 0 ? formatDurationClock(resolvedMovingSeconds) : "--"}</Text>
          </View>
        </View>
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Distance</Text>
            <Text style={styles.metricValue}>{formatDistanceMiles(resolvedDistanceMeters)}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Pace</Text>
            <Text style={styles.metricValue}>{resolvedPace}</Text>
          </View>
        </View>
        {resolvedPausedSeconds > 0 ? <Text style={styles.subtle}>Paused time: {formatDurationClock(resolvedPausedSeconds)}</Text> : null}
        {session?.source === "gps" && resolvedDistanceMeters <= 0 && (session?.routePoints?.length ?? 0) < 2 ? (
          <Text style={styles.subtle}>GPS is still locking in. Keep moving for a more accurate distance.</Text>
        ) : null}

        <View style={styles.chipsRow}>
          {sunriseBonus ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>Sunrise bonus</Text>
            </View>
          ) : null}
          {sunsetBonus ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>Sunset bonus</Text>
            </View>
          ) : null}
        </View>

        {reflectionText ? (
          <View style={styles.reflectionCard}>
            <CampfireGlyph style={styles.reflectionFire} size={42} opacity={0.16} />
            <Text style={styles.reflectionLabel}>What you carried forward</Text>
            <Text style={styles.reflectionText}>{reflectionText}</Text>
          </View>
        ) : (
          <Text style={styles.subtle}>You can share this walk or just keep the reset for yourself.</Text>
        )}

        {saveWarning ? <Text style={styles.warning}>{saveWarning}</Text> : null}

        {session?.routePoints && session.routePoints.length > 1 ? (
          <View style={styles.routeWrap}>
            <RoutePreview points={session.routePoints} title="Walk route" subtitle="Captured from this reset" />
          </View>
        ) : null}

        {session?.source === "gps" && (!session.routePoints || session.routePoints.length < 2) ? (
          <View style={styles.routeLockedCard}>
            <Text style={styles.routeLockedTitle}>Route maps are a Premium feature</Text>
            <Text style={styles.routeLockedBody}>Unlock saved GPS route maps with Step Outside Premium.</Text>
          </View>
        ) : null}

        {session?.routePoints && session.routePoints.length > 1 ? (
          <>
            <Pressable
              onPress={() => void onSaveRoute()}
              disabled={savingRoute || Boolean(session.savedRouteAt)}
              style={({ pressed }) => [
                styles.saveRouteBtn,
                Boolean(session.savedRouteAt) ? styles.saveRouteBtnSaved : null,
                pressed ? { opacity: 0.94 } : null,
              ]}
            >
              <Text
                style={[
                  styles.saveRouteBtnText,
                  Boolean(session.savedRouteAt) ? styles.saveRouteBtnTextSaved : null,
                ]}
              >
                {Boolean(session.savedRouteAt)
                  ? "SAVED FOR LATER"
                  : savingRoute
                    ? "SAVING ROUTE…"
                    : "SAVE THIS WALK"}
              </Text>
            </Pressable>
            <Text style={styles.saveRouteHint}>
              {saveRouteMessage ||
                (Boolean(session.savedRouteAt)
                  ? "This route is saved in your Premium route history."
                  : "Save this walk to keep its GPS route in your Premium history.")}
            </Text>
          </>
        ) : null}

        <Pressable
          onPress={() => void onShare()}
          disabled={sharing}
          style={({ pressed }) => [styles.primaryBtn, pressed ? { opacity: 0.94 } : null]}
        >
          <Text style={styles.primaryBtnText}>{sharing ? "OPENING SHARE…" : "SHARE"}</Text>
        </Pressable>

        {showTabShell ? (
          <Text style={styles.tabHint}>Use the tabs below to keep exploring your progress.</Text>
        ) : (
          <>
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                router.replace("/(tabs)");
              }}
              style={({ pressed }) => [styles.secondaryBtn, pressed ? { opacity: 0.9 } : null]}
            >
              <Text style={styles.secondaryBtnText}>BACK HOME</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                router.push("/(tabs)/stats");
              }}
              style={({ pressed }) => [styles.tertiaryBtn, pressed ? { opacity: 0.9 } : null]}
            >
              <Text style={styles.tertiaryBtnText}>VIEW STATS</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "transparent" },
  container: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 32,
    overflow: "hidden",
  },
  containerWithTabs: {
    justifyContent: "flex-start",
    paddingBottom: 24,
  },
  summaryHero: {
    width: "100%",
    maxWidth: 560,
    minHeight: 280,
  },
  logo: { marginBottom: 16 },
  eyebrow: {
    color: "#18442F",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  title: {
    marginTop: 10,
    color: "#1E2A24",
    fontSize: 32,
    lineHeight: 37,
    fontWeight: "900",
    textAlign: "center",
  },
  summary: {
    marginTop: 10,
    color: "rgba(30,42,36,0.76)",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  metricsRow: {
    marginTop: 14,
    width: "100%",
    maxWidth: 540,
    flexDirection: "row",
    gap: 12,
  },
  metricCard: {
    flex: 1,
    borderRadius: OutdoorTheme.radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: OutdoorTheme.colors.paperTranslucent,
    borderWidth: 1,
    borderColor: "rgba(30,42,36,0.08)",
    ...OutdoorTheme.shadows.soft,
  },
  metricLabel: {
    color: "rgba(30,42,36,0.5)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  metricValue: {
    marginTop: 6,
    color: "#1E2A24",
    fontSize: 20,
    fontWeight: "900",
  },
  chipsRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(24,68,47,0.08)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.16)",
  },
  chipText: {
    color: "#18442F",
    fontSize: 12,
    fontWeight: "900",
  },
  reflectionCard: {
    marginTop: 18,
    width: "100%",
    maxWidth: 540,
    borderRadius: OutdoorTheme.radii.xl,
    padding: 16,
    backgroundColor: OutdoorTheme.colors.paperTranslucent,
    borderWidth: 1,
    borderColor: "rgba(30,42,36,0.08)",
    overflow: "hidden",
    ...OutdoorTheme.shadows.soft,
  },
  reflectionFire: {
    position: "absolute",
    right: 16,
    top: 14,
  },
  reflectionLabel: {
    color: "rgba(30,42,36,0.54)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  reflectionText: {
    marginTop: 8,
    color: "#1E2A24",
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "700",
  },
  subtle: {
    marginTop: 18,
    color: "rgba(30,42,36,0.62)",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
    textAlign: "center",
    maxWidth: 320,
  },
  warning: {
    marginTop: 12,
    color: "rgba(30,42,36,0.62)",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    textAlign: "center",
  },
  routeWrap: {
    marginTop: 18,
    width: "100%",
    maxWidth: 540,
  },
  routeLockedCard: {
    marginTop: 18,
    width: "100%",
    maxWidth: 540,
    borderRadius: OutdoorTheme.radii.lg,
    padding: 16,
    backgroundColor: OutdoorTheme.colors.paperTranslucent,
    borderWidth: 1,
    borderColor: "rgba(30,42,36,0.08)",
  },
  routeLockedTitle: {
    color: "#1E2A24",
    fontSize: 15,
    fontWeight: "900",
  },
  routeLockedBody: {
    marginTop: 8,
    color: "rgba(30,42,36,0.66)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  saveRouteBtn: {
    marginTop: 14,
    minWidth: 240,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: "rgba(24,68,47,0.08)",
    borderWidth: 1,
    borderColor: "rgba(24,68,47,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  saveRouteBtnSaved: {
    backgroundColor: "rgba(198,155,66,0.16)",
    borderColor: "rgba(198,155,66,0.36)",
  },
  saveRouteBtnText: {
    color: "#18442F",
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  saveRouteBtnTextSaved: {
    color: OutdoorTheme.colors.goldText,
  },
  saveRouteHint: {
    marginTop: 10,
    color: "rgba(30,42,36,0.58)",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
    maxWidth: 320,
  },
  primaryBtn: {
    marginTop: 22,
    minWidth: 240,
    minHeight: 54,
    borderRadius: OutdoorTheme.radii.lg,
    backgroundColor: OutdoorTheme.colors.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontWeight: "900",
    letterSpacing: 1,
  },
  secondaryBtn: {
    marginTop: 10,
    minWidth: 240,
    minHeight: 50,
    borderRadius: OutdoorTheme.radii.lg,
    backgroundColor: "rgba(30,42,36,0.06)",
    borderWidth: 1,
    borderColor: "rgba(30,42,36,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    color: "#1E2A24",
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  tertiaryBtn: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tertiaryBtnText: {
    color: "rgba(30,42,36,0.68)",
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  tabHint: {
    marginTop: 12,
    color: "rgba(30,42,36,0.54)",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
  },
});
