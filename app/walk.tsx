import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, type AppStateStatus, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import {
  clearCompletedWalkDraft,
  clearActiveWalkSnapshot,
  getActiveWalkSnapshot,
  setActiveWalkSnapshot,
  setCompletedWalkDraft,
} from "../src/lib/activeWalk";
import type { RoutePoint } from "../src/lib/store";

type LatLng = { lat: number; lng: number };

type PermissionState = "unknown" | "granted" | "denied";

type SessionSource = "gps" | "timer";

function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return R * c;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.max(0, sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPace(distanceM: number, elapsedSec: number): string {
  if (distanceM < 25 || elapsedSec < 15) return "";

  const miles = distanceM / 1609.344;
  if (!Number.isFinite(miles) || miles <= 0) return "";

  const totalSecondsPerMile = Math.round(elapsedSec / miles);
  if (!Number.isFinite(totalSecondsPerMile) || totalSecondsPerMile <= 0) return "";

  const mm = Math.floor(totalSecondsPerMile / 60);
  const ss = totalSecondsPerMile % 60;
  return `${mm}:${String(ss).padStart(2, "0")} / mi`;
}

export default function Walk() {
  const router = useRouter();
  const SNAPSHOT_PERSIST_DEBOUNCE_MS = 4000;

  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [running, setRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [restored, setRestored] = useState(false);
  const [busyAction, setBusyAction] = useState<"start" | "pause" | "resume" | "stop" | null>(null);

  const startedAtRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoringRef = useRef(false);
  const elapsedBeforeRunRef = useRef(0);
  const runStartedAtRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const distanceRef = useRef(0);
  const routePointsRef = useRef<RoutePoint[]>([]);
  const hadGpsPointsRef = useRef(false);

  const lastPointRef = useRef<LatLng | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const pace = useMemo(() => {
    return formatPace(distanceM, elapsedSec);
  }, [distanceM, elapsedSec]);

  const refreshPermission = useCallback(async () => {
    try {
      const res = await Location.getForegroundPermissionsAsync();
      const nextPermission: PermissionState = res.status === "granted" ? "granted" : "denied";
      setPermission(nextPermission);
      return nextPermission === "granted";
    } catch {
      setPermission("denied");
      return false;
    }
  }, []);

  const requestPerms = useCallback(async () => {
    try {
      const res = await Location.requestForegroundPermissionsAsync();
      const ok = res.status === "granted";
      setPermission(ok ? "granted" : "denied");
      return ok;
    } catch {
      setPermission("denied");
      return false;
    }
  }, []);

  const ensureLocationPermission = useCallback(async () => {
    if (permission === "granted") return true;
    if (permission === "denied") return false;

    const hasExistingPermission = await refreshPermission();
    if (hasExistingPermission) return true;

    return await requestPerms();
  }, [permission, refreshPermission, requestPerms]);

  const startGps = useCallback(async () => {
    subRef.current?.remove();
    subRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 3,
      },
      (pos) => {
        const accuracy = pos.coords.accuracy ?? Number.POSITIVE_INFINITY;
        if (accuracy > 35) return;

        const point: RoutePoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          t: pos.timestamp || Date.now(),
          ...(Number.isFinite(accuracy) ? { accuracy } : {}),
        };
        const p = { lat: point.lat, lng: point.lng };
        const last = lastPointRef.current;
        if (last) {
          const d = haversineMeters(last, p);
          // Ignore jitter smaller than a few steps and large GPS spikes.
          if (d >= 2 && d < 80) {
            setDistanceM((m) => m + d);
            routePointsRef.current = [...routePointsRef.current, point];
            hadGpsPointsRef.current = routePointsRef.current.length > 1;
          }
        } else {
          routePointsRef.current = [...routePointsRef.current, point];
        }
        lastPointRef.current = p;
      }
    );
  }, []);

  const stopGps = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
    lastPointRef.current = null;
  }, []);

  const getElapsedNow = useCallback(() => {
    if (!runStartedAtRef.current) return elapsedBeforeRunRef.current;
    return elapsedBeforeRunRef.current + Math.max(0, Math.floor((Date.now() - runStartedAtRef.current) / 1000));
  }, []);

  const syncElapsedFromClock = useCallback(() => {
    const nextElapsed = getElapsedNow();
    setElapsedSec((current) => (current === nextElapsed ? current : nextElapsed));
    return nextElapsed;
  }, [getElapsedNow]);

  const startTimer = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    syncElapsedFromClock();
    tickRef.current = setInterval(() => {
      syncElapsedFromClock();
    }, 1000);
  }, [syncElapsedFromClock]);

  const stopTimer = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  }, []);

  const persistActiveWalk = useCallback(
    async (overrides?: Partial<{ elapsedSec: number; distanceM: number; running: boolean; routePoints: RoutePoint[] }>) => {
      const startedAt = startedAtRef.current;
      if (!startedAt) return;

      await setActiveWalkSnapshot({
        startedAt,
        elapsedSec: overrides?.elapsedSec ?? getElapsedNow(),
        distanceM: overrides?.distanceM ?? distanceRef.current,
        routePoints: overrides?.routePoints ?? routePointsRef.current,
        running: overrides?.running ?? runningRef.current,
        updatedAt: Date.now(),
      });
    },
    [getElapsedNow]
  );

  const clearScheduledPersist = useCallback(() => {
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = null;
    }
  }, []);

  const schedulePersist = useCallback(
    (overrides?: Partial<{ elapsedSec: number; distanceM: number; running: boolean; routePoints: RoutePoint[] }>) => {
      if (restoringRef.current || !startedAtRef.current) return;
      clearScheduledPersist();
      persistTimeoutRef.current = setTimeout(() => {
        void persistActiveWalk(overrides);
        persistTimeoutRef.current = null;
      }, SNAPSHOT_PERSIST_DEBOUNCE_MS);
    },
    [clearScheduledPersist, persistActiveWalk]
  );

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    distanceRef.current = distanceM;
  }, [distanceM]);

  const resetWalkState = useCallback(async () => {
    clearScheduledPersist();
    stopTimer();
    stopGps();
    startedAtRef.current = null;
    elapsedBeforeRunRef.current = 0;
    runStartedAtRef.current = null;
    runningRef.current = false;
    distanceRef.current = 0;
    routePointsRef.current = [];
    hadGpsPointsRef.current = false;
    lastPointRef.current = null;
    setElapsedSec(0);
    setDistanceM(0);
    setRunning(false);
    await clearActiveWalkSnapshot();
  }, [clearScheduledPersist, stopGps, stopTimer]);

  const start = async () => {
    if (!restored || running || busyAction) return;
    setBusyAction("start");
    void Haptics.selectionAsync();
    try {
      const ok = await ensureLocationPermission();
      await clearCompletedWalkDraft();
      await resetWalkState();

      startedAtRef.current = Date.now();
      elapsedBeforeRunRef.current = 0;
      runStartedAtRef.current = Date.now();
      setElapsedSec(0);
      setDistanceM(0);
      lastPointRef.current = null;
      routePointsRef.current = [];
      hadGpsPointsRef.current = false;

      setRunning(true);
      runningRef.current = true;
      distanceRef.current = 0;
      await persistActiveWalk({ elapsedSec: 0, distanceM: 0, routePoints: [], running: true });
      startTimer();

      if (ok) {
        await startGps();
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setBusyAction(null);
    }
  };

  const pause = async () => {
    if (!restored || !running || busyAction) return;
    setBusyAction("pause");
    void Haptics.selectionAsync();
    try {
      const nextElapsed = syncElapsedFromClock();
      elapsedBeforeRunRef.current = nextElapsed;
      runStartedAtRef.current = null;
      setElapsedSec(nextElapsed);
      setRunning(false);
      runningRef.current = false;
      stopTimer();
      stopGps();
      await persistActiveWalk({ elapsedSec: nextElapsed, running: false });
    } finally {
      setBusyAction(null);
    }
  };

  const resume = async () => {
    if (!restored || running || busyAction) return;
    setBusyAction("resume");
    void Haptics.selectionAsync();
    try {
      const ok = await ensureLocationPermission();

      elapsedBeforeRunRef.current = getElapsedNow();
      runStartedAtRef.current = Date.now();
      setRunning(true);
      runningRef.current = true;
      await persistActiveWalk({ elapsedSec: elapsedBeforeRunRef.current, running: true });
      startTimer();

      if (ok) {
        await startGps();
      }
    } finally {
      setBusyAction(null);
    }
  };

  const end = async () => {
    if (busyAction) return;
    setBusyAction("stop");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    const source: SessionSource = hadGpsPointsRef.current || routePointsRef.current.length > 1 ? "gps" : "timer";
    const endLat = lastPointRef.current?.lat;
    const endLng = lastPointRef.current?.lng;
    const routePoints = routePointsRef.current;
    const finalElapsed = syncElapsedFromClock();
    elapsedBeforeRunRef.current = finalElapsed;
    runStartedAtRef.current = null;

    stopTimer();
    stopGps();
    await clearActiveWalkSnapshot();

    const startedAt = startedAtRef.current ?? Date.now();
    const endedAt = Date.now();
    startedAtRef.current = null;
    setRunning(false);
    runningRef.current = false;
    clearScheduledPersist();

    // Guard: only count sessions >= 10 seconds
    if (finalElapsed < 10) {
      await resetWalkState();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Walk too short", "Walks need to be at least 10 seconds to count.");
      setBusyAction(null);
      return;
    }

    await setCompletedWalkDraft({ routePoints });

    router.replace({
      pathname: "/complete",
      params: {
        startedAt: String(startedAt),
        endedAt: String(endedAt),
        durationSec: String(finalElapsed),
        distanceM: String(Math.round(distanceM)),
        source,
        routePointCount: String(routePoints.length),
        ...(Number.isFinite(endLat) && Number.isFinite(endLng)
          ? { endLat: String(endLat), endLng: String(endLng) }
          : {}),
      },
    });
  };

  const leaveWalkScreen = useCallback(
    (destination: "back" | "home") => {
      const go = () => {
        if (destination === "home") {
          router.replace("/(tabs)");
          return;
        }
        router.back();
      };

      if (!startedAtRef.current || elapsedSec === 0) {
        void Haptics.selectionAsync();
        go();
        return;
      }

      const confirmMessage = running
        ? "You can leave this screen and keep the walk active in the background."
        : "You can leave now and come back to resume this walk later.";

      if (Platform.OS === "web") {
        const confirmed =
          typeof globalThis.confirm === "function"
            ? globalThis.confirm(`Keep this walk going?\n\n${confirmMessage}`)
            : true;

        if (confirmed) {
          void Haptics.selectionAsync();
          go();
        }
        return;
      }

      Alert.alert(
        "Keep this walk going?",
        confirmMessage,
        [
          { text: "Stay", style: "cancel" },
          {
            text: running ? "Leave Running" : "Leave Walk",
            onPress: () => {
              void Haptics.selectionAsync();
              go();
            },
          },
        ]
      );
    },
    [elapsedSec, router, running]
  );

  useEffect(() => {
    void refreshPermission();
  }, [refreshPermission]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (startedAtRef.current && previousState === "active" && nextState.match(/inactive|background/)) {
        clearScheduledPersist();
        void persistActiveWalk();
      }
    });

    return () => {
      subscription.remove();
      clearScheduledPersist();
      if (startedAtRef.current) {
        void persistActiveWalk();
      }
      stopTimer();
      stopGps();
    };
  }, [clearScheduledPersist, persistActiveWalk, stopGps, stopTimer]);

  useEffect(() => {
    void (async () => {
      restoringRef.current = true;
      const snapshot = await getActiveWalkSnapshot();
      if (!snapshot) {
        elapsedBeforeRunRef.current = 0;
        runStartedAtRef.current = null;
        restoringRef.current = false;
        setRestored(true);
        return;
      }

      startedAtRef.current = snapshot.startedAt;
      const recoveredElapsed =
        snapshot.running
          ? snapshot.elapsedSec + Math.max(0, Math.round((Date.now() - snapshot.updatedAt) / 1000))
          : snapshot.elapsedSec;

      elapsedBeforeRunRef.current = snapshot.running ? snapshot.elapsedSec : recoveredElapsed;
      runStartedAtRef.current = snapshot.running ? snapshot.updatedAt : null;
      runningRef.current = snapshot.running;
      distanceRef.current = snapshot.distanceM;
      routePointsRef.current = snapshot.routePoints ?? [];
      hadGpsPointsRef.current = routePointsRef.current.length > 1;
      setElapsedSec(recoveredElapsed);
      setDistanceM(snapshot.distanceM);
      setRunning(snapshot.running);
      if (routePointsRef.current.length > 0) {
        const last = routePointsRef.current[routePointsRef.current.length - 1];
        if (last) {
          lastPointRef.current = { lat: last.lat, lng: last.lng };
        }
      }

      if (snapshot.running) {
        startTimer();
        const ok = await refreshPermission();
        if (ok) {
          await startGps();
        }
      }

      restoringRef.current = false;
      setRestored(true);
    })();
  }, [refreshPermission, startGps, startTimer]);

  useEffect(() => {
    if (restoringRef.current || !startedAtRef.current) return;
    schedulePersist();
  }, [distanceM, elapsedSec, running, schedulePersist]);

  const hasActiveSession = Boolean(startedAtRef.current) || elapsedSec > 0 || distanceM > 0;
  const startResumeLabel =
    busyAction === "start"
      ? "STARTING…"
      : busyAction === "resume"
        ? "RESUMING…"
        : hasActiveSession
          ? running
            ? "ACTIVE"
            : "RESUME"
          : "START";
  const canStartOrResume = restored && busyAction !== "stop" && !running;
  const canPause = restored && running && busyAction === null;
  const canStop = hasActiveSession && busyAction === null;
  const statusText = running
    ? "Walk in progress. Pause when you want a breather."
    : hasActiveSession
      ? "Your walk is paused. Resume when you're ready."
      : permission === "denied"
        ? "Timer-only mode is ready. Turn location back on anytime for route and distance."
        : "Start when you're ready. Distance and pace appear automatically when location is on.";

  return (
    <View style={styles.container}>
      <View style={styles.bgGlowTop} />
      <View style={styles.bgGlowBottom} />

      <View style={styles.sessionCard}>
        <View style={styles.sessionHeader}>
          <View style={styles.sessionPill}>
            <Text style={styles.sessionPillText}>{running ? "Walk live" : hasActiveSession ? "Paused" : "Ready"}</Text>
          </View>
          <Text style={styles.sessionHint}>{permission === "denied" ? "Timer mode" : "GPS mode"}</Text>
        </View>

        <Text style={styles.title}>Walk</Text>
        <Text style={styles.sub}>Elapsed</Text>
        <Text style={styles.big}>{fmtTime(elapsedSec)}</Text>

        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.metricK}>Distance</Text>
            <Text style={styles.metricV}>{(distanceM / 1609.344).toFixed(2)} mi</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricK}>Pace</Text>
            <Text style={styles.metricV}>{pace || "—"}</Text>
          </View>
        </View>
      </View>

      {permission === "denied" ? (
        <Text style={styles.warn}>Location is off, so this walk will track time only.</Text>
      ) : null}

      {!restored ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color="#F2B541" />
          <Text style={styles.loadingText}>Loading walk…</Text>
        </View>
      ) : (
        <View style={styles.controlsStack}>
          <View style={styles.actionRow}>
            <Pressable
              style={[
                styles.btnPrimary,
                styles.splitBtn,
                !canStartOrResume ? styles.btnDisabled : null,
              ]}
              onPress={hasActiveSession ? resume : start}
              disabled={!canStartOrResume}
            >
              <Text style={styles.btnPrimaryText}>{startResumeLabel}</Text>
            </Pressable>
            <Pressable
              style={[
                styles.btnPause,
                styles.splitBtn,
                !canPause ? styles.btnDisabled : null,
              ]}
              onPress={pause}
              disabled={!canPause}
            >
              <Text style={styles.btnPauseText}>{busyAction === "pause" ? "PAUSING…" : "PAUSE"}</Text>
            </Pressable>
          </View>
          <Text style={styles.controlHint}>{statusText}</Text>
        </View>
      )}

      <Pressable
        style={[styles.btnEnd, !canStop ? { opacity: 0.5 } : null]}
        onPress={() => {
          if (!canStop) return;

          if (Platform.OS === "web") {
            const confirmed =
              typeof globalThis.confirm === "function"
                ? globalThis.confirm("End this walk?\n\nThis will save the walk and move you into reflection.")
                : true;

            if (confirmed) {
              void end();
            }
            return;
          }

          Alert.alert("End this walk?", "This will save the walk and move you into reflection.", [
            { text: "Keep walking", style: "cancel" },
            { text: "End walk", style: "destructive", onPress: () => void end() },
          ]);
        }}
        disabled={!canStop}
      >
        <Text style={styles.btnEndText}>{busyAction === "stop" ? "STOPPING…" : "STOP"}</Text>
      </Pressable>

      <View style={styles.bottomRow}>
        <Pressable
          style={styles.back}
          onPress={() => leaveWalkScreen("back")}
        >
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <Pressable
          style={styles.home}
          onPress={() => leaveWalkScreen("home")}
        >
          <Text style={styles.homeText}>Home</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F4EE",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    overflow: "hidden",
  },
  bgGlowTop: {
    position: "absolute",
    top: -90,
    right: -44,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: "rgba(37,94,54,0.08)",
  },
  bgGlowBottom: {
    position: "absolute",
    bottom: -80,
    left: -60,
    width: 210,
    height: 210,
    borderRadius: 999,
    backgroundColor: "rgba(242,181,65,0.12)",
  },
  sessionCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 22,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.12)",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sessionPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(37,94,54,0.1)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.16)",
  },
  sessionPillText: {
    color: "#255E36",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  sessionHint: {
    color: "rgba(11,15,14,0.46)",
    fontSize: 12,
    fontWeight: "800",
  },
  title: { fontSize: 26, fontWeight: "900", color: "#0B0F0E" },
  sub: { marginTop: 10, fontSize: 14, fontWeight: "800", color: "rgba(11,15,14,0.65)" },
  big: { marginTop: 8, fontSize: 60, fontWeight: "900", color: "#255E36", letterSpacing: -1.2 },

  metrics: { flexDirection: "row", gap: 14, marginTop: 22 },
  metric: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "rgba(248,244,238,0.9)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.14)",
    alignItems: "center",
  },
  metricK: { fontSize: 13, fontWeight: "800", color: "rgba(11,15,14,0.58)" },
  metricV: { marginTop: 6, fontSize: 17, fontWeight: "900", color: "#0B0F0E" },

  warn: {
    marginTop: 14,
    color: "#8C6412",
    fontWeight: "800",
    backgroundColor: "rgba(242,181,65,0.16)",
    borderWidth: 1,
    borderColor: "rgba(242,181,65,0.24)",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  loadingState: {
    marginTop: 22,
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: "rgba(11,15,14,0.7)",
    fontWeight: "800",
  },
  controlsStack: {
    marginTop: 22,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
  },
  actionRow: {
    width: "100%",
    flexDirection: "row",
    gap: 12,
  },
  splitBtn: {
    flex: 1,
  },
  controlHint: {
    marginTop: 10,
    color: "rgba(11,15,14,0.58)",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
    maxWidth: 280,
  },

  btnPrimary: {
    backgroundColor: "#255E36",
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: "center",
  },
  btnPrimaryText: { color: "white", fontWeight: "900", letterSpacing: 1 },

  btnPause: {
    backgroundColor: "#F2B541",
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: "center",
  },
  btnPauseText: { color: "#0B0F0E", fontWeight: "900", letterSpacing: 1 },
  btnDisabled: {
    opacity: 0.45,
  },

  btnEnd: {
    marginTop: 14,
    backgroundColor: "#C83333",
    paddingVertical: 14,
    paddingHorizontal: 26,
    borderRadius: 16,
    minWidth: 240,
    alignItems: "center",
  },
  btnEndText: { color: "white", fontWeight: "900", letterSpacing: 1 },

  bottomRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
  },
  back: { paddingVertical: 8, paddingHorizontal: 12 },
  backText: { color: "rgba(11,15,14,0.65)", fontWeight: "800" },
  home: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(37,94,54,0.10)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.18)",
  },
  homeText: { color: "#255E36", fontWeight: "900" },
});
