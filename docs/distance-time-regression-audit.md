# Distance/Time Regression Audit

## Root Cause

The regression came from a fragile post-walk handoff, not from Google Maps doing any distance math.

Before this fix:
- `app/walk.tsx` only saved `routePoints` into the completed draft.
- `app/complete.tsx` trusted router params as the source of truth for `durationSec`, `movingTimeSec`, `pausedTimeSec`, and `distanceM`.
- `app/reflection.tsx` forwarded `durationSec` and `distanceM`, but dropped `movingTimeSec` and `pausedTimeSec`.
- `src/components/PostWalkSummaryScreen.tsx` rebuilt the final summary mostly from params instead of preferring the saved activity/session.

That meant the final tracked values were split across multiple handoffs:
- route points in AsyncStorage draft
- elapsed/distance in router params
- saved session in local storage / Firestore

Once the post-walk flow was refactored, there was no single authoritative post-walk payload. If the navigation handoff was stale, incomplete, or zeroed, the completion and summary screens could display incorrect time/distance even though the live walk screen had tracked more useful data.

## Files Changed

- `/Users/stevencook/dev/client-production/step-outside-v2/src/lib/activeWalk.ts`
- `/Users/stevencook/dev/client-production/step-outside-v2/app/walk.tsx`
- `/Users/stevencook/dev/client-production/step-outside-v2/app/complete.tsx`
- `/Users/stevencook/dev/client-production/step-outside-v2/app/reflection.tsx`
- `/Users/stevencook/dev/client-production/step-outside-v2/src/components/PostWalkSummaryScreen.tsx`

## Before Data Flow

1. Live walk tracked:
   - elapsed time in component state/refs
   - moving time in component refs
   - filtered distance in component refs
   - accepted route points in memory
2. Stop walk:
   - saved only `routePoints` to completed draft
   - sent time/distance through router params
3. Complete screen:
   - re-read route points from draft
   - re-read time/distance from params
   - saved session from that split payload
4. Reflection screen:
   - forwarded only part of the tracked data
5. Final summary:
   - preferred params over the saved session

## After Data Flow

1. Live walk tracks:
   - `elapsedTimeSec`
   - `movingTimeSec`
   - `pausedTimeSec`
   - filtered `distanceM`
   - accepted `routePoints`
2. Stop walk:
   - writes one completed draft containing:
     - `id`
     - `startedAt`
     - `endedAt`
     - `durationSec`
     - `elapsedTimeSec`
     - `movingTimeSec`
     - `pausedTimeSec`
     - `distanceM`
     - `source`
     - `routePoints`
3. Complete screen:
   - prefers the completed draft when it matches the walk being displayed
   - uses that draft as the authoritative save payload
4. Reflection screen:
   - forwards moving/paused timing too
5. Final summary:
   - prefers the saved session for elapsed/moving/distance/pace
   - falls back to params only if the session has not loaded yet

## Dev Logging Added

Development-only console logs were added at each handoff:

- `app/walk.tsx`
  - `[walk] stop-summary`
  - `[walk] completed-draft`
- `app/complete.tsx`
  - `[complete] resolved-handoff`
  - `[complete] saved-session`
- `app/reflection.tsx`
  - `[reflection] continue`
  - `[reflection] skip`
  - `[reflection] save-fallback`
- `src/components/PostWalkSummaryScreen.tsx`
  - `[summary] received-activity`

These logs include:
- live elapsed seconds
- live moving seconds
- raw/accepted route point counts available at handoff
- filtered distance meters
- saved distance miles/meters
- saved activity ID
- summary screen received activity object

## Test Checklist

1. Start a GPS walk outdoors.
2. Confirm live walk screen shows elapsed time increasing.
3. Confirm live walk screen shows distance increasing.
4. Stop the walk after at least 1-2 minutes.
5. On the completion screen, verify:
   - headline minute summary matches the tracked duration
   - time card matches elapsed time
   - distance card matches the live tracked distance
   - route preview appears if route points were captured
6. Continue to reflection.
7. Skip or save reflection.
8. On the final summary screen, verify:
   - elapsed time matches the completion screen
   - moving time is present if available
   - distance matches the tracked filtered distance
   - pace is present and based on saved session data
   - route preview appears if route points exist
9. In development, inspect console logs for:
   - `[walk] stop-summary`
   - `[complete] resolved-handoff`
   - `[complete] saved-session`
   - `[summary] received-activity`

## Remaining Notes

- Google Maps is display-only and does not calculate pace or distance.
- GPS filtering can still reject most points if real-world signal quality is poor, but the post-walk screens should now stay internally consistent with the data that actually made it through the tracker.
