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

export async function clearActiveWalkStorageForUid(uid: string | null | undefined): Promise<void> {
  const keys = [LEGACY_KEY_ACTIVE_WALK, LEGACY_KEY_COMPLETED_WALK_DRAFT];
  if (uid) {
    keys.push(activeWalkKeyForUid(uid), completedWalkDraftKeyForUid(uid));
  }

  await AsyncStorage.multiRemove(keys);
}

function parseActiveWalkSnapshot(raw: string | null): ActiveWalkSnapshot | null {
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

function parseCompletedWalkDraft(raw: string | null): CompletedWalkDraft | null {
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
  const uid = currentUid();
  if (!uid) return null;

  const scopedKey = activeWalkKeyForUid(uid);
  const snapshot = parseActiveWalkSnapshot(await AsyncStorage.getItem(scopedKey));
  if (snapshot) return snapshot;

  const legacySnapshot = parseActiveWalkSnapshot(await AsyncStorage.getItem(LEGACY_KEY_ACTIVE_WALK));
  if (!legacySnapshot) {
    await AsyncStorage.removeItem(LEGACY_KEY_ACTIVE_WALK);
    return null;
  }

  await AsyncStorage.setItem(scopedKey, JSON.stringify(legacySnapshot));
  await AsyncStorage.removeItem(LEGACY_KEY_ACTIVE_WALK);
  return legacySnapshot;
}

async function removeLegacyActiveWalkSnapshot(): Promise<void> {
  await AsyncStorage.removeItem(LEGACY_KEY_ACTIVE_WALK);
}

export async function setActiveWalkSnapshot(snapshot: ActiveWalkSnapshot): Promise<void> {
  const uid = currentUid();
  if (!uid) return;

  await AsyncStorage.setItem(activeWalkKeyForUid(uid), JSON.stringify(snapshot));
  await removeLegacyActiveWalkSnapshot();
}

export async function clearActiveWalkSnapshot(): Promise<void> {
  const uid = currentUid();
  await clearActiveWalkSnapshotForUid(uid);
}

export async function hasActiveWalkSnapshot(): Promise<boolean> {
  return (await getActiveWalkSnapshot()) !== null;
}

export async function getCompletedWalkDraft(): Promise<CompletedWalkDraft | null> {
  const uid = currentUid();
  if (!uid) return parseCompletedWalkDraft(await AsyncStorage.getItem(LEGACY_KEY_COMPLETED_WALK_DRAFT));

  const scopedKey = completedWalkDraftKeyForUid(uid);
  const draft = parseCompletedWalkDraft(await AsyncStorage.getItem(scopedKey));
  if (draft) return draft;

  const legacyDraft = parseCompletedWalkDraft(await AsyncStorage.getItem(LEGACY_KEY_COMPLETED_WALK_DRAFT));
  if (!legacyDraft) {
    await AsyncStorage.removeItem(LEGACY_KEY_COMPLETED_WALK_DRAFT);
    return null;
  }

  await AsyncStorage.setItem(scopedKey, JSON.stringify(legacyDraft));
  await AsyncStorage.removeItem(LEGACY_KEY_COMPLETED_WALK_DRAFT);
  return legacyDraft;
}

async function removeLegacyCompletedWalkDraft(): Promise<void> {
  await AsyncStorage.removeItem(LEGACY_KEY_COMPLETED_WALK_DRAFT);
}

export async function setCompletedWalkDraft(draft: CompletedWalkDraft): Promise<void> {
  const uid = currentUid();
  if (!uid) {
    // Auth can briefly be null during startup. Keep a recovery handoff instead
    // of acknowledging a draft that was never persisted.
    await AsyncStorage.setItem(LEGACY_KEY_COMPLETED_WALK_DRAFT, JSON.stringify(draft));
    return;
  }

  await AsyncStorage.setItem(completedWalkDraftKeyForUid(uid), JSON.stringify(draft));
  await removeLegacyCompletedWalkDraft();
}

export async function clearCompletedWalkDraft(): Promise<void> {
  const uid = currentUid();
  await clearCompletedWalkDraftForUid(uid);
}
