import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BadgeRevealSplash } from "../src/components/BadgeRevealSplash";
import { NativeRouteMapCard } from "../src/components/NativeRouteMapCard";
import { PostWalkTabNav } from "../src/components/PostWalkTabNav";
import { clearCompletedWalkDraft, getCompletedWalkDraft } from "../src/lib/activeWalk";
import { BADGE_CATALOG, CHALLENGE_CATALOG } from "../src/lib/challenges/catalog";
import { refreshLocalChallengeSnapshot } from "../src/lib/challenges/storage";
import { getCachedAuthUser } from "../src/lib/auth";
import { syncCorporateChallengeProgressFromWalk, syncCorporateMemberStatsFromWalk } from "../src/lib/corporate";
import { getPremiumStatus } from "../src/lib/pro";
import { evaluateSolarBonus } from "../src/lib/solarBonus";
import { addCompletedSession, type RoutePoint, type SessionSource, type SummaryStats } from "../src/lib/store";

function minutesFromDuration(durationSec: number): number {
  return Math.max(1, Math.round(durationSec / 60));
}

function fmtNiceMinutes(min: number): string {
  return min === 1 ? "1 minute" : `${min} minutes`;
}

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
  const [minutes, setMinutes] = useState(0);
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [errorText, setErrorText] = useState("");
  const [sunriseBonus, setSunriseBonus] = useState(false);
  const [sunsetBonus, setSunsetBonus] = useState(false);
  const [lockedBonusTeaser, setLockedBonusTeaser] = useState(false);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [newlyEarnedBadgeIds, setNewlyEarnedBadgeIds] = useState<string[]>([]);
  const [newlyCompletedChallengeIds, setNewlyCompletedChallengeIds] = useState<string[]>([]);
  const [badgeRevealIndex, setBadgeRevealIndex] = useState(0);

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

        const mins = minutesFromDuration(durationSec);
        setMinutes(mins);

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

  const continueLabel = useMemo(() => {
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

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.container}>
        <BadgeRevealSplash
          badge={activeBadgeReveal}
          queuePosition={Math.min(unlockedBadges.length, badgeRevealIndex + 1)}
          queueTotal={unlockedBadges.length}
          onContinue={advanceBadgeReveal}
        />
        <Image source={require("../assets/images/icon.png")} style={styles.logo} />
        <Text style={styles.title}>Step Outside</Text>

        <Text style={styles.headline}>{headline}</Text>

        {valid ? (
          <>
            <Text style={styles.big}>
              {fmtNiceMinutes(minutes || minutesFromDuration(durationSec))}
            </Text>

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
                <NativeRouteMapCard points={routePoints} title="Captured route" subtitle="Saved from this walk" />
              </View>
            ) : null}

            <Text style={styles.sub}>
              {saving ? "Saving your walk…" : errorText ? errorText : streakLine || "Streak updated."}
            </Text>
            {!saving && routePoints.length > 1 ? (
              <Text style={styles.routeNote}>Route captured for this walk.</Text>
            ) : null}
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
          </>
        ) : (
          <Text style={styles.sub}>No session found.</Text>
        )}

        <View style={styles.actionsWrap}>
          <Text style={styles.actionsLabel}>What next?</Text>

          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              goReflection();
            }}
            disabled={saving && valid}
            style={({ pressed }) => [
              styles.btnPrimary,
              saving && valid ? styles.btnDisabled : null,
              pressed ? { opacity: 0.9 } : null,
            ]}
          >
            <Text style={styles.btnPrimaryText}>{continueLabel}</Text>
          </Pressable>

          <View style={styles.secondaryGrid}>
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                goShare();
              }}
              style={({ pressed }) => [styles.btnSecondary, pressed ? { opacity: 0.9 } : null]}
            >
              <Text style={styles.btnSecondaryText}>SHARE WALK</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                router.replace("/(tabs)/stats");
              }}
              style={({ pressed }) => [styles.btnSecondary, pressed ? { opacity: 0.9 } : null]}
            >
              <Text style={styles.btnSecondaryText}>VIEW STATS</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                router.replace("/(tabs)");
              }}
              style={({ pressed }) => [styles.btnSecondary, pressed ? { opacity: 0.9 } : null]}
            >
              <Text style={styles.btnSecondaryText}>BACK HOME</Text>
            </Pressable>
          </View>
        </View>

        <PostWalkTabNav params={walkParams} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8F4EE" },
  container: {
    flex: 1,
    backgroundColor: "#F8F4EE",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  logo: { width: 88, height: 88, borderRadius: 22, marginBottom: 14 },
  title: { fontSize: 22, fontWeight: "900", color: "#0B0F0E" },
  headline: { marginTop: 14, fontSize: 22, fontWeight: "900", color: "#0B0F0E" },
  big: { marginTop: 10, fontSize: 44, fontWeight: "900", color: "#0B0F0E" },

  metricsRow: { flexDirection: "row", gap: 12, marginTop: 14 },
  metricCard: {
    minWidth: 140,
    paddingVertical: 12,
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
    marginTop: 18,
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
    marginTop: 20,
  },
  actionsLabel: {
    marginBottom: 10,
    color: "rgba(11,15,14,0.56)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    textAlign: "center",
  },

  btnPrimary: {
    backgroundColor: "#255E36",
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 16,
    width: "100%",
    alignItems: "center",
  },
  btnPrimaryText: { color: "white", fontWeight: "900", letterSpacing: 1 },
  secondaryGrid: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  btnSecondary: {
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.10)",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "48%",
    flexGrow: 1,
  },
  btnSecondaryText: {
    color: "#0B0F0E",
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
