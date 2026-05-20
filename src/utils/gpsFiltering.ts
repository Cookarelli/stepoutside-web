import type { RoutePoint } from "../lib/store";

export const GPS_MIN_DISTANCE_METERS = 3;
// Accuracy worse than 25 meters is too noisy for trustworthy walking distance.
export const GPS_MAX_ACCURACY_METERS = 25;
// 5.5 m/s is roughly a 4:53 mile pace, generous enough for short run bursts but not GPS spikes.
export const GPS_MAX_REASONABLE_SPEED_MPS = 5.5;
// Points arriving within 3 seconds need more than trivial movement to avoid dot-jitter accumulation.
export const GPS_MIN_TIME_BETWEEN_POINTS_MS = 3000;
// Speeds near zero are usually standing still, even if GPS wanders a little bit.
export const GPS_STATIONARY_SPEED_MPS = 0.4;
// Require a couple of consecutive "still" samples before treating the user as stationary drift.
export const GPS_STATIONARY_CONFIRMATION_POINTS = 2;

const GPS_SMOOTHING_WEIGHT = 0.2;

type GpsFilterInput = {
  point: Partial<RoutePoint> | null | undefined;
  lastAcceptedPoint: RoutePoint | null;
  isTracking: boolean;
  stationaryPointStreak?: number;
};

export type GpsFilterResult =
  | {
      accepted: true;
      point: RoutePoint;
      distanceDeltaM: number;
      timeDeltaMs: number;
      nextStationaryPointStreak: number;
      reason: "accepted";
    }
  | {
      accepted: false;
      point: null;
      distanceDeltaM: 0;
      timeDeltaMs: 0;
      nextStationaryPointStreak: number;
      reason:
        | "paused"
        | "missing-coordinates"
        | "accuracy"
        | "non-monotonic-time"
        | "jitter"
        | "too-frequent"
        | "speed-spike"
        | "stationary";
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

function smoothPoint(previous: RoutePoint, next: RoutePoint): RoutePoint {
  // Light smoothing reduces dot-jitter while preserving the actual route shape.
  return {
    ...next,
    lat: previous.lat + (next.lat - previous.lat) * (1 - GPS_SMOOTHING_WEIGHT),
    lng: previous.lng + (next.lng - previous.lng) * (1 - GPS_SMOOTHING_WEIGHT),
  };
}

export function filterGpsPoint({
  point,
  lastAcceptedPoint,
  isTracking,
  stationaryPointStreak = 0,
}: GpsFilterInput): GpsFilterResult {
  if (!isTracking) {
    return {
      accepted: false,
      point: null,
      distanceDeltaM: 0,
      timeDeltaMs: 0,
      nextStationaryPointStreak: stationaryPointStreak,
      reason: "paused",
    };
  }

  const normalized = normalizePoint(point);
  if (!normalized) {
    return {
      accepted: false,
      point: null,
      distanceDeltaM: 0,
      timeDeltaMs: 0,
      nextStationaryPointStreak: stationaryPointStreak,
      reason: "missing-coordinates",
    };
  }

  if (
    typeof normalized.accuracy === "number" &&
    normalized.accuracy > GPS_MAX_ACCURACY_METERS
  ) {
    return {
      accepted: false,
      point: null,
      distanceDeltaM: 0,
      timeDeltaMs: 0,
      nextStationaryPointStreak: stationaryPointStreak,
      reason: "accuracy",
    };
  }

  if (!lastAcceptedPoint) {
    return {
      accepted: true,
      point: normalized,
      distanceDeltaM: 0,
      timeDeltaMs: 0,
      nextStationaryPointStreak: 0,
      reason: "accepted",
    };
  }

  const deltaMs = normalized.t - lastAcceptedPoint.t;
  if (deltaMs <= 0) {
    return {
      accepted: false,
      point: null,
      distanceDeltaM: 0,
      timeDeltaMs: 0,
      nextStationaryPointStreak: stationaryPointStreak,
      reason: "non-monotonic-time",
    };
  }

  const rawDistanceM = haversineMeters(lastAcceptedPoint, normalized);

  // Ignore tiny hops that are usually stationary GPS drift, not real walking progress.
  if (rawDistanceM < GPS_MIN_DISTANCE_METERS) {
    const nextStationaryPointStreak = stationaryPointStreak + 1;
    return {
      accepted: false,
      point: null,
      distanceDeltaM: 0,
      timeDeltaMs: 0,
      nextStationaryPointStreak,
      reason:
        nextStationaryPointStreak >= GPS_STATIONARY_CONFIRMATION_POINTS ? "stationary" : "jitter",
    };
  }

  // If a point arrives very quickly, require more than the base jitter floor before trusting it.
  if (deltaMs < GPS_MIN_TIME_BETWEEN_POINTS_MS && rawDistanceM < GPS_MIN_DISTANCE_METERS * 2) {
    return {
      accepted: false,
      point: null,
      distanceDeltaM: 0,
      timeDeltaMs: 0,
      nextStationaryPointStreak: stationaryPointStreak,
      reason: "too-frequent",
    };
  }

  const derivedSpeedMps = rawDistanceM / (deltaMs / 1000);
  const reportedSpeedMps =
    typeof normalized.speed === "number" && normalized.speed >= 0 ? normalized.speed : 0;
  const speedForValidation = Math.max(derivedSpeedMps, reportedSpeedMps);

  const nextStationaryPointStreak =
    reportedSpeedMps > 0 && reportedSpeedMps <= GPS_STATIONARY_SPEED_MPS
      ? stationaryPointStreak + 1
      : 0;

  if (nextStationaryPointStreak >= GPS_STATIONARY_CONFIRMATION_POINTS) {
    return {
      accepted: false,
      point: null,
      distanceDeltaM: 0,
      timeDeltaMs: 0,
      nextStationaryPointStreak,
      reason: "stationary",
    };
  }

  // Anything faster than this is more likely a GPS jump than real walking/running movement.
  if (speedForValidation > GPS_MAX_REASONABLE_SPEED_MPS) {
    return {
      accepted: false,
      point: null,
      distanceDeltaM: 0,
      timeDeltaMs: 0,
      nextStationaryPointStreak: stationaryPointStreak,
      reason: "speed-spike",
    };
  }

  const acceptedPoint = smoothPoint(lastAcceptedPoint, normalized);
  const acceptedDistanceM = haversineMeters(lastAcceptedPoint, acceptedPoint);

  // Re-check after smoothing so nearly identical accepted points still do not count as movement.
  if (acceptedDistanceM < GPS_MIN_DISTANCE_METERS) {
    const smoothedStationaryStreak = stationaryPointStreak + 1;
    return {
      accepted: false,
      point: null,
      distanceDeltaM: 0,
      timeDeltaMs: 0,
      nextStationaryPointStreak: smoothedStationaryStreak,
      reason:
        smoothedStationaryStreak >= GPS_STATIONARY_CONFIRMATION_POINTS ? "stationary" : "jitter",
    };
  }

  return {
    accepted: true,
    point: acceptedPoint,
    distanceDeltaM: acceptedDistanceM,
    timeDeltaMs: deltaMs,
    nextStationaryPointStreak: 0,
    reason: "accepted",
  };
}
