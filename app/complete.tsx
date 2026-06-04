import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { BadgeRevealSplash } from "../src/components/BadgeRevealSplash";
import { NativeRouteMapCard } from "../src/components/NativeRouteMapCard";
import { StepButton } from "../src/components/StepButton";
import { clearCompletedWalkDraft, getCompletedWalkDraft } from "../src/lib/activeWalk";
import { BADGE_CATALOG, CHALLENGE_CATALOG } from "../src/lib/challenges/catalog";
import { getNextUpMilestone, type NextUpMilestone } from "../src/lib/challenges/nextUp";
import { refreshLocalChallengeSnapshot } from "../src/lib/challenges/storage";
import { getCachedAuthUser } from "../src/lib/auth";
import { syncCorporateChallengeProgressFromWalk, syncCorporateMemberStatsFromWalk } from "../src/lib/corporate";
import { getPremiumStatus } from "../src/lib/pro";
import { evaluateSolarBonus } from "../src/lib/solarBonus";
import {
  addCompletedSession,
  type GpsDiagnostics,
  type RouteCaptureStatus,
  type RoutePoint,
  type SessionSource,
  type SummaryStats,
} from "../src/lib/store";

function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function fmtDistance(distanceM: number): string {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return "0.00 mi";
  return `${(distanceM / 1609.344).toFixed(2)} mi`;
}

