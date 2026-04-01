import AsyncStorage from "@react-native-async-storage/async-storage";

export type ActiveWalkSnapshot = {
  startedAt: number;
  elapsedSec: number;
  distanceM: number;
  running: boolean;
  updatedAt: number;
};

const KEY_ACTIVE_WALK = "@stepoutside/activeWalk";

export async function getActiveWalkSnapshot(): Promise<ActiveWalkSnapshot | null> {
  const raw = await AsyncStorage.getItem(KEY_ACTIVE_WALK);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ActiveWalkSnapshot>;
    if (
      typeof parsed?.startedAt !== "number" ||
      typeof parsed?.elapsedSec !== "number" ||
      typeof parsed?.distanceM !== "number" ||
      typeof parsed?.running !== "boolean" ||
      typeof parsed?.updatedAt !== "number"
    ) {
      return null;
    }

    return {
      startedAt: parsed.startedAt,
      elapsedSec: parsed.elapsedSec,
      distanceM: parsed.distanceM,
      running: parsed.running,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export async function setActiveWalkSnapshot(snapshot: ActiveWalkSnapshot): Promise<void> {
  await AsyncStorage.setItem(KEY_ACTIVE_WALK, JSON.stringify(snapshot));
}

export async function clearActiveWalkSnapshot(): Promise<void> {
  await AsyncStorage.removeItem(KEY_ACTIVE_WALK);
}

export async function hasActiveWalkSnapshot(): Promise<boolean> {
  return (await getActiveWalkSnapshot()) !== null;
}
