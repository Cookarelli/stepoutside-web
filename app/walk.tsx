import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, type AppStateStatus, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  clearCompletedWalkDraft,
  clearActiveWalkSnapshot,
  type CompletedWalkDraft,
  getActiveWalkSnapshot,
  setActiveWalkSnapshot,
  setCompletedWalkDraft,
} from "../src/lib/activeWalk";
import { StepButton } from "../src/components/StepButton";
import { ENV } from "../env";
import {
  computeGpsStrength,
  type GpsAcceptanceStats,
  type GpsIgnoreReason,
} from "../src/lib/gpsTracking";
import { formatAverageWalkingPace } from "../src/lib/pace";
import { PREMIUM, alpha } from "../src/lib/premiumTheme";
import type { GpsDiagnostics, RouteCaptureStatus, RoutePoint } from "../src/lib/store";
import {
  ingestWalkLocations,
  MEANINGFUL_TRACKING_GAP_SEC,
  prepareWalkTrackingForResume,
  recordWalkAppState,
  recordWalkTrackingDiagnostics,
  startBackgroundWalkTracking,
  stopBackgroundWalkTracking,
} from "../src/lib/walkLocationTracking";

type PermissionState = "unknown" | "granted" | "denied";

type SessionSource = "gps" | "timer";
type WalkPhase = "idle" | "tracking" | "paused" | "saving" | "completed";
type GpsUiState = "idle" | "primed" | "finding" | "live";

