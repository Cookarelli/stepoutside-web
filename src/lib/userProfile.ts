import AsyncStorage from "@react-native-async-storage/async-storage";

export type PreferredActivity = "walking" | "hiking" | "trail-walks" | "recovery-walks";

export type LocalUserProfile = {
  displayName: string;
  location: string;
  walkingGoal: string;
  preferredActivity: PreferredActivity | null;
  bio: string;
  updatedAt: number;
};

const USER_PROFILES_KEY = "stepoutside:v2:user-profiles";

export const EMPTY_LOCAL_USER_PROFILE: LocalUserProfile = {
  displayName: "",
  location: "",
  walkingGoal: "",
  preferredActivity: null,
  bio: "",
  updatedAt: 0,
};

function normalizeText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizePreferredActivity(value: unknown): PreferredActivity | null {
  return value === "walking" ||
    value === "hiking" ||
    value === "trail-walks" ||
    value === "recovery-walks"
    ? value
    : null;
}

function normalizeProfile(value: unknown): LocalUserProfile {
  const candidate = value && typeof value === "object" ? (value as Partial<LocalUserProfile>) : {};
  return {
    displayName: normalizeText(candidate.displayName, 48),
    location: normalizeText(candidate.location, 80),
    walkingGoal: normalizeText(candidate.walkingGoal, 80),
    preferredActivity: normalizePreferredActivity(candidate.preferredActivity),
    bio: normalizeText(candidate.bio, 160),
    updatedAt:
      typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt)
        ? candidate.updatedAt
        : 0,
  };
}

async function readProfiles(): Promise<Record<string, LocalUserProfile>> {
  const raw = await AsyncStorage.getItem(USER_PROFILES_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, normalizeProfile(value)])
    );
  } catch {
    return {};
  }
}

export async function getLocalUserProfile(identityKey: string): Promise<LocalUserProfile> {
  const profiles = await readProfiles();
  return profiles[identityKey] ?? profiles.device ?? EMPTY_LOCAL_USER_PROFILE;
}

export async function saveLocalUserProfile(
  identityKey: string,
  profile: Omit<LocalUserProfile, "updatedAt"> | LocalUserProfile
): Promise<LocalUserProfile> {
  const profiles = await readProfiles();
  const normalized = normalizeProfile({ ...profile, updatedAt: Date.now() });
  await AsyncStorage.setItem(
    USER_PROFILES_KEY,
    JSON.stringify({ ...profiles, [identityKey]: normalized })
  );

  // TODO: Sync location, walkingGoal, preferredActivity, and bio when cloud profile fields exist.
  return normalized;
}

export async function clearLocalUserProfiles(): Promise<void> {
  await AsyncStorage.removeItem(USER_PROFILES_KEY);
}
