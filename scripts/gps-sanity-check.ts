import assert from "node:assert/strict";

import {
  GPS_THRESHOLDS,
  evaluateGpsPoint,
  haversineMeters,
} from "../src/lib/gpsTracking";
import {
  FIRST_AVERAGE_PACE_DISTANCE_METERS,
  computeAveragePaceSecPerMile,
  computeInstantPaceSecPerMile,
  formatAverageWalkingPace,
} from "../src/lib/pace";
import type { RoutePoint } from "../src/lib/store";

function point(lat: number, lng: number, t: number, accuracy = 12): RoutePoint {
  return { lat, lng, t, accuracy };
}

const start = point(42.2705, -89.0940, 1_000, 10);
const normalWalk = point(42.27056, -89.0940, 6_000, 10);
const jitter = point(42.2705005, -89.0940, 6_000, 10);
const jump = point(42.2715, -89.0940, 7_000, 10);
const poorAccuracy = point(42.27056, -89.0940, 6_000, GPS_THRESHOLDS.maxAccuracyMeters + 1);

const distance = haversineMeters(start, normalWalk);
assert(distance > 4, "normal walking segment should measure more than noise floor");

const anchorResult = evaluateGpsPoint(start, null);
assert(anchorResult.accepted && anchorResult.kind === "anchor", "first valid point should become anchor");

const acceptedWalk = evaluateGpsPoint(normalWalk, start);
assert(acceptedWalk.accepted && acceptedWalk.kind === "distance", "normal walking point should be accepted");

const jitterResult = evaluateGpsPoint(jitter, start);
assert(
  !jitterResult.accepted &&
    (jitterResult.reason === "duplicate_coordinate" || jitterResult.reason === "too_close"),
  "tiny jitter should be ignored"
);

const jumpResult = evaluateGpsPoint(jump, start);
assert(!jumpResult.accepted, "impossible jump should be ignored");
assert(
  jumpResult.reason === "too_fast" || jumpResult.reason === "gps_jump",
  "jump should fail speed/jump guard"
);

const poorAccuracyResult = evaluateGpsPoint(poorAccuracy, start);
assert(!poorAccuracyResult.accepted && poorAccuracyResult.reason === "poor_accuracy");

assert.equal(
  formatAverageWalkingPace(FIRST_AVERAGE_PACE_DISTANCE_METERS, 12),
  "20:00 / mi",
  "average pace should appear after 0.01 miles without waiting 60 seconds"
);
assert.equal(
  formatAverageWalkingPace(FIRST_AVERAGE_PACE_DISTANCE_METERS - 1, 12),
  null,
  "average pace should wait for minimal accepted distance"
);
assert.equal(formatAverageWalkingPace(0, 12), null, "zero distance should keep showing Getting pace");
assert.equal(formatAverageWalkingPace(FIRST_AVERAGE_PACE_DISTANCE_METERS, 4), null, "insanely fast early pace should stay hidden");
assert.equal(formatAverageWalkingPace(FIRST_AVERAGE_PACE_DISTANCE_METERS, 50), null, "insanely slow early pace should stay hidden");
assert.equal(formatAverageWalkingPace(1609.344, 1_080), "18:00 / mi", "steady average walking pace should format cleanly");
assert.equal(computeAveragePaceSecPerMile(1609.344, 1_080), 1_080);
assert.equal(Math.round(computeInstantPaceSecPerMile(1.5) ?? 0), 1_073);

const staleReportedSpeed = { ...normalWalk, speed: 9 };
const staleReportedSpeedResult = evaluateGpsPoint(staleReportedSpeed, start);
assert(
  staleReportedSpeedResult.accepted,
  "stale reported speed should not reject normal walking movement"
);

console.log("[gps-sanity-check] passed");
