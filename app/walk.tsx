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
  const [phase, setPhase] = useState<"idle" | "tracking" | "paused" | "saving" | "completed">("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [restored, setRestored] = useState(false);
  const [busyAction, setBusyAction] = useState<"start" | "pause" | "resume" | "stop" | null>(null);

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
  const distanceRef = useRef(0);
  const routePointsRef = useRef<RoutePoint[]>([]);
  const hadGpsPointsRef = useRef(false);

  const lastPointRef = useRef<LatLng | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const locationGenerationRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const pace = useMemo(() => {
    return formatPace(distanceM, elapsedSec);
  }, [distanceM, elapsedSec]);

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
                const nextDistance = distanceRef.current + d;
                distanceRef.current = nextDistance;
                routePointsRef.current = [...routePointsRef.current, point];
                hadGpsPointsRef.current = routePointsRef.current.length > 1;
                setDistanceSafe(nextDistance);
              }
            } else {
              routePointsRef.current = [...routePointsRef.current, point];
            }

            lastPointRef.current = p;
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
    [logWalk, setDistanceSafe, stopGps]
  );

  const getElapsedNow = useCallback(() => {
    if (!runStartedAtRef.current) return elapsedBeforeRunRef.current;
    return elapsedBeforeRunRef.current + Math.max(0, Math.floor((Date.now() - runStartedAtRef.current) / 1000));
  }, []);

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
    async (overrides?: Partial<{ elapsedSec: number; distanceM: number; running: boolean; routePoints: RoutePoint[] }>) => {
      const startedAt = startedAtRef.current;
      if (!startedAt) return false;

      try {
        await setActiveWalkSnapshot({
          startedAt,
          elapsedSec: overrides?.elapsedSec ?? getElapsedNow(),
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
    distanceRef.current = 0;
    routePointsRef.current = [];
    hadGpsPointsRef.current = false;
    lastPointRef.current = null;
    setElapsedSafe(0);
    setDistanceSafe(0);
    transitionTo("idle", reason);
    await clearActiveWalkSnapshotSafe(reason);
  }, [clearActiveWalkSnapshotSafe, clearScheduledPersist, setDistanceSafe, setElapsedSafe, stopGps, stopTimer, transitionTo]);

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
      setElapsedSafe(0);
      setDistanceSafe(0);
      distanceRef.current = 0;
      lastPointRef.current = null;
      routePointsRef.current = [];
      hadGpsPointsRef.current = false;

      transitionTo("tracking", "start");
      await persistActiveWalk({ elapsedSec: 0, distanceM: 0, routePoints: [], running: true });
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
      elapsedBeforeRunRef.current = nextElapsed;
      runStartedAtRef.current = null;
      setElapsedSafe(nextElapsed);
      stopTimer("pause");
      stopGps("pause");
      transitionTo("paused", "pause");
      await persistActiveWalk({ elapsedSec: nextElapsed, running: false });
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
      transitionTo("tracking", "resume");
      await persistActiveWalk({ elapsedSec: elapsedBeforeRunRef.current, running: true });
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
      const finalDistance = Math.max(0, Math.round(distanceRef.current));

      elapsedBeforeRunRef.current = finalElapsed;
      runStartedAtRef.current = null;
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
          distanceRef.current = 0;
          routePointsRef.current = [];
          hadGpsPointsRef.current = false;
          transitionTo("idle", "restore empty");
          setElapsedSafe(0);
          setDistanceSafe(0);
          return;
        }

        startedAtRef.current = snapshot.startedAt;
        const recoveredElapsed =
          snapshot.running
            ? snapshot.elapsedSec + Math.max(0, Math.round((Date.now() - snapshot.updatedAt) / 1000))
            : snapshot.elapsedSec;

        elapsedBeforeRunRef.current = snapshot.running ? snapshot.elapsedSec : recoveredElapsed;
        runStartedAtRef.current = snapshot.running ? snapshot.updatedAt : null;
        distanceRef.current = snapshot.distanceM;
        routePointsRef.current = snapshot.routePoints ?? [];
        hadGpsPointsRef.current = routePointsRef.current.length > 1;
        setElapsedSafe(recoveredElapsed);
        setDistanceSafe(snapshot.distanceM);

        if (routePointsRef.current.length > 0) {
          const last = routePointsRef.current[routePointsRef.current.length - 1];
          if (last) {
            lastPointRef.current = { lat: last.lat, lng: last.lng };
          }
        }

        if (snapshot.running) {
          transitionTo("tracking", "restore tracking");
          startTimer("restore");
          const ok = await refreshPermission();
          if (!cancelled && ok) {
            await startGps("restore");
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
  }, [logWalk, refreshPermission, resetWalkState, setDistanceSafe, setElapsedSafe, setRestoredSafe, startGps, startTimer, transitionTo]);

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
        ? "Your walk is paused. Resume when you're ready."
        : phase === "saving"
          ? "Saving your walk now."
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
            <Text style={styles.sessionPillText}>
              {phase === "tracking" ? "Walk live" : phase === "paused" ? "Paused" : phase === "saving" ? "Saving" : "Ready"}
            </Text>
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
