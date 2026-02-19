/**
 * Centralized, typed access to Expo environment variables.
 *
 * Only variables prefixed with EXPO_PUBLIC_ are available in the client bundle.
 * Keep secrets out of here. (Firebase web config values are OK.)
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[env] Missing required environment variable: ${name}`);
  }
  return value;
}

export const ENV = {
  FIREBASE: {
    apiKey: required("EXPO_PUBLIC_FIREBASE_API_KEY"),
    authDomain: required("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: required("EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: required("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: required("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    appId: required("EXPO_PUBLIC_FIREBASE_APP_ID"),
    // optional
    measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
  },
  REVENUECAT: {
    // Public SDK keys (safe for client apps)
    appleApiKey: process.env.EXPO_PUBLIC_RC_APPLE_API_KEY ?? null,
    googleApiKey: process.env.EXPO_PUBLIC_RC_GOOGLE_API_KEY ?? null,
  },
} as const;