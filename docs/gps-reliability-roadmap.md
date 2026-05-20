# GPS Reliability Roadmap

## Goal

Make Step Outside reliable enough for production walking and hiking use, with user expectations closer to lightweight versions of Strava and AllTrails.

This roadmap reflects the current implementation in:

- `/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx`
- `/Users/stevencook/dev/client-production/step-outside-v2/src/utils/gpsFiltering.ts`
- `/Users/stevencook/dev/client-production/step-outside-v2/src/utils/pace.ts`
- `/Users/stevencook/dev/client-production/step-outside-v2/src/utils/elevation.ts`
- `/Users/stevencook/dev/client-production/step-outside-v2/src/lib/activeWalk.ts`
- `/Users/stevencook/dev/client-production/step-outside-v2/src/lib/store.ts`
- `/Users/stevencook/dev/client-production/step-outside-v2/src/components/RoutePreview.tsx`

## 1. Current Step Outside GPS Architecture

### Live tracking

- The app uses `expo-location` foreground `watchPositionAsync(...)` in `/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx`.
- Current watcher settings are tuned for walking:
  - best foreground accuracy available
  - `timeInterval` around 4 seconds
  - `distanceInterval` 5 meters
- The walk screen maintains in-memory refs for:
  - elapsed time
  - moving time
  - paused time
  - filtered distance
  - accepted route points
  - raw last point / accepted last point

### Point handling

- GPS points are filtered in `/Users/stevencook/dev/client-production/step-outside-v2/src/utils/gpsFiltering.ts`.
- The current filter:
  - validates coordinates
  - validates accuracy
  - rejects paused-state points
  - rejects duplicates
  - rejects tiny jitter hops
  - rejects speed spikes
  - rejects some directional / acceleration anomalies
  - rejects some vertical spike artifacts
- Accepted points are used for:
  - route storage
  - distance accumulation
  - moving time derivation
  - pace calculations

### Pace

- Pace logic is centralized in `/Users/stevencook/dev/client-production/step-outside-v2/src/utils/pace.ts`.
- It uses:
  - horizontal distance only
  - moving time when available
  - rolling pace smoothing for live display
- Elevation is intentionally excluded from pace math.

### Elevation

- Elevation gain is computed separately in `/Users/stevencook/dev/client-production/step-outside-v2/src/utils/elevation.ts`.
- It is treated as metadata only.
- It does not feed distance or pace.

### Persistence

- Active in-progress walk state is persisted in `/Users/stevencook/dev/client-production/step-outside-v2/src/lib/activeWalk.ts`.
- Completed sessions are normalized and saved through `/Users/stevencook/dev/client-production/step-outside-v2/src/lib/store.ts`.
- The app now has a clearer canonical saved session model using:
  - `elapsedTimeSec`
  - `movingTimeSec`
  - `pausedTimeSec`
  - `distanceM`
  - `routePoints`

### Route rendering

- Route display is handled in `/Users/stevencook/dev/client-production/step-outside-v2/src/components/RoutePreview.tsx`.
- Map rendering is now separated from tracking calculations.
- Google Maps is display-only when configured.
- Route simplification/smoothing is applied only for display.

### Debugging

- A dev-only GPS debug panel exists on the walk screen.
- It currently exposes:
  - raw point count
  - accepted point count
  - rejected point count
  - rejection reasons
  - raw vs filtered distance
  - current pace
  - rolling pace
  - motion state

## 2. Current Known Issues

Compared with user expectations from Strava and AllTrails, Step Outside is improving but still not fully production-stable.

### Activity recording

- The current tracker can record valid outdoor walks, but short walks are still vulnerable to undercounting if GPS lock is slow.
- The app has recently had regressions where completed walks showed `0.00 mi`, which indicates accepted-point flow and post-walk handoff need more real-device validation.

### Distance

