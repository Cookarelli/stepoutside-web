import type { RoutePoint } from "../lib/store";

// Require at least ~4 meters of horizontal movement before counting progress.
// This is still enough to suppress GPS jitter, but it is forgiving enough for a normal short walk.
export const GPS_MIN_DISTANCE_METERS = 4;
// Accuracy worse than 25 meters is too noisy for trustworthy walking distance.
export const GPS_MAX_ACCURACY_METERS = 25;
// Keep the speed ceiling generous enough for brisk walking and light jogging without letting GPS spikes through.
export const GPS_MAX_REASONABLE_SPEED_MPS = 3.8;
// Points arriving within 3 seconds need more than trivial movement to avoid dot-jitter accumulation.
export const GPS_MIN_TIME_BETWEEN_POINTS_MS = 3000;
// Speeds near zero are usually standing still, even if GPS wanders a little bit.
export const GPS_STATIONARY_SPEED_MPS = 0.4;
// Require a couple of consecutive "still" samples before treating the user as stationary drift.
export const GPS_STATIONARY_CONFIRMATION_POINTS = 2;
// Accuracy above ~18m is usable but lower-confidence for short walking segments.
export const GPS_LOW_CONFIDENCE_ACCURACY_METERS = 18;
// Abrupt reversals above this threshold are usually bounce or reflection, not a real turn on foot.
export const GPS_MAX_DIRECTION_CHANGE_DEGREES = 115;
// Human walking/running acceleration is far lower than most GPS jump artifacts.
export const GPS_MAX_REASONABLE_ACCELERATION_MPS2 = 2.2;
// Large one-step altitude swings usually indicate GPS/barometer noise rather than terrain.
export const GPS_MAX_VERTICAL_SPIKE_METERS = 12;
// Speeds above this are confidently "moving" for a walking/hiking activity.
export const GPS_WALKING_SPEED_MPS = 0.7;

const GPS_SMOOTHING_WEIGHT = 0.2;
const GPS_MEDIUM_SMOOTHING_WEIGHT = 0.32;
const GPS_HEAVY_SMOOTHING_WEIGHT = 0.44;

type GpsFilterInput = {
  point: Partial<RoutePoint> | null | undefined;
  lastAcceptedPoint: RoutePoint | null;
  secondLastAcceptedPoint?: RoutePoint | null;
  isTracking: boolean;
  stationaryPointStreak?: number;
};

export type MotionState = "stationary" | "walking" | "uncertain";
export type GpsConfidence = "high" | "medium" | "low";
export type GpsRejectedReason =
  | "paused"
  | "missing_coords"
  | "poor_accuracy"
  | "duplicate_timestamp"
  | "too_close"
  | "too_fast"
  | "elevation_spike"
  | "direction_jump"
  | "acceleration_spike";

export type GpsFilterResult =
  | {
      accepted: true;
      point: RoutePoint;
      distanceDeltaM: number;
      rawHorizontalDistanceM: number;
      verticalDeltaM: number;
      derivedSpeedMps: number;
      accelerationMps2: number | null;
      motionState: MotionState;
      confidence: GpsConfidence;
      timeDeltaMs: number;
      nextStationaryPointStreak: number;
      reason: "accepted";
    }
  | {
      accepted: false;
      point: null;
      distanceDeltaM: 0;
      rawHorizontalDistanceM: number;
      verticalDeltaM: number;
      derivedSpeedMps: number;
      accelerationMps2: number | null;
      motionState: MotionState;
      confidence: GpsConfidence;
      timeDeltaMs: 0;
      nextStationaryPointStreak: number;
      reason: GpsRejectedReason;
    };

