import AsyncStorage from "@react-native-async-storage/async-storage";

import type { RoutePoint, SessionSource } from "./store";
import { auth } from "./firebase";

export type ActiveWalkSnapshot = {
  startedAt: number;
  elapsedSec: number;
  distanceM: number;
  movingTimeSec?: number;
  pausedTimeSec?: number;
  routePoints?: RoutePoint[];
  running: boolean;
  updatedAt: number;
};

export type CompletedWalkDraft = {
  id?: string;
  startedAt?: number;
  endedAt?: number;
  durationSec?: number;
  elapsedTimeSec?: number;
  movingTimeSec?: number;
  pausedTimeSec?: number;
  distanceM?: number;
  source?: SessionSource;
  routePoints: RoutePoint[];
};

const LEGACY_KEY_ACTIVE_WALK = "@stepoutside/activeWalk";
const LEGACY_KEY_COMPLETED_WALK_DRAFT = "@stepoutside/completedWalkDraft";
const ACTIVE_WALK_PREFIX = "@stepoutside/user";

function currentUid(): string | null {
  return auth.currentUser?.uid ?? null;
}

function activeWalkKeyForUid(uid: string): string {
  return `${ACTIVE_WALK_PREFIX}:${uid}:activeWalk`;
}

function completedWalkDraftKeyForUid(uid: string): string {
  return `${ACTIVE_WALK_PREFIX}:${uid}:completedWalkDraft`;
}

async function removeLegacyActiveWalkStorage(): Promise<void> {
  await AsyncStorage.multiRemove([LEGACY_KEY_ACTIVE_WALK, LEGACY_KEY_COMPLETED_WALK_DRAFT]);
}

export async function clearActiveWalkStorageForUid(uid: string | null | undefined): Promise<void> {
  const keys = [LEGACY_KEY_ACTIVE_WALK, LEGACY_KEY_COMPLETED_WALK_DRAFT];
  if (uid) {
    keys.push(activeWalkKeyForUid(uid), completedWalkDraftKeyForUid(uid));
  }

  await AsyncStorage.multiRemove(keys);
}

async function clearActiveWalkSnapshotForUid(uid: string | null | undefined): Promise<void> {
  const keys = [LEGACY_KEY_ACTIVE_WALK];
  if (uid) {
    keys.push(activeWalkKeyForUid(uid));
  }

  await AsyncStorage.multiRemove(keys);
}

async function clearCompletedWalkDraftForUid(uid: string | null | undefined): Promise<void> {
  const keys = [LEGACY_KEY_COMPLETED_WALK_DRAFT];
  if (uid) {
    keys.push(completedWalkDraftKeyForUid(uid));
  }

  await AsyncStorage.multiRemove(keys);
}

export async function getActiveWalkSnapshot(): Promise<ActiveWalkSnapshot | null> {
  await removeLegacyActiveWalkStorage();

  const uid = currentUid();
  if (!uid) return null;

  const raw = await AsyncStorage.getItem(activeWalkKeyForUid(uid));
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
      ...(typeof parsed.movingTimeSec === "number" && Number.isFinite(parsed.movingTimeSec)
        ? { movingTimeSec: parsed.movingTimeSec }
        : {}),
      ...(typeof parsed.pausedTimeSec === "number" && Number.isFinite(parsed.pausedTimeSec)
        ? { pausedTimeSec: parsed.pausedTimeSec }
        : {}),
      ...(routePoints ? { routePoints } : {}),
      running: parsed.running,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export async function setActiveWalkSnapshot(snapshot: ActiveWalkSnapshot): Promise<void> {
  await removeLegacyActiveWalkStorage();

  const uid = currentUid();
  if (!uid) return;

  await AsyncStorage.setItem(activeWalkKeyForUid(uid), JSON.stringify(snapshot));
}

export async function clearActiveWalkSnapshot(): Promise<void> {
  const uid = currentUid();
  await clearActiveWalkSnapshotForUid(uid);
}

export async function hasActiveWalkSnapshot(): Promise<boolean> {
  return (await getActiveWalkSnapshot()) !== null;
}

export async function getCompletedWalkDraft(): Promise<CompletedWalkDraft | null> {
  await removeLegacyActiveWalkStorage();

  const uid = currentUid();
  if (!uid) return null;

  const raw = await AsyncStorage.getItem(completedWalkDraftKeyForUid(uid));
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
    return {
      ...(typeof parsed.id === "string" ? { id: parsed.id } : {}),
      ...(typeof parsed.startedAt === "number" && Number.isFinite(parsed.startedAt)
        ? { startedAt: parsed.startedAt }
        : {}),
      ...(typeof parsed.endedAt === "number" && Number.isFinite(parsed.endedAt)
        ? { endedAt: parsed.endedAt }
        : {}),
      ...(typeof parsed.durationSec === "number" && Number.isFinite(parsed.durationSec)
        ? { durationSec: parsed.durationSec }
        : {}),
      ...(typeof parsed.elapsedTimeSec === "number" && Number.isFinite(parsed.elapsedTimeSec)
        ? { elapsedTimeSec: parsed.elapsedTimeSec }
        : {}),
      ...(typeof parsed.movingTimeSec === "number" && Number.isFinite(parsed.movingTimeSec)
        ? { movingTimeSec: parsed.movingTimeSec }
        : {}),
      ...(typeof parsed.pausedTimeSec === "number" && Number.isFinite(parsed.pausedTimeSec)
        ? { pausedTimeSec: parsed.pausedTimeSec }
        : {}),
      ...(typeof parsed.distanceM === "number" && Number.isFinite(parsed.distanceM)
        ? { distanceM: parsed.distanceM }
        : {}),
      ...(parsed.source === "gps" || parsed.source === "timer" ? { source: parsed.source } : {}),
      routePoints,
    };
  } catch {
    return null;
  }
}

export async function setCompletedWalkDraft(draft: CompletedWalkDraft): Promise<void> {
  await removeLegacyActiveWalkStorage();

  const uid = currentUid();
  if (!uid) return;

  await AsyncStorage.setItem(completedWalkDraftKeyForUid(uid), JSON.stringify(draft));
}

export async function clearCompletedWalkDraft(): Promise<void> {
  const uid = currentUid();
  await clearCompletedWalkDraftForUid(uid);
}
