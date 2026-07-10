import AsyncStorage from "@react-native-async-storage/async-storage";

import { auth } from "./firebase";

const ONBOARDING_KEY = "@stepoutside/onboardingCompleted";
const NEW_ACCOUNT_WELCOME_KEY = "@stepoutside/newAccountNeedsWelcome";
const REPLAY_WELCOME_KEY = "@stepoutside:replayWelcomeRequested";

function currentUid(): string | null {
  return auth.currentUser?.uid ?? null;
}

function scopedKey(baseKey: string): string {
  const uid = currentUid();
  return uid ? `${baseKey}:${uid}` : baseKey;
}

export async function hasCompletedOnboarding(): Promise<boolean> {
  const [scopedValue, legacyValue] = await Promise.all([
    AsyncStorage.getItem(scopedKey(ONBOARDING_KEY)),
    AsyncStorage.getItem(ONBOARDING_KEY),
  ]);
  return scopedValue === "true" || legacyValue === "true";
}

export async function completeOnboarding(): Promise<void> {
  await AsyncStorage.multiSet([
    [scopedKey(ONBOARDING_KEY), "true"],
    [ONBOARDING_KEY, "true"],
  ]);
  await AsyncStorage.multiRemove([
    scopedKey(NEW_ACCOUNT_WELCOME_KEY),
    NEW_ACCOUNT_WELCOME_KEY,
    scopedKey(REPLAY_WELCOME_KEY),
    REPLAY_WELCOME_KEY,
  ]);
}

export async function resetOnboarding(): Promise<void> {
  await AsyncStorage.multiSet([[scopedKey(REPLAY_WELCOME_KEY), "true"]]);
  await AsyncStorage.multiRemove([scopedKey(ONBOARDING_KEY), ONBOARDING_KEY]);
}

export async function markNewAccountNeedsWelcome(): Promise<void> {
  await AsyncStorage.setItem(scopedKey(NEW_ACCOUNT_WELCOME_KEY), "true");
}

export async function newAccountNeedsWelcome(): Promise<boolean> {
  return (await AsyncStorage.getItem(scopedKey(NEW_ACCOUNT_WELCOME_KEY))) === "true";
}

export async function clearNewAccountNeedsWelcome(): Promise<void> {
  await AsyncStorage.multiRemove([scopedKey(NEW_ACCOUNT_WELCOME_KEY), NEW_ACCOUNT_WELCOME_KEY]);
}

export async function welcomeReplayRequested(): Promise<boolean> {
  return (await AsyncStorage.getItem(scopedKey(REPLAY_WELCOME_KEY))) === "true";
}

export async function shouldShowWelcomeScreens(): Promise<boolean> {
  const [needsWelcome, replayRequested] = await Promise.all([
    newAccountNeedsWelcome(),
    welcomeReplayRequested(),
  ]);
  return needsWelcome || replayRequested;
}