- Distance is now based on filtered horizontal point pairs, which is directionally correct.
- However, thresholds remain sensitive:
  - too strict can cause undercounting / `0.00 mi`
  - too loose can cause overcounting and unrealistic pace
- Real-world calibration is still incomplete.

### Pace

- Pace is substantially better than before, but still sensitive to:
  - sparse points
  - short-walk startup noise
  - aggressive rolling display assumptions
- It is not yet as stable as Strava/AllTrails on all edge cases.

### Elevation

- Elevation is correctly separated from distance/pace.
- However, altitude from phones is inherently noisy, especially around stairs, indoors, and dense urban areas.

### Route rendering

- Display-only route rendering is now better isolated from saved tracking data.
- Google Maps integration is now safer, but route polish does not improve GPS truth.

### Pause/resume

- Pause/resume handling is significantly better:
  - paused points are ignored
  - paused time is separated
  - resume uses an anchor approach
- This still needs repeated device verification in real pause/resume scenarios.

### Background behavior

- The app does not currently do true background location recording like Strava.
- It persists snapshots and can restore state, but it is still fundamentally a foreground tracker.
- Lock-screen / background continuity is weaker than dedicated fitness apps.

### Bad GPS handling

- The app now rejects many bad samples.
- It still needs more field testing to ensure the filter is progressive instead of brittle.

## 3. What V1 Must Fix Before App Store Resubmission

These are launch-critical.

### Must-fix 1: Reliable short-walk recording

- A normal 1-minute outdoor walk must produce:
  - non-zero elapsed time
  - non-zero distance when GPS is available
  - no false `0.00 mi` unless GPS truly never locked

### Must-fix 2: Stable post-walk summary consistency

- Live walk, completion, reflection, and final summary must all show the same canonical:
  - elapsed time
  - moving time
  - paused time
  - distance

### Must-fix 3: No paused/stationary distance accumulation

- Standing still must not keep increasing distance.
- Paused walks must not accumulate route points or distance.

### Must-fix 4: Outdoor pace sanity

- Typical outdoor walking should not present wildly unrealistic pace.
- Pace must feel believable for casual walking, even if it is not “athlete-grade” yet.

### Must-fix 5: Friendly startup behavior

- Early GPS uncertainty must be messaged clearly.
- The app should prefer:
  - “GPS is still locking in”
  - or “Getting GPS...”
- instead of misleading zero-like output.

### Must-fix 6: Reproducible test protocol

- Before resubmission, every GPS change needs a repeatable real-world walk test.
- This is currently more important than adding new GPS features.

## 4. What Can Wait Until V1.1

These are valuable, but not required to safely resubmit.

- smarter motion classification using CoreMotion / activity recognition
- better background recording
- improved elevation smoothing / hill detection
- route map matching
- richer analytics around signal quality
- auto-pause / auto-resume
- per-activity modes like walk vs run vs hike
- more advanced route compression strategies

## 5. Recommended Architecture

### A. Location watcher

- Keep one foreground location watcher as the primary V1 tracker.
- Clearly separate:
  - watcher configuration
  - point ingestion
  - persistence
  - UI rendering

### B. Raw points buffer

- Maintain a raw buffer of all incoming watcher points in memory during an activity.
- Use raw points for:
  - debugging
  - diagnostics
  - future tuning
- Do not use raw points directly for user-facing distance.

### C. Filtered points

- Maintain a separate filtered accepted points array.
- This filtered array should be the only source for:
  - recorded route
  - distance accumulation
  - moving time derivation
  - pace derivation

### D. Canonical saved activity object

- Persist a single normalized saved activity object with:
  - `id`
  - `startedAt`
  - `endedAt`
  - `elapsedTimeSec`
  - `movingTimeSec`
  - `pausedTimeSec`
  - `distanceM`
  - `paceSecPerMile`
  - `routePoints`
  - `elevationGainMeters`
  - `source`
  - route metadata / bonuses
- All post-walk screens should read from this saved object by ID.

### E. Display-only route simplification

