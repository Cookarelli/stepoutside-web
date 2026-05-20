# Step Outside GPS Accuracy Audit

## Scope

This audit covers the current Step Outside walk tracking flow and the places where GPS/location, distance, pace, route storage, pause/resume, and elapsed time are handled.

Primary tracking implementation:

- [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:23)

Related persistence and saved-session handling:

- [src/lib/activeWalk.ts](/Users/stevencook/dev/client-production/step-outside-v2/src/lib/activeWalk.ts:1)
- [src/lib/store.ts](/Users/stevencook/dev/client-production/step-outside-v2/src/lib/store.ts:11)
- [app/complete.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/complete.tsx:91)

Other non-tracking location usage in the app:

- [app/(tabs)/index.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/(tabs)/index.tsx:275)
- [app/(tabs)/steps.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/(tabs)/steps.tsx:161)
- [src/lib/notifications.ts](/Users/stevencook/dev/client-production/step-outside-v2/src/lib/notifications.ts:135)

## Current location provider/package

- The app uses `expo-location` for all GPS/location access.
- Continuous walk tracking uses `Location.watchPositionAsync(...)` in [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:272).
- Nearby-content and reminder flows use one-shot location reads with `getCurrentPositionAsync(...)` and `getLastKnownPositionAsync(...)`, but those are not part of live distance tracking.

## Where location updates are requested

### Live walk tracking

File:

- [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:265)

Behavior:

- Requests foreground permission with `getForegroundPermissionsAsync()` and `requestForegroundPermissionsAsync()` in [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:212) and [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:225).
- Starts continuous tracking with `Location.watchPositionAsync(...)` in [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:272).

Current tracking settings:

- Accuracy: `Location.Accuracy.BestForNavigation`
- Time interval: `1000` ms
- Distance interval: `3` meters

Source:

- [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:274)

### Home screen location

File:

- [app/(tabs)/index.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/(tabs)/index.tsx:275)

Behavior:

- Uses foreground permission.
- Uses `getLastKnownPositionAsync()` first, then `getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })`.
- This is for weather/reset suggestions, not walk distance tracking.

### Steps/nearby route suggestions

Files:

- [app/(tabs)/steps.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/(tabs)/steps.tsx:161)
- [app/(tabs)/steps.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/(tabs)/steps.tsx:360)

Behavior:

- Uses one-shot location lookup with `Location.Accuracy.Balanced`.
- Not part of walk distance or pace tracking.

### Notifications sunrise/sunset lookup

File:

- [src/lib/notifications.ts](/Users/stevencook/dev/client-production/step-outside-v2/src/lib/notifications.ts:135)

Behavior:

- Uses one-shot location lookup with `Location.Accuracy.Balanced`.
- Not part of walk distance or pace tracking.

## Where distance is calculated

### Live walk distance

File:

- [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:23)

Implementation:

- Distance is calculated with a local `haversineMeters(a, b)` helper.
- On each accepted GPS update, the app measures the straight-line distance from the previous point to the new point.
- That segment is added to `distanceRef.current`.

Source:

- Segment distance: [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:301)
- Distance accumulation: [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:305)

### Saved session distance

Files:

- [app/complete.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/complete.tsx:112)
- [src/lib/store.ts](/Users/stevencook/dev/client-production/step-outside-v2/src/lib/store.ts:200)

Behavior:

- The final distance saved for a walk is the rounded `distanceRef.current` value from the live tracker.
- No post-processing or recomputation is done from the route polyline before save.

## Where pace is calculated

### Live pace shown during the walk

File:

- [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:43)

Implementation:

- Pace is calculated as:
  - `miles = distanceM / 1609.344`
  - `totalSecondsPerMile = elapsedSec / miles`
- The UI displays `elapsed time / total distance`.

Source:

- [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:46)
- [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:49)

### Saved pace in stored sessions

File:

- [src/lib/store.ts](/Users/stevencook/dev/client-production/step-outside-v2/src/lib/store.ts:179)

Implementation:

- Stored pace is computed the same way:
  - `durationSec / miles`
- It uses total elapsed duration, not moving time.

## Where route points are stored

### In-memory during the walk

File:

- [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:286)

Point shape:

- `lat`
- `lng`
- `t`
- `accuracy` if available
- `altitude` if available
- `speed` if available

Type definition:

- [src/lib/store.ts](/Users/stevencook/dev/client-production/step-outside-v2/src/lib/store.ts:11)

### Active-walk snapshot

File:

- [src/lib/activeWalk.ts](/Users/stevencook/dev/client-production/step-outside-v2/src/lib/activeWalk.ts:5)

Behavior:

- While a walk is active or paused, `elapsedSec`, `distanceM`, `routePoints`, `running`, and timestamps are periodically persisted to AsyncStorage.

Source:

- [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:419)

### Completed-walk draft

Files:

- [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:408)
- [src/lib/activeWalk.ts](/Users/stevencook/dev/client-production/step-outside-v2/src/lib/activeWalk.ts:10)

Behavior:

- On stop, route points are copied into a completed-walk draft before the app routes to the completion screen.

### Saved sessions

Files:

- [app/complete.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/complete.tsx:112)
- [src/lib/store.ts](/Users/stevencook/dev/client-production/step-outside-v2/src/lib/store.ts:837)

Behavior:

