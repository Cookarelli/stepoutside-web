import assert from "node:assert/strict";

import {
  GPS_THRESHOLDS,
  evaluateGpsPoint,
  formatWalkingPace,
  haversineMeters,
} from "../src/lib/gpsTracking";
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

assert.equal(formatWalkingPace(10, 10), "26:49 / mi", "useful early walking pace should appear after ten seconds");
assert.equal(formatWalkingPace(30, 10), null, "wild early pace spike should stay hidden");
assert.equal(formatWalkingPace(2, 10), null, "pace should wait for enough movement");
assert.equal(formatWalkingPace(GPS_THRESHOLDS.minPaceDistanceMeters - 1, 120), null);
assert.equal(formatWalkingPace(1609.344, 1_080), "18:00 / mi", "steady walking pace should format cleanly");

const staleReportedSpeed = { ...normalWalk, speed: 9 };
const staleReportedSpeedResult = evaluateGpsPoint(staleReportedSpeed, start);
assert(
  staleReportedSpeedResult.accepted,
  "stale reported speed should not reject normal walking movement"
);

console.log("[gps-sanity-check] passed");