- Any smoothing, sampling, or simplification should happen only in the route preview layer.
- Never write simplified display points back into the saved activity.

### F. Debug panel

- Keep the dev-only debug panel.
- It should remain the primary tuning tool during V1.
- Minimum debug fields:
  - raw point count
  - accepted point count
  - rejected counts by reason
  - filtered distance
  - raw distance
  - current pace
  - motion state
  - latest accuracy

## 6. Minimum Acceptable Accuracy Targets

For App Store resubmission, V1 should meet these minimum expectations:

- distance within roughly `5–10%` on normal outdoor walks
- pace visually stable within a believable normal walking range
- no `0.00 mi` after a valid outdoor walk with usable GPS
- no distance accumulation while paused
- no distance accumulation while stationary
- post-walk screens always agree on final time/distance

These are not elite-athlete targets. They are consumer-trust targets.

## 7. Test Protocol

Every GPS build should run this same protocol on a real phone.

### Test 1: 1 minute short walk

- Start outdoors with good sky view.
- Walk for about 1 minute.
- Expect:
  - some accepted points
  - non-zero distance
  - no broken summary handoff

### Test 2: 10 minute normal walk

- Use a known neighborhood route.
- Compare distance against expectation or another trusted app.
- Expect distance within about 5–10%.

### Test 3: Pause/resume

- Walk for 2 minutes.
- Pause for 30–60 seconds while standing still.
- Resume and finish.
- Expect:
  - paused time recorded
  - no distance added while paused
  - resumed route continues cleanly

### Test 4: Stairs/elevation

- Include a short stairs or hill section.
- Expect:
  - no fake pace spike
  - no huge distance jump
  - elevation changes recorded as metadata only

### Test 5: Standing still

- Start a walk and stand still for 30–60 seconds.
- Expect:
  - near-zero or zero added distance
  - no aggressive pace output

### Test 6: Background / lock screen

- Start a walk.
- Lock the phone or background the app briefly.
- Return and finish.
- Expect:
  - active state restored
  - no corrupted final summary
  - no silent reset

## 8. Future Upgrades

### Apple Health / CoreMotion

- Use Apple motion/activity context to improve:
  - stationary detection
  - walking vs non-walking confidence
  - future auto-pause logic

### Background location refinement

- Move toward true background tracking if the product needs Strava-like continuity.
- This will likely require stricter product and battery decisions.

### Map matching

- Optional future enhancement for prettier route alignment.
- Should be display-only or analytics-only unless deliberately chosen otherwise.

### Apple Watch support

- Valuable long-term for a walking app, but not needed for V1 launch stability.

### Dedicated native module

- If Expo Location proves insufficient for reliable production activity tracking, a dedicated native module may be warranted.
- This should only happen after current filter and state-flow issues are fully characterized through testing.

## Comparison to Strava / AllTrails Expectations

### Strava-like expectations

- highly reliable start/stop behavior
- strong background handling
- stable pace
- mature auto-pause / movement classification
- aggressive field-tested filtering

Step Outside is not there yet.

### AllTrails-like expectations

- clear recorded route
- believable hiking/walking distance
- route history trustworthiness
- elevation shown as supporting metadata

Step Outside is closer to this target, but still needs V1 reliability hardening.

## Recommended Immediate Priority Order

1. Lock down canonical saved activity integrity.
2. Verify accepted-point flow on real device walks.
3. Tune the GPS filter until short outdoor walks reliably produce non-zero distance.
4. Re-run the full post-walk summary consistency test.
5. Only after that, revisit polish work like map visuals or advanced motion logic.

## Bottom Line

Step Outside now has the right architectural direction:

- filtered route points
- separated elevation metadata
- canonical saved sessions
- display-only route rendering
- debug tooling

But production GPS trust still depends on one thing above all else:

real repeated outdoor validation against a fixed test protocol, with filter tuning driven by those results rather than UI behavior alone.
