/**
 * Centralized, typed access to Expo environment variables.
 *
 * Only variables prefixed with EXPO_PUBLIC_ are available in the client bundle.
 * Keep secrets out of here. (Firebase web config values are OK.)
 */

const RAW_ENV = {
  EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "",
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? "",
  EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
  EXPO_PUBLIC_RC_APPLE_API_KEY: process.env.EXPO_PUBLIC_RC_APPLE_API_KEY ?? null,
  EXPO_PUBLIC_RC_GOOGLE_API_KEY: process.env.EXPO_PUBLIC_RC_GOOGLE_API_KEY ?? null,
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? null,
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? null,
  EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? null,
  EXPO_PUBLIC_ENABLE_NATIVE_ROUTE_MAPS: process.env.EXPO_PUBLIC_ENABLE_NATIVE_ROUTE_MAPS ?? "",
  EXPO_PUBLIC_USE_GOOGLE_MAPS_IOS: process.env.EXPO_PUBLIC_USE_GOOGLE_MAPS_IOS ?? "",
  EXPO_PUBLIC_ENABLE_GOOGLE_PLACES_SUGGESTIONS: process.env.EXPO_PUBLIC_ENABLE_GOOGLE_PLACES_SUGGESTIONS ?? "",
  EXPO_PUBLIC_GOOGLE_PLACES_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? null,
  EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? null,
  EXPO_PUBLIC_ENABLE_PREMIUM_TEST_OVERRIDE: process.env.EXPO_PUBLIC_ENABLE_PREMIUM_TEST_OVERRIDE ?? "",
  EXPO_PUBLIC_PREMIUM_TEST_OVERRIDE_PLAN: process.env.EXPO_PUBLIC_PREMIUM_TEST_OVERRIDE_PLAN ?? "",
  EXPO_PUBLIC_DEV_PREMIUM_OVERRIDE_PLAN: process.env.EXPO_PUBLIC_DEV_PREMIUM_OVERRIDE_PLAN ?? "",
  EXPO_PUBLIC_PREMIUM_TEST_EMAILS: process.env.EXPO_PUBLIC_PREMIUM_TEST_EMAILS ?? "",
  EXPO_PUBLIC_DEV_PREMIUM_OVERRIDE_EMAILS: process.env.EXPO_PUBLIC_DEV_PREMIUM_OVERRIDE_EMAILS ?? "",
  EXPO_PUBLIC_PREMIUM_TEST_UIDS: process.env.EXPO_PUBLIC_PREMIUM_TEST_UIDS ?? "",
  EXPO_PUBLIC_DEV_PREMIUM_OVERRIDE_UIDS: process.env.EXPO_PUBLIC_DEV_PREMIUM_OVERRIDE_UIDS ?? "",
  EXPO_PUBLIC_PREMIUM_TEST_ALLOW_ANONYMOUS: process.env.EXPO_PUBLIC_PREMIUM_TEST_ALLOW_ANONYMOUS ?? "",
  EXPO_PUBLIC_DEV_PREMIUM_OVERRIDE_ANONYMOUS: process.env.EXPO_PUBLIC_DEV_PREMIUM_OVERRIDE_ANONYMOUS ?? "",
  EXPO_PUBLIC_GPS_DEBUG: process.env.EXPO_PUBLIC_GPS_DEBUG ?? "",
  EXPO_PUBLIC_STEP_OUTSIDE_PREVIEW_FIREBASE: process.env.EXPO_PUBLIC_STEP_OUTSIDE_PREVIEW_FIREBASE ?? "",
} as const;

type EnvKey = keyof typeof RAW_ENV;

function optional(name: EnvKey): string {
  const value = RAW_ENV[name] ?? "";
  if (__DEV__ && !value) {
    console.warn(`[ENV] Missing ${name}; using empty string fallback.`);
  }
  return value;
}

