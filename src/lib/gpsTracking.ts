import type { RoutePoint } from "./store";

export type GpsIgnoreReason =
  | "missing_coords"
  | "poor_accuracy"
  | "invalid_timestamp"
  | "duplicate_timestamp"
  | "duplicate_coordinate"
  | "too_soon"
  | "too_close"
  | "too_fast"
  | "gps_jump";

export type GpsStrengthLabel = "Strong GPS" | "Fair GPS" | "Weak GPS";

export type GpsAcceptanceStats = {
  rawPoints: number;
  acceptedDistancePoints: number;
  ignoredPoints: number;
  lastIgnoredReason: GpsIgnoreReason | null;
  averageAccuracy: number | null;
  gpsStrength: GpsStrengthLabel;
};

export type GpsAcceptedResult =
  | {
      accepted: true;
      kind: "anchor" | "distance";
      point: RoutePoint;
      deltaMeters: number;
      deltaTimeSec: number;
      speedMps: number | null;
    }
  | {
      accepted: false;
      reason: GpsIgnoreReason;
      deltaMeters: number | null;
      deltaTimeSec: number | null;
      speedMps: number | null;
    };

export const GPS_WARMUP_SECONDS = 3;
export const MIN_DISTANCE_METERS = 2;
export const MAX_ACCEPTABLE_ACCURACY_METERS = 35;
export const MAX_REASONABLE_WALKING_SPEED_MPS = 3.0;
export const MIN_DISTANCE_FOR_PACE_DISPLAY = 0.05 * 1609.344;

export const GPS_THRESHOLDS = {
  minAcceptedDeltaSec: 2,
  minAcceptedDeltaMeters: MIN_DISTANCE_METERS,
  maxAccuracyMeters: MAX_ACCEPTABLE_ACCURACY_METERS,
  maxNormalWalkingSpeedMps: MAX_REASONABLE_WALKING_SPEED_MPS,
  absoluteMaxSpeedMps: 4.5,
  maxJumpDistanceMeters: 25,
  duplicateCoordinateToleranceMeters: 0.75,
  minPaceDistanceMeters: MIN_DISTANCE_FOR_PACE_DISPLAY,
  minPaceElapsedSec: 60,
  suspiciousFastPaceSecPerMile: 10 * 60,
  suspiciousFastMinDistanceMeters: 0.1 * 1609.344,
  suspiciousFastMinElapsedSec: 180,
} as const;

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
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

