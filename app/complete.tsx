import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { OutdoorTheme } from "../constants/theme";
import { BrandHeaderMark } from "../src/components/BrandBadge";
import { LayeredEnvironment } from "../src/components/OutdoorUI";
import { RoutePreview } from "../src/components/RoutePreview";
import { logWalkCompleted } from "../src/lib/analytics";
import { clearActiveWalkSnapshot, clearCompletedWalkDraft, getCompletedWalkDraft } from "../src/lib/activeWalk";
import { getProState } from "../src/lib/pro";
import { evaluateSolarBonus } from "../src/lib/solarBonus";
import { addCompletedSession, updateCompletedSessionBonus, type OutsideSession, type RoutePoint, type SessionSource, type SummaryStats } from "../src/lib/store";
import {
  formatDistanceMiles,
  formatDurationClock,
  formatDurationMinutesLabel,
  resolveSessionDistanceMeters,
  resolveSessionElapsedSeconds,
} from "../src/utils/sessionSummary";

export default function CompleteScreen() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    walkId?: string;
    startedAt?: string;
    endedAt?: string;
    durationSec?: string;
    movingTimeSec?: string;
    pausedTimeSec?: string;
    distanceM?: string;
    source?: string;
  }>();

  const paramWalkId = (params.walkId ?? "").trim();
  const paramStartedAt = Number(params.startedAt ?? "");
  const paramEndedAt = Number(params.endedAt ?? "");
  const paramDurationSec = Number(params.durationSec ?? "");
  const paramMovingTimeSec = Number(params.movingTimeSec ?? "");
  const paramPausedTimeSec = Number(params.pausedTimeSec ?? "");
  const paramDistanceM = Number(params.distanceM ?? "0");
  const paramSource: SessionSource = params.source === "gps" ? "gps" : "timer";

  const [saving, setSaving] = useState(true);
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [errorText, setErrorText] = useState("");
  const [sunriseBonus, setSunriseBonus] = useState(false);
  const [sunsetBonus, setSunsetBonus] = useState(false);
  const [lockedBonusTeaser, setLockedBonusTeaser] = useState(false);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [savedSession, setSavedSession] = useState<OutsideSession | null>(null);
  const [resolvedWalkId, setResolvedWalkId] = useState(paramWalkId);
  const [resolvedStartedAt, setResolvedStartedAt] = useState(paramStartedAt);
  const [resolvedEndedAt, setResolvedEndedAt] = useState(paramEndedAt);
  const [resolvedDurationSec, setResolvedDurationSec] = useState(paramDurationSec);
  const [resolvedMovingTimeSec, setResolvedMovingTimeSec] = useState(paramMovingTimeSec);
  const [resolvedPausedTimeSec, setResolvedPausedTimeSec] = useState(paramPausedTimeSec);
  const [resolvedDistanceM, setResolvedDistanceM] = useState(paramDistanceM);
  const [resolvedSource, setResolvedSource] = useState<SessionSource>(paramSource);
  const resolvedValid =
    Number.isFinite(resolvedStartedAt) &&
    Number.isFinite(resolvedEndedAt) &&
    Number.isFinite(resolvedDurationSec) &&
    resolvedDurationSec > 0;
  const fallbackSession: Partial<OutsideSession> = {
    id: resolvedWalkId,
    startedAt: resolvedStartedAt,
    endedAt: resolvedEndedAt,
    durationSec: resolvedDurationSec,
    elapsedTimeSec: resolvedDurationSec,
    movingTimeSec: resolvedMovingTimeSec,
    pausedTimeSec: resolvedPausedTimeSec,
    distanceM: resolvedDistanceM,
    source: resolvedSource,
    routePoints,
  };
  const displaySession = savedSession ?? fallbackSession;
  const displayElapsedSeconds = resolveSessionElapsedSeconds(savedSession, fallbackSession);
  const displayDistanceMeters = resolveSessionDistanceMeters(savedSession, fallbackSession);

  const lastSaveKeyRef = useRef<string | null>(null);
  const didHapticRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        setErrorText("");
        setSaving(true);
        const walkDraft = await getCompletedWalkDraft();
        const draftMatchesParams =
          Boolean(
            walkDraft &&
              ((walkDraft.id && walkDraft.id === paramWalkId) ||
                (walkDraft.startedAt === paramStartedAt && walkDraft.endedAt === paramEndedAt))
          );
        const startedAt = draftMatchesParams ? Number(walkDraft?.startedAt ?? paramStartedAt) : paramStartedAt;
        const endedAt = draftMatchesParams ? Number(walkDraft?.endedAt ?? paramEndedAt) : paramEndedAt;
        const durationSec = draftMatchesParams ? Number(walkDraft?.durationSec ?? paramDurationSec) : paramDurationSec;
        const movingTimeSec = draftMatchesParams
          ? Number(walkDraft?.movingTimeSec ?? paramMovingTimeSec)
          : paramMovingTimeSec;
        const pausedTimeSec = draftMatchesParams
          ? Number(walkDraft?.pausedTimeSec ?? paramPausedTimeSec)
          : paramPausedTimeSec;
        const distanceM = draftMatchesParams ? Number(walkDraft?.distanceM ?? paramDistanceM) : paramDistanceM;
        const source: SessionSource =
          draftMatchesParams && (walkDraft?.source === "gps" || walkDraft?.source === "timer")
            ? walkDraft.source
            : paramSource;
        const walkId =
          draftMatchesParams && typeof walkDraft?.id === "string" && walkDraft.id.trim()
            ? walkDraft.id.trim()
            : paramWalkId || `${startedAt}-${endedAt}`;
        const draftRoutePoints = draftMatchesParams ? walkDraft?.routePoints ?? [] : [];

        const valid =
          Number.isFinite(startedAt) &&
          Number.isFinite(endedAt) &&
          Number.isFinite(durationSec) &&
          durationSec > 0;
        const counts = valid && durationSec >= 10;
        const saveKey = `${walkId}-${durationSec}-${Math.round(Number.isFinite(distanceM) ? distanceM : 0)}-${source}`;

        setResolvedWalkId(walkId);
        setResolvedStartedAt(startedAt);
        setResolvedEndedAt(endedAt);
        setResolvedDurationSec(durationSec);
        setResolvedMovingTimeSec(movingTimeSec);
        setResolvedPausedTimeSec(pausedTimeSec);
        setResolvedDistanceM(distanceM);
        setResolvedSource(source);
        setRoutePoints(draftRoutePoints);

        if (__DEV__) {
          console.log("[complete] resolved-handoff", {
            paramWalkId,
            walkId,
            liveElapsedSeconds: durationSec,
            liveMovingSeconds: movingTimeSec,
            pausedSeconds: pausedTimeSec,
            rawRoutePointCount: walkDraft?.routePoints?.length ?? 0,
            acceptedRoutePointCount: draftRoutePoints.length,
            filteredDistanceMeters: distanceM,
            source,
            usedDraft: draftMatchesParams,
          });
        }

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

        const result = await addCompletedSession({
          id: walkId,
          startedAt,
          endedAt,
          durationSec,
          elapsedTimeSec: durationSec,
          movingTimeSec: Number.isFinite(movingTimeSec) ? Math.max(0, Math.round(movingTimeSec)) : undefined,
          pausedTimeSec: Number.isFinite(pausedTimeSec) ? Math.max(0, Math.round(pausedTimeSec)) : undefined,
          source,
          title: source === "gps" ? "Tracked outdoor walk" : "Outdoor walk",
          activityType: "walk",
          distanceM: Number.isFinite(distanceM) ? Math.max(0, Math.round(distanceM)) : 0,
          routePoints: draftRoutePoints,
          isSunriseBonus: false,
          isSunsetBonus: false,
          bonusType: null,
          bonusLabel: null,
          bonusPoints: null,
          sunriseBonus: false,
          sunsetBonus: false,
        });

        try {
          await clearCompletedWalkDraft();
          await clearActiveWalkSnapshot();
        } catch (error) {
          // The local session is already durable. Leaving a handoff copy is
          // safer than turning a successful save into a perceived failure.
          if (__DEV__) console.warn("[complete] completed-walk cleanup deferred", error);
        }

        setSummary(result.summary);
        setSavedSession(result.session);
        void logWalkCompleted(durationSec / 60, Math.max(0, distanceM) / 1609.344);

        if (__DEV__) {
          console.log("[complete] saved-session", {
            savedActivityId: walkId,
            savedDistanceMiles: Number(((Math.max(0, distanceM) / 1609.344) || 0).toFixed(2)),
            savedDistanceMeters: Math.max(0, distanceM),
            routePointCount: draftRoutePoints.length,
          });
        }

        if (!didHapticRef.current) {
          didHapticRef.current = true;
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        void (async () => {
          try {
            // Both entitlement lookup and solar lookup are deliberately outside
            // the critical local-save path.
            const premiumStatus = await getProState();
            const solarBonus = await evaluateSolarBonus({
              startedAt,
              startPoint: draftRoutePoints[0] ?? null,
              isPremium: premiumStatus.isPro,
            });
            await updateCompletedSessionBonus(walkId, {
              isSunriseBonus: solarBonus.isSunriseBonus,
              isSunsetBonus: solarBonus.isSunsetBonus,
              bonusType: solarBonus.bonusType,
              bonusLabel: solarBonus.bonusLabel,
              bonusPoints: solarBonus.bonusPoints,
              sunriseBonus: solarBonus.isSunriseBonus,
              sunsetBonus: solarBonus.isSunsetBonus,
            });
            setSunriseBonus(solarBonus.isSunriseBonus);
            setSunsetBonus(solarBonus.isSunsetBonus);
            setLockedBonusTeaser(Boolean(solarBonus.bonusType) && !premiumStatus.isPro);
          } catch (error) {
            if (__DEV__) console.warn("[complete] bonus metadata update failed", error);
          }
        })();
      } catch (error) {
        console.error("[complete] failed to save walk", error);
        lastSaveKeyRef.current = null;
        setErrorText("Couldn’t save this session. Try again.");
      } finally {
        setSaving(false);
      }
    })();
  }, [paramDistanceM, paramDurationSec, paramEndedAt, paramMovingTimeSec, paramPausedTimeSec, paramSource, paramStartedAt, paramWalkId]);

  const headline = useMemo(() => {
    if (!resolvedValid) return "Go back and start a walk.";
    if (resolvedDurationSec < 10) return "Almost.";
    return "This counts.";
  }, [resolvedDurationSec, resolvedValid]);

  const streakLine = useMemo(() => {
    if (!summary) return "";
    const cs = Number(summary.currentStreakDays ?? 0);
    const bs = Number(summary.bestStreakDays ?? 0);
    return `Streak: ${cs} day${cs === 1 ? "" : "s"} • Best: ${bs}`;
  }, [summary]);

  const continueLabel = useMemo(() => {
    if (!resolvedValid) return "BACK HOME";
    return saving ? "SAVING…" : "CONTINUE";
  }, [resolvedValid, saving]);

  const goNext = () => {
    if (!resolvedValid) {
      router.replace("/(tabs)");
      return;
    }

    router.push({
      pathname: "/reflection" as never,
      params: {
        walkId: resolvedWalkId || `${resolvedStartedAt}-${resolvedEndedAt}`,
        sunriseBonus: String(sunriseBonus),
        sunsetBonus: String(sunsetBonus),
      },
    } as never);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <LayeredEnvironment />
      <View style={styles.container}>
        <BrandHeaderMark size={64} showTagline style={styles.logo} />

        <Text style={styles.headline}>{headline}</Text>

        {resolvedValid ? (
          <>
            <Text style={styles.big}>
              {formatDurationMinutesLabel(displayElapsedSeconds || resolvedDurationSec)}
            </Text>

            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricK}>Time</Text>
                <Text style={styles.metricV}>{formatDurationClock(displayElapsedSeconds)}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricK}>Distance</Text>
                <Text style={styles.metricV}>{formatDistanceMiles(displayDistanceMeters)}</Text>
              </View>
            </View>

            {displaySession.source === "gps" && displayDistanceMeters <= 0 && (displaySession.routePoints?.length ?? 0) < 2 ? (
              <Text style={styles.routeNote}>GPS is still locking in. Keep moving for a more accurate distance.</Text>
            ) : null}

            {(displaySession.routePoints?.length ?? 0) > 1 ? (
              <View style={styles.routeWrap}>
                <RoutePreview points={displaySession.routePoints ?? []} title="Captured route" subtitle="Saved from this walk" />
              </View>
            ) : null}

            <Text style={styles.sub}>
              {saving ? "Saving your walk…" : errorText ? errorText : streakLine || "Streak updated."}
            </Text>
            {!saving && (displaySession.routePoints?.length ?? 0) > 1 ? (
              <Text style={styles.routeNote}>Route captured for this walk.</Text>
            ) : null}
            {sunriseBonus ? <Text style={styles.bonus}>Sunrise Bonus earned</Text> : null}
            {sunsetBonus ? <Text style={styles.bonus}>Sunset Bonus earned</Text> : null}
            {lockedBonusTeaser ? (
              <Text style={styles.bonusTeaser}>Premium unlocks sunrise and sunset bonus achievements.</Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.sub}>No session found.</Text>
        )}

        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            goNext();
          }}
          disabled={saving && resolvedValid}
          style={({ pressed }) => [
            styles.btnPrimary,
            saving && resolvedValid ? styles.btnDisabled : null,
            pressed ? { opacity: 0.9 } : null,
          ]}
        >
          <Text style={styles.btnPrimaryText}>{continueLabel}</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "transparent" },
  container: {
    flex: 1,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  logo: { marginBottom: 14 },
  headline: { marginTop: 14, fontSize: 22, fontWeight: "900", color: OutdoorTheme.colors.charcoal },
  big: { marginTop: 10, fontSize: 44, fontWeight: "900", color: OutdoorTheme.colors.charcoal },

  metricsRow: { flexDirection: "row", gap: 12, marginTop: 14 },
  metricCard: {
    minWidth: 140,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: OutdoorTheme.radii.lg,
    backgroundColor: OutdoorTheme.colors.paperTranslucent,
    borderWidth: 1,
    borderColor: "rgba(30,42,36,0.12)",
    alignItems: "center",
  },
  metricK: { fontSize: 12, fontWeight: "900", color: "rgba(30,42,36,0.62)" },
  metricV: { marginTop: 6, fontSize: 16, fontWeight: "900", color: OutdoorTheme.colors.charcoal },
  routeWrap: {
    marginTop: 18,
    width: "100%",
    maxWidth: 540,
  },

  sub: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(30,42,36,0.65)",
    textAlign: "center",
    paddingHorizontal: 10,
  },
  bonus: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "900",
    color: OutdoorTheme.colors.goldText,
    backgroundColor: OutdoorTheme.colors.goldTint,
    borderWidth: 1,
    borderColor: "rgba(198,155,66,0.24)",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: OutdoorTheme.radii.pill,
  },
  bonusTeaser: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
    color: "rgba(30,42,36,0.7)",
    textAlign: "center",
  },
  routeNote: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "800",
    color: "rgba(24,68,47,0.86)",
  },

  btnPrimary: {
    marginTop: 22,
    backgroundColor: OutdoorTheme.colors.forest,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 16,
    minWidth: 240,
    alignItems: "center",
  },
  btnPrimaryText: { color: "white", fontWeight: "900", letterSpacing: 1 },
  btnDisabled: {
    opacity: 0.6,
  },

  btnSecondary: {
    marginTop: 12,
    backgroundColor: "rgba(30,42,36,0.06)",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 16,
    minWidth: 240,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(30,42,36,0.12)",
  },
  btnSecondaryText: { color: OutdoorTheme.colors.charcoal, fontWeight: "900", letterSpacing: 1 },
});
