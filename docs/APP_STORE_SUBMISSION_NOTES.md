# App Store Submission Notes (Template)

## What changed in this build
- Fixed app navigation structure and tab layout.
- Improved session tracking flow (start/pause/resume/end) and completion persistence.
- Added clear location permission purpose string and tightened platform permission config.
- Removed template/demo screens from primary app flow.
- Updated app version/build metadata for resubmission.

## App Review Notes (paste into App Store Connect)
Step Outside helps users track short outdoor walks.

- Location usage: the app requests **foreground location only** while a walk is being actively tracked.
- Data handling: walk session data is stored locally on-device for stats/streaks.
- No account is required to use core functionality.

Reviewer steps:
1. Open app and tap **START**.
2. On the walk screen, allow location permission when prompted.
3. Walk for ~10+ seconds, then tap **END**.
4. On completion screen, tap **VIEW STATS** to confirm saved session/streak.

If GPS is unavailable in review environment, timer still advances and core flow remains testable.

## Release Notes (customer-facing)
- Improved walk tracking reliability and session save behavior.
- Refined navigation and overall app stability.
- Better permissions messaging and setup for location-based distance/pace.
- UI polish across home, walk, and stats screens.

## Pre-submit TODOs
- Replace placeholder privacy policy URL in `app/(tabs)/explore.tsx` with your live URL.
- Confirm the final `ios.bundleIdentifier` and `android.package` values in `app.json` match your production app records.
