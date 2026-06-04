import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { type ActiveWalkSnapshot, getActiveWalkSnapshot, updateActiveWalkSnapshot } from "./activeWalk";
import {
  computeGpsStrength,
  evaluateGpsPoint,
  type GpsAcceptanceStats,
  type GpsIgnoreReason,
  updateGpsStats,
} from "./gpsTracking";
import type { GpsDiagnostics, RoutePoint } from "./store";

export const WALK_LOCATION_TASK = "step-outside-active-walk-location";
export const MEANINGFUL_TRACKING_GAP_SEC = 90;
let backgroundTaskOperationQueue: Promise<void> = Promise.resolve();

export type WalkLocationSource = "foreground" | "background";

type LocationTaskData = {
  locations?: Location.LocationObject[];
};

function logBackground(message: string, details?: Record<string, unknown>) {
  if (!__DEV__) return;
  if (details) {
    console.log(`[walk-bg] ${message}`, details);
    return;
  }
  console.log(`[walk-bg] ${message}`);
}

function toRoutePoint(location: Location.LocationObject): RoutePoint {
  const { coords } = location;
  return {
    lat: coords.latitude,
    lng: coords.longitude,
    t: location.timestamp || Date.now(),
    ...(typeof coords.accuracy === "number" && Number.isFinite(coords.accuracy)
      ? { accuracy: coords.accuracy }
      : {}),
    ...(typeof coords.altitude === "number" && Number.isFinite(coords.altitude)
      ? { altitude: coords.altitude }
      : {}),
    ...(typeof coords.speed === "number" && Number.isFinite(coords.speed) ? { speed: coords.speed } : {}),
  };
}

function diagnosticsToStats(snapshot: ActiveWalkSnapshot): GpsAcceptanceStats {
  const diagnostics = snapshot.gpsDiagnostics;
  return {
    rawPoints: diagnostics?.rawPoints ?? 0,
    acceptedDistancePoints: diagnostics?.acceptedPoints ?? 0,
    ignoredPoints: diagnostics?.rejectedPoints ?? 0,
    lastIgnoredReason:
      typeof diagnostics?.lastRejectedReason === "string"
        ? (diagnostics.lastRejectedReason as GpsIgnoreReason)
        : null,
    averageAccuracy: diagnostics?.averageAccuracy ?? null,
    worstAccuracy: diagnostics?.worstAccuracy ?? null,
    lastAcceptedTimestamp: diagnostics?.lastAcceptedAt ?? null,
    acceptedDistanceM: diagnostics?.acceptedDistanceM ?? snapshot.distanceM,
    gpsStrength: computeGpsStrength(diagnostics?.averageAccuracy ?? null, diagnostics?.acceptedPoints ?? 0),
  };
}

function buildDiagnostics(
  previous: GpsDiagnostics | undefined,
  stats: GpsAcceptanceStats,
  sourceCounts: { foregroundPoints: number; backgroundPoints: number },
  largestTrackingGapSec: number,
  lastLocationAt: number | null,
  rejectionCounts: Record<string, number>,
  lastTrackingGapReason: string | null
): GpsDiagnostics {
  return {
    ...previous,
    rawPoints: stats.rawPoints,
    acceptedPoints: stats.acceptedDistancePoints,
    rejectedPoints: stats.ignoredPoints,
    foregroundPoints: sourceCounts.foregroundPoints,
    backgroundPoints: sourceCounts.backgroundPoints,
    largestTrackingGapSec,
    lastTrackingGapReason,
    lastLocationAt,
    rejectionCounts,
    lastRejectedReason: stats.lastIgnoredReason,
    lastAcceptedAt: stats.lastAcceptedTimestamp,
    acceptedDistanceM: stats.acceptedDistanceM,
    averageAccuracy: stats.averageAccuracy,
    worstAccuracy: stats.worstAccuracy,
  };
}

function activeElapsedSec(snapshot: ActiveWalkSnapshot, now: number): number {
  if (!snapshot.running) return snapshot.elapsedSec;
  return Math.max(
    snapshot.elapsedSec,
    Math.floor((now - snapshot.startedAt) / 1000) - Math.max(0, snapshot.pausedDurationSec ?? 0)
  );
}