function optionalCsv(name: EnvKey): string[] {
  const value = RAW_ENV[name] ?? "";
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function optionalBoolean(name: EnvKey): boolean {
  return (RAW_ENV[name] ?? "").trim().toLowerCase() === "true";
}

function optionalBooleanDefaultTrue(name: EnvKey): boolean {
  const raw = (RAW_ENV[name] ?? "").trim().toLowerCase();
  if (!raw) return true;
  return raw !== "false";
}

function optionalPlan(name: EnvKey): "monthly" | "yearly" | null {
  const value = (RAW_ENV[name] ?? "").trim().toLowerCase();
  if (value === "monthly" || value === "yearly") {
    return value;
  }
  return null;
}

function optionalPlanWithDefault(name: EnvKey, fallback: "monthly" | "yearly"): "monthly" | "yearly" {
  return optionalPlan(name) ?? fallback;
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
    measurementId: RAW_ENV.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
    usePreviewFallback: optionalBoolean("EXPO_PUBLIC_STEP_OUTSIDE_PREVIEW_FIREBASE"),
  },
  REVENUECAT: {
    // Public SDK keys (safe for client apps)
    appleApiKey: RAW_ENV.EXPO_PUBLIC_RC_APPLE_API_KEY,
    googleApiKey: RAW_ENV.EXPO_PUBLIC_RC_GOOGLE_API_KEY,
  },
  AUTH: {
    googleIosClientId: RAW_ENV.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    googleWebClientId: RAW_ENV.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    googleAndroidClientId: RAW_ENV.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  },
  MAPS: {
    nativeRouteMapsEnabled: optionalBooleanDefaultTrue("EXPO_PUBLIC_ENABLE_NATIVE_ROUTE_MAPS"),
    preferGoogleProviderOnIos: optionalBoolean("EXPO_PUBLIC_USE_GOOGLE_MAPS_IOS"),
    placesSuggestionsEnabled: optionalBooleanDefaultTrue("EXPO_PUBLIC_ENABLE_GOOGLE_PLACES_SUGGESTIONS"),
    placesApiKey:
      RAW_ENV.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ??
      RAW_ENV.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ??
      null,
  },
  DEV: {
    // Developer-only screenshot/testing override.
    // Leave these unset in production builds so Premium access always comes from RevenueCat.
    enablePremiumTestOverride:
      optionalBoolean("EXPO_PUBLIC_ENABLE_PREMIUM_TEST_OVERRIDE") || optionalPlan("EXPO_PUBLIC_DEV_PREMIUM_OVERRIDE_PLAN") !== null,
    premiumOverridePlan:
      optionalPlan("EXPO_PUBLIC_PREMIUM_TEST_OVERRIDE_PLAN") ??
      optionalPlan("EXPO_PUBLIC_DEV_PREMIUM_OVERRIDE_PLAN"),
    premiumOverridePlanDefault: optionalPlanWithDefault("EXPO_PUBLIC_PREMIUM_TEST_OVERRIDE_PLAN", "yearly"),
    premiumOverrideEmails: [
      ...optionalCsv("EXPO_PUBLIC_PREMIUM_TEST_EMAILS"),
      ...optionalCsv("EXPO_PUBLIC_DEV_PREMIUM_OVERRIDE_EMAILS"),
    ],
    premiumOverrideUids: [
      ...optionalCsv("EXPO_PUBLIC_PREMIUM_TEST_UIDS"),
      ...optionalCsv("EXPO_PUBLIC_DEV_PREMIUM_OVERRIDE_UIDS"),
    ],
    premiumOverrideAllowAnonymous:
      optionalBoolean("EXPO_PUBLIC_PREMIUM_TEST_ALLOW_ANONYMOUS") || optionalBoolean("EXPO_PUBLIC_DEV_PREMIUM_OVERRIDE_ANONYMOUS"),
    // Temporary GPS debugging toggle for device tracking audits.
    gpsDebug: optionalBoolean("EXPO_PUBLIC_GPS_DEBUG"),
  },
} as const;