- `addCompletedSession(...)` saves summary data for all users.
- Route points are only included in the stored session when `getPremiumStatus().isPremium` is true.

Source:

- [src/lib/store.ts](/Users/stevencook/dev/client-production/step-outside-v2/src/lib/store.ts:840)

## Current filtering of bad GPS points

### What exists today

File:

- [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:283)

Current filters:

- Rejects points when `accuracy > 35` meters.
- Rejects segments smaller than `2` meters.
- Rejects segments `>= 80` meters.

Source:

- Accuracy filter: [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:283)
- Distance filter: [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:304)

### What does not exist today

- No smoothing across multiple points
- No rolling average
- No bearing/heading consistency filter
- No speed sanity check, even though `speed` is captured
- No requirement for multiple stable points before distance begins
- No special stationary-drift suppression beyond the `2` meter minimum
- No accuracy-weighted distance correction
- No pause-resume gap correction beyond resetting the last point anchor

## Pause/resume behavior

Files:

- [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:535)
- [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:555)

Behavior:

- On pause:
  - elapsed time is synced once
  - timer stops
  - GPS watcher stops
  - `lastPointRef` is cleared by `stopGps(...)`
- On resume:
  - elapsed timer restarts from the paused total
  - GPS watcher restarts
  - the first resumed GPS point becomes the new anchor point
  - no segment is counted from the pre-pause point to the first post-resume point

Sources:

- Pause stops GPS and timer: [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:543)
- Resume restarts GPS and timer: [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:564)
- `stopGps(...)` clears `lastPointRef`: [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:248)

Conclusion:

- Paused time is ignored by the elapsed timer.
- Paused GPS points are ignored because tracking callback only processes points while `phaseRef.current === "tracking"`.
- Pause/resume is not the main cause of inflated distance in the current implementation.

## Elapsed time vs moving time

### Current implementation

File:

- [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:339)

Behavior:

- The app tracks only one time dimension: `elapsedSec`.
- `elapsedSec` is wall-clock time while the walk is actively running.
- There is no separate `movingTimeSec`.
- There is no auto-pause when speed drops to zero or GPS drift suggests the user is standing still.

Sources:

- Elapsed clock: [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:339)
- Pause freezes elapsed accumulation: [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:539)
- Saved pace also uses `durationSec`: [src/lib/store.ts](/Users/stevencook/dev/client-production/step-outside-v2/src/lib/store.ts:179)

Conclusion:

- Pace is based on total active elapsed time, not moving time.
- That means pauses are handled correctly when the user presses Pause.
- But if the user is standing still without pausing, stationary drift can still add distance while elapsed time keeps rising.

## Whether stationary GPS drift is counted

Yes, potentially.

Why:

- The app accepts any point with reported accuracy `<= 35m`.
- It counts any accepted segment between `2m` and `< 80m`.
- At a 1 second polling interval, small GPS wobble of 2 to 6 meters can repeatedly count as real movement.
- There is no “must be moving” check using speed.
- There is no “ignore drift while nearly stationary” rule.

Source:

- [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:272)
- [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:283)
- [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:304)

## Why pace may be inflated

Important clarification:

- “Inflated” pace in the screenshot means the app is showing a pace that is too fast.
- That happens when the app overestimates distance relative to elapsed time.

Example from the screenshot:

- `3:59` elapsed with `0.30 mi`
- That yields about `13:15 / mi`
- If the real distance was smaller, the calculated pace would look artificially fast

Most likely causes in the current code:

1. Stationary drift is still countable
- A `2m` minimum is too low for 1-second GPS sampling in a walking app.
- Small wander can accumulate quickly over a short session.

2. The accuracy gate is permissive for walking-grade precision
- `accuracy <= 35m` allows points that are still noisy enough to distort short-distance totals.

3. No speed-based filtering
- The app records `speed`, but does not use it to reject implausible walking segments or drift.

4. No smoothing or stabilization period
- The first accepted point immediately becomes the tracking anchor.
- The app does not wait for a few stable readings before counting distance.

5. Distance is accumulated segment-by-segment at 1 second cadence
- Frequent short hops create a “polyline wobble” effect.
- Even if each hop is small, the sum can be meaningfully too large.

## Bottom-line assessment

The current overestimation is most likely coming from live GPS segment accumulation in [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:301), not from the persistence layer.

Most likely root cause:

- high-frequency GPS sampling
- permissive accepted accuracy
- very low minimum movement threshold
- no stationary-drift suppression
- no moving-time concept

## Most relevant code references

- Live GPS watcher: [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:272)
- Segment acceptance logic: [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:301)
- Live pace formula: [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:43)
- Active snapshot persistence: [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:419)
- Restore path for active walk: [app/walk.tsx](/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx:733)
- Saved pace formula: [src/lib/store.ts](/Users/stevencook/dev/client-production/step-outside-v2/src/lib/store.ts:179)
- Completed session save: [src/lib/store.ts](/Users/stevencook/dev/client-production/step-outside-v2/src/lib/store.ts:837)

## Suggested next focus

If we do a fix pass later, the highest-value candidates to test first are:

1. Raise the minimum accepted segment threshold above `2m`
2. Tighten the allowed accuracy threshold below `35m`
3. Add stationary drift rejection using `speed`, repeated near-identical points, or both
4. Delay distance accumulation until GPS stabilizes for a few points
5. Consider tracking `movingTime` separately from `elapsedSec`
