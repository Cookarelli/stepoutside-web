import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, type AppStateStatus, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  clearCompletedWalkDraft,
  clearActiveWalkSnapshot,
  getActiveWalkSnapshot,
  setActiveWalkSnapshot,
  setCompletedWalkDraft,
} from "../src/lib/activeWalk";
import { ENV } from "../env";
import {
  computeGpsStrength,
  evaluateGpsPoint,
  formatWalkingPace,
  GPS_WARMUP_SECONDS,
  type GpsAcceptanceStats,
  type GpsIgnoreReason,
  updateGpsStats,
} from "../src/lib/gpsTracking";
import { PREMIUM, alpha } from "../src/lib/premiumTheme";
import type { RoutePoint } from "../src/lib/store";

type PermissionState = "unknown" | "granted" | "denied";

type SessionSource = "gps" | "timer";
type WalkPhase = "idle" | "countdown" | "tracking" | "paused" | "saving" | "completed";
type GpsUiState = "idle" | "primed" | "finding" | "live";

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.max(0, sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Walk() {
  const router = useRouter();
  const SNAPSHOT_PERSIST_DEBOUNCE_MS = 4000;

  useEffect(() => {
    console.log("[boot] walk screen mounted");
  }, []);

  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [phase, setPhase] = useState<WalkPhase>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [movingDurationSec, setMovingDurationSec] = useState(0);
  const [restored, setRestored] = useState(false);
  const [busyAction, setBusyAction] = useState<"start" | "pause" | "resume" | "stop" | null>(null);
  const [countdownSec, setCountdownSec] = useState(0);
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
  const rawRoutePointsRef = useRef<RoutePoint[]>([]);
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
    gpsStrength: "Weak GPS",
  });

  const lastPointRef = useRef<RoutePoint | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const locationGenerationRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const pace = useMemo(() => {
    return formatWalkingPace(distanceM, movingDurationSec);
  }, [distanceM, movingDurationSec]);

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

  const logPace = useCallback((movingSeconds: number, confirmedDistanceMeters: number) => {
    if (!__DEV__) return;

    console.log("[PACE]", {
      movingSeconds,
      distanceMiles: Number((confirmedDistanceMeters / 1609.344).toFixed(3)),
      pace: formatWalkingPace(confirmedDistanceMeters, movingSeconds) ?? "Warming up",
    });
  }, []);

  const trackIgnoredPoint = useCallback(
    (reason: GpsIgnoreReason, accuracy: number | null, deltaMeters: number | null, speedMps: number | null) => {
      gpsIgnoreCountsRef.current = {
        ...gpsIgnoreCountsRef.current,
        [reason]: (gpsIgnoreCountsRef.current[reason] ?? 0) + 1,
      };
      gpsStatsRef.current = updateGpsStats(gpsStatsRef.current, accuracy, false, reason);
      logGps("ignored", {
        reason,
        accuracy,
        deltaMeters: deltaMeters === null ? null : Number(deltaMeters.toFixed(2)),
        speedMps: speedMps === null ? null : Number(speedMps.toFixed(2)),
        rawPoints: gpsStatsRef.current.rawPoints,
        ignoredPoints: gpsStatsRef.current.ignoredPoints,
        gpsStrength: gpsStatsRef.current.gpsStrength,
      });
    },
    [logGps]
  );

  const setPermissionSafe = useCallback((next: PermissionState) => {
    if (mountedRef.current) {
      setPermission(next);
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

  const setCountdownSafe = useCallback((next: number) => {
    if (mountedRef.current) {
      setCountdownSec(next);
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
          return next === "countdown" || next === "tracking";
        case "countdown":
          return next === "tracking" || next === "idle";
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
      const res = await Location.getForegroundPermissionsAsync();
      const nextPermission: PermissionState =
        res.status === "granted"
          ? "granted"
          : res.status === "denied"
            ? "denied"
            : "unknown";
      logWalk("permission refreshed", {
        status: res.status,
        canAskAgain: res.canAskAgain,
        mappedPermission: nextPermission,
      });
      setPermissionSafe(nextPermission);
      return nextPermission === "granted";
    } catch (error) {
      console.error("[walk] failed to refresh permission", error);
      setPermissionSafe("unknown");
      return false;
    }
  }, [logWalk, setPermissionSafe]);

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

  const buildRoutePoint = useCallback(
    (
      coords: Pick<Location.LocationObjectCoords, "latitude" | "longitude" | "accuracy" | "altitude" | "speed">,
      timestamp: number
    ): RoutePoint => ({
      lat: coords.latitude,
      lng: coords.longitude,
      t: timestamp || Date.now(),
      ...(typeof coords.accuracy === "number" && Number.isFinite(coords.accuracy) ? { accuracy: coords.accuracy } : {}),
      ...(typeof coords.altitude === "number" && Number.isFinite(coords.altitude) ? { altitude: coords.altitude } : {}),
      ...(typeof coords.speed === "number" && Number.isFinite(coords.speed) ? { speed: coords.speed } : {}),
    }),
    []
  );

  const acceptAnchorPoint = useCallback(
    (point: RoutePoint, source: "watch" | "fresh-start-fix") => {
      const accuracy =
        typeof point.accuracy === "number" && Number.isFinite(point.accuracy) ? point.accuracy : null;

      gpsStatsRef.current = updateGpsStats(gpsStatsRef.current, accuracy, true, null);
      routePointsRef.current = routePointsRef.current.length === 0 ? [point] : routePointsRef.current;
      lastPointRef.current = point;
      if (firstAcceptedElapsedRef.current === null) {
        firstAcceptedElapsedRef.current =
          runStartedAtRef.current === null
            ? elapsedBeforeRunRef.current
            : elapsedBeforeRunRef.current + Math.max(0, Math.floor((Date.now() - runStartedAtRef.current) / 1000));
      }
      setGpsUiStateSafe("live");
      logGps("accepted", {
        kind: source === "watch" ? "anchor" : "seeded_anchor",
        accuracy,
        gpsStrength: gpsStatsRef.current.gpsStrength,
      });
    },
    [logGps, setGpsUiStateSafe]
  );

  const wait = useCallback((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)), []);

  const getAcceptableLastKnownPoint = useCallback(async () => {
    try {
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (!lastKnown) return null;

      const point = buildRoutePoint(lastKnown.coords, lastKnown.timestamp || Date.now());
      const result = evaluateGpsPoint(point, null);
      if (!result.accepted) {
        return null;
      }

      return point;
    } catch (error) {
      console.warn("[walk] failed to read last known location", error);
      return null;
    }
  }, [buildRoutePoint]);

  const getFreshStartingPoint = useCallback(async () => {
    try {
      const locationOrNull = await Promise.race<Location.LocationObject | null>([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation }),
        wait((GPS_WARMUP_SECONDS + 1) * 1000).then(() => null),
      ]);

      if (!locationOrNull) return null;

      const point = buildRoutePoint(locationOrNull.coords, locationOrNull.timestamp || Date.now());
      const result = evaluateGpsPoint(point, null);
      if (!result.accepted) {
        return null;
      }

      return point;
    } catch (error) {
      console.warn("[walk] failed to read fresh start fix", error);
      return null;
    }
  }, [buildRoutePoint, wait]);

  const ensureLocationPermission = useCallback(async () => {
    if (permission === "granted") return true;
    if (permission === "denied") return false;

    const hasExistingPermission = await refreshPermission();
    if (hasExistingPermission) return true;

    return await requestPerms();
  }, [permission, refreshPermission, requestPerms]);

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
    async (reason: string, seededPoint?: RoutePoint | null) => {
      stopGps(`restart before ${reason}`);
      const generation = locationGenerationRef.current;
      logWalk("gps starting", { reason, generation });

      if (seededPoint) {
        routePointsRef.current = [seededPoint];
        acceptAnchorPoint(seededPoint, "fresh-start-fix");
      } else if (permission !== "denied") {
        setGpsUiStateSafe("finding");
      }

      try {
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1000,
            distanceInterval: 3,
          },
          (pos) => {
            if (!mountedRef.current || locationGenerationRef.current !== generation || phaseRef.current !== "tracking") {
              return;
            }

            const point = buildRoutePoint(pos.coords, pos.timestamp || Date.now());
            rawRoutePointsRef.current = [...rawRoutePointsRef.current, point];
            logGps("raw point", {
              lat: Number(point.lat.toFixed(6)),
              lng: Number(point.lng.toFixed(6)),
              accuracy: point.accuracy ?? null,
              speed: typeof pos.coords.speed === "number" && Number.isFinite(pos.coords.speed)
                ? Number(pos.coords.speed.toFixed(2))
                : null,
              heading: typeof pos.coords.heading === "number" && Number.isFinite(pos.coords.heading)
                ? Number(pos.coords.heading.toFixed(1))
                : null,
              altitude: typeof pos.coords.altitude === "number" && Number.isFinite(pos.coords.altitude)
                ? Number(pos.coords.altitude.toFixed(1))
                : null,
              timestamp: point.t,
            });

            const accuracy =
              typeof point.accuracy === "number" && Number.isFinite(point.accuracy) ? point.accuracy : null;
            const result = evaluateGpsPoint(point, lastPointRef.current);

            if (!result.accepted) {
              trackIgnoredPoint(result.reason, accuracy, result.deltaMeters, result.speedMps);
              return;
            }

            gpsStatsRef.current = updateGpsStats(gpsStatsRef.current, accuracy, true, null);

            if (result.kind === "anchor") {
              acceptAnchorPoint(point, "watch");
              return;
            }

            const nextDistance = distanceRef.current + result.deltaMeters;
            const nextMovingDuration = movingDurationSecRef.current + Math.max(0, Math.round(result.deltaTimeSec));
            distanceRef.current = nextDistance;
            movingDurationSecRef.current = nextMovingDuration;
            routePointsRef.current = [...routePointsRef.current, point];
            hadGpsPointsRef.current = routePointsRef.current.length > 1;
            lastPointRef.current = point;
            setGpsUiStateSafe("live");
            setDistanceSafe(nextDistance);
            setMovingDurationSafe(nextMovingDuration);
            logGps("accepted", {
              deltaMeters: Number(result.deltaMeters.toFixed(2)),
              deltaTimeSec: Number(result.deltaTimeSec.toFixed(2)),
              speedMps: result.speedMps === null ? null : Number(result.speedMps.toFixed(2)),
              accuracy,
              acceptedPoints: gpsStatsRef.current.acceptedDistancePoints,
              averageAccuracy:
                gpsStatsRef.current.averageAccuracy === null
                  ? null
                  : Number(gpsStatsRef.current.averageAccuracy.toFixed(1)),
              gpsStrength: gpsStatsRef.current.gpsStrength,
            });
            logWalk("distance updated", {
              distanceMeters: Math.round(nextDistance),
              distanceMiles: Number((nextDistance / 1609.344).toFixed(3)),
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
    [acceptAnchorPoint, buildRoutePoint, logGps, logWalk, permission, setDistanceSafe, setGpsUiStateSafe, setMovingDurationSafe, stopGps, trackIgnoredPoint]
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

  const setCompletedWalkDraftSafe = useCallback(async (routePoints: RoutePoint[], reason: string) => {
    try {
      await setCompletedWalkDraft({ routePoints });
      logWalk("completed draft saved", { reason, points: routePoints.length });
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
          startedAt,
          elapsedSec: overrides?.elapsedSec ?? getElapsedNow(),
          distanceM: overrides?.distanceM ?? distanceRef.current,
          movingDurationSec: overrides?.movingDurationSec ?? movingDurationSecRef.current,
          pausedDurationSec: overrides?.pausedDurationSec ?? getPausedDurationNow(),
          pauseStartedAt:
            overrides && "pauseStartedAt" in overrides ? overrides.pauseStartedAt ?? null : pauseStartedAtRef.current,
          routePoints: overrides?.routePoints ?? routePointsRef.current,
          running: overrides?.running ?? phaseRef.current === "tracking",
          updatedAt: Date.now(),
        });
        return true;
      } catch (error) {
        console.error("[walk] failed to persist active walk", error);
        return false;
      }
    },
    [getElapsedNow, getPausedDurationNow]
  );

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
    distanceRef.current = 0;
    rawRoutePointsRef.current = [];
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
      gpsStrength: "Weak GPS",
    };
    gpsIgnoreCountsRef.current = {};
    setCountdownSafe(0);
    setGpsUiStateSafe("idle");
    setElapsedSafe(0);
    setDistanceSafe(0);
    setMovingDurationSafe(0);
    transitionTo("idle", reason);
    await clearActiveWalkSnapshotSafe(reason);
  }, [clearActiveWalkSnapshotSafe, clearScheduledPersist, setCountdownSafe, setDistanceSafe, setElapsedSafe, setGpsUiStateSafe, setMovingDurationSafe, stopGps, stopTimer, transitionTo]);

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
      await clearCompletedWalkDraftSafe("start");
      await resetWalkState("start");
      transitionTo("countdown", "start warmup");

      const permissionPromise = ensureLocationPermission();
      const warmupPromise = (async () => {
        const ok = await permissionPromise;
        if (!ok) return { lastKnownPoint: null as RoutePoint | null, freshPoint: null as RoutePoint | null };

        const lastKnownPoint = await getAcceptableLastKnownPoint();
        if (lastKnownPoint) {
          setGpsUiStateSafe("primed");
        }

        const freshPoint = await getFreshStartingPoint();
        return { lastKnownPoint, freshPoint };
      })();

      for (let countdown = GPS_WARMUP_SECONDS; countdown >= 1; countdown -= 1) {
        setCountdownSafe(countdown);
        await wait(1000);
      }
      setCountdownSafe(0);

      const ok = await permissionPromise;
      const { lastKnownPoint, freshPoint } = await warmupPromise;

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
      rawRoutePointsRef.current = freshPoint ? [freshPoint] : [];
      routePointsRef.current = [];
      hadGpsPointsRef.current = false;
      firstAcceptedElapsedRef.current = null;

      if (ok) {
        setGpsUiStateSafe(freshPoint ? "live" : lastKnownPoint ? "primed" : "finding");
      }

      transitionTo("tracking", "start");
      logWalk("walk started", { gpsEnabled: ok, hasFreshStartingPoint: Boolean(freshPoint) });
      await persistActiveWalk({
        elapsedSec: 0,
        distanceM: 0,
        movingDurationSec: 0,
        pausedDurationSec: 0,
        pauseStartedAt: null,
        routePoints: [],
        running: true,
      });
      startTimer("start");

      if (ok) {
        await startGps("start", freshPoint);
      }

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
      const ok = await ensureLocationPermission();

      elapsedBeforeRunRef.current = getElapsedNow();
      runStartedAtRef.current = Date.now();
      if (pauseStartedAtRef.current !== null) {
        pausedDurationSecRef.current = getPausedDurationNow();
      }
      pauseStartedAtRef.current = null;
      if (ok) {
        setGpsUiStateSafe(firstAcceptedElapsedRef.current === null ? "finding" : "live");
      }
      transitionTo("tracking", "resume");
      logWalk("walk resumed", { elapsedSeconds: elapsedBeforeRunRef.current, gpsEnabled: ok });
      await persistActiveWalk({
        elapsedSec: elapsedBeforeRunRef.current,
        pausedDurationSec: pausedDurationSecRef.current,
        pauseStartedAt: null,
        movingDurationSec: movingDurationSecRef.current,
        running: true,
      });
      startTimer("resume");

      if (ok) {
        await startGps("resume");
      }
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
      transitionTo("saving", "stop");

      const source: SessionSource = hadGpsPointsRef.current || routePointsRef.current.length > 1 ? "gps" : "timer";
      const endLat = lastPointRef.current?.lat;
      const endLng = lastPointRef.current?.lng;
      const routePoints = [...routePointsRef.current];
      const finalElapsed = syncElapsedFromClock();
      const finalPausedDuration = getPausedDurationNow();
      const finalTotalElapsed = getTotalElapsedNow();
      const finalMovingElapsed = movingDurationSecRef.current;
      const finalDistance = Math.max(0, Math.round(distanceRef.current));
      logWalk("walk ended", {
        elapsedSeconds: finalElapsed,
        pausedSeconds: finalPausedDuration,
        totalElapsedSeconds: finalTotalElapsed,
        movingTimeSeconds: finalMovingElapsed,
        distanceMeters: finalDistance,
        distanceMiles: Number((finalDistance / 1609.344).toFixed(3)),
        pace: formatWalkingPace(finalDistance, finalMovingElapsed) ?? "Warming up",
        source,
        rawPoints: rawRoutePointsRef.current.length,
        acceptedPoints: gpsStatsRef.current.acceptedDistancePoints,
        ignoredPoints: gpsStatsRef.current.ignoredPoints,
        lastIgnoredReason: gpsStatsRef.current.lastIgnoredReason,
        averageAccuracy:
          gpsStatsRef.current.averageAccuracy === null
            ? null
            : Number(gpsStatsRef.current.averageAccuracy.toFixed(1)),
        gpsStrength: gpsStatsRef.current.gpsStrength,
        ignoredReasonCounts: gpsIgnoreCountsRef.current,
      });

      elapsedBeforeRunRef.current = finalElapsed;
      runStartedAtRef.current = null;
      pausedDurationSecRef.current = finalPausedDuration;
      pauseStartedAtRef.current = null;
      clearScheduledPersist();
      stopTimer("stop");
      stopGps("stop");
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

      const savedDraft = await setCompletedWalkDraftSafe(routePoints, "stop");
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

      if (
        startedAtRef.current &&
        (phaseRef.current === "tracking" || phaseRef.current === "paused") &&
        previousState === "active" &&
        nextState.match(/inactive|background/)
      ) {
        clearScheduledPersist();
        void persistActiveWalk();
      }
    });

    return () => {
      subscription.remove();
      clearScheduledPersist();
      if (startedAtRef.current && (phaseRef.current === "tracking" || phaseRef.current === "paused")) {
        void persistActiveWalk();
      }
      stopTimer("screen cleanup");
      stopGps("screen cleanup");
    };
  }, [clearScheduledPersist, persistActiveWalk, stopGps, stopTimer]);

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
          rawRoutePointsRef.current = [];
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
            ? snapshot.elapsedSec + Math.max(0, Math.round((Date.now() - snapshot.updatedAt) / 1000))
            : snapshot.elapsedSec;

        elapsedBeforeRunRef.current = snapshot.running ? snapshot.elapsedSec : recoveredElapsed;
        runStartedAtRef.current = snapshot.running ? snapshot.updatedAt : null;
        pausedDurationSecRef.current = snapshot.pausedDurationSec ?? 0;
        pauseStartedAtRef.current = snapshot.running ? null : snapshot.pauseStartedAt ?? null;
        movingDurationSecRef.current = snapshot.movingDurationSec ?? 0;
        distanceRef.current = snapshot.distanceM;
        rawRoutePointsRef.current = snapshot.routePoints ?? [];
        routePointsRef.current = snapshot.routePoints ?? [];
        hadGpsPointsRef.current = routePointsRef.current.length > 1;
        firstAcceptedElapsedRef.current = routePointsRef.current.length > 0 ? 0 : null;
        const accuracies = routePointsRef.current
          .map((point) => point.accuracy)
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
        const averageAccuracy =
          accuracies.length > 0
            ? accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length
            : null;
        gpsStatsRef.current = {
          rawPoints: routePointsRef.current.length,
          acceptedDistancePoints: Math.max(0, routePointsRef.current.length - 1),
          ignoredPoints: 0,
          lastIgnoredReason: null,
          averageAccuracy,
          gpsStrength: computeGpsStrength(averageAccuracy, Math.max(0, routePointsRef.current.length - 1)),
        };
        setElapsedSafe(recoveredElapsed);
        setDistanceSafe(snapshot.distanceM);
        setMovingDurationSafe(movingDurationSecRef.current);

        if (routePointsRef.current.length > 0) {
          const last = routePointsRef.current[routePointsRef.current.length - 1];
          if (last) {
            lastPointRef.current = last;
          }
        }

        if (snapshot.running) {
          setGpsUiStateSafe(routePointsRef.current.length > 0 ? "live" : "finding");
          transitionTo("tracking", "restore tracking");
          startTimer("restore");
          const ok = await refreshPermission();
          if (!cancelled && ok) {
            await startGps("restore");
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
  }, [logWalk, refreshPermission, resetWalkState, setDistanceSafe, setElapsedSafe, setGpsUiStateSafe, setMovingDurationSafe, setRestoredSafe, startGps, startTimer, transitionTo]);

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
    logPace(movingDurationSec, distanceM);
  }, [distanceM, elapsedSec, logPace, logWalk, movingDurationSec, phase]);

  const hasActiveSession = phase !== "idle";
  const startResumeLabel =
    busyAction === "start"
      ? "STARTING…"
      : busyAction === "resume"
        ? "RESUMING…"
        : phase === "countdown"
          ? "GET READY…"
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
      : phase === "countdown"
        ? "--"
        : !hasGpsAnchor
          ? "Finding GPS…"
          : pace ?? "Warming up";
  const statusText =
    phase === "countdown"
      ? "Starting in a moment while we wake up GPS."
      : phase === "tracking" && permission !== "denied" && !hasGpsAnchor
        ? "Finding a reliable GPS starting point. Distance begins as soon as the first accurate fix arrives."
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
              {phase === "countdown"
                ? "Get ready"
                : phase === "tracking"
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
        <Text style={styles.sub}>{phase === "countdown" ? "Starting in" : "Elapsed"}</Text>
        <Text style={styles.big}>{phase === "countdown" ? String(countdownSec || GPS_WARMUP_SECONDS) : fmtTime(elapsedSec)}</Text>
        <Text style={styles.sessionSupport}>
          {phase === "countdown"
            ? "A quick 3-2-1 while we prep your walk and check location."
            : permission === "denied"
            ? "Timer mode is active. Turn location back on anytime for route and distance."
            : !hasGpsAnchor
              ? "We’re looking for the first reliable GPS fix. Distance starts after that point is locked."
            : "Keep your phone with you and Step Outside will track route, distance, and pace."}
        </Text>

        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.metricK}>Distance</Text>
            <Text style={styles.metricV}>{(distanceM / 1609.344).toFixed(2)} mi</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricK}>Pace</Text>
            <Text style={styles.metricV}>{paceLabel}</Text>
          </View>
        </View>
      </View>

      {permission === "denied" ? (
        <Text style={styles.warn}>Location is off, so this walk will track time only.</Text>
      ) : null}

      {!restored ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={PREMIUM.colors.gold} />
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

  btnPrimary: {
    backgroundColor: PREMIUM.colors.forest,
    minHeight: 56,
    paddingVertical: 16,
    borderRadius: PREMIUM.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: { color: PREMIUM.colors.offWhite, fontWeight: "900", letterSpacing: 0.8 },

  btnPause: {
    backgroundColor: PREMIUM.colors.gold,
    minHeight: 56,
    paddingVertical: 16,
    borderRadius: PREMIUM.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPauseText: { color: PREMIUM.colors.ink, fontWeight: "900", letterSpacing: 0.8 },
  btnDisabled: {
    opacity: 0.45,
  },

  btnEnd: {
    marginTop: 14,
    backgroundColor: PREMIUM.colors.danger,
    minHeight: 56,
    paddingVertical: 14,
    paddingHorizontal: 26,
    borderRadius: PREMIUM.radius.pill,
    minWidth: 240,
    alignItems: "center",
    justifyContent: "center",
  },
  btnEndText: { color: PREMIUM.colors.offWhite, fontWeight: "900", letterSpacing: 0.8 },

  bottomRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
  },
  back: { minHeight: 44, paddingVertical: 8, paddingHorizontal: 12, justifyContent: "center", borderRadius: PREMIUM.radius.pill },
  backText: { color: PREMIUM.colors.textMuted, fontWeight: "800" },
  home: {
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: PREMIUM.radius.pill,
    backgroundColor: alpha(PREMIUM.colors.forest, 0.1),
    borderWidth: 1,
    borderColor: PREMIUM.colors.lineStrong,
    justifyContent: "center",
  },
  homeText: { color: PREMIUM.colors.forest, fontWeight: "900" },
});
