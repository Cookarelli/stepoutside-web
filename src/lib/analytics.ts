import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

type AnalyticsParam = string | number | boolean;
type AnalyticsParams = Record<string, AnalyticsParam | null | undefined>;

type NativeAnalytics = {
  logAppOpen?: () => Promise<void>;
  logEvent: (name: string, params?: Record<string, AnalyticsParam>) => Promise<void>;
  logScreenView: (params: { screen_name: string; screen_class: string }) => Promise<void>;
  setAnalyticsCollectionEnabled: (enabled: boolean) => Promise<void>;
};

const FIRST_SESSION_KEY = "stepoutside:v2:analytics:first-session-logged";
const MAX_STRING_PARAM_LENGTH = 100;

let nativeAnalyticsPromise: Promise<NativeAnalytics | null> | null = null;
const nativeAnalyticsPackage = "@react-native-firebase/analytics";

function cleanString(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted_email]")
    .replace(/[-+]?\d{1,3}\.\d{4,}\s*,\s*[-+]?\d{1,3}\.\d{4,}/g, "[redacted_location]")
    .trim()
    .slice(0, MAX_STRING_PARAM_LENGTH);
}

function cleanParams(params?: AnalyticsParams): Record<string, AnalyticsParam> | undefined {
  if (!params) return undefined;

  const cleaned = Object.entries(params).reduce<Record<string, AnalyticsParam>>((acc, [key, value]) => {
    if (value === null || value === undefined) return acc;
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)) return acc;

    if (typeof value === "string") {
      const next = cleanString(value);
      if (next) acc[key] = next;
      return acc;
    }

    if (typeof value === "number") {
      if (Number.isFinite(value)) acc[key] = value;
      return acc;
    }

    acc[key] = value;
    return acc;
  }, {});

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

async function getNativeAnalytics(): Promise<NativeAnalytics | null> {
  if (Platform.OS === "web") return null;

  nativeAnalyticsPromise ??= import(nativeAnalyticsPackage)
    .then((mod) => mod.default() as NativeAnalytics)
    .catch((error) => {
      if (__DEV__) {
        console.warn("[analytics] native Firebase Analytics unavailable", error);
      }
      return null;
    });

  return nativeAnalyticsPromise;
}

async function logEvent(name: string, params?: AnalyticsParams): Promise<void> {
  try {
    const analytics = await getNativeAnalytics();
    if (!analytics) return;
    await analytics.logEvent(name, cleanParams(params));
  } catch (error) {
    if (__DEV__) {
      console.warn(`[analytics] ${name} failed`, error);
    }
  }
}

async function logFirstSessionOnce(): Promise<void> {
  try {
    const alreadyLogged = await AsyncStorage.getItem(FIRST_SESSION_KEY);
    if (alreadyLogged === "true") return;

    await logEvent("first_session");
    await AsyncStorage.setItem(FIRST_SESSION_KEY, "true");
  } catch (error) {
    if (__DEV__) {
      console.warn("[analytics] first_session failed", error);
    }
  }
}

export async function initializeAnalytics(): Promise<void> {
  try {
    const analytics = await getNativeAnalytics();
    if (!analytics) return;
    await analytics.setAnalyticsCollectionEnabled(true);
  } catch (error) {
    if (__DEV__) {
      console.warn("[analytics] initialization failed", error);
    }
  }
}

export async function logAppOpen(): Promise<void> {
  try {
    const analytics = await getNativeAnalytics();
    if (!analytics) return;
    if (analytics.logAppOpen) {
      await analytics.logAppOpen();
    } else {
      await analytics.logEvent("app_open");
    }
    await logFirstSessionOnce();
  } catch (error) {
    if (__DEV__) {
      console.warn("[analytics] app_open failed", error);
    }
  }
}

export async function logScreenView(screenName: string): Promise<void> {
  try {
    const analytics = await getNativeAnalytics();
    if (!analytics) return;
    await analytics.logScreenView({
      screen_name: cleanString(screenName),
      screen_class: cleanString(screenName),
    });
  } catch (error) {
    if (__DEV__) {
      console.warn(`[analytics] screen_view ${screenName} failed`, error);
    }
  }
}

export function screenNameFromPath(pathname: string): string | null {
  if (pathname === "/" || pathname === "/(tabs)" || pathname === "/(tabs)/index") return "Home";
  if (pathname === "/auth") return "Auth";
  if (pathname === "/profile-setup") return "Profile Setup";
  if (pathname === "/start") return "Warmup";
  if (pathname === "/walk") return "Active Walk";
  if (pathname === "/complete" || pathname === "/share" || pathname === "/(tabs)/share") return "Walk Complete";
  if (pathname === "/challenges") return "Challenges";
  if (pathname === "/friends") return "Buddies / Friends";
  if (pathname === "/friends-search") return "Buddy Search";
  if (pathname === "/stats" || pathname === "/(tabs)/stats") return "Stats";
  if (pathname === "/profile" || pathname === "/(tabs)/profile") return "Profile";
  if (pathname === "/pro") return "Paywall";
  if (pathname === "/edit-profile") return "Settings";
  if (pathname === "/saved-route") return "Saved Route";
  return null;
}

export async function logScreenViewForPath(pathname: string): Promise<void> {
  const screenName = screenNameFromPath(pathname);
  if (screenName) {
    await logScreenView(screenName);
  }
}

export function logSignupStarted(): Promise<void> {
  return logEvent("signup_started", { method: "email" });
}

export function logSignupCompleted(method: string): Promise<void> {
  return logEvent("signup_completed", { method });
}

export function logLoginCompleted(method: string): Promise<void> {
  return logEvent("login_completed", { method });
}

export function logWalkStarted(source: string): Promise<void> {
  return logEvent("walk_started", { source });
}

export function logWalkCompleted(durationMinutes: number, distanceMiles: number, steps?: number): Promise<void> {
  return logEvent("walk_completed", {
    duration_minutes: Math.max(0, Math.round(durationMinutes)),
    distance_miles: Number(Math.max(0, distanceMiles).toFixed(2)),
    steps: typeof steps === "number" ? Math.max(0, Math.round(steps)) : undefined,
  });
}

export function logChallengeViewed(challengeId: string): Promise<void> {
  return logEvent("challenge_viewed", { challenge_id: challengeId });
}

export function logChallengeJoined(challengeId: string): Promise<void> {
  return logEvent("challenge_joined", { challenge_id: challengeId });
}

export function logBuddySearch(queryLength: number): Promise<void> {
  return logEvent("buddy_search", { query_length: Math.max(0, Math.round(queryLength)) });
}

export function logBuddyAdded(): Promise<void> {
  return logEvent("buddy_added");
}

export function logPaywallViewed(source: string): Promise<void> {
  return logEvent("paywall_viewed", { source });
}

export function logSubscriptionStarted(plan: string): Promise<void> {
  return logEvent("subscription_started", { plan });
}

export function logSubscriptionRestored(): Promise<void> {
  return logEvent("subscription_restored");
}

export function logRestorePurchasesTapped(source: string): Promise<void> {
  return logEvent("restore_purchases_tapped", { source });
}

export function logProfileUpdated(): Promise<void> {
  return logEvent("profile_updated");
}

export function logProfileCompleted(): Promise<void> {
  return logEvent("profile_completed");
}

export function logRouteSaved(): Promise<void> {
  return logEvent("route_saved");
}

export function logErrorScreen(screenName: string, errorMessage: string): Promise<void> {
  return logEvent("error_screen", {
    screen_name: screenName,
    error_message: errorMessage,
  });
}
