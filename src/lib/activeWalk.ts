import AsyncStorage from "@react-native-async-storage/async-storage";

import { auth } from "./firebase";
import type { GpsDiagnostics, RouteCaptureStatus, RoutePoint } from "./store";

export type ActiveWalkSnapshot = {
  walkId: string;
  startedAt: number;
  elapsedSec: number;
  distanceM: number;
  pausedDurationSec?: number;
  movingDurationSec?: number;
  pauseStartedAt?: number | null;
  routePoints?: RoutePoint[];
  lastAcceptedPoint?: RoutePoint | null;
  lastLocationUpdateAt?: number | null;
  gpsUiState?: "idle" | "primed" | "finding" | "live";
  routeCaptureStatus?: RouteCaptureStatus;
  routeCaptureInterrupted?: boolean;
  routeCaptureGapSec?: number;
  gpsDiagnostics?: GpsDiagnostics;
  running: boolean;
  updatedAt: number;
};

export type CompletedWalkDraft = {
  routePoints: RoutePoint[];
  routeCaptureStatus?: RouteCaptureStatus;
  routeCaptureInterrupted?: boolean;
  routeCaptureGapSec?: number;
  gpsDiagnostics?: GpsDiagnostics;
};

const LEGACY_KEY_ACTIVE_WALK = "@stepoutside/activeWalk";
const LEGACY_KEY_COMPLETED_WALK_DRAFT = "@stepoutside/completedWalkDraft";
const ACTIVE_WALK_PREFIX = "@stepoutside/user";
let activeWalkMutationQueue: Promise<void> = Promise.resolve();

function currentUid(): string | null {
  return auth.currentUser?.uid ?? null;
}

function activeWalkKeyForUid(uid: string): string {
  return `${ACTIVE_WALK_PREFIX}:${uid}:activeWalk`;
}

function completedWalkDraftKeyForUid(uid: string): string {
  return `${ACTIVE_WALK_PREFIX}:${uid}:completedWalkDraft`;
}

async function removeLegacyActiveWalkStorage(): Promise<void> {
  await AsyncStorage.multiRemove([LEGACY_KEY_ACTIVE_WALK, LEGACY_KEY_COMPLETED_WALK_DRAFT]);
}

export async function clearActiveWalkStorageForUid(uid: string | null | undefined): Promise<void> {
  const keys = [LEGACY_KEY_ACTIVE_WALK, LEGACY_KEY_COMPLETED_WALK_DRAFT];
  if (uid) {
    keys.push(activeWalkKeyForUid(uid), completedWalkDraftKeyForUid(uid));
  }

  await AsyncStorage.multiRemove(keys);
}

async function clearActiveWalkSnapshotForUid(uid: string | null | undefined): Promise<void> {
  const keys = [LEGACY_KEY_ACTIVE_WALK];
  if (uid) {
    keys.push(activeWalkKeyForUid(uid));
  }

  await AsyncStorage.multiRemove(keys);
}

async function clearCompletedWalkDraftForUid(uid: string | null | undefined): Promise<void> {
  const keys = [LEGACY_KEY_COMPLETED_WALK_DRAFT];
  if (uid) {
    keys.push(completedWalkDraftKeyForUid(uid));
  }

  await AsyncStorage.multiRemove(keys);
}

function normalizeRouteCaptureStatus(value: unknown): RouteCaptureStatus | undefined {
  if (value === "complete" || value === "partial" || value === "none") {
    return value;
  }
  return undefined;
}

