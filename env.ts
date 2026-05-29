/**
 * Centralized, typed access to Expo environment variables.
 *
 * Only variables prefixed with EXPO_PUBLIC_ are available in the client bundle.
 * Keep secrets out of here. (Firebase web config values are OK.)
 */

console.log("[BOOT] env.ts loaded");

function optional(name: string): string {
  const value = process.env[name] ?? "";
  if (__DEV__ && !value) {
    console.warn(`[ENV] Missing ${name}; using empty string fallback.`);
  }
  return value;
}

function optionalCsv(name: string): string[] {
  const value = process.env[name] ?? "";
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function optionalBoolean(name: string): boolean {
  return (process.env[name] ?? "").trim().toLowerCase() === "true";
}

function optionalBooleanDefaultTrue(name: string): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return true;
  return raw !== "false";
}

function optionalPlan(name: string): "monthly" | "yearly" | "lifetime" | null {
  const value = (process.env[name] ?? "").trim().toLowerCase();
  if (value === "monthly" || value === "yearly" || value === "lifetime") {
    return value;
  }
  return null;
}

function optionalPlanWithDefault(name: string, fallback: "monthly" | "yearly" | "lifetime"): "monthly" | "yearly" | "lifetime" {
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
  MAPS: {
    nativeRouteMapsEnabled: optionalBooleanDefaultTrue("EXPO_PUBLIC_ENABLE_NATIVE_ROUTE_MAPS"),
    preferGoogleProviderOnIos: optionalBoolean("EXPO_PUBLIC_USE_GOOGLE_MAPS_IOS"),
    placesSuggestionsEnabled: optionalBooleanDefaultTrue("EXPO_PUBLIC_ENABLE_GOOGLE_PLACES_SUGGESTIONS"),
    placesApiKey:
      process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ??
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ??
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
