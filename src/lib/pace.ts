const METERS_PER_MILE = 1609.344;

export const FIRST_AVERAGE_PACE_DISTANCE_METERS = 0.01 * METERS_PER_MILE;
export const MIN_PLAUSIBLE_WALKING_PACE_SEC_PER_MILE = 10 * 60;
export const MAX_PLAUSIBLE_WALKING_PACE_SEC_PER_MILE = 35 * 60;

function formatPaceSeconds(totalSecondsPerMile: number): string {
  const roundedSeconds = Math.max(1, Math.round(totalSecondsPerMile));
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")} / mi`;
}

export function computeAveragePaceSecPerMile(
  acceptedDistanceM: number,
  activeDurationSec: number
): number | null {
  if (
    !Number.isFinite(acceptedDistanceM) ||
    !Number.isFinite(activeDurationSec) ||
    acceptedDistanceM <= 0 ||
    activeDurationSec <= 0
  ) {
    return null;
  }

  const miles = acceptedDistanceM / METERS_PER_MILE;
  const paceSecPerMile = activeDurationSec / miles;
  return Number.isFinite(paceSecPerMile) && paceSecPerMile > 0 ? paceSecPerMile : null;
}

export function formatAverageWalkingPace(
  acceptedDistanceM: number,
  activeDurationSec: number
): string | null {
  if (acceptedDistanceM < FIRST_AVERAGE_PACE_DISTANCE_METERS) {
    return null;
  }

  const paceSecPerMile = computeAveragePaceSecPerMile(acceptedDistanceM, activeDurationSec);
  if (
    paceSecPerMile === null ||
    paceSecPerMile < MIN_PLAUSIBLE_WALKING_PACE_SEC_PER_MILE ||
    paceSecPerMile > MAX_PLAUSIBLE_WALKING_PACE_SEC_PER_MILE
  ) {
    return null;
  }

  return formatPaceSeconds(paceSecPerMile);
}

export function computeInstantPaceSecPerMile(speedMps: number | null | undefined): number | null {
  if (typeof speedMps !== "number" || !Number.isFinite(speedMps) || speedMps <= 0) {
    return null;
  }

  const paceSecPerMile = METERS_PER_MILE / speedMps;
  return Number.isFinite(paceSecPerMile) && paceSecPerMile > 0 ? paceSecPerMile : null;
}
