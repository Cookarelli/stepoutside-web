import type { RoutePoint } from "../lib/store";

// Ignore tiny barometric/GPS altitude wiggles under 3 meters.
export const ELEVATION_MIN_GAIN_DELTA_METERS = 3;
// Ignore huge single-step jumps that are more likely bad altitude samples than real terrain.
export const ELEVATION_MAX_STEP_CHANGE_METERS = 30;
const METERS_TO_FEET = 3.28084;

export function calculateElevationGain(routePoints?: RoutePoint[] | null): {
  elevationGainMeters: number;
  elevationGainFeet: number;
} | null {
  if (!Array.isArray(routePoints) || routePoints.length < 2) return null;

  // Elevation gain is metadata only. It is intentionally calculated separately so vertical movement
  // never inflates horizontal pace or distance in walking/hiking summaries.

  let totalGainMeters = 0;
  let lastAltitude: number | null = null;
  let seenAltitudePoint = false;

  for (const point of routePoints) {
    const altitude =
      typeof point?.altitude === "number" && Number.isFinite(point.altitude) ? point.altitude : null;

    if (altitude === null) continue;

    if (lastAltitude === null) {
      lastAltitude = altitude;
      seenAltitudePoint = true;
      continue;
    }

    const deltaMeters = altitude - lastAltitude;
    lastAltitude = altitude;
    seenAltitudePoint = true;

    if (Math.abs(deltaMeters) < ELEVATION_MIN_GAIN_DELTA_METERS) {
      continue;
    }

    if (Math.abs(deltaMeters) > ELEVATION_MAX_STEP_CHANGE_METERS) {
      continue;
    }

    if (deltaMeters > 0) {
      totalGainMeters += deltaMeters;
    }
  }

  if (!seenAltitudePoint) return null;

  return {
    elevationGainMeters: Math.max(0, Math.round(totalGainMeters)),
    elevationGainFeet: Math.max(0, Math.round(totalGainMeters * METERS_TO_FEET)),
  };
}
