# Google Maps Setup

Step Outside now supports Google Maps for **route display polish only**.

Important:

- Google Maps improves how saved route previews look.
- Google Maps does **not** improve GPS accuracy.
- Google Maps does **not** calculate pace or distance.
- Pace and distance continue using Step Outside's filtered GPS logic.

## Required environment variable

Add this public environment variable:

```bash
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

This project reads it from:

- [env.ts](/Users/stevencook/dev/client-production/step-outside-v2/env.ts)
- [app.config.ts](/Users/stevencook/dev/client-production/step-outside-v2/app.config.ts)

At build time, [app.config.ts](/Users/stevencook/dev/client-production/step-outside-v2/app.config.ts) conditionally injects the SDK 54 native config fields:

- `ios.config.googleMapsApiKey`
- `android.config.googleMaps.apiKey`

## Local setup

Add the key to your local `.env` or `.env.local` file:

```bash
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

Then restart Expo so the config reloads.

## EAS environment setup

Set the variable in EAS before building:

```bash
eas env:create --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value your_google_maps_api_key_here
```

Or add it through the Expo dashboard / EAS project environment UI if you prefer.

Important:

- this value must be available during the native build, not just at runtime
- after adding or changing it, rebuild the iOS/Android app binary
- if the variable is missing, the native Google Maps provider is not configured, and Step Outside falls back to the default native provider or custom preview

Make sure the variable is available to the build profile you use for:

- development builds
- preview/internal builds
- production/TestFlight builds

## iOS config notes

Google Maps is wired through Expo config using:

- `ios.config.googleMapsApiKey`

That value is injected by [app.config.ts](/Users/stevencook/dev/client-production/step-outside-v2/app.config.ts) when `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is present.

Use an iOS-restricted Google Maps key for:

- bundle ID: `com.cookarell.stepoutside`

After adding or changing the key, rebuild the iOS app binary.

## Android config notes

Google Maps is wired through Expo config using:

- `android.config.googleMaps.apiKey`

That value is also injected by [app.config.ts](/Users/stevencook/dev/client-production/step-outside-v2/app.config.ts).

Use an Android-restricted Google Maps key for:

- package: `com.stevencook.stepoutside`
- the correct SHA-1 / SHA-256 signing fingerprints for the build you are testing

After adding or changing the key, rebuild the Android app binary.

## Fallback behavior

If `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is missing:

- Step Outside still tries to render the route with the native default map provider on supported devices
- if a native map provider is unavailable, it falls back to the custom preview
- the app still builds and runs
- GPS tracking, pace, and distance still work normally

## What improves when configured

With a valid key on native builds, route previews can show:

- continuous smooth polyline
- start marker
- finish marker
- fitted route bounds
- calmer, more map-like presentation

## Reminder

Google Maps only improves **display**.

It does **not**:

- make GPS more accurate
- change filtered route data
- change elevation logic
- change pace calculations
- change walking distance calculations