export async function ingestWalkLocations(
  source: WalkLocationSource,
  locations: Location.LocationObject[]
): Promise<ActiveWalkSnapshot | null> {
  if (locations.length === 0) return null;

  const orderedLocations = [...locations].sort((a, b) => a.timestamp - b.timestamp);
  return updateActiveWalkSnapshot((snapshot) => {
    if (!snapshot?.running) return snapshot;

    let routePoints = [...(snapshot.routePoints ?? [])];
    let lastAcceptedPoint: RoutePoint | null =
      snapshot.lastAcceptedPoint === null
        ? null
        : snapshot.lastAcceptedPoint ?? routePoints[routePoints.length - 1] ?? null;
    let distanceM = snapshot.distanceM;
    let movingDurationSec = snapshot.movingDurationSec ?? 0;
    let stats = diagnosticsToStats(snapshot);
    let foregroundPoints = snapshot.gpsDiagnostics?.foregroundPoints ?? 0;
    let backgroundPoints = snapshot.gpsDiagnostics?.backgroundPoints ?? 0;
    let lastLocationAt = snapshot.lastLocationUpdateAt ?? snapshot.gpsDiagnostics?.lastLocationAt ?? null;
    let largestTrackingGapSec = snapshot.gpsDiagnostics?.largestTrackingGapSec ?? snapshot.routeCaptureGapSec ?? 0;
    let routeCaptureInterrupted = snapshot.routeCaptureInterrupted ?? false;
    let rejectionCounts = { ...(snapshot.gpsDiagnostics?.rejectionCounts ?? {}) };
    let lastTrackingGapReason = snapshot.gpsDiagnostics?.lastTrackingGapReason ?? null;
    let segmentStartPending = routePoints.length > 0 && lastAcceptedPoint === null;

    for (const location of orderedLocations) {
      const point = toRoutePoint(location);
      if (lastLocationAt !== null && point.t <= lastLocationAt) {
        continue;
      }

      const updateGapSec =
        lastLocationAt === null ? 0 : Math.max(0, Math.round((point.t - lastLocationAt) / 1000));
      if (updateGapSec > largestTrackingGapSec) {
        largestTrackingGapSec = updateGapSec;
      }
      if (updateGapSec >= MEANINGFUL_TRACKING_GAP_SEC) {
        routeCaptureInterrupted = true;
        segmentStartPending = routePoints.length > 0;
        lastAcceptedPoint = null;
        lastTrackingGapReason = `No location updates for ${updateGapSec} seconds`;
        logBackground("meaningful location gap", { source, updateGapSec });
      }
      lastLocationAt = point.t;

      if (source === "background") {
        backgroundPoints += 1;
      } else {
        foregroundPoints += 1;
      }

      const accuracy =
        typeof point.accuracy === "number" && Number.isFinite(point.accuracy) ? point.accuracy : null;
      const result = evaluateGpsPoint(point, lastAcceptedPoint);
      if (!result.accepted) {
        stats = updateGpsStats(stats, accuracy, false, result.reason);
        rejectionCounts = {
          ...rejectionCounts,
          [result.reason]: (rejectionCounts[result.reason] ?? 0) + 1,
        };
        continue;
      }

      stats = updateGpsStats(stats, accuracy, true, null, {
        timestamp: point.t,
        distanceMeters: result.deltaMeters,
      });

      if (result.kind === "anchor") {
        if (routePoints.length === 0 || segmentStartPending) {
          routePoints.push(segmentStartPending ? { ...point, segmentStart: true } : point);
        }
        segmentStartPending = false;
        lastAcceptedPoint = point;
        continue;
      }

      routePoints.push(point);
      lastAcceptedPoint = point;
      distanceM += result.deltaMeters;
      movingDurationSec += Math.max(0, Math.round(result.deltaTimeSec));
    }

    const now = Date.now();
    const gpsDiagnostics = buildDiagnostics(
      snapshot.gpsDiagnostics,
      stats,
      { foregroundPoints, backgroundPoints },
      largestTrackingGapSec,
      lastLocationAt,
      rejectionCounts,
      lastTrackingGapReason
    );
    const hasRoute = routePoints.length > 1;

    return {
      ...snapshot,
      elapsedSec: activeElapsedSec(snapshot, now),
      distanceM,
      movingDurationSec,
      routePoints,
      lastAcceptedPoint,
      lastLocationUpdateAt: lastLocationAt,
      gpsUiState: routePoints.length > 0 ? "live" : "finding",
      routeCaptureStatus: hasRoute ? (routeCaptureInterrupted ? "partial" : "complete") : "none",
      routeCaptureInterrupted,
      routeCaptureGapSec: largestTrackingGapSec,
      gpsDiagnostics,
      updatedAt: now,
    };
  });
}

export async function recordWalkTrackingDiagnostics(
  changes: Partial<GpsDiagnostics>
): Promise<ActiveWalkSnapshot | null> {
  return updateActiveWalkSnapshot((snapshot) => {
    if (!snapshot) return snapshot;
    const gpsDiagnostics: GpsDiagnostics = {
      rawPoints: snapshot.gpsDiagnostics?.rawPoints ?? 0,
      acceptedPoints: snapshot.gpsDiagnostics?.acceptedPoints ?? 0,
      rejectedPoints: snapshot.gpsDiagnostics?.rejectedPoints ?? 0,
      ...snapshot.gpsDiagnostics,
      ...changes,
    };
    return { ...snapshot, gpsDiagnostics, updatedAt: Date.now() };
  });
}

