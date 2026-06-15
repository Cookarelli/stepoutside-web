# Google Sign-In Setup

Step Outside uses Expo Auth Session to collect a Google ID token, then signs into the existing Firebase Auth project with a Google credential.

## App Config

- `app.config.ts` already declares the app scheme: `stepoutsidev2`.
- The iOS bundle identifier is `com.cookarell.stepoutside`.
- The current JavaScript Firebase/Auth Session path does not require a committed `GoogleService-Info.plist`. Add one only if a future native Firebase SDK integration needs it.

## Firebase Console

1. Open the existing Step Outside Firebase project.
2. In Authentication > Sign-in method, enable Google.
3. Confirm the support email is set for the Google provider.
4. Keep Email/Password enabled.

## Google Cloud OAuth Clients

Create or verify these OAuth client IDs in the same Google Cloud project behind Firebase:

- iOS OAuth client for bundle ID `com.cookarell.stepoutside`.
- Web OAuth client for Expo Auth Session / Firebase credential exchange.
- Android OAuth client can be added later for Android support.

Expose the public client IDs to Expo with:

```bash
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...
```

The app shows the Google button only when the required public client IDs are present. Do not commit `.env` files containing environment-specific values.

## QA Checklist

1. Existing email/password login works.
2. Existing email/password account creation works.
3. Existing password reset works.
4. Existing logout clears Profile state.
5. Google login works for a new user.
6. Google login works for a returning user.
7. Google-created users receive `users/{uid}` without overwriting a claimed username.
8. Username claim still works after Google login.
9. App reload preserves Firebase auth state.
10. Logout after Google login clears Firebase/local Profile state.
