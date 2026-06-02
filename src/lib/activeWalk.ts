import AsyncStorage from "@react-native-async-storage/async-storage";

import type { GpsDiagnostics, RouteCaptureStatus, RoutePoint } from "./store";

export type ActiveWalkSnapshot = {
  startedAt: number;
  elapsedSec: number;
  distanceM: number;
  pausedDurationSec?: number;
  movingDurationSec?: number;
  pauseStartedAt?: number | null;
  routePoints?: RoutePoint[];
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

const KEY_ACTIVE_WALK = "@stepoutside/activeWalk";
const KEY_COMPLETED_WALK_DRAFT = "@stepoutside/completedWalkDraft";

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

export async function getActiveWalkSnapshot(): Promise<ActiveWalkSnapshot | null> {
  const raw = await AsyncStorage.getItem(KEY_ACTIVE_WALK);
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

export async function setActiveWalkSnapshot(snapshot: ActiveWalkSnapshot): Promise<void> {
  await AsyncStorage.setItem(KEY_ACTIVE_WALK, JSON.stringify(snapshot));
}

export async function clearActiveWalkSnapshot(): Promise<void> {
  await AsyncStorage.removeItem(KEY_ACTIVE_WALK);
}

export async function hasActiveWalkSnapshot(): Promise<boolean> {
  return (await getActiveWalkSnapshot()) !== null;
}

export async function getCompletedWalkDraft(): Promise<CompletedWalkDraft | null> {
  const raw = await AsyncStorage.getItem(KEY_COMPLETED_WALK_DRAFT);
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
  await AsyncStorage.setItem(KEY_COMPLETED_WALK_DRAFT, JSON.stringify(draft));
}

export async function clearCompletedWalkDraft(): Promise<void> {
  await AsyncStorage.removeItem(KEY_COMPLETED_WALK_DRAFT);
}
