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
import type { RoutePoint } from "../src/lib/store";
import { type MotionState, filterGpsPoint, haversineMeters } from "../src/utils/gpsFiltering";
import { calculateMovingTimeSeconds, getPaceMetrics } from "../src/utils/pace";

type PermissionState = "unknown" | "granted" | "denied";

type SessionSource = "gps" | "timer";

const WALKING_GPS_ACCURACY =
  Location.Accuracy.BestForNavigation ?? Location.Accuracy.Highest;
const WALKING_GPS_TIME_INTERVAL_MS = 4000;
const WALKING_GPS_DISTANCE_INTERVAL_METERS = 5;

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.max(0, sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtMeters(distanceM: number): string {
  return `${distanceM.toFixed(1)} m`;
}

function fmtDebugNumber(value?: number | null, digits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

type GpsDebugState = {
  rawPointCount: number;
  acceptedPointCount: number;
  rejectedPointCount: number;
  latestAccuracy: number | null;
  latestSpeed: number | null;
  latestHorizontalDistanceM: number;
  latestVerticalChangeM: number;
  totalFilteredDistanceM: number;
  totalRawDistanceM: number;
  movingTimeSeconds: number;
  pausedTimeSeconds: number;
  currentPace: string;
  currentRawPace: string;
  currentRollingPace: string;
  lastRejectedReason: string;
  motionState: MotionState | "unknown";
};

const EMPTY_GPS_DEBUG_STATE: GpsDebugState = {
  rawPointCount: 0,
  acceptedPointCount: 0,
  rejectedPointCount: 0,
  latestAccuracy: null,
  latestSpeed: null,
  latestHorizontalDistanceM: 0,
  latestVerticalChangeM: 0,
  totalFilteredDistanceM: 0,
  totalRawDistanceM: 0,
  movingTimeSeconds: 0,
  pausedTimeSeconds: 0,
  currentPace: "-- / mi",
  currentRawPace: "-- / mi",
  currentRollingPace: "-- / mi",
  lastRejectedReason: "none",
  motionState: "unknown",
};

export default function Walk() {
  const router = useRouter();
  const SNAPSHOT_PERSIST_DEBOUNCE_MS = 4000;

  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [phase, setPhase] = useState<"idle" | "tracking" | "paused" | "saving" | "completed">("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [movingSec, setMovingSec] = useState(0);
  const [pausedSec, setPausedSec] = useState(0);
  const [restored, setRestored] = useState(false);
  const [busyAction, setBusyAction] = useState<"start" | "pause" | "resume" | "stop" | null>(null);
  const [gpsDebug, setGpsDebug] = useState<GpsDebugState>(EMPTY_GPS_DEBUG_STATE);

  const mountedRef = useRef(true);
  const restoredRef = useRef(false);
  const phaseRef = useRef<"idle" | "tracking" | "paused" | "saving" | "completed">("idle");
  const busyActionRef = useRef<"start" | "pause" | "resume" | "stop" | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerGenerationRef = useRef(0);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoringRef = useRef(false);
  const elapsedBeforeRunRef = useRef(0);
  const runStartedAtRef = useRef<number | null>(null);
  const pausedTotalSecRef = useRef(0);
  const pausedStartedAtRef = useRef<number | null>(null);
  const distanceRef = useRef(0);
  const movingSecRef = useRef(0);
  const routePointsRef = useRef<RoutePoint[]>([]);
  const hadGpsPointsRef = useRef(false);
  const stationaryPointStreakRef = useRef(0);
  const awaitingResumeAnchorRef = useRef(false);

  const lastPointRef = useRef<RoutePoint | null>(null);
  const lastRawPointRef = useRef<RoutePoint | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const locationGenerationRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const paceMetrics = useMemo(() => {
    return getPaceMetrics({
      distanceM,
      elapsedSeconds: elapsedSec,
      movingSeconds: movingSec,
      routePoints: routePointsRef.current,
      preferRolling: true,
      loadingFallback: permission === "denied" ? "-- / mi" : "Getting GPS...",
      emptyFallback: "-- / mi",
    });
  }, [distanceM, elapsedSec, movingSec, permission]);
  const pace = paceMetrics.display;

  const logWalk = useCallback((message: string, details?: Record<string, unknown>) => {
    if (details) {
      console.log(`[walk] ${message}`, details);
      return;
    }

    console.log(`[walk] ${message}`);
  }, []);

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

  const setMovingSafe = useCallback((next: number) => {
    if (mountedRef.current) {
      setMovingSec(next);
    }
  }, []);

  const setPausedSafe = useCallback((next: number) => {
    if (mountedRef.current) {
      setPausedSec(next);
    }
  }, []);

  const setGpsDebugSafe = useCallback((next: GpsDebugState | ((current: GpsDebugState) => GpsDebugState)) => {
    if (!__DEV__ || !mountedRef.current) return;
    setGpsDebug(next);
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

  const canTransitionTo = useCallback(
    (current: "idle" | "tracking" | "paused" | "saving" | "completed", next: "idle" | "tracking" | "paused" | "saving" | "completed") => {
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
    (next: "idle" | "tracking" | "paused" | "saving" | "completed", reason: string) => {
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
      allowedPhases: ("idle" | "tracking" | "paused" | "saving" | "completed")[]
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
      const nextPermission: PermissionState = res.status === "granted" ? "granted" : "denied";
      setPermissionSafe(nextPermission);
      return nextPermission === "granted";
    } catch (error) {
      console.error("[walk] failed to refresh permission", error);
      setPermissionSafe("denied");
      return false;
    }
  }, [setPermissionSafe]);

  const requestPerms = useCallback(async () => {
    try {
      const res = await Location.requestForegroundPermissionsAsync();
      const ok = res.status === "granted";
      setPermissionSafe(ok ? "granted" : "denied");
      return ok;
    } catch (error) {
      console.error("[walk] failed to request permission", error);
      setPermissionSafe("denied");
      return false;
    }
  }, [setPermissionSafe]);

  const ensureLocationPermission = useCallback(async () => {
    if (permission === "granted") return true;
    if (permission === "denied") return false;

    const hasExistingPermission = await refreshPermission();
    if (hasExistingPermission) return true;

    return await requestPerms();
  }, [permission, refreshPermission, requestPerms]);

  const stopGps = useCallback(
    (reason: string, options?: { preserveLastPoint?: boolean }) => {
      locationGenerationRef.current += 1;
      if (subRef.current) {
        try {
          subRef.current.remove();
        } catch (error) {
          console.error("[walk] failed to remove gps subscription", error);
        }
      }
      subRef.current = null;
      if (!options?.preserveLastPoint) {
        lastPointRef.current = null;
      }
      if (!options?.preserveLastPoint) {
        lastRawPointRef.current = null;
      }
      logWalk("gps stopped", { reason });
    },
    [logWalk]
  );

  const getActiveElapsedNow = useCallback(() => {
    if (!runStartedAtRef.current) return elapsedBeforeRunRef.current;
    return elapsedBeforeRunRef.current + Math.max(0, Math.floor((Date.now() - runStartedAtRef.current) / 1000));
  }, []);

  const getPausedNow = useCallback(() => {
    const livePaused =
      pausedStartedAtRef.current ? Math.max(0, Math.floor((Date.now() - pausedStartedAtRef.current) / 1000)) : 0;
    return pausedTotalSecRef.current + livePaused;
  }, []);

  const startGps = useCallback(
    async (reason: string, options?: { preserveLastPoint?: boolean }) => {
      stopGps(`restart before ${reason}`, { preserveLastPoint: options?.preserveLastPoint });
      const generation = locationGenerationRef.current;
      logWalk("gps starting", { reason, generation });

      try {
        const subscription = await Location.watchPositionAsync(
          {
            // Use the best foreground accuracy available so walking routes stay usable on iPhone.
            // If BestForNavigation is unavailable in a platform build, fall back to Highest.
            accuracy: WALKING_GPS_ACCURACY,
            // Walking and hiking do not need 1-second GPS polling. A 4-second cadence is steadier,
            // reduces battery drain, and avoids overcounting from rapid jitter.
            timeInterval: WALKING_GPS_TIME_INTERVAL_MS,
            // Require about 5 meters of movement before the OS wakes the watcher again.
            // This is a better fit for walking than tiny 3-meter jumps.
            distanceInterval: WALKING_GPS_DISTANCE_INTERVAL_METERS,
            // Let Android surface location-settings prompts when device services are off.
            // This keeps the permission flow friendlier without changing iOS review behavior.
            mayShowUserSettingsDialog: true,
          },
          (pos) => {
            if (!mountedRef.current || locationGenerationRef.current !== generation || phaseRef.current !== "tracking") {
              return;
            }

            const nextPoint: RoutePoint = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              t: pos.timestamp || Date.now(),
              ...(typeof pos.coords.accuracy === "number" && Number.isFinite(pos.coords.accuracy)
                ? { accuracy: pos.coords.accuracy }
                : {}),
              ...(typeof pos.coords.altitude === "number" && Number.isFinite(pos.coords.altitude)
                ? { altitude: pos.coords.altitude }
                : {}),
              ...(typeof pos.coords.speed === "number" && Number.isFinite(pos.coords.speed)
                ? { speed: pos.coords.speed }
                : {}),
            };
            const rawDistanceDeltaM = lastRawPointRef.current ? haversineMeters(lastRawPointRef.current, nextPoint) : 0;
            lastRawPointRef.current = nextPoint;
            setGpsDebugSafe((current) => ({
              ...current,
              rawPointCount: current.rawPointCount + 1,
              latestAccuracy: typeof nextPoint.accuracy === "number" ? nextPoint.accuracy : null,
              latestSpeed: typeof nextPoint.speed === "number" ? nextPoint.speed : null,
              totalRawDistanceM: current.totalRawDistanceM + Math.max(0, rawDistanceDeltaM),
            }));
            const filtered = filterGpsPoint({
              point: nextPoint,
              lastAcceptedPoint: lastPointRef.current,
              secondLastAcceptedPoint: routePointsRef.current.length > 1 ? routePointsRef.current[routePointsRef.current.length - 2] : null,
              isTracking: phaseRef.current === "tracking",
              stationaryPointStreak: stationaryPointStreakRef.current,
            });
            stationaryPointStreakRef.current = filtered.nextStationaryPointStreak;
            if (!filtered.accepted) {
              setGpsDebugSafe((current) => ({
                ...current,
                rejectedPointCount: current.rejectedPointCount + 1,
                latestHorizontalDistanceM: filtered.rawHorizontalDistanceM,
                latestVerticalChangeM: filtered.verticalDeltaM,
                movingTimeSeconds: movingSecRef.current,
                pausedTimeSeconds: getPausedNow(),
                currentPace: pace,
                currentRawPace: current.currentRawPace,
                currentRollingPace: current.currentRollingPace,
                lastRejectedReason: filtered.reason,
                motionState: filtered.motionState,
              }));
              if (__DEV__) {
                console.debug("[gps] rejected", {
                  reason: filtered.reason,
                  accuracy: nextPoint.accuracy ?? null,
                  horizontalDistanceM: Number(filtered.rawHorizontalDistanceM.toFixed(1)),
                  verticalDeltaM: Number(filtered.verticalDeltaM.toFixed(1)),
                  derivedSpeedMps: Number(filtered.derivedSpeedMps.toFixed(2)),
                  motionState: filtered.motionState,
                  confidence: filtered.confidence,
                });
              }
              return;
            }

            const shouldAnchorWithoutDistance = awaitingResumeAnchorRef.current && lastPointRef.current !== null;
            lastPointRef.current = filtered.point;
            stationaryPointStreakRef.current = 0;

            if (
              routePointsRef.current.length === 0 ||
              routePointsRef.current[routePointsRef.current.length - 1]?.t !== filtered.point.t
            ) {
              routePointsRef.current = [...routePointsRef.current, filtered.point];
            }

            if (shouldAnchorWithoutDistance) {
              awaitingResumeAnchorRef.current = false;
              hadGpsPointsRef.current = routePointsRef.current.length > 1;
              const anchorPaceMetrics = getPaceMetrics({
                distanceM: distanceRef.current,
                elapsedSeconds: getActiveElapsedNow() + getPausedNow(),
                movingSeconds: movingSecRef.current,
                routePoints: routePointsRef.current,
                preferRolling: true,
                loadingFallback: permission === "denied" ? "-- / mi" : "Getting GPS...",
                emptyFallback: "-- / mi",
              });
              setGpsDebugSafe((current) => ({
                ...current,
                acceptedPointCount: current.acceptedPointCount + 1,
                latestHorizontalDistanceM: filtered.rawHorizontalDistanceM,
                latestVerticalChangeM: filtered.verticalDeltaM,
                totalFilteredDistanceM: distanceRef.current,
                movingTimeSeconds: movingSecRef.current,
                pausedTimeSeconds: getPausedNow(),
                currentPace: anchorPaceMetrics.display,
                currentRawPace: anchorPaceMetrics.rawDisplay,
                currentRollingPace: anchorPaceMetrics.rollingDisplay,
                motionState: filtered.motionState,
              }));
              if (__DEV__) {
                console.debug("[gps] accepted-anchor", {
                  accuracy: nextPoint.accuracy ?? null,
                  horizontalDistanceM: Number(filtered.rawHorizontalDistanceM.toFixed(1)),
                  verticalDeltaM: Number(filtered.verticalDeltaM.toFixed(1)),
                  rollingPace: anchorPaceMetrics.rollingDisplay,
                  rawPace: anchorPaceMetrics.rawDisplay,
                  motionState: filtered.motionState,
                  confidence: filtered.confidence,
                });
              }
              return;
            }

            awaitingResumeAnchorRef.current = false;
            hadGpsPointsRef.current = routePointsRef.current.length > 1;

            if (filtered.distanceDeltaM > 0) {
              const nextDistance = distanceRef.current + filtered.distanceDeltaM;
              distanceRef.current = nextDistance;
              setDistanceSafe(nextDistance);

              const nextMovingSec = movingSecRef.current + Math.max(1, Math.round(filtered.timeDeltaMs / 1000));
              movingSecRef.current = nextMovingSec;
              setMovingSafe(nextMovingSec);
            }

            const nextPaceMetrics = getPaceMetrics({
              distanceM: distanceRef.current,
              elapsedSeconds: getActiveElapsedNow() + getPausedNow(),
              movingSeconds: movingSecRef.current,
              routePoints: routePointsRef.current,
              preferRolling: true,
              loadingFallback: permission === "denied" ? "-- / mi" : "Getting GPS...",
              emptyFallback: "-- / mi",
            });

            setGpsDebugSafe((current) => ({
              ...current,
              acceptedPointCount: current.acceptedPointCount + 1,
              latestHorizontalDistanceM: filtered.rawHorizontalDistanceM,
              latestVerticalChangeM: filtered.verticalDeltaM,
              totalFilteredDistanceM: distanceRef.current,
              movingTimeSeconds: movingSecRef.current,
              pausedTimeSeconds: getPausedNow(),
              currentPace: nextPaceMetrics.display,
              currentRawPace: nextPaceMetrics.rawDisplay,
              currentRollingPace: nextPaceMetrics.rollingDisplay,
              lastRejectedReason: current.lastRejectedReason,
              motionState: filtered.motionState,
            }));
            if (__DEV__) {
              console.debug("[gps] accepted", {
                accuracy: nextPoint.accuracy ?? null,
                horizontalDistanceM: Number(filtered.rawHorizontalDistanceM.toFixed(1)),
                verticalDeltaM: Number(filtered.verticalDeltaM.toFixed(1)),
                filteredDistanceM: Number(distanceRef.current.toFixed(1)),
                rollingPace: nextPaceMetrics.rollingDisplay,
                rawPace: nextPaceMetrics.rawDisplay,
                derivedSpeedMps: Number(filtered.derivedSpeedMps.toFixed(2)),
                motionState: filtered.motionState,
                confidence: filtered.confidence,
              });
            }
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
    [getActiveElapsedNow, getPausedNow, logWalk, pace, permission, setDistanceSafe, setGpsDebugSafe, setMovingSafe, stopGps]
  );

  const getElapsedNow = useCallback(() => {
    return getActiveElapsedNow() + getPausedNow();
  }, [getActiveElapsedNow, getPausedNow]);

  const syncElapsedFromClock = useCallback(() => {
    const nextElapsed = getElapsedNow();
    const nextPaused = getPausedNow();
    setElapsedSafe(nextElapsed);
    setPausedSafe(nextPaused);
    return nextElapsed;
  }, [getElapsedNow, getPausedNow, setElapsedSafe, setPausedSafe]);

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
        movingTimeSec: number;
        pausedTimeSec: number;
        distanceM: number;
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
          movingTimeSec: overrides?.movingTimeSec ?? movingSecRef.current,
          pausedTimeSec: overrides?.pausedTimeSec ?? getPausedNow(),
          distanceM: overrides?.distanceM ?? distanceRef.current,
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
    [getElapsedNow, getPausedNow]
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
        movingTimeSec: number;
        pausedTimeSec: number;
        distanceM: number;
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
    pausedTotalSecRef.current = 0;
    pausedStartedAtRef.current = null;
    distanceRef.current = 0;
    movingSecRef.current = 0;
    routePointsRef.current = [];
    hadGpsPointsRef.current = false;
    stationaryPointStreakRef.current = 0;
    awaitingResumeAnchorRef.current = false;
    lastPointRef.current = null;
    lastRawPointRef.current = null;
    setElapsedSafe(0);
    setDistanceSafe(0);
    setMovingSafe(0);
    setPausedSafe(0);
    setGpsDebugSafe(EMPTY_GPS_DEBUG_STATE);
    transitionTo("idle", reason);
    await clearActiveWalkSnapshotSafe(reason);
  }, [clearActiveWalkSnapshotSafe, clearScheduledPersist, setDistanceSafe, setElapsedSafe, setGpsDebugSafe, setMovingSafe, setPausedSafe, stopGps, stopTimer, transitionTo]);

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
      const ok = await ensureLocationPermission();
      await clearCompletedWalkDraftSafe("start");
      await resetWalkState("start");

      startedAtRef.current = Date.now();
      elapsedBeforeRunRef.current = 0;
      runStartedAtRef.current = Date.now();
      pausedTotalSecRef.current = 0;
      pausedStartedAtRef.current = null;
      setElapsedSafe(0);
      setDistanceSafe(0);
      setMovingSafe(0);
      setPausedSafe(0);
      distanceRef.current = 0;
      movingSecRef.current = 0;
      lastPointRef.current = null;
      lastRawPointRef.current = null;
      routePointsRef.current = [];
      hadGpsPointsRef.current = false;
      stationaryPointStreakRef.current = 0;
      awaitingResumeAnchorRef.current = false;
      setGpsDebugSafe(EMPTY_GPS_DEBUG_STATE);

      transitionTo("tracking", "start");
      await persistActiveWalk({
        elapsedSec: 0,
        movingTimeSec: 0,
        pausedTimeSec: 0,
        distanceM: 0,
        routePoints: [],
        running: true,
      });
      startTimer("start");

      if (ok) {
        await startGps("start");
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
      const nextPaused = getPausedNow();
      elapsedBeforeRunRef.current = getActiveElapsedNow();
      runStartedAtRef.current = null;
      setElapsedSafe(nextElapsed);
      pausedStartedAtRef.current = Date.now();
      pausedTotalSecRef.current = nextPaused;
      setPausedSafe(nextPaused);
      stopTimer("pause");
      stopGps("pause", { preserveLastPoint: true });
      awaitingResumeAnchorRef.current = true;
      transitionTo("paused", "pause");
      await persistActiveWalk({
        elapsedSec: nextElapsed,
        movingTimeSec: movingSecRef.current,
        pausedTimeSec: nextPaused,
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
      const accumulatedPaused = getPausedNow();
      pausedTotalSecRef.current = accumulatedPaused;
      pausedStartedAtRef.current = null;
      setPausedSafe(accumulatedPaused);
      runStartedAtRef.current = Date.now();
      transitionTo("tracking", "resume");
      await persistActiveWalk({
        elapsedSec: getElapsedNow(),
        movingTimeSec: movingSecRef.current,
        pausedTimeSec: accumulatedPaused,
        running: true,
      });
      startTimer("resume");

      if (ok) {
        awaitingResumeAnchorRef.current = true;
        await startGps("resume", { preserveLastPoint: true });
      }
    } catch (error) {
      console.error("[walk] resume failed", error);
      pausedStartedAtRef.current = Date.now();
      stopTimer("resume failed");
      stopGps("resume failed", { preserveLastPoint: true });
      awaitingResumeAnchorRef.current = true;
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
      const finalPaused = getPausedNow();
      const finalMoving = Math.max(0, movingSecRef.current);
      const finalDistance = Math.max(0, Math.round(distanceRef.current));

      elapsedBeforeRunRef.current = getActiveElapsedNow();
      runStartedAtRef.current = null;
      pausedStartedAtRef.current = null;
      pausedTotalSecRef.current = finalPaused;
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
          movingTimeSec: String(finalMoving),
          pausedTimeSec: String(finalPaused),
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
          pausedTotalSecRef.current = 0;
          pausedStartedAtRef.current = null;
          distanceRef.current = 0;
          movingSecRef.current = 0;
          routePointsRef.current = [];
          hadGpsPointsRef.current = false;
          stationaryPointStreakRef.current = 0;
          awaitingResumeAnchorRef.current = false;
          lastRawPointRef.current = null;
          transitionTo("idle", "restore empty");
          setElapsedSafe(0);
          setDistanceSafe(0);
          setMovingSafe(0);
          setPausedSafe(0);
          setGpsDebugSafe(EMPTY_GPS_DEBUG_STATE);
          return;
        }

        startedAtRef.current = snapshot.startedAt;
        const restoredPausedSec = Math.max(0, snapshot.pausedTimeSec ?? 0);
        const restoredMovingSec =
          Math.max(0, snapshot.movingTimeSec ?? 0) || calculateMovingTimeSeconds(snapshot.routePoints ?? []) || 0;
        const recoveredElapsed =
          snapshot.running
            ? snapshot.elapsedSec + Math.max(0, Math.round((Date.now() - snapshot.updatedAt) / 1000))
            : snapshot.elapsedSec;

        elapsedBeforeRunRef.current = Math.max(
          0,
          (snapshot.running ? snapshot.elapsedSec : recoveredElapsed) - restoredPausedSec
        );
        runStartedAtRef.current = snapshot.running ? snapshot.updatedAt : null;
        pausedTotalSecRef.current = restoredPausedSec;
        pausedStartedAtRef.current = snapshot.running ? null : snapshot.updatedAt;
        distanceRef.current = snapshot.distanceM;
        routePointsRef.current = snapshot.routePoints ?? [];
        movingSecRef.current = restoredMovingSec;
        hadGpsPointsRef.current = routePointsRef.current.length > 1;
        stationaryPointStreakRef.current = 0;
        awaitingResumeAnchorRef.current = !snapshot.running && routePointsRef.current.length > 0;
        setElapsedSafe(recoveredElapsed);
        setDistanceSafe(snapshot.distanceM);
        setMovingSafe(movingSecRef.current);
        setPausedSafe(snapshot.running ? restoredPausedSec : getPausedNow());

        if (routePointsRef.current.length > 0) {
          const last = routePointsRef.current[routePointsRef.current.length - 1];
          if (last) {
            lastPointRef.current = last;
            lastRawPointRef.current = last;
          }
        }

        setGpsDebugSafe({
          rawPointCount: routePointsRef.current.length,
          acceptedPointCount: routePointsRef.current.length,
          rejectedPointCount: 0,
          latestAccuracy: routePointsRef.current.at(-1)?.accuracy ?? null,
          latestSpeed: routePointsRef.current.at(-1)?.speed ?? null,
          latestHorizontalDistanceM: 0,
          latestVerticalChangeM: 0,
          totalFilteredDistanceM: snapshot.distanceM,
          totalRawDistanceM: snapshot.distanceM,
          movingTimeSeconds: movingSecRef.current,
          pausedTimeSeconds: snapshot.running ? restoredPausedSec : getPausedNow(),
          currentPace: getPaceMetrics({
            distanceM: snapshot.distanceM,
            elapsedSeconds: recoveredElapsed,
            movingSeconds: movingSecRef.current,
            routePoints: routePointsRef.current,
            preferRolling: true,
            loadingFallback: permission === "denied" ? "-- / mi" : "Getting GPS...",
            emptyFallback: "-- / mi",
          }).display,
          currentRawPace: getPaceMetrics({
            distanceM: snapshot.distanceM,
            elapsedSeconds: recoveredElapsed,
            movingSeconds: movingSecRef.current,
            routePoints: routePointsRef.current,
            preferRolling: false,
            loadingFallback: permission === "denied" ? "-- / mi" : "Getting GPS...",
            emptyFallback: "-- / mi",
          }).display,
          currentRollingPace: getPaceMetrics({
            distanceM: snapshot.distanceM,
            elapsedSeconds: recoveredElapsed,
            movingSeconds: movingSecRef.current,
            routePoints: routePointsRef.current,
            preferRolling: true,
            loadingFallback: permission === "denied" ? "-- / mi" : "Getting GPS...",
            emptyFallback: "-- / mi",
          }).rollingDisplay,
          lastRejectedReason: "none",
          motionState: "unknown",
        });

        if (snapshot.running) {
          transitionTo("tracking", "restore tracking");
          startTimer("restore");
          const ok = await refreshPermission();
          if (!cancelled && ok) {
            await startGps("restore", { preserveLastPoint: true });
          }
        } else {
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
  }, [getPausedNow, logWalk, permission, refreshPermission, resetWalkState, setDistanceSafe, setElapsedSafe, setGpsDebugSafe, setMovingSafe, setPausedSafe, setRestoredSafe, startGps, startTimer, transitionTo]);

  useEffect(() => {
    if (restoringRef.current || !startedAtRef.current) return;
    if (phase !== "tracking" && phase !== "paused") return;
    schedulePersist();
  }, [distanceM, elapsedSec, phase, schedulePersist]);

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
  const statusText =
    phase === "tracking"
      ? "Walk in progress. Pause when you want a breather."
      : phase === "paused"
        ? `Your walk is paused. ${fmtTime(pausedSec)} paused so far.`
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
              {phase === "tracking" ? "Walk live" : phase === "paused" ? "Paused" : phase === "saving" ? "Saving" : "Ready"}
            </Text>
          </View>
          <Text style={styles.sessionHint}>{permission === "denied" ? "Timer mode" : "GPS mode"}</Text>
        </View>

        <Text style={styles.title}>Walk</Text>
        <Text style={styles.sub}>Elapsed</Text>
        <Text style={styles.big}>{fmtTime(elapsedSec)}</Text>
        <Text style={styles.sessionSupport}>
          {permission === "denied"
            ? "Timer mode is active. Turn location back on anytime for route and distance."
            : "Keep your phone with you and Step Outside will track route, distance, and pace."}
        </Text>

        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.metricK}>Distance</Text>
            <Text style={styles.metricV}>{(distanceM / 1609.344).toFixed(2)} mi</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricK}>Pace</Text>
            <Text style={styles.metricV}>{pace}</Text>
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

      {__DEV__ ? (
        <View style={styles.debugCard}>
          <Text style={styles.debugTitle}>GPS Debug</Text>
          <View style={styles.debugGrid}>
            <Text style={styles.debugRow}>Raw GPS points: {gpsDebug.rawPointCount}</Text>
            <Text style={styles.debugRow}>Accepted GPS points: {gpsDebug.acceptedPointCount}</Text>
            <Text style={styles.debugRow}>Rejected GPS points: {gpsDebug.rejectedPointCount}</Text>
            <Text style={styles.debugRow}>Latest accuracy: {fmtDebugNumber(gpsDebug.latestAccuracy)} m</Text>
            <Text style={styles.debugRow}>Latest speed: {fmtDebugNumber(gpsDebug.latestSpeed)} m/s</Text>
            <Text style={styles.debugRow}>Latest horizontal: {fmtMeters(gpsDebug.latestHorizontalDistanceM)}</Text>
            <Text style={styles.debugRow}>Latest vertical: {fmtDebugNumber(gpsDebug.latestVerticalChangeM)} m</Text>
            <Text style={styles.debugRow}>Filtered distance: {fmtMeters(gpsDebug.totalFilteredDistanceM)}</Text>
            <Text style={styles.debugRow}>Raw distance: {fmtMeters(gpsDebug.totalRawDistanceM)}</Text>
            <Text style={styles.debugRow}>Moving time: {fmtTime(gpsDebug.movingTimeSeconds)}</Text>
            <Text style={styles.debugRow}>Paused time: {fmtTime(gpsDebug.pausedTimeSeconds)}</Text>
            <Text style={styles.debugRow}>Current pace: {gpsDebug.currentPace}</Text>
            <Text style={styles.debugRow}>Rolling pace: {gpsDebug.currentRollingPace}</Text>
            <Text style={styles.debugRow}>Raw pace: {gpsDebug.currentRawPace}</Text>
            <Text style={styles.debugRow}>Motion state: {gpsDebug.motionState}</Text>
            <Text style={styles.debugRow}>Last reject: {gpsDebug.lastRejectedReason}</Text>
          </View>
        </View>
      ) : null}

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
    backgroundColor: "#F8F4EE",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
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
  sessionSupport: {
    marginTop: 10,
    color: "rgba(11,15,14,0.62)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    maxWidth: 280,
  },

  metrics: { flexDirection: "row", gap: 14, marginTop: 18 },
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
  debugCard: {
    width: "100%",
    maxWidth: 380,
    marginTop: 16,
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(11,15,14,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  debugTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  debugGrid: {
    marginTop: 10,
    gap: 6,
  },
  debugRow: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
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
    minHeight: 56,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: { color: "white", fontWeight: "900", letterSpacing: 1 },

  btnPause: {
    backgroundColor: "#F2B541",
    minHeight: 56,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPauseText: { color: "#0B0F0E", fontWeight: "900", letterSpacing: 1 },
  btnDisabled: {
    opacity: 0.45,
  },

  btnEnd: {
    marginTop: 14,
    backgroundColor: "#C83333",
    minHeight: 56,
    paddingVertical: 14,
    paddingHorizontal: 26,
    borderRadius: 16,
    minWidth: 240,
    alignItems: "center",
    justifyContent: "center",
  },
  btnEndText: { color: "white", fontWeight: "900", letterSpacing: 1 },

  bottomRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
  },
  back: { minHeight: 44, paddingVertical: 8, paddingHorizontal: 12, justifyContent: "center" },
  backText: { color: "rgba(11,15,14,0.65)", fontWeight: "800" },
  home: {
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(37,94,54,0.10)",
    borderWidth: 1,
    borderColor: "rgba(37,94,54,0.18)",
    justifyContent: "center",
  },
  homeText: { color: "#255E36", fontWeight: "900" },
});
