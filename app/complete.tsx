import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { RoutePreview } from "../src/components/RoutePreview";
import { clearCompletedWalkDraft, getCompletedWalkDraft } from "../src/lib/activeWalk";
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

  const params = useLocalSearchParams<{
    startedAt?: string;
    endedAt?: string;
    durationSec?: string;
    distanceM?: string;
    source?: string;
    endLat?: string;
    endLng?: string;
  }>();

  const startedAt = Number(params.startedAt ?? "");
  const endedAt = Number(params.endedAt ?? "");
  const durationSec = Number(params.durationSec ?? "");
  const distanceM = Number(params.distanceM ?? "0");
  const source: SessionSource = params.source === "gps" ? "gps" : "timer";
  const endLat = Number(params.endLat ?? "");
  const endLng = Number(params.endLng ?? "");

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
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);

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

        let earnedSunriseBonus = false;
        let earnedSunsetBonus = false;

        if (Number.isFinite(endLat) && Number.isFinite(endLng)) {
          try {
            const day = new Date(endedAt).toISOString().slice(0, 10);
            const wx = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${endLat}&longitude=${endLng}&daily=sunrise,sunset&timezone=auto&start_date=${day}&end_date=${day}`
            );
            if (wx.ok) {
              const data = await wx.json();
              const sunriseIso = data?.daily?.sunrise?.[0] as string | undefined;
              const sunsetIso = data?.daily?.sunset?.[0] as string | undefined;

              const endMs = endedAt;
              const windowMs = 45 * 60 * 1000;

              if (sunriseIso) {
                const sr = new Date(sunriseIso).getTime();
                earnedSunriseBonus = Math.abs(endMs - sr) <= windowMs;
              }
              if (sunsetIso) {
                const ss = new Date(sunsetIso).getTime();
                earnedSunsetBonus = Math.abs(endMs - ss) <= windowMs;
              }
            }
          } catch {
            // bonus check best effort only
          }
        }

        setSunriseBonus(earnedSunriseBonus);
        setSunsetBonus(earnedSunsetBonus);
        setRoutePoints(walkDraft?.routePoints ?? []);

        const result = await addCompletedSession({
          id,
          startedAt,
          endedAt,
          durationSec,
          source,
          distanceM: Number.isFinite(distanceM) ? Math.max(0, Math.round(distanceM)) : 0,
          routePoints: walkDraft?.routePoints ?? [],
          sunriseBonus: earnedSunriseBonus,
          sunsetBonus: earnedSunsetBonus,
        });

        await clearCompletedWalkDraft();

        setSummary(result.summary);

        if (!didHapticRef.current) {
          didHapticRef.current = true;
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch {
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
    return saving ? "SAVING…" : "CONTINUE";
  }, [saving, valid]);

  const goNext = () => {
    if (!valid) {
      router.replace("/(tabs)");
      return;
    }

    router.push({
      pathname: "/reflection" as never,
      params: {
        walkId: `${startedAt}-${endedAt}`,
        startedAt: String(startedAt),
        endedAt: String(endedAt),
        durationSec: String(durationSec),
        distanceM: String(Number.isFinite(distanceM) ? Math.max(0, Math.round(distanceM)) : 0),
        source,
        sunriseBonus: String(sunriseBonus),
        sunsetBonus: String(sunsetBonus),
        routePointCount: String(routePoints.length),
      },
    } as never);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.container}>
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
                <RoutePreview points={routePoints} title="Captured route" subtitle="Saved from this walk" />
              </View>
            ) : null}

            <Text style={styles.sub}>
              {saving ? "Saving your walk…" : errorText ? errorText : streakLine || "Streak updated."}
            </Text>
            {!saving && routePoints.length > 1 ? (
              <Text style={styles.routeNote}>Route captured for this walk.</Text>
            ) : null}
            {sunriseBonus ? <Text style={styles.bonus}>☀️ Sunrise bonus earned</Text> : null}
            {sunsetBonus ? <Text style={styles.bonus}>🌅 Sunset bonus earned</Text> : null}
          </>
        ) : (
          <Text style={styles.sub}>No session found.</Text>
        )}

        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            goNext();
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
  routeNote: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "800",
    color: "rgba(37,94,54,0.86)",
  },

  btnPrimary: {
    marginTop: 22,
    backgroundColor: "#255E36",
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
    backgroundColor: "rgba(11,15,14,0.06)",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 16,
    minWidth: 240,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.12)",
  },
  btnSecondaryText: { color: "#0B0F0E", fontWeight: "900", letterSpacing: 1 },
});
