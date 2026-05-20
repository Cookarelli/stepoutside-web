import type { RoutePoint } from "../lib/store";

import {
  GPS_MAX_REASONABLE_SPEED_MPS,
  GPS_MIN_DISTANCE_METERS,
  GPS_MIN_TIME_BETWEEN_POINTS_MS,
  haversineMeters,
} from "./gpsFiltering";

export const PACE_MIN_DISTANCE_MILES = 0.05;
const MAX_MOVING_GAP_MS = 15000;

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

export function getPaceDisplay(options: {
  distanceM?: number | null;
  elapsedSeconds: number;
  movingSeconds?: number | null;
  routePoints?: RoutePoint[] | null;
  loadingFallback?: string;
  emptyFallback?: string;
}): string {
  const {
    distanceM,
    elapsedSeconds,
    movingSeconds,
    routePoints,
    loadingFallback = "Getting GPS...",
    emptyFallback = "-- / mi",
  } = options;

  const distanceMiles =
    typeof distanceM === "number" && Number.isFinite(distanceM) ? distanceM / 1609.344 : 0;
  const effectiveSeconds =
    (typeof movingSeconds === "number" && Number.isFinite(movingSeconds) && movingSeconds > 0
      ? movingSeconds
      : null) ??
    calculateMovingTimeSeconds(routePoints) ??
    elapsedSeconds;
  const pace = calculatePaceMinutesPerMile(distanceMiles, effectiveSeconds);

  if (pace === null) {
    return distanceMiles > 0 && distanceMiles < PACE_MIN_DISTANCE_MILES ? loadingFallback : emptyFallback;
  }

  return formatPace(pace, emptyFallback);
}
