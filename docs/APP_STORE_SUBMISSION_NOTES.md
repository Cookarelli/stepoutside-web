# App Store Submission Notes

## What changed in this build
- Fixed active walk recovery so users return to the current walk instead of being prompted to start over.
- Added sunrise quotes, sunset nudges, and streak-save reminder preferences.
- Added smarter nearby route suggestions with ZIP fallback plus indoor walk options.
- Connected the Pro screen to live RevenueCat offerings, purchase, and restore flows.
- Updated release metadata for the next App Store submission.

## App Review Notes (paste into App Store Connect)
Step Outside helps people take short walks, keep a streak going, and discover quick nearby routes.

- Location usage: the app requests **foreground location only** while a walk is being actively tracked, or to suggest nearby short routes if the user chooses location-based suggestions.
- Notifications: optional local reminders can be enabled for sunrise quotes, sunset nudges, and streak-save reminders.
- Purchases: optional Pro subscription / lifetime purchase is available through Apple in the Pro screen. Restore purchases is supported.
- Data handling: walk session data is stored locally on-device for stats and streaks. Route suggestions are read from a public route catalog.
- No account is required to use core functionality.

Reviewer steps:
1. Open app and tap **START**.
2. On the walk screen, allow location permission when prompted.
3. Walk for ~10+ seconds, then tap **END**.
4. On completion screen, tap **VIEW STATS** to confirm saved session/streak.
5. Optional: open **Steps** and deny location, then enter ZIP `78701` or `10018` to verify route suggestions still appear without device location.
6. Optional: open **Pro** to view available plans and the restore purchases action.

If GPS is unavailable in review environment, timer still advances and core flow remains testable.

## Release Notes (customer-facing)
- Better walk recovery when you return to the app mid-walk.
- New daily motivation with sunrise quotes, sunset nudges, and streak reminders.
- Nearby quick-walk suggestions with ZIP fallback and indoor options.
- Pro screen now supports live plans, purchase restore, and improved polish.

## Pre-submit TODOs
- Confirm the privacy policy URL in `app/(tabs)/explore.tsx` is final copy for App Store review.
- Confirm the live RevenueCat products and entitlement mapping are active in App Store / RevenueCat.
