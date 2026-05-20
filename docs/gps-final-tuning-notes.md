# Step Outside GPS Final Tuning Notes

## What caused the pace to become too fast

The main regression after the earlier accurate outdoor pass was the newer live pace logic becoming more optimistic than the older overall moving pace logic.

Specific causes:

- Live pace started preferring a short rolling pace window by default.
- That rolling pace could react to a small cluster of favorable recent segments and display a faster pace than the broader walk average.
- GPS segment acceptance was still a bit too loose for normal outdoor walking:
  - minimum horizontal movement was only `3m`
  - max reasonable speed was still `5.5 m/s`
  - max accepted accuracy was still `25m`
- Stairs/elevation noise did not directly add altitude into distance, but unstable stairwell/downhill GPS could still create short horizontal jumps that looked like fast walking.

## What was changed

- Restored more conservative outdoor walking behavior.
- Kept elevation support only as display/metadata.
- Confirmed horizontal distance and pace are based on latitude/longitude only.
- Increased the minimum accepted horizontal movement.
- Lowered the maximum accepted walking speed.
- Tightened acceptable GPS accuracy.
- Tightened acceleration rejection.
- Kept rolling pace smoothing, but made it conservative:
  - live pace now prefers the slower of:
    - overall moving pace
    - rolling pace
- Increased the rolling pace window slightly to reduce short-term optimism.

## Current thresholds

- `GPS_MIN_DISTANCE_METERS = 5`
- `GPS_MAX_ACCURACY_METERS = 20`
- `GPS_MAX_REASONABLE_SPEED_MPS = 3.0`
- `GPS_MIN_TIME_BETWEEN_POINTS_MS = 4000`
- `GPS_LOW_CONFIDENCE_ACCURACY_METERS = 14`
- `GPS_MAX_REASONABLE_ACCELERATION_MPS2 = 2.2`
- `GPS_STATIONARY_SPEED_MPS = 0.4`
- `GPS_STATIONARY_CONFIRMATION_POINTS = 2`
- `GPS_MAX_DIRECTION_CHANGE_DEGREES = 115`
- `GPS_MAX_VERTICAL_SPIKE_METERS = 12`
- rolling pace window: `30000 ms`

## Elevation behavior

- Elevation gain is calculated separately from filtered route point altitude values.
- Elevation gain is display/metadata only.
- Elevation gain is **not** included in:
  - horizontal distance
  - moving time
  - pace

## How to test the next build

Run one controlled outdoor walk test:

1. Walk a known flat route for at least 10 to 15 minutes.
2. Keep the phone in a stable pocket or hand position.
3. Compare Step Outside against:
   - Apple Maps walking expectation
   - a known route length
   - another walking tracker if available
4. Check the dev GPS panel during the walk:
   - rejected points should increase when GPS gets noisy
   - rolling pace should not be faster than raw pace for long
   - accuracy should generally stay under `20m`
5. Pause once for 20 to 30 seconds:
   - distance should stop increasing
   - pace should settle after resume
6. If possible, do one short stairs/downhill segment:
   - watch for rejected points instead of a sudden fast pace jump
   - confirm altitude may change, but horizontal pace should stay believable

## Expected result

For a normal outdoor walk, Step Outside should return closer to the earlier, more believable range around `18–19 min/mi`, rather than dropping into artificially fast mid-15 pace unless the user is actually moving that quickly.
