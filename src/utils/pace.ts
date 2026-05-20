import type { RoutePoint } from "../lib/store";

import {
  GPS_MAX_REASONABLE_SPEED_MPS,
  GPS_MIN_DISTANCE_METERS,
  GPS_MIN_TIME_BETWEEN_POINTS_MS,
  haversineMeters,
} from "./gpsFiltering";

export const PACE_MIN_DISTANCE_MILES = 0.05;
const MAX_MOVING_GAP_MS = 15000;
const DEFAULT_ROLLING_PACE_WINDOW_MS = 30000;

// Validation examples:
// 0.30 miles in 239 seconds = about 13:17 / mi
// 0.22 miles in 239 seconds = about 18:06 / mi
// 1 mile in 18 minutes = 18:00 / mi
export function calculatePaceMinutesPerMile(distanceMiles: number, elapsedSeconds: number): number | null {
  if (!Number.isFinite(distanceMiles) || !Number.isFinite(elapsedSeconds)) return null;
  if (distanceMiles < PACE_MIN_DISTANCE_MILES || elapsedSeconds <= 0) return null;

  const minutesPerMile = (elapsedSeconds / 60) / distanceMiles;
  return Number.isFinite(minutesPerMile) && minutesPerMile > 0 ? minutesPerMile : null;
}

export function formatPace(minutesPerMile: number | null, fallback = "-- / mi"): string {
  if (minutesPerMile === null || !Number.isFinite(minutesPerMile) || minutesPerMile <= 0) {
    return fallback;
  }

  const totalSeconds = Math.round(minutesPerMile * 60);
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${mm}:${String(ss).padStart(2, "0")} / mi`;
}

export function calculateMovingTimeSeconds(routePoints?: RoutePoint[] | null): number | null {
  if (!Array.isArray(routePoints) || routePoints.length < 2) return null;

  let movingMs = 0;

  for (let index = 1; index < routePoints.length; index += 1) {
    const previous = routePoints[index - 1];
    const current = routePoints[index];
    if (!previous || !current) continue;

    const deltaMs = current.t - previous.t;
    if (deltaMs <= 0 || deltaMs > MAX_MOVING_GAP_MS) {
      continue;
    }

    const distanceM = haversineMeters(previous, current);
    if (distanceM < GPS_MIN_DISTANCE_METERS) {
      continue;
    }

    if (distanceM / (deltaMs / 1000) > GPS_MAX_REASONABLE_SPEED_MPS) {
      continue;
    }

    if (deltaMs < GPS_MIN_TIME_BETWEEN_POINTS_MS && distanceM < GPS_MIN_DISTANCE_METERS * 2) {
      continue;
    }

    movingMs += deltaMs;
  }

  return movingMs > 0 ? Math.round(movingMs / 1000) : null;
}

export function calculateRollingPaceMinutesPerMile(
  routePoints?: RoutePoint[] | null,
  windowMs = DEFAULT_ROLLING_PACE_WINDOW_MS
): number | null {
  if (!Array.isArray(routePoints) || routePoints.length < 2) return null;

  const latestTimestamp = routePoints[routePoints.length - 1]?.t;
  if (typeof latestTimestamp !== "number" || !Number.isFinite(latestTimestamp)) {
    return null;
  }

  let rollingDistanceM = 0;
  let rollingMs = 0;

  for (let index = routePoints.length - 1; index >= 1; index -= 1) {
    const previous = routePoints[index - 1];
    const current = routePoints[index];
    if (!previous || !current) continue;

    if (latestTimestamp - current.t > windowMs) {
      break;
    }

    const deltaMs = current.t - previous.t;
    if (deltaMs <= 0 || deltaMs > MAX_MOVING_GAP_MS) {
      continue;
    }

    const distanceM = haversineMeters(previous, current);
    if (distanceM < GPS_MIN_DISTANCE_METERS) {
      continue;
    }

    const speedMps = distanceM / (deltaMs / 1000);
    if (speedMps > GPS_MAX_REASONABLE_SPEED_MPS) {
      continue;
    }

    if (deltaMs < GPS_MIN_TIME_BETWEEN_POINTS_MS && distanceM < GPS_MIN_DISTANCE_METERS * 2) {
      continue;
    }

    rollingDistanceM += distanceM;
    rollingMs += deltaMs;
  }

  if (rollingMs <= 0) return null;
  return calculatePaceMinutesPerMile(rollingDistanceM / 1609.344, rollingMs / 1000);
}

export function getPaceMetrics(options: {
  distanceM?: number | null;
  elapsedSeconds: number;
  movingSeconds?: number | null;
  routePoints?: RoutePoint[] | null;
  preferRolling?: boolean;
  loadingFallback?: string;
  emptyFallback?: string;
  rollingWindowMs?: number;
}): {
  display: string;
  rawDisplay: string;
  rollingDisplay: string;
  rawPaceMinutesPerMile: number | null;
  rollingPaceMinutesPerMile: number | null;
} {
  const {
    distanceM,
    elapsedSeconds,
    movingSeconds,
    routePoints,
    preferRolling = true,
    loadingFallback = "Getting GPS...",
    emptyFallback = "-- / mi",
    rollingWindowMs = DEFAULT_ROLLING_PACE_WINDOW_MS,
  } = options;

  const distanceMiles =
    typeof distanceM === "number" && Number.isFinite(distanceM) ? distanceM / 1609.344 : 0;
  const effectiveSeconds =
    (typeof movingSeconds === "number" && Number.isFinite(movingSeconds) && movingSeconds > 0
      ? movingSeconds
      : null) ??
    calculateMovingTimeSeconds(routePoints) ??
    elapsedSeconds;
  // Pace is always based on horizontal GPS distance only. Elevation gain is stored separately
  // for metadata and display, and is never added into pace or distance calculations.
  const rawPaceMinutesPerMile = calculatePaceMinutesPerMile(distanceMiles, effectiveSeconds);
  const rollingPaceMinutesPerMile = calculateRollingPaceMinutesPerMile(routePoints, rollingWindowMs);
  const conservativeRollingPaceMinutesPerMile =
    rawPaceMinutesPerMile !== null && rollingPaceMinutesPerMile !== null
      ? Math.max(rawPaceMinutesPerMile, rollingPaceMinutesPerMile)
      : rollingPaceMinutesPerMile ?? rawPaceMinutesPerMile;
  const preferredPaceMinutesPerMile =
    preferRolling ? conservativeRollingPaceMinutesPerMile : rawPaceMinutesPerMile;

  const fallback =
    preferredPaceMinutesPerMile === null &&
    distanceMiles > 0 &&
    distanceMiles < PACE_MIN_DISTANCE_MILES
      ? loadingFallback
      : emptyFallback;

  return {
    display: formatPace(preferredPaceMinutesPerMile, fallback),
    rawDisplay: formatPace(rawPaceMinutesPerMile, emptyFallback),
    rollingDisplay: formatPace(rollingPaceMinutesPerMile, emptyFallback),
    rawPaceMinutesPerMile,
    rollingPaceMinutesPerMile,
  };
}

export function getPaceDisplay(options: {
  distanceM?: number | null;
  elapsedSeconds: number;
  movingSeconds?: number | null;
  routePoints?: RoutePoint[] | null;
  preferRolling?: boolean;
  loadingFallback?: string;
  emptyFallback?: string;
}): string {
  return getPaceMetrics(options).display;
}