export async function recordWalkAppState(appState: string): Promise<ActiveWalkSnapshot | null> {
  return updateActiveWalkSnapshot((snapshot) => {
    if (!snapshot) return snapshot;
    const gpsDiagnostics: GpsDiagnostics = {
      rawPoints: snapshot.gpsDiagnostics?.rawPoints ?? 0,
      acceptedPoints: snapshot.gpsDiagnostics?.acceptedPoints ?? 0,
      rejectedPoints: snapshot.gpsDiagnostics?.rejectedPoints ?? 0,
      ...snapshot.gpsDiagnostics,
      appStateChanges: (snapshot.gpsDiagnostics?.appStateChanges ?? 0) + 1,
      lastAppState: appState,
    };
    return { ...snapshot, gpsDiagnostics, updatedAt: Date.now() };
  });
}

export async function prepareWalkTrackingForResume(): Promise<ActiveWalkSnapshot | null> {
  return updateActiveWalkSnapshot((snapshot) => {
    if (!snapshot) return snapshot;
    const gpsDiagnostics: GpsDiagnostics = {
      rawPoints: snapshot.gpsDiagnostics?.rawPoints ?? 0,
      acceptedPoints: snapshot.gpsDiagnostics?.acceptedPoints ?? 0,
      rejectedPoints: snapshot.gpsDiagnostics?.rejectedPoints ?? 0,
      ...snapshot.gpsDiagnostics,
      lastLocationAt: null,
    };
    return {
      ...snapshot,
      lastAcceptedPoint: null,
      lastLocationUpdateAt: null,
      gpsDiagnostics,
      updatedAt: Date.now(),
    };
  });
}

async function startBackgroundWalkTrackingInternal(): Promise<boolean> {
  try {
    const available = await TaskManager.isAvailableAsync();
    if (!available) {
      await recordWalkTrackingDiagnostics({
        backgroundTaskStarted: false,
        backgroundTaskLastError: "Background task manager unavailable",
      });
      return false;
    }

    if (await Location.hasStartedLocationUpdatesAsync(WALK_LOCATION_TASK)) {
      await recordWalkTrackingDiagnostics({
        backgroundTaskStarted: true,
        backgroundTaskLastError: null,
      });
      return true;
    }

    await Location.startLocationUpdatesAsync(WALK_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      activityType: Location.ActivityType.Fitness,
      distanceInterval: 2,
      timeInterval: 2000,
      deferredUpdatesDistance: 0,
      deferredUpdatesInterval: 1000,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      ...(Platform.OS === "android"
        ? {
            foregroundService: {
              notificationTitle: "Step Outside walk active",
              notificationBody: "Tracking your walk while your screen is off.",
              notificationColor: "#255E36",
              killServiceOnDestroy: false,
            },
          }
        : {}),
    });
    await recordWalkTrackingDiagnostics({
      backgroundTaskStarted: true,
      backgroundTaskLastError: null,
    });
    logBackground("location task started");
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordWalkTrackingDiagnostics({
      backgroundTaskStarted: false,
      backgroundTaskLastError: message,
    });
    console.error("[walk-bg] failed to start location task", error);
    return false;
  }
}

export async function startBackgroundWalkTracking(): Promise<boolean> {
  let started = false;
  const operation = backgroundTaskOperationQueue.then(async () => {
    started = await startBackgroundWalkTrackingInternal();
  });
  backgroundTaskOperationQueue = operation.catch(() => undefined);
  await operation;
  return started;
}

async function stopBackgroundWalkTrackingInternal(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(WALK_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(WALK_LOCATION_TASK);
    }
    logBackground("location task stopped");
  } catch (error) {
    console.error("[walk-bg] failed to stop location task", error);
  }
}

export async function stopBackgroundWalkTracking(): Promise<void> {
  const operation = backgroundTaskOperationQueue.then(stopBackgroundWalkTrackingInternal);
  backgroundTaskOperationQueue = operation.catch(() => undefined);
  await operation;
}

export async function reconcileBackgroundWalkTracking(): Promise<void> {
  const snapshot = await getActiveWalkSnapshot();
  if (!snapshot?.running) {
    await stopBackgroundWalkTracking();
    return;
  }

  const backgroundPermission = await Location.getBackgroundPermissionsAsync();
  if (backgroundPermission.status === "granted") {
    await startBackgroundWalkTracking();
  }
}

if (!TaskManager.isTaskDefined(WALK_LOCATION_TASK)) {
  TaskManager.defineTask<LocationTaskData>(WALK_LOCATION_TASK, async ({ data, error, executionInfo }) => {
    if (error) {
      await recordWalkTrackingDiagnostics({
        backgroundTaskStarted: false,
        backgroundTaskLastError: `${error.code}: ${error.message}`,
      });
      console.error("[walk-bg] task error", error);
      return;
    }

    const locations = data?.locations ?? [];
    logBackground("locations received", {
      count: locations.length,
      appState: executionInfo.appState ?? "unknown",
    });
    await ingestWalkLocations("background", locations);
  });
}