function normalizeGpsDiagnostics(value: unknown): GpsDiagnostics | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = value as Partial<GpsDiagnostics>;
  if (
    typeof candidate.rawPoints !== "number" ||
    !Number.isFinite(candidate.rawPoints) ||
    typeof candidate.acceptedPoints !== "number" ||
    !Number.isFinite(candidate.acceptedPoints) ||
    typeof candidate.rejectedPoints !== "number" ||
    !Number.isFinite(candidate.rejectedPoints)
  ) {
    return undefined;
  }

  const rejectionCounts =
    candidate.rejectionCounts && typeof candidate.rejectionCounts === "object"
      ? Object.fromEntries(
          Object.entries(candidate.rejectionCounts).filter(
            ([key, count]) => typeof key === "string" && typeof count === "number" && Number.isFinite(count)
          )
        )
      : undefined;

  return {
    rawPoints: Math.max(0, Math.round(candidate.rawPoints)),
    acceptedPoints: Math.max(0, Math.round(candidate.acceptedPoints)),
    rejectedPoints: Math.max(0, Math.round(candidate.rejectedPoints)),
    ...(typeof candidate.foregroundPoints === "number" && Number.isFinite(candidate.foregroundPoints)
      ? { foregroundPoints: Math.max(0, Math.round(candidate.foregroundPoints)) }
      : {}),
    ...(typeof candidate.backgroundPoints === "number" && Number.isFinite(candidate.backgroundPoints)
      ? { backgroundPoints: Math.max(0, Math.round(candidate.backgroundPoints)) }
      : {}),
    ...(typeof candidate.largestTrackingGapSec === "number" && Number.isFinite(candidate.largestTrackingGapSec)
      ? { largestTrackingGapSec: Math.max(0, candidate.largestTrackingGapSec) }
      : {}),
    ...(candidate.lastTrackingGapReason === null || typeof candidate.lastTrackingGapReason === "string"
      ? { lastTrackingGapReason: candidate.lastTrackingGapReason ?? null }
      : {}),
    ...(candidate.lastLocationAt === null ||
    (typeof candidate.lastLocationAt === "number" && Number.isFinite(candidate.lastLocationAt))
      ? { lastLocationAt: candidate.lastLocationAt ?? null }
      : {}),
    ...(typeof candidate.backgroundTaskStarted === "boolean"
      ? { backgroundTaskStarted: candidate.backgroundTaskStarted }
      : {}),
    ...(candidate.backgroundTaskLastError === null || typeof candidate.backgroundTaskLastError === "string"
      ? { backgroundTaskLastError: candidate.backgroundTaskLastError ?? null }
      : {}),
    ...(typeof candidate.appStateChanges === "number" && Number.isFinite(candidate.appStateChanges)
      ? { appStateChanges: Math.max(0, Math.round(candidate.appStateChanges)) }
      : {}),
    ...(candidate.lastAppState === null || typeof candidate.lastAppState === "string"
      ? { lastAppState: candidate.lastAppState ?? null }
      : {}),
    ...(candidate.locationPermissionStatus === null || typeof candidate.locationPermissionStatus === "string"
      ? { locationPermissionStatus: candidate.locationPermissionStatus ?? null }
      : {}),
    ...(rejectionCounts && Object.keys(rejectionCounts).length > 0 ? { rejectionCounts } : {}),
    ...(candidate.lastRejectedReason === null || typeof candidate.lastRejectedReason === "string"
      ? { lastRejectedReason: candidate.lastRejectedReason ?? null }
      : {}),
    ...(candidate.lastAcceptedAt === null ||
    (typeof candidate.lastAcceptedAt === "number" && Number.isFinite(candidate.lastAcceptedAt))
      ? { lastAcceptedAt: candidate.lastAcceptedAt ?? null }
      : {}),
    ...(typeof candidate.acceptedDistanceM === "number" && Number.isFinite(candidate.acceptedDistanceM)
      ? { acceptedDistanceM: Math.max(0, candidate.acceptedDistanceM) }
      : {}),
    ...(candidate.averageAccuracy === null ||
    (typeof candidate.averageAccuracy === "number" && Number.isFinite(candidate.averageAccuracy))
      ? { averageAccuracy: candidate.averageAccuracy ?? null }
      : {}),
    ...(candidate.worstAccuracy === null ||
    (typeof candidate.worstAccuracy === "number" && Number.isFinite(candidate.worstAccuracy))
      ? { worstAccuracy: candidate.worstAccuracy ?? null }
      : {}),
  };
}

