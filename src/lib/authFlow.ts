import { hasActiveWalkSnapshot } from "./activeWalk";
import { waitForAuthUserSnapshot } from "./auth";
import { shouldShowWelcomeScreens } from "./onboarding";
import { getCurrentUserProfile, isUserProfileComplete } from "./userProfile";

export type AppEntryRoute = "/auth" | "/profile-setup" | "/(onboarding)/welcome-1" | "/walk" | "/(tabs)";

async function hasActiveWalkSafely(): Promise<boolean> {
  try {
    return await hasActiveWalkSnapshot();
  } catch (error) {
    if (__DEV__) {
      console.warn("[auth-flow] active walk lookup failed", error);
    }
    return false;
  }
}

async function hasCompleteProfileSafely(): Promise<boolean> {
  try {
    return isUserProfileComplete(await getCurrentUserProfile());
  } catch (error) {
    if (__DEV__) {
      console.warn("[auth-flow] profile lookup failed", error);
    }
    return false;
  }
}

export async function getAuthenticatedEntryRoute(): Promise<AppEntryRoute> {
  const hasCompleteProfile = await hasCompleteProfileSafely();
  if (!hasCompleteProfile) return "/profile-setup";

  if (await shouldShowWelcomeScreens()) {
    return "/(onboarding)/welcome-1";
  }

  return (await hasActiveWalkSafely()) ? "/walk" : "/(tabs)";
}

export async function getInitialAppRoute(): Promise<AppEntryRoute> {
  const user = await waitForAuthUserSnapshot();
  if (!user) return "/auth";

  return getAuthenticatedEntryRoute();
}

export async function getPostProfileSetupRoute(): Promise<AppEntryRoute> {
  if (await shouldShowWelcomeScreens()) {
    return "/(onboarding)/welcome-1";
  }

  return (await hasActiveWalkSafely()) ? "/walk" : "/(tabs)";
}

export async function getPostWelcomeRoute(): Promise<AppEntryRoute> {
  const hasCompleteProfile = await hasCompleteProfileSafely();
  if (!hasCompleteProfile) return "/profile-setup";

  return (await hasActiveWalkSafely()) ? "/walk" : "/(tabs)";
}