export default function CompleteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    console.log("[boot] complete screen mounted");
  }, []);

  const params = useLocalSearchParams<{
    startedAt?: string;
    endedAt?: string;
    durationSec?: string;
    activeDurationSec?: string;
    pausedDurationSec?: string;
    totalElapsedSec?: string;
    movingDurationSec?: string;
    distanceM?: string;
    source?: string;
  }>();

  const startedAt = Number(params.startedAt ?? "");
  const endedAt = Number(params.endedAt ?? "");
  const durationSec = Number(params.durationSec ?? "");
  const activeDurationSec = Number(params.activeDurationSec ?? params.durationSec ?? "");
  const pausedDurationSec = Number(params.pausedDurationSec ?? "0");
  const totalElapsedSec = Number(params.totalElapsedSec ?? "");
  const movingDurationSec = Number(params.movingDurationSec ?? "0");
  const distanceM = Number(params.distanceM ?? "0");
  const source: SessionSource = params.source === "gps" ? "gps" : "timer";

  const valid =
    Number.isFinite(startedAt) &&
    Number.isFinite(endedAt) &&
    Number.isFinite(durationSec) &&
    durationSec > 0;

  const counts = valid && durationSec >= 10;

  const saveKey = `${startedAt}-${endedAt}-${durationSec}-${Math.round(
    Number.isFinite(distanceM) ? distanceM : 0
  )}-${source}`;

  const [saving, setSaving] = useState(true);
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [errorText, setErrorText] = useState("");
  const [sunriseBonus, setSunriseBonus] = useState(false);
  const [sunsetBonus, setSunsetBonus] = useState(false);
  const [lockedBonusTeaser, setLockedBonusTeaser] = useState(false);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [routeCaptureStatus, setRouteCaptureStatus] = useState<RouteCaptureStatus>("none");
  const [routeCaptureInterrupted, setRouteCaptureInterrupted] = useState(false);
  const [routeCaptureGapSec, setRouteCaptureGapSec] = useState(0);
  const [gpsDiagnostics, setGpsDiagnostics] = useState<GpsDiagnostics | null>(null);
  const [newlyEarnedBadgeIds, setNewlyEarnedBadgeIds] = useState<string[]>([]);
  const [newlyCompletedChallengeIds, setNewlyCompletedChallengeIds] = useState<string[]>([]);
  const [badgeRevealIndex, setBadgeRevealIndex] = useState(0);
  const [nextUpGoal, setNextUpGoal] = useState<NextUpMilestone | null>(null);

  const lastSaveKeyRef = useRef<string | null>(null);
  const didHapticRef = useRef(false);

  useEffect(() => {
    (async () => {
      if (!valid) {
        await clearCompletedWalkDraft();
        setSaving(false);
        return;
      }

      if (!counts) {
        await clearCompletedWalkDraft();
        setSaving(false);
        setErrorText("Walks under 10 seconds don’t count yet.");
        return;
      }

      if (lastSaveKeyRef.current === saveKey) {
        setSaving(false);
        return;
      }
      lastSaveKeyRef.current = saveKey;

      try {
        setErrorText("");
        setSaving(true);

        const id = `${startedAt}-${endedAt}`;
        const walkDraft = await getCompletedWalkDraft();
        const draftRoutePoints = walkDraft?.routePoints ?? [];
        const premiumStatus = await getPremiumStatus();
        const solarBonus = await evaluateSolarBonus({
          startedAt,
          startPoint: draftRoutePoints[0] ?? null,
          isPremium: premiumStatus.isPremium,
        });

        setSunriseBonus(solarBonus.isSunriseBonus);
        setSunsetBonus(solarBonus.isSunsetBonus);
        setLockedBonusTeaser(Boolean(solarBonus.bonusType) && !premiumStatus.isPremium);
        setRoutePoints(draftRoutePoints);
        setRouteCaptureStatus(walkDraft?.routeCaptureStatus ?? (draftRoutePoints.length > 1 ? "complete" : "none"));
        setRouteCaptureInterrupted(Boolean(walkDraft?.routeCaptureInterrupted));
        setRouteCaptureGapSec(Math.max(0, walkDraft?.routeCaptureGapSec ?? 0));
        setGpsDiagnostics(walkDraft?.gpsDiagnostics ?? null);

        const result = await addCompletedSession({
          id,
          startedAt,
          endedAt,
          durationSec,
          activeDurationSec: Number.isFinite(activeDurationSec) ? Math.max(0, Math.round(activeDurationSec)) : durationSec,
          pausedDurationSec:
            Number.isFinite(pausedDurationSec) ? Math.max(0, Math.round(pausedDurationSec)) : 0,
          totalElapsedSec:
            Number.isFinite(totalElapsedSec)
              ? Math.max(0, Math.round(totalElapsedSec))
              : Math.max(
                  durationSec,
                  (Number.isFinite(activeDurationSec) ? Math.max(0, Math.round(activeDurationSec)) : durationSec) +
                    (Number.isFinite(pausedDurationSec) ? Math.max(0, Math.round(pausedDurationSec)) : 0)
                ),
          movingDurationSec:
            Number.isFinite(movingDurationSec) ? Math.max(0, Math.round(movingDurationSec)) : 0,
          source,
          title: source === "gps" ? "Tracked outdoor walk" : "Outdoor walk",
          activityType: "walk",
          distanceM: Number.isFinite(distanceM) ? Math.max(0, Math.round(distanceM)) : 0,
          routePoints: draftRoutePoints,
          isSunriseBonus: solarBonus.isSunriseBonus,
          isSunsetBonus: solarBonus.isSunsetBonus,
          bonusType: solarBonus.bonusType,
          bonusLabel: solarBonus.bonusLabel,
          bonusPoints: solarBonus.bonusPoints,
          sunriseBonus: solarBonus.isSunriseBonus,
          sunsetBonus: solarBonus.isSunsetBonus,
          routeCaptureStatus: walkDraft?.routeCaptureStatus ?? (draftRoutePoints.length > 1 ? "complete" : "none"),
          routeCaptureInterrupted: Boolean(walkDraft?.routeCaptureInterrupted),
          routeCaptureGapSec: Math.max(0, walkDraft?.routeCaptureGapSec ?? 0),
          gpsDiagnostics: walkDraft?.gpsDiagnostics,
        });

        const challengeRefresh = await refreshLocalChallengeSnapshot({
          sessions: result.sessions,
          summary: result.summary,
          now: new Date(endedAt),
        });

        try {
          const cachedUser = await getCachedAuthUser();
          await syncCorporateMemberStatsFromWalk({
            summary: result.summary,
            sessions: result.sessions,
            cachedUser,
          });
          await syncCorporateChallengeProgressFromWalk({
            summary: result.summary,
            sessions: result.sessions,
            now: new Date(endedAt),
          });
        } catch {
          // Corporate sync should never block the core post-walk flow.
        }

        await clearCompletedWalkDraft();

        setSummary(result.summary);
        setNewlyCompletedChallengeIds(challengeRefresh.unlocks.newlyCompletedChallengeIds);
        setNewlyEarnedBadgeIds(challengeRefresh.unlocks.newlyEarnedBadgeIds);
        setNextUpGoal(getNextUpMilestone(challengeRefresh.snapshot));

        if (!didHapticRef.current) {
          didHapticRef.current = true;
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch (error) {
        console.error("[complete] failed to save walk", error);
        lastSaveKeyRef.current = null;
        setErrorText("Couldn’t save this session. Try again.");
      } finally {
        setSaving(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveKey]);

  const headline = useMemo(() => {
    if (!valid) return "Go back and start a walk.";
    if (!counts) return "Almost.";
    return "This counts.";
  }, [valid, counts]);

  const streakLine = useMemo(() => {
    if (!summary) return "";
    const cs = Number(summary.currentStreakDays ?? 0);
    const bs = Number(summary.bestStreakDays ?? 0);
    return `Streak: ${cs} day${cs === 1 ? "" : "s"} • Best: ${bs}`;
  }, [summary]);

  const reflectionLabel = useMemo(() => {
    if (!valid) return "BACK HOME";
    return saving ? "SAVING…" : "SAVE REFLECTION";
  }, [saving, valid]);

  const unlockedBadges = useMemo(
    () => BADGE_CATALOG.filter((badge) => newlyEarnedBadgeIds.includes(badge.id)),
    [newlyEarnedBadgeIds]
  );

  useEffect(() => {
    setBadgeRevealIndex(0);
  }, [newlyEarnedBadgeIds]);

  const completedChallenges = useMemo(
    () => CHALLENGE_CATALOG.filter((challenge) => newlyCompletedChallengeIds.includes(challenge.id)),
    [newlyCompletedChallengeIds]
  );

  const routeGapLabel = useMemo(() => {
    if (routeCaptureGapSec <= 0) return null;
    if (routeCaptureGapSec < 60) return `about ${routeCaptureGapSec} sec`;
    const roundedMinutes = Math.max(1, Math.round(routeCaptureGapSec / 60));
    return `about ${roundedMinutes} min`;
  }, [routeCaptureGapSec]);

  const routeSubtitle = useMemo(() => {
    if (routeCaptureStatus === "partial") return "Partial route captured around a location update gap";
    return "Saved from this walk";
  }, [routeCaptureStatus]);

  const routeNote = useMemo(() => {
    if (saving) return null;

    if (routePoints.length > 1 && routeCaptureStatus === "complete") {
      return "Route captured for this walk.";
    }

    if (routePoints.length > 1 && routeCaptureStatus === "partial") {
      return routeGapLabel
        ? `Part of this route was captured around a location update gap of ${routeGapLabel}.`
        : "Part of this route was captured around a meaningful location update gap.";
    }

    if (source === "gps") {
      return "This walk saved successfully, but a full GPS route was not captured.";
    }

    return null;
  }, [routeCaptureStatus, routeGapLabel, routePoints.length, saving, source]);

  const activeBadgeReveal = unlockedBadges[badgeRevealIndex] ?? null;

  const advanceBadgeReveal = () => {
    setBadgeRevealIndex((current) => current + 1);
  };

  const walkParams = useMemo(
    () => ({
      walkId: `${startedAt}-${endedAt}`,
      startedAt: String(startedAt),
      endedAt: String(endedAt),
      durationSec: String(durationSec),
      activeDurationSec: String(Number.isFinite(activeDurationSec) ? Math.max(0, Math.round(activeDurationSec)) : durationSec),
      pausedDurationSec: String(Number.isFinite(pausedDurationSec) ? Math.max(0, Math.round(pausedDurationSec)) : 0),
      totalElapsedSec: String(
        Number.isFinite(totalElapsedSec)
          ? Math.max(0, Math.round(totalElapsedSec))
          : Math.max(
              durationSec,
              (Number.isFinite(activeDurationSec) ? Math.max(0, Math.round(activeDurationSec)) : durationSec) +
                (Number.isFinite(pausedDurationSec) ? Math.max(0, Math.round(pausedDurationSec)) : 0)
            )
      ),
      movingDurationSec: String(Number.isFinite(movingDurationSec) ? Math.max(0, Math.round(movingDurationSec)) : 0),
      distanceM: String(Number.isFinite(distanceM) ? Math.max(0, Math.round(distanceM)) : 0),
      source,
      sunriseBonus: String(sunriseBonus),
      sunsetBonus: String(sunsetBonus),
      routePointCount: String(routePoints.length),
    }),
    [
      activeDurationSec,
      distanceM,
      durationSec,
      endedAt,
      movingDurationSec,
      pausedDurationSec,
      routePoints.length,
      source,
      startedAt,
      sunriseBonus,
      sunsetBonus,
      totalElapsedSec,
    ]
  );

  const goReflection = () => {
    if (!valid) {
      router.replace("/(tabs)");
      return;
    }

    router.push({
      pathname: "/reflection" as never,
      params: walkParams,
    } as never);
  };

  const goShare = () => {
    if (!valid) {
      router.replace("/(tabs)");
      return;
    }

    router.push({
      pathname: "/share" as never,
      params: walkParams,
    } as never);
  };

  const goHome = () => {
    void Haptics.selectionAsync();
    router.replace("/(tabs)");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom + 24, 40) },
        ]}
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.container}>
        <BadgeRevealSplash
          badge={activeBadgeReveal}
          nextUp={nextUpGoal}
          queuePosition={Math.min(unlockedBadges.length, badgeRevealIndex + 1)}
          queueTotal={unlockedBadges.length}
          onContinue={advanceBadgeReveal}
        />
        <View style={styles.topBar}>
          <View>
            <Text style={styles.eyebrow}>Walk complete</Text>
            <Text style={styles.topBarTitle}>Step Outside</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back home"
            onPress={goHome}
            style={({ pressed }) => [styles.homeButton, pressed ? styles.homeButtonPressed : null]}
          >
            <Ionicons name="home-outline" size={17} color="#255E36" />
            <Text style={styles.homeButtonText}>HOME</Text>
          </Pressable>
        </View>

        <Text style={styles.headline}>{headline}</Text>

        {valid ? (
          <>
            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricK}>Time</Text>
                <Text style={styles.metricV}>{fmtClock(durationSec)}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricK}>Distance</Text>
                <Text style={styles.metricV}>{fmtDistance(distanceM)}</Text>
              </View>
            </View>

            {routePoints.length > 1 ? (
              <View style={styles.routeWrap}>
                <NativeRouteMapCard points={routePoints} title="Captured route" subtitle={routeSubtitle} />
              </View>
            ) : null}

            <View style={styles.actionsWrap}>
              <StepButton
                label={reflectionLabel}
                onPress={() => {
                  void Haptics.selectionAsync();
                  goReflection();
                }}
                disabled={saving}
                fullWidth
                style={styles.primaryAction}
              />

              <View style={styles.secondaryGrid}>
                <StepButton label="BACK HOME" onPress={goHome} variant="tertiary" style={styles.halfButton} />
                <StepButton
                  label="VIEW STATS"
                  onPress={() => {
                    void Haptics.selectionAsync();
                    router.replace("/(tabs)/stats");
                  }}
                  variant="secondary"
                  style={styles.halfButton}
                />
                <StepButton
                  label="SHARE WALK"
                  onPress={() => {
                    void Haptics.selectionAsync();
                    goShare();
                  }}
                  variant="secondary"
                  style={styles.halfButton}
                />
              </View>
            </View>

            <Text style={styles.sub}>
              {saving ? "Saving your walk…" : errorText ? errorText : streakLine || "Streak updated."}
            </Text>
            {routeNote ? <Text style={styles.routeNote}>{routeNote}</Text> : null}
            {sunriseBonus ? <Text style={styles.bonus}>☀️ Sunrise Bonus earned</Text> : null}
            {sunsetBonus ? <Text style={styles.bonus}>🌅 Sunset Bonus earned</Text> : null}
            {lockedBonusTeaser ? (
              <Text style={styles.bonusTeaser}>Premium unlocks sunrise and sunset bonus achievements.</Text>
            ) : null}
            {unlockedBadges.length > 0 || completedChallenges.length > 0 ? (
              <View style={styles.achievementCard}>
                <Text style={styles.achievementEyebrow}>New progress unlocked</Text>
                {unlockedBadges.map((badge) => (
                  <Text key={badge.id} style={styles.achievementLine}>
                    {badge.title} badge earned
                  </Text>
                ))}
                {completedChallenges.map((challenge) => (
                  <Text key={challenge.id} style={styles.achievementLineMuted}>
                    {challenge.title} challenge complete
                  </Text>
                ))}
              </View>
            ) : null}
            {__DEV__ && gpsDiagnostics ? (
              <View style={styles.devCard}>
                <Text style={styles.devTitle}>GPS diagnostics</Text>
                <Text style={styles.devBody}>
                  Raw {gpsDiagnostics.rawPoints} • Accepted {gpsDiagnostics.acceptedPoints} • Rejected {gpsDiagnostics.rejectedPoints}
                </Text>
                <Text style={styles.devBody}>
                  Foreground {gpsDiagnostics.foregroundPoints ?? 0} • Background {gpsDiagnostics.backgroundPoints ?? 0} • Largest gap{" "}
                  {Math.round(gpsDiagnostics.largestTrackingGapSec ?? 0)} sec
                </Text>
                <Text style={styles.devBody}>
                  Background task {gpsDiagnostics.backgroundTaskStarted ? "started" : "not started"} • App state{" "}
                  {gpsDiagnostics.lastAppState ?? "unknown"} • Changes {gpsDiagnostics.appStateChanges ?? 0}
                </Text>
                <Text style={styles.devBody}>
                  Last location{" "}
                  {gpsDiagnostics.lastLocationAt ? new Date(gpsDiagnostics.lastLocationAt).toLocaleTimeString() : "n/a"}
                </Text>
                {gpsDiagnostics.lastTrackingGapReason ? (
                  <Text style={styles.devBody}>Gap reason: {gpsDiagnostics.lastTrackingGapReason}</Text>
                ) : null}
                {gpsDiagnostics.locationPermissionStatus ? (
                  <Text style={styles.devBody}>Permissions: {gpsDiagnostics.locationPermissionStatus}</Text>
                ) : null}
                {gpsDiagnostics.backgroundTaskLastError ? (
                  <Text style={styles.devBody}>Background error: {gpsDiagnostics.backgroundTaskLastError}</Text>
                ) : null}
                <Text style={styles.devBody}>
                  Accepted distance {fmtDistance(gpsDiagnostics.acceptedDistanceM ?? 0)} • Avg accuracy{" "}
                  {gpsDiagnostics.averageAccuracy === null || gpsDiagnostics.averageAccuracy === undefined
                    ? "n/a"
                    : `${Math.round(gpsDiagnostics.averageAccuracy)}m`}{" "}
                  • Worst{" "}
                  {gpsDiagnostics.worstAccuracy === null || gpsDiagnostics.worstAccuracy === undefined
                    ? "n/a"
                    : `${Math.round(gpsDiagnostics.worstAccuracy)}m`}
                </Text>
                {gpsDiagnostics.lastRejectedReason ? (
                  <Text style={styles.devBody}>Last rejection: {gpsDiagnostics.lastRejectedReason}</Text>
                ) : null}
                {routeCaptureInterrupted ? (
                  <Text style={styles.devBody}>
                    Route capture interruption detected{routeGapLabel ? ` (${routeGapLabel})` : ""}.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </>
        ) : (
          <Text style={styles.sub}>No session found.</Text>
        )}
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8F4EE" },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    backgroundColor: "#F8F4EE",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  topBar: {
    width: "100%",
    maxWidth: 540,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: {
    color: "rgba(37,94,54,0.72)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  topBarTitle: {
    marginTop: 2,
    color: "#0B0F0E",
    fontSize: 17,
    fontWeight: "900",
  },
  homeButton: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.18)",
  },
  homeButtonPressed: {
    opacity: 0.72,
  },
  homeButtonText: {
    color: "#255E36",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  headline: { marginTop: 12, fontSize: 24, fontWeight: "900", color: "#0B0F0E" },

  metricsRow: { width: "100%", maxWidth: 540, flexDirection: "row", gap: 10, marginTop: 10 },
  metricCard: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "rgba(11,15,14,0.06)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.12)",
    alignItems: "center",
  },
  metricK: { fontSize: 12, fontWeight: "900", color: "rgba(11,15,14,0.62)" },
  metricV: { marginTop: 6, fontSize: 16, fontWeight: "900", color: "#0B0F0E" },
  routeWrap: {
    marginTop: 12,
    width: "100%",
    maxWidth: 540,
  },

  sub: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(11,15,14,0.65)",
    textAlign: "center",
    paddingHorizontal: 10,
  },
  bonus: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "900",
    color: "#255E36",
  },
  bonusTeaser: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
    color: "rgba(11,15,14,0.7)",
    textAlign: "center",
  },
  routeNote: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "800",
    color: "rgba(37,94,54,0.86)",
  },
  devCard: {
    marginTop: 14,
    width: "100%",
    maxWidth: 540,
    borderRadius: 18,
    backgroundColor: "rgba(11,15,14,0.05)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.08)",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 4,
  },
  devTitle: {
    color: "#0B0F0E",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  devBody: {
    color: "rgba(11,15,14,0.72)",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  achievementCard: {
    marginTop: 14,
    width: "100%",
    maxWidth: 540,
    borderRadius: 20,
    backgroundColor: "rgba(242,181,65,0.22)",
    borderWidth: 1,
    borderColor: "rgba(242,181,65,0.38)",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 4,
  },
  achievementEyebrow: {
    color: "rgba(11,15,14,0.62)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  achievementLine: {
    color: "#0B0F0E",
    fontSize: 15,
    fontWeight: "900",
  },
  achievementLineMuted: {
    color: "rgba(11,15,14,0.72)",
    fontSize: 14,
    fontWeight: "700",
  },
  actionsWrap: {
    width: "100%",
    maxWidth: 540,
    marginTop: 12,
  },
  primaryAction: {
    minHeight: 52,
  },
  secondaryGrid: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  halfButton: {
    minWidth: "48%",
    flexGrow: 1,
    minHeight: 48,
    paddingHorizontal: 12,
  },
});