async function readActiveWalkSnapshot(): Promise<ActiveWalkSnapshot | null> {
  await removeLegacyActiveWalkStorage();

  const uid = currentUid();
  if (!uid) return null;

  const raw = await AsyncStorage.getItem(activeWalkKeyForUid(uid));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ActiveWalkSnapshot>;
    const routePoints =
      Array.isArray(parsed?.routePoints)
        ? parsed.routePoints.filter(
            (point): point is RoutePoint =>
              Boolean(
                point &&
                  typeof point === "object" &&
                  typeof point.lat === "number" &&
                  Number.isFinite(point.lat) &&
                  typeof point.lng === "number" &&
                  Number.isFinite(point.lng) &&
                  typeof point.t === "number" &&
                  Number.isFinite(point.t)
              )
          )
        : undefined;

    if (
      typeof parsed?.startedAt !== "number" ||
      typeof parsed?.elapsedSec !== "number" ||
      typeof parsed?.distanceM !== "number" ||
      typeof parsed?.running !== "boolean" ||
      typeof parsed?.updatedAt !== "number"
    ) {
      return null;
    }

    return {
      walkId: typeof parsed.walkId === "string" && parsed.walkId ? parsed.walkId : String(parsed.startedAt),
      startedAt: parsed.startedAt,
      elapsedSec: parsed.elapsedSec,
      distanceM: parsed.distanceM,
      ...(typeof parsed.pausedDurationSec === "number" && Number.isFinite(parsed.pausedDurationSec)
        ? { pausedDurationSec: parsed.pausedDurationSec }
        : {}),
      ...(typeof parsed.movingDurationSec === "number" && Number.isFinite(parsed.movingDurationSec)
        ? { movingDurationSec: parsed.movingDurationSec }
        : {}),
      ...(parsed.pauseStartedAt === null ||
      (typeof parsed.pauseStartedAt === "number" && Number.isFinite(parsed.pauseStartedAt))
        ? { pauseStartedAt: parsed.pauseStartedAt ?? null }
        : {}),
      ...(routePoints ? { routePoints } : {}),
      ...(parsed.lastAcceptedPoint && typeof parsed.lastAcceptedPoint === "object"
        ? {
            lastAcceptedPoint: routePoints?.find((point) => point.t === parsed.lastAcceptedPoint?.t) ??
              (typeof parsed.lastAcceptedPoint.lat === "number" &&
              Number.isFinite(parsed.lastAcceptedPoint.lat) &&
              typeof parsed.lastAcceptedPoint.lng === "number" &&
              Number.isFinite(parsed.lastAcceptedPoint.lng) &&
              typeof parsed.lastAcceptedPoint.t === "number" &&
              Number.isFinite(parsed.lastAcceptedPoint.t)
                ? parsed.lastAcceptedPoint
                : null),
          }
        : parsed.lastAcceptedPoint === null
          ? { lastAcceptedPoint: null }
          : {}),
      ...(parsed.lastLocationUpdateAt === null ||
      (typeof parsed.lastLocationUpdateAt === "number" && Number.isFinite(parsed.lastLocationUpdateAt))
        ? { lastLocationUpdateAt: parsed.lastLocationUpdateAt ?? null }
        : {}),
      ...(parsed.gpsUiState === "idle" ||
      parsed.gpsUiState === "primed" ||
      parsed.gpsUiState === "finding" ||
      parsed.gpsUiState === "live"
        ? { gpsUiState: parsed.gpsUiState }
        : {}),
      ...(normalizeRouteCaptureStatus(parsed.routeCaptureStatus)
        ? { routeCaptureStatus: parsed.routeCaptureStatus }
        : {}),
      ...(typeof parsed.routeCaptureInterrupted === "boolean"
        ? { routeCaptureInterrupted: parsed.routeCaptureInterrupted }
        : {}),
      ...(typeof parsed.routeCaptureGapSec === "number" && Number.isFinite(parsed.routeCaptureGapSec)
        ? { routeCaptureGapSec: Math.max(0, parsed.routeCaptureGapSec) }
        : {}),
      ...(normalizeGpsDiagnostics(parsed.gpsDiagnostics)
        ? { gpsDiagnostics: normalizeGpsDiagnostics(parsed.gpsDiagnostics) }
        : {}),
      running: parsed.running,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

function enqueueActiveWalkMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = activeWalkMutationQueue.then(mutation, mutation);
  activeWalkMutationQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function mergeActiveWalkSnapshot(current: ActiveWalkSnapshot | null, incoming: ActiveWalkSnapshot): ActiveWalkSnapshot {
  if (!current || current.walkId !== incoming.walkId) return incoming;

  const currentPoints = current.routePoints ?? [];
  const incomingPoints = incoming.routePoints ?? [];
  const currentLocationAt = current.lastLocationUpdateAt ?? current.gpsDiagnostics?.lastLocationAt ?? 0;
  const incomingLocationAt = incoming.lastLocationUpdateAt ?? incoming.gpsDiagnostics?.lastLocationAt ?? 0;
  const currentDiagnostics = current.gpsDiagnostics;
  const incomingDiagnostics = incoming.gpsDiagnostics;
  const mergedDiagnostics =
    currentDiagnostics || incomingDiagnostics
      ? {
          ...currentDiagnostics,
          ...incomingDiagnostics,
          rawPoints: Math.max(currentDiagnostics?.rawPoints ?? 0, incomingDiagnostics?.rawPoints ?? 0),
          acceptedPoints: Math.max(
            currentDiagnostics?.acceptedPoints ?? 0,
            incomingDiagnostics?.acceptedPoints ?? 0
          ),
          rejectedPoints: Math.max(
            currentDiagnostics?.rejectedPoints ?? 0,
            incomingDiagnostics?.rejectedPoints ?? 0
          ),
          foregroundPoints: Math.max(
            currentDiagnostics?.foregroundPoints ?? 0,
            incomingDiagnostics?.foregroundPoints ?? 0
          ),
          backgroundPoints: Math.max(
            currentDiagnostics?.backgroundPoints ?? 0,
            incomingDiagnostics?.backgroundPoints ?? 0
          ),
          largestTrackingGapSec: Math.max(
            currentDiagnostics?.largestTrackingGapSec ?? 0,
            incomingDiagnostics?.largestTrackingGapSec ?? 0
          ),
          lastLocationAt:
            Math.max(currentDiagnostics?.lastLocationAt ?? 0, incomingDiagnostics?.lastLocationAt ?? 0) || null,
          lastAcceptedAt:
            Math.max(currentDiagnostics?.lastAcceptedAt ?? 0, incomingDiagnostics?.lastAcceptedAt ?? 0) || null,
          acceptedDistanceM: Math.max(
            currentDiagnostics?.acceptedDistanceM ?? 0,
            incomingDiagnostics?.acceptedDistanceM ?? 0
          ),
          backgroundTaskStarted:
            incomingDiagnostics?.backgroundTaskStarted ?? currentDiagnostics?.backgroundTaskStarted,
          appStateChanges: Math.max(
            currentDiagnostics?.appStateChanges ?? 0,
            incomingDiagnostics?.appStateChanges ?? 0
          ),
          lastAppState:
            (currentDiagnostics?.appStateChanges ?? 0) > (incomingDiagnostics?.appStateChanges ?? 0)
              ? currentDiagnostics?.lastAppState
              : incomingDiagnostics?.lastAppState,
        }
      : undefined;
  const keepCurrentLocationData =
    currentPoints.length > incomingPoints.length ||
    (currentPoints.length === incomingPoints.length &&
      (currentLocationAt > incomingLocationAt ||
        (currentLocationAt === incomingLocationAt && current.lastAcceptedPoint && !incoming.lastAcceptedPoint)));
  const mergedPoints = keepCurrentLocationData ? currentPoints : incomingPoints;
  const routeCaptureInterrupted = Boolean(current.routeCaptureInterrupted || incoming.routeCaptureInterrupted);

  return {
    ...incoming,
    distanceM: Math.max(current.distanceM, incoming.distanceM, mergedDiagnostics?.acceptedDistanceM ?? 0),
    movingDurationSec: Math.max(current.movingDurationSec ?? 0, incoming.movingDurationSec ?? 0),
    routePoints: mergedPoints,
    lastAcceptedPoint: keepCurrentLocationData
      ? current.lastAcceptedPoint ?? currentPoints[currentPoints.length - 1] ?? null
      : incoming.lastAcceptedPoint ?? incomingPoints[incomingPoints.length - 1] ?? null,
    lastLocationUpdateAt: Math.max(currentLocationAt, incomingLocationAt) || null,
    gpsUiState: keepCurrentLocationData ? current.gpsUiState ?? incoming.gpsUiState : incoming.gpsUiState,
    routeCaptureStatus:
      mergedPoints.length < 2 ? "none" : routeCaptureInterrupted ? "partial" : "complete",
    routeCaptureInterrupted,
    routeCaptureGapSec: Math.max(current.routeCaptureGapSec ?? 0, incoming.routeCaptureGapSec ?? 0),
    gpsDiagnostics: mergedDiagnostics,
  };
}

export async function getActiveWalkSnapshot(): Promise<ActiveWalkSnapshot | null> {
  await activeWalkMutationQueue;
  return readActiveWalkSnapshot();
}

export async function setActiveWalkSnapshot(snapshot: ActiveWalkSnapshot): Promise<void> {
  await enqueueActiveWalkMutation(async () => {
    await removeLegacyActiveWalkStorage();
    const uid = currentUid();
    if (!uid) return;

    const current = await readActiveWalkSnapshot();
    await AsyncStorage.setItem(activeWalkKeyForUid(uid), JSON.stringify(mergeActiveWalkSnapshot(current, snapshot)));
  });
}

export async function updateActiveWalkSnapshot(
  updater: (snapshot: ActiveWalkSnapshot | null) => ActiveWalkSnapshot | null | Promise<ActiveWalkSnapshot | null>
): Promise<ActiveWalkSnapshot | null> {
  return enqueueActiveWalkMutation(async () => {
    await removeLegacyActiveWalkStorage();
    const uid = currentUid();
    if (!uid) return null;

    const current = await readActiveWalkSnapshot();
    const next = await updater(current);
    if (next) {
      await AsyncStorage.setItem(activeWalkKeyForUid(uid), JSON.stringify(next));
    } else {
      await clearActiveWalkSnapshotForUid(uid);
    }
    return next;
  });
}

export async function clearActiveWalkSnapshot(): Promise<void> {
  await enqueueActiveWalkMutation(async () => {
    await clearActiveWalkSnapshotForUid(currentUid());
  });
}

export async function hasActiveWalkSnapshot(): Promise<boolean> {
  return (await getActiveWalkSnapshot()) !== null;
}

export async function getCompletedWalkDraft(): Promise<CompletedWalkDraft | null> {
  await removeLegacyActiveWalkStorage();

  const uid = currentUid();
  if (!uid) return null;

  const raw = await AsyncStorage.getItem(completedWalkDraftKeyForUid(uid));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<CompletedWalkDraft>;
    const routePoints =
      Array.isArray(parsed?.routePoints)
        ? parsed.routePoints.filter(
            (point): point is RoutePoint =>
              Boolean(
                point &&
                  typeof point === "object" &&
                  typeof point.lat === "number" &&
                  Number.isFinite(point.lat) &&
                  typeof point.lng === "number" &&
                  Number.isFinite(point.lng) &&
                  typeof point.t === "number" &&
                  Number.isFinite(point.t)
              )
          )
        : null;

    if (!routePoints) return null;
    return {
      routePoints,
      ...(normalizeRouteCaptureStatus(parsed.routeCaptureStatus)
        ? { routeCaptureStatus: parsed.routeCaptureStatus }
        : {}),
      ...(typeof parsed.routeCaptureInterrupted === "boolean"
        ? { routeCaptureInterrupted: parsed.routeCaptureInterrupted }
        : {}),
      ...(typeof parsed.routeCaptureGapSec === "number" && Number.isFinite(parsed.routeCaptureGapSec)
        ? { routeCaptureGapSec: Math.max(0, parsed.routeCaptureGapSec) }
        : {}),
      ...(normalizeGpsDiagnostics(parsed.gpsDiagnostics)
        ? { gpsDiagnostics: normalizeGpsDiagnostics(parsed.gpsDiagnostics) }
        : {}),
    };
  } catch {
    return null;
  }
}

export async function setCompletedWalkDraft(draft: CompletedWalkDraft): Promise<void> {
  await removeLegacyActiveWalkStorage();

  const uid = currentUid();
  if (!uid) return;

  await AsyncStorage.setItem(completedWalkDraftKeyForUid(uid), JSON.stringify(draft));
}

export async function clearCompletedWalkDraft(): Promise<void> {
  await clearCompletedWalkDraftForUid(currentUid());
}