const GPS_STARTUP_TIMEOUT_MS = 5000;

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.max(0, sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Walk() {
  const router = useRouter();
  const SNAPSHOT_PERSIST_DEBOUNCE_MS = 2000;
  const ROUTE_CAPTURE_GAP_THRESHOLD_SEC = MEANINGFUL_TRACKING_GAP_SEC;

  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [backgroundPermission, setBackgroundPermission] = useState<PermissionState>("unknown");
  const [backgroundTrackingReady, setBackgroundTrackingReady] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<WalkPhase>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [, setMovingDurationSec] = useState(0);
  const [restored, setRestored] = useState(false);
  const [busyAction, setBusyAction] = useState<"start" | "pause" | "resume" | "stop" | null>(null);
  const [gpsUiState, setGpsUiState] = useState<GpsUiState>("idle");

  const mountedRef = useRef(true);
  const restoredRef = useRef(false);
  const phaseRef = useRef<WalkPhase>("idle");
  const busyActionRef = useRef<"start" | "pause" | "resume" | "stop" | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerGenerationRef = useRef(0);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoringRef = useRef(false);
  const elapsedBeforeRunRef = useRef(0);
  const runStartedAtRef = useRef<number | null>(null);
  const pausedDurationSecRef = useRef(0);
  const pauseStartedAtRef = useRef<number | null>(null);
  const movingDurationSecRef = useRef(0);
  const distanceRef = useRef(0);
  const routePointsRef = useRef<RoutePoint[]>([]);
  const hadGpsPointsRef = useRef(false);
  const firstAcceptedElapsedRef = useRef<number | null>(null);
  const gpsIgnoreCountsRef = useRef<Partial<Record<GpsIgnoreReason, number>>>({});
  const gpsStatsRef = useRef<GpsAcceptanceStats>({
    rawPoints: 0,
    acceptedDistancePoints: 0,
    ignoredPoints: 0,
    lastIgnoredReason: null,
    averageAccuracy: null,
    worstAccuracy: null,
    lastAcceptedTimestamp: null,
    acceptedDistanceM: 0,
    gpsStrength: "Weak GPS",
  });
  const gpsDiagnosticsExtraRef = useRef<Partial<GpsDiagnostics>>({});

  const lastPointRef = useRef<RoutePoint | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const locationGenerationRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const routeCaptureInterruptedRef = useRef(false);
  const routeCaptureGapSecRef = useRef(0);
  const backgroundPermissionAlertedRef = useRef(false);

  const pace = useMemo(() => {
    return formatAverageWalkingPace(distanceM, elapsedSec);
  }, [distanceM, elapsedSec]);

  const logWalk = useCallback((message: string, details?: Record<string, unknown>) => {
    if (details) {
      console.log(`[walk] ${message}`, details);
      return;
    }

    console.log(`[walk] ${message}`);
  }, []);

  const logGps = useCallback((message: string, details?: Record<string, unknown>) => {
    if (!__DEV__ || !ENV.DEV.gpsDebug) return;

    if (details) {
      console.log(`[GPS] ${message}`, details);
      return;
    }

    console.log(`[GPS] ${message}`);
  }, []);

  const logPace = useCallback((activeSeconds: number, confirmedDistanceMeters: number) => {
    if (!__DEV__) return;

    console.log("[PACE]", {
      activeSeconds,
      distanceMiles: Number((confirmedDistanceMeters / 1609.344).toFixed(3)),
      averagePace: formatAverageWalkingPace(confirmedDistanceMeters, activeSeconds) ?? "Getting pace…",
    });
  }, []);

  const buildGpsDiagnostics = useCallback((): GpsDiagnostics => {
    const rejectionCounts = Object.fromEntries(
      Object.entries(gpsIgnoreCountsRef.current).filter(([, count]) => typeof count === "number" && Number.isFinite(count))
    );

    return {
      ...gpsDiagnosticsExtraRef.current,
      rawPoints: gpsStatsRef.current.rawPoints,
      acceptedPoints: gpsStatsRef.current.acceptedDistancePoints,
      rejectedPoints: gpsStatsRef.current.ignoredPoints,
      ...(Object.keys(rejectionCounts).length > 0 ? { rejectionCounts } : {}),
      ...(gpsStatsRef.current.lastIgnoredReason !== null ? { lastRejectedReason: gpsStatsRef.current.lastIgnoredReason } : {}),
      ...(gpsStatsRef.current.lastAcceptedTimestamp !== null
        ? { lastAcceptedAt: gpsStatsRef.current.lastAcceptedTimestamp }
        : {}),
      acceptedDistanceM: Math.max(0, Math.round(gpsStatsRef.current.acceptedDistanceM)),
      averageAccuracy: gpsStatsRef.current.averageAccuracy,
      worstAccuracy: gpsStatsRef.current.worstAccuracy,
    };
  }, []);

  const getRouteCaptureStatus = useCallback(
    (source: SessionSource, routePoints: RoutePoint[], endedFromPhase?: WalkPhase) => {
      let gapSec = routeCaptureGapSecRef.current;
      let interrupted = routeCaptureInterruptedRef.current;

      if (
        source === "gps" &&
        routePoints.length > 1 &&
        endedFromPhase === "tracking" &&
        typeof gpsDiagnosticsExtraRef.current.lastLocationAt === "number"
      ) {
        const terminalGapSec = Math.max(
          0,
          Math.round((Date.now() - (gpsDiagnosticsExtraRef.current.lastLocationAt ?? Date.now())) / 1000)
        );
        if (terminalGapSec >= ROUTE_CAPTURE_GAP_THRESHOLD_SEC) {
          interrupted = true;
          gapSec = Math.max(gapSec, terminalGapSec);
          routeCaptureInterruptedRef.current = true;
          routeCaptureGapSecRef.current = gapSec;
          gpsDiagnosticsExtraRef.current = {
            ...gpsDiagnosticsExtraRef.current,
            largestTrackingGapSec: gapSec,
            lastTrackingGapReason: `No location updates for ${terminalGapSec} seconds before walk ended`,
          };
          logWalk("terminal route capture gap detected", { gapSec: terminalGapSec });
        }
      }

      const status: RouteCaptureStatus =
        source !== "gps" || routePoints.length < 2 ? "none" : interrupted ? "partial" : "complete";

      return {
        status,
        interrupted,
        gapSec,
      };
    },
    [ROUTE_CAPTURE_GAP_THRESHOLD_SEC, logWalk]
  );

  const setPermissionSafe = useCallback((next: PermissionState) => {
    if (mountedRef.current) {
      setPermission(next);
    }
  }, []);

  const setBackgroundPermissionSafe = useCallback((next: PermissionState) => {
    if (mountedRef.current) {
      setBackgroundPermission(next);
    }
  }, []);

  const setBackgroundTrackingReadySafe = useCallback((next: boolean | null) => {
    if (mountedRef.current) {
      setBackgroundTrackingReady(next);
    }
  }, []);

  const setElapsedSafe = useCallback((next: number) => {
    if (mountedRef.current) {
      setElapsedSec(next);
    }
  }, []);

  const setDistanceSafe = useCallback((next: number) => {
    if (mountedRef.current) {
      setDistanceM(next);
    }
  }, []);

  const setMovingDurationSafe = useCallback((next: number) => {
    if (mountedRef.current) {
      setMovingDurationSec(next);
    }
  }, []);

  const setRestoredSafe = useCallback((next: boolean) => {
    restoredRef.current = next;
    if (mountedRef.current) {
      setRestored(next);
    }
  }, []);

  const setBusyActionSafe = useCallback((next: "start" | "pause" | "resume" | "stop" | null) => {
    busyActionRef.current = next;
    if (mountedRef.current) {
      setBusyAction(next);
    }
  }, []);

  const setGpsUiStateSafe = useCallback((next: GpsUiState) => {
    if (mountedRef.current) {
      setGpsUiState(next);
    }
  }, []);

  const canTransitionTo = useCallback(
    (current: WalkPhase, next: WalkPhase) => {
      if (current === next) return true;

      switch (current) {
        case "idle":
          return next === "tracking";
        case "tracking":
          return next === "paused" || next === "saving" || next === "idle";
        case "paused":
          return next === "tracking" || next === "saving" || next === "idle";
        case "saving":
          return next === "completed" || next === "idle";
        case "completed":
          return next === "idle";
        default:
          return false;
      }
    },
    []
  );

  const transitionTo = useCallback(
    (next: WalkPhase, reason: string) => {
      const current = phaseRef.current;
      if (!canTransitionTo(current, next)) {
        console.warn(`[walk] invalid transition ${current} -> ${next}`, { reason });
        return false;
      }

      if (current === next) {
        logWalk(`phase remains ${next}`, { reason });
        return true;
      }

      phaseRef.current = next;
      if (mountedRef.current) {
        setPhase(next);
      }
      logWalk(`phase ${current} -> ${next}`, { reason });
      return true;
    },
    [canTransitionTo, logWalk]
  );

  const beginAction = useCallback(
    (
      action: "start" | "pause" | "resume" | "stop",
      allowedPhases: WalkPhase[]
    ) => {
      if (!restoredRef.current) {
        logWalk(`blocked ${action}`, { reason: "not restored" });
        return false;
      }

      if (busyActionRef.current) {
        logWalk(`blocked ${action}`, { reason: "busy", busyAction: busyActionRef.current });
        return false;
      }

      if (!allowedPhases.includes(phaseRef.current)) {
        console.warn(`[walk] blocked ${action} from ${phaseRef.current}`);
        return false;
      }

      setBusyActionSafe(action);
      logWalk(`action ${action} started`, { phase: phaseRef.current });
      return true;
    },
    [logWalk, setBusyActionSafe]
  );

  const finishAction = useCallback(() => {
    if (busyActionRef.current) {
      logWalk(`action ${busyActionRef.current} finished`, { phase: phaseRef.current });
    }
    setBusyActionSafe(null);
  }, [logWalk, setBusyActionSafe]);

  const refreshPermission = useCallback(async () => {
    try {
      const [res, backgroundRes] = await Promise.all([
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
      ]);
      const nextPermission: PermissionState =
        res.status === "granted"
          ? "granted"
          : res.status === "denied"
            ? "denied"
            : "unknown";
      const nextBackgroundPermission: PermissionState =
        backgroundRes.status === "granted"
          ? "granted"
          : backgroundRes.status === "denied"
            ? "denied"
            : "unknown";
      logWalk("permission refreshed", {
        status: res.status,
        backgroundStatus: backgroundRes.status,
        canAskAgain: res.canAskAgain,
        mappedPermission: nextPermission,
      });
      setPermissionSafe(nextPermission);
      setBackgroundPermissionSafe(nextBackgroundPermission);
      void recordWalkTrackingDiagnostics({
        locationPermissionStatus: `foreground:${res.status};background:${backgroundRes.status}`,
      });
      return nextPermission === "granted";
    } catch (error) {
      console.error("[walk] failed to refresh permission", error);
      setPermissionSafe("unknown");
      setBackgroundPermissionSafe("unknown");
      return false;
    }
  }, [logWalk, setBackgroundPermissionSafe, setPermissionSafe]);

  const requestPerms = useCallback(async () => {
    try {
      const res = await Location.requestForegroundPermissionsAsync();
      const ok = res.status === "granted";
      logWalk("permission requested", {
        status: res.status,
        canAskAgain: res.canAskAgain,
        granted: ok,
      });
      setPermissionSafe(ok ? "granted" : "denied");
      return ok;
    } catch (error) {
      console.error("[walk] failed to request permission", error);
      setPermissionSafe("unknown");
      return false;
    }
  }, [logWalk, setPermissionSafe]);

  const ensureLocationPermission = useCallback(async () => {
    if (permission === "granted") return true;
    if (permission === "denied") return false;

    const hasExistingPermission = await refreshPermission();
    if (hasExistingPermission) return true;

    return await requestPerms();
  }, [permission, refreshPermission, requestPerms]);

  const ensureBackgroundPermission = useCallback(async () => {
    try {
      const existing = await Location.getBackgroundPermissionsAsync();
      if (existing.status === "granted") {
        setBackgroundPermissionSafe("granted");
        void recordWalkTrackingDiagnostics({
          locationPermissionStatus: "foreground:granted;background:granted",
        });
        return true;
      }
      if (existing.status === "denied" && !existing.canAskAgain) {
        setBackgroundPermissionSafe("denied");
        void recordWalkTrackingDiagnostics({
          locationPermissionStatus: "foreground:granted;background:denied",
        });
        if (!backgroundPermissionAlertedRef.current && Platform.OS !== "web") {
          backgroundPermissionAlertedRef.current = true;
          Alert.alert(
            "Keep tracking when locked",
            "Allow Always location access in Settings so Step Outside can track an active walk with the screen locked.",
            [
              { text: "Not now", style: "cancel" },
              { text: "Open Settings", onPress: () => void Linking.openSettings() },
            ]
          );
        }
        return false;
      }

      const result = await Location.requestBackgroundPermissionsAsync();
      const granted = result.status === "granted";
      setBackgroundPermissionSafe(granted ? "granted" : "denied");
      void recordWalkTrackingDiagnostics({
        locationPermissionStatus: `foreground:granted;background:${result.status}`,
      });

      if (!granted && !backgroundPermissionAlertedRef.current && Platform.OS !== "web") {
        backgroundPermissionAlertedRef.current = true;
        Alert.alert(
          "Keep tracking when locked",
          "Allow Step Outside to use location in the background so your route and distance continue when your screen is locked.",
          [
            { text: "Not now", style: "cancel" },
            { text: "Open Settings", onPress: () => void Linking.openSettings() },
          ]
        );
      }
      return granted;
    } catch (error) {
      console.error("[walk] failed to request background permission", error);
      setBackgroundPermissionSafe("unknown");
      return false;
    }
  }, [setBackgroundPermissionSafe]);

  const applyLocationSnapshot = useCallback(
    (snapshot: Awaited<ReturnType<typeof getActiveWalkSnapshot>>) => {
      if (!snapshot || snapshot.startedAt !== startedAtRef.current) return;

      const routePoints = snapshot.routePoints ?? [];
      const diagnostics = snapshot.gpsDiagnostics;
      routePointsRef.current = routePoints;
      distanceRef.current = snapshot.distanceM;
      movingDurationSecRef.current = snapshot.movingDurationSec ?? 0;
      lastPointRef.current = snapshot.lastAcceptedPoint ?? routePoints[routePoints.length - 1] ?? null;
      hadGpsPointsRef.current = routePoints.length > 1;
      firstAcceptedElapsedRef.current = routePoints.length > 0 ? firstAcceptedElapsedRef.current ?? 0 : null;
      routeCaptureInterruptedRef.current = snapshot.routeCaptureInterrupted ?? false;
      routeCaptureGapSecRef.current = snapshot.routeCaptureGapSec ?? diagnostics?.largestTrackingGapSec ?? 0;
      gpsDiagnosticsExtraRef.current = diagnostics ?? {};

      if (diagnostics) {
        gpsStatsRef.current = {
          rawPoints: diagnostics.rawPoints,
          acceptedDistancePoints: diagnostics.acceptedPoints,
          ignoredPoints: diagnostics.rejectedPoints,
          lastIgnoredReason:
            typeof diagnostics.lastRejectedReason === "string"
              ? (diagnostics.lastRejectedReason as GpsIgnoreReason)
              : null,
          averageAccuracy: diagnostics.averageAccuracy ?? null,
          worstAccuracy: diagnostics.worstAccuracy ?? null,
          lastAcceptedTimestamp: diagnostics.lastAcceptedAt ?? null,
          acceptedDistanceM: diagnostics.acceptedDistanceM ?? snapshot.distanceM,
          gpsStrength: computeGpsStrength(diagnostics.averageAccuracy ?? null, diagnostics.acceptedPoints),
        };
        gpsIgnoreCountsRef.current = diagnostics.rejectionCounts ?? {};
      }

      setElapsedSafe(snapshot.elapsedSec);
      setDistanceSafe(snapshot.distanceM);
      setMovingDurationSafe(snapshot.movingDurationSec ?? 0);
      setGpsUiStateSafe(snapshot.gpsUiState ?? (routePoints.length > 0 ? "live" : "finding"));
    },
    [setDistanceSafe, setElapsedSafe, setGpsUiStateSafe, setMovingDurationSafe]
  );

  const stopGps = useCallback(
    (reason: string) => {
      locationGenerationRef.current += 1;
      if (subRef.current) {
        try {
          subRef.current.remove();
        } catch (error) {
          console.error("[walk] failed to remove gps subscription", error);
        }
      }
      subRef.current = null;
      lastPointRef.current = null;
      logWalk("gps stopped", { reason });
    },
    [logWalk]
  );

  const startGps = useCallback(
    async (reason: string) => {
      stopGps(`restart before ${reason}`);
      const generation = locationGenerationRef.current;
      logWalk("gps starting", { reason, generation });
      setGpsUiStateSafe("finding");

      try {
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 2000,
            distanceInterval: 2,
          },
          (pos) => {
            if (!mountedRef.current || locationGenerationRef.current !== generation || phaseRef.current !== "tracking") {
              return;
            }
            void ingestWalkLocations("foreground", [pos]).then((snapshot) => {
              if (
                mountedRef.current &&
                locationGenerationRef.current === generation &&
                phaseRef.current === "tracking"
              ) {
                applyLocationSnapshot(snapshot);
                logGps("foreground point persisted", {
                  distanceMeters: Math.round(snapshot?.distanceM ?? distanceRef.current),
                  acceptedPoints: snapshot?.gpsDiagnostics?.acceptedPoints ?? 0,
                });
              }
            });
          }
        );

        if (!mountedRef.current || phaseRef.current !== "tracking" || locationGenerationRef.current !== generation) {
          try {
            subscription.remove();
          } catch (error) {
            console.error("[walk] failed to remove stale gps subscription", error);
          }
          return false;
        }

        subRef.current = subscription;
        logWalk("gps started", { reason, generation });
        return true;
      } catch (error) {
        console.error("[walk] failed to start gps subscription", error);
        return false;
      }
    },
    [applyLocationSnapshot, logGps, logWalk, setGpsUiStateSafe, stopGps]
  );

  const startGpsWithTimeout = useCallback(
    async (reason: string) => {
      let timeoutRef: ReturnType<typeof setTimeout> | null = null;

      const timeoutPromise = new Promise<false>((resolve) => {
        timeoutRef = setTimeout(() => {
          logWalk("gps startup timeout; walk continues", {
            reason,
            timeoutMs: GPS_STARTUP_TIMEOUT_MS,
          });
          resolve(false);
        }, GPS_STARTUP_TIMEOUT_MS);
      });

      const started = await Promise.race([startGps(reason), timeoutPromise]);

      if (timeoutRef) {
        clearTimeout(timeoutRef);
      }

      return started;
    },
    [logWalk, startGps]
  );

  const beginLocationTracking = useCallback(
    async (reason: string) => {
      const foregroundGranted = await ensureLocationPermission();
      if (!foregroundGranted || phaseRef.current !== "tracking") {
        if (!foregroundGranted) {
          setGpsUiStateSafe("idle");
          setBackgroundTrackingReadySafe(false);
          void recordWalkTrackingDiagnostics({
            locationPermissionStatus: "foreground:denied;background:unknown",
          });
        }
        return false;
      }

      setGpsUiStateSafe("finding");
      void startGpsWithTimeout(reason);

      const backgroundGranted = await ensureBackgroundPermission();
      if (backgroundGranted && phaseRef.current === "tracking") {
        const backgroundStarted = await startBackgroundWalkTracking();
        gpsDiagnosticsExtraRef.current = {
          ...gpsDiagnosticsExtraRef.current,
          backgroundTaskStarted: backgroundStarted,
          ...(backgroundStarted ? { backgroundTaskLastError: null } : {}),
        };
        setBackgroundTrackingReadySafe(backgroundStarted);
      } else if (!backgroundGranted) {
        gpsDiagnosticsExtraRef.current = {
          ...gpsDiagnosticsExtraRef.current,
          backgroundTaskStarted: false,
        };
        setBackgroundTrackingReadySafe(false);
      }
      return true;
    },
    [
      ensureBackgroundPermission,
      ensureLocationPermission,
      setBackgroundTrackingReadySafe,
      setGpsUiStateSafe,
      startGpsWithTimeout,
    ]
  );

  const getElapsedNow = useCallback(() => {
    if (!runStartedAtRef.current) return elapsedBeforeRunRef.current;
    return elapsedBeforeRunRef.current + Math.max(0, Math.floor((Date.now() - runStartedAtRef.current) / 1000));
  }, []);

  const getPausedDurationNow = useCallback(() => {
    const pauseStartedAt = pauseStartedAtRef.current;
    if (pauseStartedAt === null) return pausedDurationSecRef.current;
    return pausedDurationSecRef.current + Math.max(0, Math.floor((Date.now() - pauseStartedAt) / 1000));
  }, []);

  const getTotalElapsedNow = useCallback(() => {
    return getElapsedNow() + getPausedDurationNow();
  }, [getElapsedNow, getPausedDurationNow]);

  const syncElapsedFromClock = useCallback(() => {
    const nextElapsed = getElapsedNow();
    setElapsedSafe(nextElapsed);
    return nextElapsed;
  }, [getElapsedNow, setElapsedSafe]);

  const stopTimer = useCallback(
    (reason: string) => {
      timerGenerationRef.current += 1;
      if (tickRef.current) {
        clearInterval(tickRef.current);
      }
      tickRef.current = null;
      logWalk("timer stopped", { reason });
    },
    [logWalk]
  );

  const startTimer = useCallback(
    (reason: string) => {
      stopTimer(`restart before ${reason}`);
      const generation = timerGenerationRef.current;
      logWalk("timer starting", { reason, generation });

      if (phaseRef.current !== "tracking") {
        console.warn(`[walk] skipped timer start outside tracking`, { reason, phase: phaseRef.current });
        return false;
      }

      syncElapsedFromClock();
      tickRef.current = setInterval(() => {
        if (!mountedRef.current || timerGenerationRef.current !== generation || phaseRef.current !== "tracking") {
          return;
        }

        syncElapsedFromClock();
      }, 1000);
      return true;
    },
    [logWalk, stopTimer, syncElapsedFromClock]
  );

  const clearActiveWalkSnapshotSafe = useCallback(async (reason: string) => {
    try {
      await clearActiveWalkSnapshot();
      logWalk("active snapshot cleared", { reason });
      return true;
    } catch (error) {
      console.error("[walk] failed to clear active snapshot", error);
      return false;
    }
  }, [logWalk]);

  const clearCompletedWalkDraftSafe = useCallback(async (reason: string) => {
    try {
      await clearCompletedWalkDraft();
      logWalk("completed draft cleared", { reason });
      return true;
    } catch (error) {
      console.error("[walk] failed to clear completed draft", error);
      return false;
    }
  }, [logWalk]);

  const setCompletedWalkDraftSafe = useCallback(async (draft: CompletedWalkDraft, reason: string) => {
    try {
      await setCompletedWalkDraft(draft);
      logWalk("completed draft saved", {
        reason,
        points: draft.routePoints.length,
        routeCaptureStatus: draft.routeCaptureStatus ?? "none",
      });
      return true;
    } catch (error) {
      console.error("[walk] failed to save completed draft", error);
      return false;
    }
  }, [logWalk]);

  const persistActiveWalk = useCallback(
    async (
      overrides?: Partial<{
        elapsedSec: number;
        distanceM: number;
        movingDurationSec: number;
        pausedDurationSec: number;
        pauseStartedAt: number | null;
        running: boolean;
        routePoints: RoutePoint[];
      }>
    ) => {
      const startedAt = startedAtRef.current;
      if (!startedAt) return false;

      try {
        await setActiveWalkSnapshot({
          walkId: String(startedAt),
          startedAt,
          elapsedSec: overrides?.elapsedSec ?? getElapsedNow(),
          distanceM: overrides?.distanceM ?? distanceRef.current,
          movingDurationSec: overrides?.movingDurationSec ?? movingDurationSecRef.current,
        pausedDurationSec: overrides?.pausedDurationSec ?? getPausedDurationNow(),
        pauseStartedAt:
          overrides && "pauseStartedAt" in overrides ? overrides.pauseStartedAt ?? null : pauseStartedAtRef.current,
        routePoints: overrides?.routePoints ?? routePointsRef.current,
        lastAcceptedPoint: lastPointRef.current,
        lastLocationUpdateAt: gpsDiagnosticsExtraRef.current.lastLocationAt ?? null,
        gpsUiState,
        routeCaptureStatus:
          getRouteCaptureStatus(
            routePointsRef.current.length > 1 || hadGpsPointsRef.current ? "gps" : "timer",
            overrides?.routePoints ?? routePointsRef.current
          ).status,
        routeCaptureInterrupted: routeCaptureInterruptedRef.current,
        routeCaptureGapSec: routeCaptureGapSecRef.current,
        gpsDiagnostics: buildGpsDiagnostics(),
        running: overrides?.running ?? phaseRef.current === "tracking",
        updatedAt: Date.now(),
      });
        return true;
      } catch (error) {
        console.error("[walk] failed to persist active walk", error);
        return false;
      }
    },
    [buildGpsDiagnostics, getElapsedNow, getPausedDurationNow, getRouteCaptureStatus, gpsUiState]
  );
  const persistActiveWalkRef = useRef(persistActiveWalk);
  const stopGpsRef = useRef(stopGps);
  const stopTimerRef = useRef(stopTimer);
  persistActiveWalkRef.current = persistActiveWalk;
  stopGpsRef.current = stopGps;
  stopTimerRef.current = stopTimer;

  const clearScheduledPersist = useCallback(() => {
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = null;
    }
  }, []);

  const schedulePersist = useCallback(
    (
      overrides?: Partial<{
        elapsedSec: number;
        distanceM: number;
        movingDurationSec: number;
        pausedDurationSec: number;
        pauseStartedAt: number | null;
        running: boolean;
        routePoints: RoutePoint[];
      }>
    ) => {
      if (
        restoringRef.current ||
        !startedAtRef.current ||
        (phaseRef.current !== "tracking" && phaseRef.current !== "paused")
      ) {
        return;
      }

      clearScheduledPersist();
      persistTimeoutRef.current = setTimeout(() => {
        void (async () => {
          try {
            await persistActiveWalk(overrides);
          } catch (error) {
            console.error("[walk] scheduled persist failed", error);
          } finally {
            persistTimeoutRef.current = null;
          }
        })();
      }, SNAPSHOT_PERSIST_DEBOUNCE_MS);
    },
    [clearScheduledPersist, persistActiveWalk]
  );

  const resetWalkState = useCallback(async (reason: string) => {
    clearScheduledPersist();
    stopTimer(reason);
    stopGps(reason);
    startedAtRef.current = null;
    elapsedBeforeRunRef.current = 0;
    runStartedAtRef.current = null;
    pausedDurationSecRef.current = 0;
    pauseStartedAtRef.current = null;
    movingDurationSecRef.current = 0;
    routeCaptureInterruptedRef.current = false;
    routeCaptureGapSecRef.current = 0;
    distanceRef.current = 0;
    routePointsRef.current = [];
    hadGpsPointsRef.current = false;
    firstAcceptedElapsedRef.current = null;
    lastPointRef.current = null;
    gpsStatsRef.current = {
      rawPoints: 0,
      acceptedDistancePoints: 0,
      ignoredPoints: 0,
      lastIgnoredReason: null,
      averageAccuracy: null,
      worstAccuracy: null,
      lastAcceptedTimestamp: null,
      acceptedDistanceM: 0,
      gpsStrength: "Weak GPS",
    };
    gpsIgnoreCountsRef.current = {};
    gpsDiagnosticsExtraRef.current = {};
    setBackgroundTrackingReadySafe(null);
    setGpsUiStateSafe("idle");
    setElapsedSafe(0);
    setDistanceSafe(0);
    setMovingDurationSafe(0);
    transitionTo("idle", reason);
    await Promise.all([stopBackgroundWalkTracking(), clearActiveWalkSnapshotSafe(reason)]);
  }, [clearActiveWalkSnapshotSafe, clearScheduledPersist, setBackgroundTrackingReadySafe, setDistanceSafe, setElapsedSafe, setGpsUiStateSafe, setMovingDurationSafe, stopGps, stopTimer, transitionTo]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      restoredRef.current = false;
    };
  }, []);

  const start = async () => {
    if (!beginAction("start", ["idle"])) return;
    void Haptics.selectionAsync();
    try {
      const cleanupPromise = Promise.all([
        clearCompletedWalkDraftSafe("start"),
        resetWalkState("start"),
      ]);

      startedAtRef.current = Date.now();
      elapsedBeforeRunRef.current = 0;
      runStartedAtRef.current = Date.now();
      pausedDurationSecRef.current = 0;
      pauseStartedAtRef.current = null;
      movingDurationSecRef.current = 0;
      setElapsedSafe(0);
      setDistanceSafe(0);
      setMovingDurationSafe(0);
      distanceRef.current = 0;
      lastPointRef.current = null;
      routePointsRef.current = [];
      hadGpsPointsRef.current = false;
      firstAcceptedElapsedRef.current = null;
      setGpsUiStateSafe("finding");

      transitionTo("tracking", "start");
      logWalk("walk started; gps initializes in background");
      startTimer("start");

      await cleanupPromise;
      await persistActiveWalk({
        elapsedSec: 0,
        distanceM: 0,
        movingDurationSec: 0,
        pausedDurationSec: 0,
        pauseStartedAt: null,
        routePoints: [],
        running: true,
      });
      void beginLocationTracking("start");

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("[walk] start failed", error);
      await resetWalkState("start failed");
      Alert.alert("Couldn’t start walk", "Please try again.");
    } finally {
      finishAction();
    }
  };

  const pause = async () => {
    if (!beginAction("pause", ["tracking"])) return;
    void Haptics.selectionAsync();
    try {
      const nextElapsed = syncElapsedFromClock();
      elapsedBeforeRunRef.current = nextElapsed;
      runStartedAtRef.current = null;
      pauseStartedAtRef.current = Date.now();
      setElapsedSafe(nextElapsed);
      stopTimer("pause");
      stopGps("pause");
      await stopBackgroundWalkTracking();
      setGpsUiStateSafe(permission === "denied" ? "idle" : firstAcceptedElapsedRef.current === null ? "finding" : "live");
      transitionTo("paused", "pause");
      logWalk("walk paused", { elapsedSeconds: nextElapsed });
      await persistActiveWalk({
        elapsedSec: nextElapsed,
        pausedDurationSec: pausedDurationSecRef.current,
        pauseStartedAt: pauseStartedAtRef.current,
        movingDurationSec: movingDurationSecRef.current,
        running: false,
      });
    } catch (error) {
      console.error("[walk] pause failed", error);
      Alert.alert("Couldn’t pause walk", "The walk was left in a safe state. Please try again.");
    } finally {
      finishAction();
    }
  };

  const resume = async () => {
    if (!beginAction("resume", ["paused"])) return;
    void Haptics.selectionAsync();
    try {
      elapsedBeforeRunRef.current = getElapsedNow();
      runStartedAtRef.current = Date.now();
      if (pauseStartedAtRef.current !== null) {
        pausedDurationSecRef.current = getPausedDurationNow();
      }
      pauseStartedAtRef.current = null;
      setGpsUiStateSafe(firstAcceptedElapsedRef.current === null ? "finding" : "live");
      transitionTo("tracking", "resume");
      logWalk("walk resumed", { elapsedSeconds: elapsedBeforeRunRef.current });
      startTimer("resume");
      await persistActiveWalk({
        elapsedSec: elapsedBeforeRunRef.current,
        pausedDurationSec: pausedDurationSecRef.current,
        pauseStartedAt: null,
        movingDurationSec: movingDurationSecRef.current,
        running: true,
      });
      await prepareWalkTrackingForResume();
      lastPointRef.current = null;
      gpsDiagnosticsExtraRef.current = {
        ...gpsDiagnosticsExtraRef.current,
        lastLocationAt: null,
      };
      void beginLocationTracking("resume");
    } catch (error) {
      console.error("[walk] resume failed", error);
      stopTimer("resume failed");
      stopGps("resume failed");
      transitionTo("paused", "resume failed");
      Alert.alert("Couldn’t resume walk", "Please try again.");
    } finally {
      finishAction();
    }
  };

  const end = async () => {
    if (!beginAction("stop", ["tracking", "paused"])) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      const endedFromPhase = phaseRef.current;
      transitionTo("saving", "stop");
      clearScheduledPersist();
      stopTimer("stop");
      stopGps("stop");
      await stopBackgroundWalkTracking();
      applyLocationSnapshot(await getActiveWalkSnapshot());

      const source: SessionSource = hadGpsPointsRef.current || routePointsRef.current.length > 1 ? "gps" : "timer";
      const endLat = lastPointRef.current?.lat;
      const endLng = lastPointRef.current?.lng;
      const routePoints = [...routePointsRef.current];
      const finalElapsed = syncElapsedFromClock();
      const finalPausedDuration = getPausedDurationNow();
      const finalTotalElapsed = getTotalElapsedNow();
      const finalMovingElapsed = movingDurationSecRef.current;
      const finalDistance = Math.max(0, Math.round(distanceRef.current));
      const routeCapture = getRouteCaptureStatus(source, routePoints, endedFromPhase);
      const gpsDiagnostics = buildGpsDiagnostics();
      logWalk("walk ended", {
        elapsedSeconds: finalElapsed,
        pausedSeconds: finalPausedDuration,
        totalElapsedSeconds: finalTotalElapsed,
        movingTimeSeconds: finalMovingElapsed,
        distanceMeters: finalDistance,
        distanceMiles: Number((finalDistance / 1609.344).toFixed(3)),
        averagePace: formatAverageWalkingPace(finalDistance, finalElapsed) ?? "Getting pace…",
        source,
        rawPoints: gpsStatsRef.current.rawPoints,
        acceptedPoints: gpsStatsRef.current.acceptedDistancePoints,
        ignoredPoints: gpsStatsRef.current.ignoredPoints,
        lastIgnoredReason: gpsStatsRef.current.lastIgnoredReason,
        lastAcceptedTimestamp: gpsStatsRef.current.lastAcceptedTimestamp,
        acceptedDistanceM: Math.round(gpsStatsRef.current.acceptedDistanceM),
        averageAccuracy:
          gpsStatsRef.current.averageAccuracy === null
            ? null
            : Number(gpsStatsRef.current.averageAccuracy.toFixed(1)),
        worstAccuracy:
          gpsStatsRef.current.worstAccuracy === null ? null : Number(gpsStatsRef.current.worstAccuracy.toFixed(1)),
        gpsStrength: gpsStatsRef.current.gpsStrength,
        routeCaptureStatus: routeCapture.status,
        routeCaptureInterrupted: routeCapture.interrupted,
        routeCaptureGapSec: routeCapture.gapSec,
        ignoredReasonCounts: gpsIgnoreCountsRef.current,
      });

      elapsedBeforeRunRef.current = finalElapsed;
      runStartedAtRef.current = null;
      pausedDurationSecRef.current = finalPausedDuration;
      pauseStartedAtRef.current = null;
      await clearActiveWalkSnapshotSafe("stop");

      const startedAt = startedAtRef.current ?? Date.now();
      const endedAt = Date.now();
      startedAtRef.current = null;

      // Guard: only count sessions >= 10 seconds
      if (finalElapsed < 10) {
        await resetWalkState("stop too short");
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Walk too short", "Walks need to be at least 10 seconds to count.");
        return;
      }

      const savedDraft = await setCompletedWalkDraftSafe(
        {
          routePoints,
          routeCaptureStatus: routeCapture.status,
          routeCaptureInterrupted: routeCapture.interrupted,
          routeCaptureGapSec: routeCapture.gapSec,
          gpsDiagnostics,
        },
        "stop"
      );
      if (!savedDraft) {
        await resetWalkState("stop draft failed");
        Alert.alert("Couldn’t save walk", "Please try again.");
        return;
      }

      transitionTo("completed", "stop");
      router.replace({
        pathname: "/complete",
        params: {
          startedAt: String(startedAt),
          endedAt: String(endedAt),
          durationSec: String(finalElapsed),
          activeDurationSec: String(finalElapsed),
          pausedDurationSec: String(finalPausedDuration),
          totalElapsedSec: String(finalTotalElapsed),
          movingDurationSec: String(finalMovingElapsed),
          distanceM: String(finalDistance),
          source,
          routePointCount: String(routePoints.length),
          routeCaptureStatus: routeCapture.status,
          routeCaptureInterrupted: String(routeCapture.interrupted),
          routeCaptureGapSec: String(routeCapture.gapSec),
          ...(Number.isFinite(endLat) && Number.isFinite(endLng)
            ? { endLat: String(endLat), endLng: String(endLng) }
            : {}),
        },
      });
    } catch (error) {
      console.error("[walk] stop failed", error);
      await resetWalkState("stop failed");
      Alert.alert("Couldn’t stop walk", "Please try again.");
    } finally {
      finishAction();
    }
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

      if (phaseRef.current === "idle" || !startedAtRef.current || elapsedSec === 0) {
        void Haptics.selectionAsync();
        go();
        return;
      }

      const confirmMessage = phaseRef.current === "tracking"
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
            text: phaseRef.current === "tracking" ? "Leave Running" : "Leave Walk",
            onPress: () => {
              void Haptics.selectionAsync();
              go();
            },
          },
        ]
      );
    },
    [elapsedSec, router]
  );

  useEffect(() => {
    void refreshPermission();
  }, [refreshPermission]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      logWalk("app state changed", { previousState, nextState });
      void recordWalkAppState(nextState);

      if (
        startedAtRef.current &&
        (phaseRef.current === "tracking" || phaseRef.current === "paused") &&
        previousState === "active" &&
        nextState.match(/inactive|background/)
      ) {
        clearScheduledPersist();
        void persistActiveWalkRef.current();
      }

      if (
        startedAtRef.current &&
        phaseRef.current === "tracking" &&
        previousState.match(/inactive|background/) &&
        nextState === "active"
      ) {
        void (async () => {
          applyLocationSnapshot(await getActiveWalkSnapshot());
          const ok = await refreshPermission();
          if (ok && phaseRef.current === "tracking") {
            await startGpsWithTimeout("app active restore");
            const background = await Location.getBackgroundPermissionsAsync();
            if (background.status === "granted") {
              const backgroundStarted = await startBackgroundWalkTracking();
              gpsDiagnosticsExtraRef.current = {
                ...gpsDiagnosticsExtraRef.current,
                backgroundTaskStarted: backgroundStarted,
                ...(backgroundStarted ? { backgroundTaskLastError: null } : {}),
              };
              setBackgroundTrackingReadySafe(backgroundStarted);
            }
          }
        })();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [
    applyLocationSnapshot,
    clearScheduledPersist,
    logWalk,
    refreshPermission,
    setBackgroundTrackingReadySafe,
    startGpsWithTimeout,
  ]);

  useEffect(() => {
    return () => {
      clearScheduledPersist();
      if (startedAtRef.current && (phaseRef.current === "tracking" || phaseRef.current === "paused")) {
        void persistActiveWalkRef.current();
      }
      stopTimerRef.current("screen cleanup");
      stopGpsRef.current("screen cleanup");
    };
  }, [clearScheduledPersist]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      restoringRef.current = true;
      logWalk("restoring walk snapshot");

      try {
        const snapshot = await getActiveWalkSnapshot();
        if (cancelled || !mountedRef.current) return;

        if (!snapshot) {
          elapsedBeforeRunRef.current = 0;
          runStartedAtRef.current = null;
          pausedDurationSecRef.current = 0;
          pauseStartedAtRef.current = null;
          movingDurationSecRef.current = 0;
          distanceRef.current = 0;
          routePointsRef.current = [];
          hadGpsPointsRef.current = false;
          firstAcceptedElapsedRef.current = null;
          setGpsUiStateSafe("idle");
          transitionTo("idle", "restore empty");
          setElapsedSafe(0);
          setDistanceSafe(0);
          setMovingDurationSafe(0);
          return;
        }

        startedAtRef.current = snapshot.startedAt;
        const recoveredElapsed =
          snapshot.running
            ? Math.max(
                snapshot.elapsedSec,
                Math.max(
                  0,
                  Math.floor((Date.now() - snapshot.startedAt) / 1000) - Math.max(0, snapshot.pausedDurationSec ?? 0)
                )
              )
            : snapshot.elapsedSec;

        elapsedBeforeRunRef.current = recoveredElapsed;
        runStartedAtRef.current = snapshot.running ? Date.now() : null;
        pausedDurationSecRef.current = snapshot.pausedDurationSec ?? 0;
        pauseStartedAtRef.current = snapshot.running ? null : snapshot.pauseStartedAt ?? null;
        movingDurationSecRef.current = snapshot.movingDurationSec ?? 0;
        distanceRef.current = snapshot.distanceM;
        routePointsRef.current = snapshot.routePoints ?? [];
        routeCaptureInterruptedRef.current = snapshot.routeCaptureInterrupted ?? false;
        routeCaptureGapSecRef.current =
          snapshot.routeCaptureGapSec ?? snapshot.gpsDiagnostics?.largestTrackingGapSec ?? 0;
        hadGpsPointsRef.current = routePointsRef.current.length > 1;
        firstAcceptedElapsedRef.current = routePointsRef.current.length > 0 ? 0 : null;
        if (snapshot.gpsDiagnostics) {
          gpsDiagnosticsExtraRef.current = snapshot.gpsDiagnostics;
          gpsStatsRef.current = {
            rawPoints: snapshot.gpsDiagnostics.rawPoints,
            acceptedDistancePoints: snapshot.gpsDiagnostics.acceptedPoints,
            ignoredPoints: snapshot.gpsDiagnostics.rejectedPoints,
            lastIgnoredReason:
              typeof snapshot.gpsDiagnostics.lastRejectedReason === "string"
                ? (snapshot.gpsDiagnostics.lastRejectedReason as GpsIgnoreReason)
                : null,
            averageAccuracy: snapshot.gpsDiagnostics.averageAccuracy ?? null,
            worstAccuracy: snapshot.gpsDiagnostics.worstAccuracy ?? null,
            lastAcceptedTimestamp: snapshot.gpsDiagnostics.lastAcceptedAt ?? null,
            acceptedDistanceM: snapshot.gpsDiagnostics.acceptedDistanceM ?? snapshot.distanceM,
            gpsStrength: computeGpsStrength(
              snapshot.gpsDiagnostics.averageAccuracy ?? null,
              snapshot.gpsDiagnostics.acceptedPoints
            ),
          };
          gpsIgnoreCountsRef.current = snapshot.gpsDiagnostics.rejectionCounts ?? {};
        } else {
          gpsDiagnosticsExtraRef.current = {};
          const accuracies = routePointsRef.current
            .map((point) => point.accuracy)
            .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
          const averageAccuracy =
            accuracies.length > 0
              ? accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length
              : null;
          const worstAccuracy = accuracies.length > 0 ? Math.max(...accuracies) : null;
          gpsStatsRef.current = {
            rawPoints: routePointsRef.current.length,
            acceptedDistancePoints: routePointsRef.current.length,
            ignoredPoints: 0,
            lastIgnoredReason: null,
            averageAccuracy,
            worstAccuracy,
            lastAcceptedTimestamp: routePointsRef.current[routePointsRef.current.length - 1]?.t ?? null,
            acceptedDistanceM: snapshot.distanceM,
            gpsStrength: computeGpsStrength(averageAccuracy, routePointsRef.current.length),
          };
          gpsIgnoreCountsRef.current = {};
        }
        setElapsedSafe(recoveredElapsed);
        setDistanceSafe(snapshot.distanceM);
        setMovingDurationSafe(movingDurationSecRef.current);

        if (routePointsRef.current.length > 0) {
          const last = routePointsRef.current[routePointsRef.current.length - 1];
          if (last) {
            lastPointRef.current = snapshot.lastAcceptedPoint ?? last;
          }
        }

        if (snapshot.running) {
          setGpsUiStateSafe(snapshot.gpsUiState ?? (routePointsRef.current.length > 0 ? "live" : "finding"));
          transitionTo("tracking", "restore tracking");
          startTimer("restore");
          if (!cancelled) {
            void beginLocationTracking("restore");
          }
        } else {
          setGpsUiStateSafe(routePointsRef.current.length > 0 ? "live" : "idle");
          transitionTo("paused", "restore paused");
        }
      } catch (error) {
        console.error("[walk] failed to restore active walk", error);
        await resetWalkState("restore failed");
      } finally {
        restoringRef.current = false;
        if (!cancelled) {
          setRestoredSafe(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [beginLocationTracking, logWalk, resetWalkState, setDistanceSafe, setElapsedSafe, setGpsUiStateSafe, setMovingDurationSafe, setRestoredSafe, startTimer, transitionTo]);

  useEffect(() => {
    if (restoringRef.current || !startedAtRef.current) return;
    if (phase !== "tracking" && phase !== "paused") return;
    schedulePersist();
  }, [distanceM, elapsedSec, phase, schedulePersist]);

  useEffect(() => {
    if (phase !== "tracking" && phase !== "paused") return;
    if (elapsedSec > 0 && elapsedSec % 15 === 0) {
      logWalk("elapsed seconds", { elapsedSeconds: elapsedSec });
    }
    logPace(elapsedSec, distanceM);
  }, [distanceM, elapsedSec, logPace, logWalk, phase]);

  const hasActiveSession = phase !== "idle";
  const startResumeLabel =
    busyAction === "start"
      ? "STARTING…"
      : busyAction === "resume"
        ? "RESUMING…"
        : phase === "paused"
          ? "RESUME"
          : phase === "tracking"
            ? "ACTIVE"
            : "START";
  const canStartOrResume = restored && busyAction === null && (phase === "idle" || phase === "paused");
  const canPause = restored && busyAction === null && phase === "tracking";
  const canStop = restored && busyAction === null && (phase === "tracking" || phase === "paused");
  const hasGpsAnchor = firstAcceptedElapsedRef.current !== null;
  const paceLabel =
    permission === "denied"
      ? "--"
      : pace ?? "Getting pace…";
  const statusText =
    phase === "tracking" && permission !== "denied" && !hasGpsAnchor
      ? "GPS is warming up in the background. Your timer is running and distance begins with the first valid point."
      : phase === "tracking"
        ? "Walk in progress. Pause when you want a breather."
        : phase === "paused"
          ? "Your walk is paused. Resume when you're ready."
          : phase === "saving"
            ? "Saving your walk now."
            : permission === "denied"
              ? "Timer-only mode is ready. Turn location back on anytime for route and distance."
              : "Start when you're ready. Distance and pace appear automatically when location is on.";

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.bgGlowTop} />
      <View style={styles.bgGlowBottom} />

      <View style={styles.sessionCard}>
        <View style={styles.sessionHeader}>
          <View style={styles.sessionPill}>
            <Text style={styles.sessionPillText}>
              {phase === "tracking"
                ? "Walk live"
                : phase === "paused"
                  ? "Paused"
                  : phase === "saving"
                    ? "Saving"
                    : "Ready"}
            </Text>
          </View>
          <Text style={styles.sessionHint}>
            {permission === "denied"
              ? "Timer mode"
              : gpsUiState === "primed"
                ? "GPS primed"
                : gpsUiState === "finding"
                  ? "Finding GPS…"
                  : "GPS mode"}
          </Text>
        </View>

        <Text style={styles.title}>Walk</Text>
        <Text style={styles.sub}>Elapsed</Text>
        <Text style={styles.big}>{fmtTime(elapsedSec)}</Text>
        <Text style={styles.sessionSupport}>
          {permission === "denied"
            ? "Timer mode is active. Turn location back on anytime for route and distance."
            : !hasGpsAnchor
              ? "Your timer is running while GPS warms up. Distance starts with the first valid point."
              : "Keep your phone with you and Step Outside will track route, distance, and pace."}
        </Text>

        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.metricK}>Distance</Text>
            <Text style={styles.metricV}>{(distanceM / 1609.344).toFixed(2)} mi</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricK}>Avg pace</Text>
            <Text style={styles.metricV}>{paceLabel}</Text>
          </View>
        </View>
      </View>

      {permission === "denied" ? (
        <Text style={styles.warn}>Location is off, so this walk will track time only.</Text>
      ) : phase === "tracking" && backgroundPermission === "denied" ? (
        <Text style={styles.warn}>Allow Always location access to keep tracking while your screen is locked.</Text>
      ) : phase === "tracking" && backgroundTrackingReady === false ? (
        <Text style={styles.warn}>Screen-lock tracking could not start. Keep Step Outside open for this walk.</Text>
      ) : null}

      {!restored ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={PREMIUM.colors.gold} />
          <Text style={styles.loadingText}>Loading walk…</Text>
        </View>
      ) : (
        <View style={styles.controlsStack}>
          <View style={styles.actionRow}>
            <StepButton
              style={styles.splitBtn}
              onPress={hasActiveSession ? resume : start}
              label={startResumeLabel}
              disabled={!canStartOrResume}
            />
            <StepButton
              style={styles.splitBtn}
              onPress={pause}
              label={busyAction === "pause" ? "PAUSING…" : "PAUSE"}
              disabled={!canPause}
              tone="gold"
            />
          </View>
          <Text style={styles.controlHint}>{statusText}</Text>
        </View>
      )}

      <StepButton
        style={styles.btnEnd}
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
        label={busyAction === "stop" ? "STOPPING…" : "STOP"}
        tone="danger"
        fullWidth
      />

      <View style={styles.bottomRow}>
        <StepButton
          style={styles.back}
          onPress={() => leaveWalkScreen("back")}
          label="BACK"
          variant="tertiary"
        />

        <StepButton
          style={styles.home}
          onPress={() => leaveWalkScreen("home")}
          label="HOME"
          variant="secondary"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PREMIUM.colors.cream,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: PREMIUM.spacing.screen,
    paddingVertical: 18,
    overflow: "hidden",
  },
  bgGlowTop: {
    position: "absolute",
    top: -90,
    right: -44,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: alpha(PREMIUM.colors.forest, 0.08),
  },
  bgGlowBottom: {
    position: "absolute",
    bottom: -80,
    left: -60,
    width: 210,
    height: 210,
    borderRadius: 999,
    backgroundColor: alpha(PREMIUM.colors.gold, 0.14),
  },
  sessionCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: PREMIUM.radius.hero,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
    backgroundColor: alpha(PREMIUM.colors.offWhite, 0.84),
    borderWidth: 1,
    borderColor: PREMIUM.colors.line,
    ...PREMIUM.shadow.hero,
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
    backgroundColor: alpha(PREMIUM.colors.forest, 0.1),
    borderWidth: 1,
    borderColor: PREMIUM.colors.lineStrong,
  },
  sessionPillText: {
    color: PREMIUM.colors.forest,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  sessionHint: {
    color: PREMIUM.colors.textSoft,
    fontSize: 12,
    fontWeight: "800",
  },
  title: { fontSize: 32, lineHeight: 38, fontWeight: "700", color: PREMIUM.colors.text, fontFamily: PREMIUM.type.serifFamily },
  sub: { marginTop: 12, fontSize: 13, fontWeight: "800", color: PREMIUM.colors.textMuted, letterSpacing: 0.6, textTransform: "uppercase" },
  big: { marginTop: 8, fontSize: 62, fontWeight: "800", color: PREMIUM.colors.forest, letterSpacing: -1.8, fontFamily: PREMIUM.type.serifFamily },
  sessionSupport: {
    marginTop: 10,
    color: PREMIUM.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    maxWidth: 280,
  },

  metrics: { flexDirection: "row", gap: 14, marginTop: 18 },
  metric: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: PREMIUM.radius.lg,
    backgroundColor: alpha(PREMIUM.colors.cream, 0.96),
    borderWidth: 1,
    borderColor: PREMIUM.colors.line,
    alignItems: "center",
  },
  metricK: { fontSize: 12, fontWeight: "800", color: PREMIUM.colors.textSoft, textTransform: "uppercase", letterSpacing: 0.4 },
  metricV: { marginTop: 6, fontSize: 18, fontWeight: "900", color: PREMIUM.colors.text },

  warn: {
    marginTop: 14,
    color: PREMIUM.colors.ink,
    fontWeight: "800",
    backgroundColor: alpha(PREMIUM.colors.gold, 0.2),
    borderWidth: 1,
    borderColor: alpha(PREMIUM.colors.goldDeep, 0.28),
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: PREMIUM.radius.md,
  },
  loadingState: {
    marginTop: 22,
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: PREMIUM.colors.textMuted,
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
    color: PREMIUM.colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
    maxWidth: 280,
  },

  btnEnd: {
    marginTop: 14,
    minWidth: 240,
    alignItems: "center",
  },

  bottomRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
  },
  back: { minHeight: 46, paddingHorizontal: 16, justifyContent: "center", borderRadius: PREMIUM.radius.pill, flex: 1 },
  home: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: PREMIUM.radius.pill,
    justifyContent: "center",
    flex: 1,
  },
});