function isFiniteCoord(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatWalkingPace(distanceM: number, elapsedSec: number): string | null {
  if (
    !Number.isFinite(distanceM) ||
    !Number.isFinite(elapsedSec) ||
    distanceM < GPS_THRESHOLDS.minPaceDistanceMeters ||
    elapsedSec < GPS_THRESHOLDS.minPaceElapsedSec
  ) {
    return null;
  }

  const miles = distanceM / 1609.344;
  if (!Number.isFinite(miles) || miles <= 0) return null;

  const totalSecondsPerMile = Math.round(elapsedSec / miles);
  if (!Number.isFinite(totalSecondsPerMile) || totalSecondsPerMile <= 0) return null;

  if (
    totalSecondsPerMile < GPS_THRESHOLDS.suspiciousFastPaceSecPerMile &&
    (distanceM < GPS_THRESHOLDS.suspiciousFastMinDistanceMeters ||
      elapsedSec < GPS_THRESHOLDS.suspiciousFastMinElapsedSec)
  ) {
    return null;
  }

  const mm = Math.floor(totalSecondsPerMile / 60);
  const ss = totalSecondsPerMile % 60;
  return `${mm}:${String(ss).padStart(2, "0")} / mi`;
}

export function computeGpsStrength(
  averageAccuracy: number | null,
  acceptedDistancePoints: number
): GpsStrengthLabel {
  if (averageAccuracy !== null && averageAccuracy <= 20 && acceptedDistancePoints >= 4) {
    return "Strong GPS";
  }
  if (averageAccuracy !== null && averageAccuracy <= 35 && acceptedDistancePoints >= 2) {
    return "Fair GPS";
  }
  return "Weak GPS";
}

export function updateGpsStats(
  stats: GpsAcceptanceStats,
  pointAccuracy: number | null,
  accepted: boolean,
  reason: GpsIgnoreReason | null
): GpsAcceptanceStats {
  const rawPoints = stats.rawPoints + 1;
  const acceptedDistancePoints = accepted ? stats.acceptedDistancePoints + 1 : stats.acceptedDistancePoints;
  const ignoredPoints = accepted ? stats.ignoredPoints : stats.ignoredPoints + 1;
  const averageAccuracy =
    pointAccuracy === null
      ? stats.averageAccuracy
      : stats.averageAccuracy === null
        ? pointAccuracy
        : (stats.averageAccuracy * stats.rawPoints + pointAccuracy) / rawPoints;

  return {
    rawPoints,
    acceptedDistancePoints,
    ignoredPoints,
    lastIgnoredReason: accepted ? stats.lastIgnoredReason : reason,
    averageAccuracy,
    gpsStrength: computeGpsStrength(averageAccuracy, acceptedDistancePoints),
  };
}

export function evaluateGpsPoint(
  point: RoutePoint,
  previousAcceptedPoint: RoutePoint | null
): GpsAcceptedResult {
  if (!isFiniteCoord(point.lat) || !isFiniteCoord(point.lng)) {
    return { accepted: false, reason: "missing_coords", deltaMeters: null, deltaTimeSec: null, speedMps: null };
  }

  const accuracy = typeof point.accuracy === "number" && Number.isFinite(point.accuracy) ? point.accuracy : null;
  if (accuracy === null || accuracy > GPS_THRESHOLDS.maxAccuracyMeters) {
    return { accepted: false, reason: "poor_accuracy", deltaMeters: null, deltaTimeSec: null, speedMps: null };
  }

  if (!Number.isFinite(point.t) || point.t <= 0) {
    return { accepted: false, reason: "invalid_timestamp", deltaMeters: null, deltaTimeSec: null, speedMps: null };
  }

  if (!previousAcceptedPoint) {
    return {
      accepted: true,
      kind: "anchor",
      point,
      deltaMeters: 0,
      deltaTimeSec: 0,
      speedMps: null,
    };
  }

  const dtSec = (point.t - previousAcceptedPoint.t) / 1000;
  if (!Number.isFinite(dtSec) || dtSec <= 0) {
    return { accepted: false, reason: "duplicate_timestamp", deltaMeters: null, deltaTimeSec: null, speedMps: null };
  }

  const deltaMeters = haversineMeters(previousAcceptedPoint, point);
  if (!Number.isFinite(deltaMeters)) {
    return { accepted: false, reason: "invalid_timestamp", deltaMeters: null, deltaTimeSec: dtSec, speedMps: null };
  }

  if (deltaMeters <= GPS_THRESHOLDS.duplicateCoordinateToleranceMeters) {
    return { accepted: false, reason: "duplicate_coordinate", deltaMeters, deltaTimeSec: dtSec, speedMps: 0 };
  }

  const speedMps = deltaMeters / dtSec;
  const reportedSpeed =
    typeof point.speed === "number" && Number.isFinite(point.speed) && point.speed >= 0 ? point.speed : null;
  const effectiveSpeedMps = reportedSpeed ?? speedMps;

  const dynamicNoiseFloor = Math.min(
    GPS_THRESHOLDS.minAcceptedDeltaMeters,
    Math.max(1, accuracy === null ? GPS_THRESHOLDS.minAcceptedDeltaMeters : accuracy * 0.18)
  );
  const relaxedNoiseFloor = Math.max(1, dynamicNoiseFloor * 0.75);

  if (dtSec < GPS_THRESHOLDS.minAcceptedDeltaSec && deltaMeters < relaxedNoiseFloor * 1.5) {
    return { accepted: false, reason: "too_soon", deltaMeters, deltaTimeSec: dtSec, speedMps: effectiveSpeedMps };
  }

  if (deltaMeters < dynamicNoiseFloor && effectiveSpeedMps < 1.8) {
    return { accepted: false, reason: "too_close", deltaMeters, deltaTimeSec: dtSec, speedMps: effectiveSpeedMps };
  }

  if (speedMps > GPS_THRESHOLDS.absoluteMaxSpeedMps) {
    return { accepted: false, reason: "too_fast", deltaMeters, deltaTimeSec: dtSec, speedMps };
  }

  if (
    deltaMeters > GPS_THRESHOLDS.maxJumpDistanceMeters &&
    speedMps > GPS_THRESHOLDS.maxNormalWalkingSpeedMps
  ) {
    return { accepted: false, reason: "gps_jump", deltaMeters, deltaTimeSec: dtSec, speedMps };
  }

  if (effectiveSpeedMps > GPS_THRESHOLDS.maxNormalWalkingSpeedMps && accuracy !== null && accuracy > 20) {
    return { accepted: false, reason: "too_fast", deltaMeters, deltaTimeSec: dtSec, speedMps: effectiveSpeedMps };
  }

  return {
    accepted: true,
    kind: "distance",
    point,
    deltaMeters,
    deltaTimeSec: dtSec,
    speedMps,
  };
}

export function smoothRoutePoints(points: RoutePoint[], windowRadius = 1): RoutePoint[] {
  if (points.length < 3) return points;

  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return point;

    let latSum = 0;
    let lngSum = 0;
    let count = 0;

    for (let cursor = index - windowRadius; cursor <= index + windowRadius; cursor += 1) {
      const candidate = points[cursor];
      if (!candidate) continue;
      latSum += candidate.lat;
      lngSum += candidate.lng;
      count += 1;
    }

    if (count === 0) return point;

    return {
      ...point,
      lat: latSum / count,
      lng: lngSum / count,
    };
  });
}
