# Firebase Analytics Debugging

Step Outside uses native Firebase Analytics through `@react-native-firebase/analytics`, so analytics events only fire in an Expo dev-client, simulator/device build, or TestFlight/App Store build. Expo Go will not include the native Firebase Analytics SDK.

## Run Locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the dev client bundler:

   ```bash
   npm run start:dev-client
   ```

3. Build/run a native client when native code changes:

   ```bash
   npm run ios
   npm run android
   ```

   For EAS builds, use the `development` profile so DebugView can receive events from a real native app.

## iOS DebugView

1. Build and install the iOS dev client or TestFlight build that includes `GoogleService-Info.plist`.
2. In Xcode, open the scheme for the app target and add this launch argument:

   ```text
   -FIRDebugEnabled
   ```

3. Relaunch the app from Xcode.
4. Open Firebase Console > Analytics > DebugView and select the iOS device.
5. To disable debug mode later, launch once with:

   ```text
   -FIRDebugDisabled
   ```

## Android DebugView

1. Build and install an Android native build that includes `google-services.json`.
2. Enable analytics debug mode:

   ```bash
   adb shell setprop debug.firebase.analytics.app com.stevencook.stepoutside
   ```

3. Relaunch the app.
4. Open Firebase Console > Analytics > DebugView and select the Android device.
5. Disable debug mode when finished:

   ```bash
   adb shell setprop debug.firebase.analytics.app .none.
   ```

## GA4 Realtime

Use GA4 Realtime for a broader smoke test after DebugView is working. Realtime can lag by a few minutes; DebugView is the faster source while testing a native build.

## Expected Test Session

During one clean test pass, trigger these events:

- Launch app: `app_open`, `first_session` on the first local install.
- Visit tabs/screens: `screen_view` for `Home`, `Warmup`, `Active Walk`, `Walk Complete`, `Challenges`, `Buddies / Friends`, `Buddy Search`, `Stats`, `Profile`, `Paywall`, and `Settings`.
- Create account: `signup_started`, `signup_completed`.
- Sign in: `login_completed`.
- Start and finish a walk: `walk_started`, `walk_completed`.
- View paywall and start a purchase: `paywall_viewed`, `subscription_started`.
- Tap restore purchases: `restore_purchases_tapped`; successful restores also log `subscription_restored`.
- Search friends and send a request: `buddy_search`, `buddy_added`.
- Accept a friend challenge: `challenge_viewed`, `challenge_joined`.
- Edit profile: `profile_updated`; if display name and username are present, `profile_completed`.
- Save a GPS route: `route_saved`.

Events intentionally exclude emails, names, usernames, raw search text, raw GPS coordinates, and route point data.