export function haversineMeters(a: Pick<RoutePoint, "lat" | "lng">, b: Pick<RoutePoint, "lat" | "lng">): number {
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

function normalizePoint(point: Partial<RoutePoint> | null | undefined): RoutePoint | null {
  if (
    !point ||
    typeof point.lat !== "number" ||
    !Number.isFinite(point.lat) ||
    typeof point.lng !== "number" ||
    !Number.isFinite(point.lng)
  ) {
    return null;
  }

  const timestamp = typeof point.t === "number" && Number.isFinite(point.t) ? point.t : Date.now();
  const accuracy =
    typeof point.accuracy === "number" && Number.isFinite(point.accuracy) ? point.accuracy : undefined;
  const altitude =
    typeof point.altitude === "number" && Number.isFinite(point.altitude) ? point.altitude : undefined;
  const speed = typeof point.speed === "number" && Number.isFinite(point.speed) ? point.speed : undefined;

  return {
    lat: point.lat,
    lng: point.lng,
    t: timestamp,
    ...(typeof accuracy === "number" ? { accuracy } : {}),
    ...(typeof altitude === "number" ? { altitude } : {}),
    ...(typeof speed === "number" ? { speed } : {}),
  };
}

function getConfidence(accuracy?: number): GpsConfidence {
  if (typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy <= 8) return "high";
  if (accuracy <= GPS_LOW_CONFIDENCE_ACCURACY_METERS) return "medium";
  return "low";
}

function getMotionState(distanceM: number, speedMps: number): MotionState {
  if (speedMps <= GPS_STATIONARY_SPEED_MPS || distanceM < GPS_MIN_DISTANCE_METERS) {
    return "stationary";
  }

  if (speedMps >= GPS_WALKING_SPEED_MPS) {
    return "walking";
  }

  return "uncertain";
}

function bearingDegrees(a: Pick<RoutePoint, "lat" | "lng">, b: Pick<RoutePoint, "lat" | "lng">): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const toDeg = (x: number) => (x * 180) / Math.PI;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lng - a.lng);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function bearingDeltaDegrees(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function smoothPoint(previous: RoutePoint, next: RoutePoint, confidence: GpsConfidence, motionState: MotionState): RoutePoint {
  // Light smoothing reduces dot-jitter while preserving the actual route shape.
  const smoothingWeight =
    confidence === "high" && motionState === "walking"
      ? GPS_SMOOTHING_WEIGHT
      : confidence === "medium" || motionState === "uncertain"
        ? GPS_MEDIUM_SMOOTHING_WEIGHT
        : GPS_HEAVY_SMOOTHING_WEIGHT;

  return {
    ...next,
    lat: previous.lat + (next.lat - previous.lat) * (1 - smoothingWeight),
    lng: previous.lng + (next.lng - previous.lng) * (1 - smoothingWeight),
  };
}

export function filterGpsPoint({
  point,
  lastAcceptedPoint,
  secondLastAcceptedPoint = null,
  isTracking,
  stationaryPointStreak = 0,
}: GpsFilterInput): GpsFilterResult {
  const missingResult = {
    point: null,
    distanceDeltaM: 0 as const,
    rawHorizontalDistanceM: 0,
    verticalDeltaM: 0,
    derivedSpeedMps: 0,
    accelerationMps2: null,
    motionState: "uncertain" as MotionState,
    confidence: "low" as GpsConfidence,
    timeDeltaMs: 0 as const,
    nextStationaryPointStreak: stationaryPointStreak,
  };

  if (!isTracking) {
    return {
      accepted: false,
      ...missingResult,
      reason: "paused",
    };
  }

  const normalized = normalizePoint(point);
  if (!normalized) {
    return {
      accepted: false,
      ...missingResult,
      reason: "missing_coords",
    };
  }

  const confidence = getConfidence(normalized.accuracy);

  if (
    typeof normalized.accuracy === "number" &&
    normalized.accuracy > GPS_MAX_ACCURACY_METERS
  ) {
    return {
      accepted: false,
      ...missingResult,
      confidence,
      nextStationaryPointStreak: stationaryPointStreak,
      reason: "poor_accuracy",
    };
  }

  if (!lastAcceptedPoint) {
    return {
      accepted: true,
      point: normalized,
      distanceDeltaM: 0,
      rawHorizontalDistanceM: 0,
      verticalDeltaM: 0,
      derivedSpeedMps: 0,
      accelerationMps2: null,
      motionState: getMotionState(0, typeof normalized.speed === "number" ? normalized.speed : 0),
      confidence,
      timeDeltaMs: 0,
      nextStationaryPointStreak: 0,
      reason: "accepted",
    };
  }

  const deltaMs = normalized.t - lastAcceptedPoint.t;
  if (deltaMs <= 0) {
    return {
      accepted: false,
      ...missingResult,
      confidence,
      nextStationaryPointStreak: stationaryPointStreak,
      reason: "duplicate_timestamp",
    };
  }

  // Horizontal distance comes from latitude/longitude only. Vertical altitude changes are tracked
  // separately and must never inflate walking pace or distance.
  const rawDistanceM = haversineMeters(lastAcceptedPoint, normalized);
  const verticalDeltaM =
    typeof normalized.altitude === "number" && typeof lastAcceptedPoint.altitude === "number"
      ? normalized.altitude - lastAcceptedPoint.altitude
      : 0;
  const derivedSpeedMps = rawDistanceM / (deltaMs / 1000);
  const reportedSpeedMps =
    typeof normalized.speed === "number" && normalized.speed >= 0 ? normalized.speed : 0;
  const speedForValidation = Math.max(derivedSpeedMps, reportedSpeedMps);
  const motionState = getMotionState(rawDistanceM, speedForValidation);
  const previousSpeedMps =
    secondLastAcceptedPoint
      ? haversineMeters(secondLastAcceptedPoint, lastAcceptedPoint) /
        Math.max(1, (lastAcceptedPoint.t - secondLastAcceptedPoint.t) / 1000)
      : null;
  const accelerationMps2 =
    previousSpeedMps !== null
      ? Math.abs(derivedSpeedMps - previousSpeedMps) / Math.max(1, deltaMs / 1000)
      : null;

  // Ignore tiny hops that are usually stationary GPS drift, not real walking progress.
  if (rawDistanceM < GPS_MIN_DISTANCE_METERS) {
    const nextStationaryPointStreak = stationaryPointStreak + 1;
    return {
      accepted: false,
      ...missingResult,
      confidence,
      rawHorizontalDistanceM: rawDistanceM,
      verticalDeltaM,
      derivedSpeedMps,
      accelerationMps2,
      motionState,
      nextStationaryPointStreak,
      reason: "too_close",
    };
  }

  // If a point arrives very quickly, require more than the base jitter floor before trusting it.
  if (deltaMs < GPS_MIN_TIME_BETWEEN_POINTS_MS && rawDistanceM < GPS_MIN_DISTANCE_METERS * 2) {
    return {
      accepted: false,
      ...missingResult,
      confidence,
      rawHorizontalDistanceM: rawDistanceM,
      verticalDeltaM,
      derivedSpeedMps,
      accelerationMps2,
      motionState,
      nextStationaryPointStreak: stationaryPointStreak,
      reason: "too_close",
    };
  }

  const nextStationaryPointStreak =
    motionState === "stationary"
      ? stationaryPointStreak + 1
      : 0;

  if (nextStationaryPointStreak >= GPS_STATIONARY_CONFIRMATION_POINTS) {
    return {
      accepted: false,
      ...missingResult,
      confidence,
      rawHorizontalDistanceM: rawDistanceM,
      verticalDeltaM,
      derivedSpeedMps,
      accelerationMps2,
      motionState,
      nextStationaryPointStreak,
      reason: "too_close",
    };
  }

  if (Math.abs(verticalDeltaM) > GPS_MAX_VERTICAL_SPIKE_METERS && rawDistanceM < GPS_MIN_DISTANCE_METERS * 2) {
    return {
      accepted: false,
      ...missingResult,
      confidence,
      rawHorizontalDistanceM: rawDistanceM,
      verticalDeltaM,
      derivedSpeedMps,
      accelerationMps2,
      motionState,
      nextStationaryPointStreak,
      reason: "elevation_spike",
    };
  }

  if (
    secondLastAcceptedPoint &&
    rawDistanceM >= GPS_MIN_DISTANCE_METERS * 2 &&
    confidence !== "high"
  ) {
    const previousDistanceM = haversineMeters(secondLastAcceptedPoint, lastAcceptedPoint);
    if (previousDistanceM >= GPS_MIN_DISTANCE_METERS) {
      const previousBearing = bearingDegrees(secondLastAcceptedPoint, lastAcceptedPoint);
      const nextBearing = bearingDegrees(lastAcceptedPoint, normalized);
      if (bearingDeltaDegrees(previousBearing, nextBearing) > GPS_MAX_DIRECTION_CHANGE_DEGREES) {
        return {
          accepted: false,
          ...missingResult,
          confidence,
          rawHorizontalDistanceM: rawDistanceM,
          verticalDeltaM,
          derivedSpeedMps,
          accelerationMps2,
          motionState,
          nextStationaryPointStreak,
          reason: "direction_jump",
        };
      }
    }
  }

  // Anything faster than this is more likely a GPS jump than real walking/running movement.
  if (speedForValidation > GPS_MAX_REASONABLE_SPEED_MPS) {
    return {
      accepted: false,
      ...missingResult,
      confidence,
      rawHorizontalDistanceM: rawDistanceM,
      verticalDeltaM,
      derivedSpeedMps,
      accelerationMps2,
      motionState,
      nextStationaryPointStreak,
      reason: "too_fast",
    };
  }

  if (
    accelerationMps2 !== null &&
    accelerationMps2 > GPS_MAX_REASONABLE_ACCELERATION_MPS2 &&
    confidence !== "high"
  ) {
    return {
      accepted: false,
      ...missingResult,
      confidence,
      rawHorizontalDistanceM: rawDistanceM,
      verticalDeltaM,
      derivedSpeedMps,
      accelerationMps2,
      motionState,
      nextStationaryPointStreak,
      reason: "acceleration_spike",
    };
  }

  const acceptedPoint = smoothPoint(lastAcceptedPoint, normalized, confidence, motionState);
  const acceptedDistanceM = haversineMeters(lastAcceptedPoint, acceptedPoint);
  // Smoothing is only for route quality. If a raw point already cleared validation, we should not
  // throw it away just because the smoothed position lands slightly closer to the prior point.
  // That edge case can cause short real walks to save as 0.00 mi when watcher updates arrive near
  // the 5 m OS threshold. In that case, keep the validated raw point as the accepted anchor.
  const finalAcceptedPoint =
    acceptedDistanceM < GPS_MIN_DISTANCE_METERS
      ? normalized
      : acceptedPoint;
  const finalAcceptedDistanceM =
    acceptedDistanceM < GPS_MIN_DISTANCE_METERS
      ? rawDistanceM
      : acceptedDistanceM;

  return {
    accepted: true,
    point: finalAcceptedPoint,
    distanceDeltaM: finalAcceptedDistanceM,
    rawHorizontalDistanceM: rawDistanceM,
    verticalDeltaM,
    derivedSpeedMps,
    accelerationMps2,
    motionState,
    confidence,
    timeDeltaMs: deltaMs,
    nextStationaryPointStreak: 0,
    reason: "accepted",
  };
}

export function calculateAcceptedRouteDistanceMeters(routePoints?: RoutePoint[] | null): number {
  if (!Array.isArray(routePoints) || routePoints.length < 2) return 0;

  let totalMeters = 0;

  for (let index = 1; index < routePoints.length; index += 1) {
    const previous = routePoints[index - 1];
    const current = routePoints[index];
    if (!previous || !current) continue;

    const horizontalDistanceM = haversineMeters(previous, current);
    if (!Number.isFinite(horizontalDistanceM) || horizontalDistanceM <= 0) continue;

    totalMeters += horizontalDistanceM;
  }

  return totalMeters;
}
