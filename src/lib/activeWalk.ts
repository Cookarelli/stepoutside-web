import AsyncStorage from "@react-native-async-storage/async-storage";

import type { RoutePoint } from "./store";

export type ActiveWalkSnapshot = {
  startedAt: number;
  elapsedSec: number;
  distanceM: number;
  routePoints?: RoutePoint[];
  running: boolean;
  updatedAt: number;
};

export type CompletedWalkDraft = {
  routePoints: RoutePoint[];
};

const KEY_ACTIVE_WALK = "@stepoutside/activeWalk";
const KEY_COMPLETED_WALK_DRAFT = "@stepoutside/completedWalkDraft";

export async function getActiveWalkSnapshot(): Promise<ActiveWalkSnapshot | null> {
  const raw = await AsyncStorage.getItem(KEY_ACTIVE_WALK);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ActiveWalkSnapshot>;
    const routePoints =
      Array.isArray(parsed?.routePoints)
        ? parsed.routePoints.filter(
            (point): point is RoutePoint =>
              Boolean(
                point &&
                  typeof point === "object" &&
                  typeof point.lat === "number" &&
                  Number.isFinite(point.lat) &&
                  typeof point.lng === "number" &&
                  Number.isFinite(point.lng) &&
                  typeof point.t === "number" &&
                  Number.isFinite(point.t)
              )
          )
        : undefined;

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
      ...(routePoints ? { routePoints } : {}),
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

export async function getCompletedWalkDraft(): Promise<CompletedWalkDraft | null> {
  const raw = await AsyncStorage.getItem(KEY_COMPLETED_WALK_DRAFT);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<CompletedWalkDraft>;
    const routePoints =
      Array.isArray(parsed?.routePoints)
        ? parsed.routePoints.filter(
            (point): point is RoutePoint =>
              Boolean(
                point &&
                  typeof point === "object" &&
                  typeof point.lat === "number" &&
                  Number.isFinite(point.lat) &&
                  typeof point.lng === "number" &&
                  Number.isFinite(point.lng) &&
                  typeof point.t === "number" &&
                  Number.isFinite(point.t)
              )
          )
        : null;

    if (!routePoints) return null;
    return { routePoints };
  } catch {
    return null;
  }
}

export async function setCompletedWalkDraft(draft: CompletedWalkDraft): Promise<void> {
  await AsyncStorage.setItem(KEY_COMPLETED_WALK_DRAFT, JSON.stringify(draft));
}

export async function clearCompletedWalkDraft(): Promise<void> {
  await AsyncStorage.removeItem(KEY_COMPLETED_WALK_DRAFT);
}
