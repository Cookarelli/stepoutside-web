/**
 * Centralized, typed access to Expo environment variables.
 *
 * Only variables prefixed with EXPO_PUBLIC_ are available in the client bundle.
 * Keep secrets out of here. (Firebase web config values are OK.)
 */

function optional(name: string): string {
  return process.env[name] ?? "";
}

export const ENV = {
  FIREBASE: {
    apiKey: optional("EXPO_PUBLIC_FIREBASE_API_KEY"),
    authDomain: optional("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: optional("EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: optional("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: optional("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    appId: optional("EXPO_PUBLIC_FIREBASE_APP_ID"),
    // optional
    measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
  },
  REVENUECAT: {
    // Public SDK keys (safe for client apps)
    appleApiKey: process.env.EXPO_PUBLIC_RC_APPLE_API_KEY ?? null,
    googleApiKey: process.env.EXPO_PUBLIC_RC_GOOGLE_API_KEY ?? null,
  },
  AUTH: {
    googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? null,
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? null,
    googleAndroidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? null,
  },
} as const;
