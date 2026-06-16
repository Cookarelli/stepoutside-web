import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { calculateElevationGain } from "../utils/elevation";
import { calculateMovingTimeSeconds, calculatePaceMinutesPerMile } from "../utils/pace";

import { auth, db } from "./firebase";
import { refreshCurrentUserLeaderboardEntry } from "./leaderboard";
import { getPremiumStatus } from "./pro";
import type { SolarBonusType } from "./solarBonus";

export type SessionSource = "timer" | "gps";
export type ActivityType = "walk" | "hike";

export type RoutePoint = {
  lat: number;
  lng: number;
  t: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
};

export type RawRoutePoint = RoutePoint;
export type FilteredRoutePoint = RoutePoint;

export type OutsideSession = {
  id: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  elapsedTimeSec?: number;
  movingTimeSec?: number;
  pausedTimeSec?: number;
  source: SessionSource;
  title?: string;
  activityType?: ActivityType;
  /** Optional GPS distance (meters) */
  distanceM?: number;
  elevationGainMeters?: number;
  elevationGainFeet?: number;
  routePoints?: RoutePoint[];
  savedRouteAt?: number;
  shareIntentAt?: number;
  isSunriseBonus?: boolean;
  isSunsetBonus?: boolean;
  bonusType?: SolarBonusType;
  bonusLabel?: string | null;
  bonusPoints?: number | null;
  sunriseBonus?: boolean;
  sunsetBonus?: boolean;
  paceSecPerMile?: number;
};

export type SavedActivity = OutsideSession;

export type SummaryStats = {
  totalMinutes: number;
  totalSessions: number;
  currentStreakDays: number;
  bestStreakDays: number;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  activeDaysThisWeek: number;
  activeDaysThisMonth: number;
  weeklyGoal: number;
  monthlyGoal: number;
  weeklyConsistencyStreakCurrent: number;
  comebackStreakCount: number;
  streakFreezeCount: number;
  sunriseBonusCount: number;
  sunsetBonusCount: number;
  goldenHourStreakCurrent: number;
  goldenHourStreakBest: number;
  dualResetDaysCount: number;
  daysCompleted: Record<string, number>; // YYYY-MM-DD -> minutes
};

type PersistedSummaryStats = SummaryStats & {
  version?: number;
};

const LEGACY_KEY_SESSIONS = "stepoutside:v2:sessions";
const LEGACY_KEY_SUMMARY = "stepoutside:v2:summary";
const KEY_DATA_SCOPE_MIGRATION = "stepoutside:v2:user-data-scope-cleanup:v1";
const USER_DATA_PREFIX = "stepoutside:v2:user";
const SUMMARY_VERSION = 3;
const DEFAULT_WEEKLY_GOAL = 4;
const DEFAULT_MONTHLY_GOAL = 16;

export const EMPTY_SUMMARY: SummaryStats = {
  totalMinutes: 0,
  totalSessions: 0,
  currentStreakDays: 0,
  bestStreakDays: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastActivityDate: null,
  activeDaysThisWeek: 0,
  activeDaysThisMonth: 0,
  weeklyGoal: DEFAULT_WEEKLY_GOAL,
  monthlyGoal: DEFAULT_MONTHLY_GOAL,
  weeklyConsistencyStreakCurrent: 0,
  comebackStreakCount: 0,
  streakFreezeCount: 0,
  sunriseBonusCount: 0,
  sunsetBonusCount: 0,
  goldenHourStreakCurrent: 0,
  goldenHourStreakBest: 0,
  dualResetDaysCount: 0,
  daysCompleted: {},
};

function getCurrentDataUid(): string | null {
  return auth.currentUser?.uid ?? null;
}

function sessionsKeyForUid(uid: string): string {
  return `${USER_DATA_PREFIX}:${uid}:sessions`;
}

function summaryKeyForUid(uid: string): string {
  return `${USER_DATA_PREFIX}:${uid}:summary`;
}

async function cleanupLegacyUnscopedWalkStorage(): Promise<void> {
  const cleanupKeys = [LEGACY_KEY_SESSIONS, LEGACY_KEY_SUMMARY];
  const alreadyCleaned = await AsyncStorage.getItem(KEY_DATA_SCOPE_MIGRATION);

  await AsyncStorage.multiRemove(cleanupKeys);

  if (alreadyCleaned !== "done") {
    await AsyncStorage.setItem(KEY_DATA_SCOPE_MIGRATION, "done");
  }
}

async function getUserStorageScope(): Promise<{ sessionsKey: string; summaryKey: string } | null> {
  await cleanupLegacyUnscopedWalkStorage();

  const uid = getCurrentDataUid();
  if (!uid) return null;

  return {
    sessionsKey: sessionsKeyForUid(uid),
    summaryKey: summaryKeyForUid(uid),
  };
}

export async function clearUserOwnedWalkStorageForUid(uid: string | null | undefined): Promise<void> {
  const keys = [LEGACY_KEY_SESSIONS, LEGACY_KEY_SUMMARY];
  if (uid) {
    keys.push(sessionsKeyForUid(uid), summaryKeyForUid(uid));
  }

  await AsyncStorage.multiRemove(keys);
  await AsyncStorage.setItem(KEY_DATA_SCOPE_MIGRATION, "done");
}

function finiteNumberOr(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function firstFiniteNumber(candidate: unknown, ...fallbacks: unknown[]): number | undefined {
  const values = [candidate, ...fallbacks];
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function clampMin1(n: number): number {
  return Math.max(1, Math.round(n));
}

export function dayKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map((x) => Number(x));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function diffDaysBetweenKeys(a: string, b: string): number {
  const start = parseDayKey(a);
  const end = parseDayKey(b);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function startOfWeekLocal(date: Date): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function weekKeyLocal(date: Date): string {
  return dayKeyLocal(startOfWeekLocal(date));
}

function minutesFromDuration(durationSec: number): number {
  return clampMin1(durationSec / 60);
}

function normalizeRoutePoint(value: unknown): RoutePoint | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<RoutePoint>;
  if (
    typeof candidate.lat !== "number" ||
    !Number.isFinite(candidate.lat) ||
    typeof candidate.lng !== "number" ||
    !Number.isFinite(candidate.lng) ||
    typeof candidate.t !== "number" ||
    !Number.isFinite(candidate.t)
  ) {
    return null;
  }

  return {
    lat: candidate.lat,
    lng: candidate.lng,
    t: candidate.t,
    ...(typeof candidate.accuracy === "number" && Number.isFinite(candidate.accuracy)
      ? { accuracy: candidate.accuracy }
      : {}),
    ...(typeof candidate.altitude === "number" && Number.isFinite(candidate.altitude)
      ? { altitude: candidate.altitude }
      : {}),
    ...(typeof candidate.speed === "number" && Number.isFinite(candidate.speed)
      ? { speed: candidate.speed }
      : {}),
  };
}

function normalizeActivityType(value: unknown): ActivityType {
  return value === "hike" ? "hike" : "walk";
}

function resolveElapsedTimeSec(session: Record<string, unknown>): number {
  return Math.max(
    0,
    finiteNumberOr(
      firstFiniteNumber(
        session.elapsedTimeSec,
        session.elapsedSeconds,
        session.durationSec,
        session.durationSeconds
      ),
      0
    )
  );
}

function resolveMovingTimeSec(session: Record<string, unknown>): number | undefined {
  const moving = firstFiniteNumber(session.movingTimeSec, session.movingTimeSeconds);
  return typeof moving === "number" ? Math.max(0, moving) : undefined;
}

function resolvePausedTimeSec(session: Record<string, unknown>): number | undefined {
  const paused = firstFiniteNumber(session.pausedTimeSec, session.pausedSeconds);
  return typeof paused === "number" ? Math.max(0, paused) : undefined;
}

function resolveDistanceMeters(session: Record<string, unknown>): number | undefined {
  const directMeters = firstFiniteNumber(
    session.distanceM,
    session.distanceMeters,
    session.filteredDistanceMeters,
    session.totalDistance
  );
  if (typeof directMeters === "number") return Math.max(0, directMeters);

  const genericDistance = firstFiniteNumber(session.distance);
  if (typeof genericDistance === "number") return Math.max(0, genericDistance);

  const miles = firstFiniteNumber(session.distanceMiles);
  if (typeof miles === "number") return Math.max(0, miles * 1609.344);

  return undefined;
}

function defaultSessionTitle(session: Pick<OutsideSession, "activityType">): string {
  return session.activityType === "hike" ? "Outdoor hike" : "Outdoor walk";
}

function computePaceSecPerMile(durationSec: number, distanceM?: number): number | undefined {
  if (typeof distanceM !== "number" || !Number.isFinite(distanceM) || distanceM < 25) return undefined;
  const miles = distanceM / 1609.344;
  const minutesPerMile = calculatePaceMinutesPerMile(miles, durationSec);
  if (minutesPerMile === null) return undefined;
  return Math.max(1, Math.round(minutesPerMile * 60));
}

function buildSessionForStorage(session: OutsideSession, includeRoutePoints: boolean): OutsideSession {
  const routePoints =
    includeRoutePoints && Array.isArray(session.routePoints) && session.routePoints.length > 1
      ? session.routePoints
      : undefined;
  const elevationGain = calculateElevationGain(routePoints);
  const sessionRecord = session as unknown as Record<string, unknown>;
  const elapsedTimeSec = Math.max(
    0,
    resolveElapsedTimeSec(sessionRecord)
  );
  const movingTimeSec = Math.max(
    0,
    finiteNumberOr(
      resolveMovingTimeSec(sessionRecord),
      calculateMovingTimeSeconds(routePoints) ?? elapsedTimeSec
    )
  );
  const pausedTimeSec = Math.max(
    0,
    finiteNumberOr(resolvePausedTimeSec(sessionRecord), Math.max(0, elapsedTimeSec - movingTimeSec))
  );
  const distanceM = resolveDistanceMeters(sessionRecord);

  return {
    id: session.id,
    startedAt: finiteNumberOr(session.startedAt),
    endedAt: finiteNumberOr(session.endedAt),
    durationSec: elapsedTimeSec,
    elapsedTimeSec,
    movingTimeSec,
    pausedTimeSec,
    source: session.source === "gps" ? "gps" : "timer",
    title: session.title?.trim() || defaultSessionTitle(session),
    activityType: normalizeActivityType(session.activityType),
    ...(typeof distanceM === "number" && Number.isFinite(distanceM)
      ? { distanceM: Math.max(0, distanceM) }
      : {}),
    ...(typeof session.elevationGainMeters === "number" && Number.isFinite(session.elevationGainMeters)
      ? { elevationGainMeters: Math.max(0, Math.round(session.elevationGainMeters)) }
      : elevationGain
        ? { elevationGainMeters: elevationGain.elevationGainMeters }
        : {}),
    ...(typeof session.elevationGainFeet === "number" && Number.isFinite(session.elevationGainFeet)
      ? { elevationGainFeet: Math.max(0, Math.round(session.elevationGainFeet)) }
      : elevationGain
        ? { elevationGainFeet: elevationGain.elevationGainFeet }
        : {}),
    ...(typeof session.isSunriseBonus === "boolean" ? { isSunriseBonus: session.isSunriseBonus } : {}),
    ...(typeof session.isSunsetBonus === "boolean" ? { isSunsetBonus: session.isSunsetBonus } : {}),
    ...(session.bonusType === "sunrise" || session.bonusType === "sunset" ? { bonusType: session.bonusType } : {}),
    ...(session.bonusLabel === null || typeof session.bonusLabel === "string" ? { bonusLabel: session.bonusLabel ?? null } : {}),
    ...(session.bonusPoints === null || (typeof session.bonusPoints === "number" && Number.isFinite(session.bonusPoints))
      ? { bonusPoints: session.bonusPoints ?? null }
      : {}),
    ...(typeof session.sunriseBonus === "boolean" ? { sunriseBonus: session.sunriseBonus } : {}),
    ...(typeof session.sunsetBonus === "boolean" ? { sunsetBonus: session.sunsetBonus } : {}),
    ...(typeof session.savedRouteAt === "number" && Number.isFinite(session.savedRouteAt)
      ? { savedRouteAt: session.savedRouteAt }
      : {}),
    ...(typeof session.shareIntentAt === "number" && Number.isFinite(session.shareIntentAt)
      ? { shareIntentAt: session.shareIntentAt }
      : {}),
    ...(typeof session.paceSecPerMile === "number" && Number.isFinite(session.paceSecPerMile)
      ? { paceSecPerMile: session.paceSecPerMile }
      : computePaceSecPerMile(movingTimeSec, distanceM)
        ? { paceSecPerMile: computePaceSecPerMile(movingTimeSec, distanceM) }
        : {}),
    ...(routePoints ? { routePoints } : {}),
  };
}

function buildRemoteSessionPayload(session: OutsideSession, includeRoutePoints: boolean) {
  const normalized = buildSessionForStorage(session, includeRoutePoints);
  return {
    ...normalized,
    endedDayKey: dayKeyLocal(new Date(normalized.endedAt)),
    routePointCount: session.routePoints?.length ?? 0,
    hasRoutePoints: includeRoutePoints && (session.routePoints?.length ?? 0) > 1,
    updatedAt: Date.now(),
  };
}

async function syncSessionToFirestore(session: OutsideSession, includeRoutePoints: boolean): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) return;

  const payload = {
    ...buildRemoteSessionPayload(session, includeRoutePoints),
    ownerUid: currentUser.uid,
    userId: currentUser.uid,
  };
  await setDoc(doc(db, "users", currentUser.uid, "sessions", session.id), payload, { merge: true });
}

export function hasSunriseBonus(session: Pick<OutsideSession, "isSunriseBonus" | "sunriseBonus">): boolean {
  return Boolean(session.isSunriseBonus || session.sunriseBonus);
}

export function hasSunsetBonus(session: Pick<OutsideSession, "isSunsetBonus" | "sunsetBonus">): boolean {
  return Boolean(session.isSunsetBonus || session.sunsetBonus);
}

export function isGoldenHourSession(
  session: Pick<OutsideSession, "isSunriseBonus" | "isSunsetBonus" | "sunriseBonus" | "sunsetBonus">
): boolean {
  return hasSunriseBonus(session) || hasSunsetBonus(session);
}

export function isDualResetDay(
  value:
    | {
        sunrise: boolean;
        sunset: boolean;
      }
    | undefined
): boolean {
  return Boolean(value?.sunrise && value?.sunset);
}

function computeStreaks(daysCompleted: Record<string, number>) {
  const keys = Object.keys(daysCompleted)
    .filter((k) => (daysCompleted[k] ?? 0) > 0)
    .sort();

  if (keys.length === 0) return { current: 0, best: 0 };

  const set = new Set(keys);

  const today = new Date();
  let current = 0;
  for (let i = 0; i < 3650; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const k = dayKeyLocal(d);
    if (set.has(k)) current++;
    else break;
  }

  let best = 1;
  let run = 1;

  for (let i = 1; i < keys.length; i++) {
    const diffDays = diffDaysBetweenKeys(keys[i - 1], keys[i]);

    if (diffDays === 1) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }

  return { current, best };
}

function countActiveDaysThisWeek(daysCompleted: Record<string, number>, now: Date): number {
  const start = startOfWeekLocal(now);
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const current = new Date(start);
    current.setDate(start.getDate() + i);
    const key = dayKeyLocal(current);
    if ((daysCompleted[key] ?? 0) > 0) count += 1;
  }
  return count;
}

function countActiveDaysThisMonth(daysCompleted: Record<string, number>, now: Date): number {
  const year = now.getFullYear();
  const month = now.getMonth();
  return Object.keys(daysCompleted).filter((key) => {
    if ((daysCompleted[key] ?? 0) <= 0) return false;
    const date = parseDayKey(key);
    return date.getFullYear() === year && date.getMonth() === month;
  }).length;
}

function computeComebackStreakCount(activeDayKeys: string[]): number {
  if (activeDayKeys.length <= 1) return 0;
  let count = 0;
  for (let i = 1; i < activeDayKeys.length; i++) {
    if (diffDaysBetweenKeys(activeDayKeys[i - 1], activeDayKeys[i]) > 1) {
      count += 1;
    }
  }
  return count;
}

function computeWeeklyConsistencyStreak(
  daysCompleted: Record<string, number>,
  weeklyGoal: number,
  now: Date
): number {
  if (weeklyGoal <= 0) return 0;

  const countsByWeek: Record<string, number> = {};
  for (const key of Object.keys(daysCompleted)) {
    if ((daysCompleted[key] ?? 0) <= 0) continue;
    const weekKey = weekKeyLocal(parseDayKey(key));
    countsByWeek[weekKey] = (countsByWeek[weekKey] ?? 0) + 1;
  }

  let streak = 0;
  let cursor = startOfWeekLocal(now);

  for (let i = 0; i < 520; i++) {
    const weekKey = dayKeyLocal(cursor);
    if ((countsByWeek[weekKey] ?? 0) >= weeklyGoal) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 7);
      continue;
    }
    break;
  }

  return streak;
}

async function readSessions(): Promise<OutsideSession[]> {
  const scope = await getUserStorageScope();
  if (!scope) return [];

  const raw = await AsyncStorage.getItem(scope.sessionsKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as OutsideSession[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((session) => {
        const rawSession = session as unknown as Record<string, unknown>;
        const routePoints = Array.isArray(session?.routePoints)
          ? session.routePoints
              .map((point) => normalizeRoutePoint(point))
              .filter((point): point is RoutePoint => point !== null)
          : undefined;
        const durationSec = firstFiniteNumber(
          rawSession.durationSec,
          rawSession.durationSeconds,
          rawSession.elapsedTimeSec,
          rawSession.elapsedSeconds
        );

        if (
          typeof session?.id !== "string" ||
          !Number.isFinite(session?.startedAt) ||
          !Number.isFinite(session?.endedAt) ||
          !Number.isFinite(durationSec) ||
          (session?.source !== "timer" && session?.source !== "gps")
        ) {
          return null;
        }

        return {
          ...buildSessionForStorage(
            {
              ...(rawSession as unknown as OutsideSession),
              id: session.id,
              startedAt: finiteNumberOr(session.startedAt),
              endedAt: finiteNumberOr(session.endedAt),
              durationSec: Math.max(0, finiteNumberOr(durationSec)),
              ...(typeof session.elapsedTimeSec === "number" && Number.isFinite(session.elapsedTimeSec)
                ? { elapsedTimeSec: session.elapsedTimeSec }
                : {}),
              ...(typeof session.movingTimeSec === "number" && Number.isFinite(session.movingTimeSec)
                ? { movingTimeSec: session.movingTimeSec }
                : {}),
              ...(typeof session.pausedTimeSec === "number" && Number.isFinite(session.pausedTimeSec)
                ? { pausedTimeSec: session.pausedTimeSec }
                : {}),
              source: session.source,
              title: typeof session.title === "string" ? session.title : undefined,
              activityType: normalizeActivityType(session.activityType),
          ...(typeof session.distanceM === "number" && Number.isFinite(session.distanceM)
            ? { distanceM: Math.max(0, session.distanceM) }
            : {}),
          ...(typeof session.elevationGainMeters === "number" && Number.isFinite(session.elevationGainMeters)
            ? { elevationGainMeters: Math.max(0, session.elevationGainMeters) }
            : {}),
          ...(typeof session.elevationGainFeet === "number" && Number.isFinite(session.elevationGainFeet)
            ? { elevationGainFeet: Math.max(0, session.elevationGainFeet) }
            : {}),
          ...(typeof session.isSunriseBonus === "boolean" ? { isSunriseBonus: session.isSunriseBonus } : {}),
          ...(typeof session.isSunsetBonus === "boolean" ? { isSunsetBonus: session.isSunsetBonus } : {}),
          ...(session.bonusType === "sunrise" || session.bonusType === "sunset" ? { bonusType: session.bonusType } : {}),
          ...(session.bonusLabel === null || typeof session.bonusLabel === "string"
            ? { bonusLabel: session.bonusLabel ?? null }
            : {}),
          ...(session.bonusPoints === null || (typeof session.bonusPoints === "number" && Number.isFinite(session.bonusPoints))
            ? { bonusPoints: session.bonusPoints ?? null }
            : {}),
          ...(typeof session.sunriseBonus === "boolean" ? { sunriseBonus: session.sunriseBonus } : {}),
          ...(typeof session.sunsetBonus === "boolean" ? { sunsetBonus: session.sunsetBonus } : {}),
              ...(routePoints && routePoints.length > 0 ? { routePoints } : {}),
              ...(typeof session.savedRouteAt === "number" && Number.isFinite(session.savedRouteAt)
                ? { savedRouteAt: session.savedRouteAt }
                : {}),
              ...(typeof session.shareIntentAt === "number" && Number.isFinite(session.shareIntentAt)
                ? { shareIntentAt: session.shareIntentAt }
                : {}),
              ...(typeof session.paceSecPerMile === "number" && Number.isFinite(session.paceSecPerMile)
                ? { paceSecPerMile: session.paceSecPerMile }
                : {}),
            },
            true
          ),
        };
      })
      .filter((session): session is OutsideSession => session !== null);
  } catch {
    return [];
  }
}

async function writeSessions(sessions: OutsideSession[]) {
  const scope = await getUserStorageScope();
  if (!scope) return;

  await AsyncStorage.setItem(scope.sessionsKey, JSON.stringify(sessions));
}

function mergeSessionLists(localSessions: OutsideSession[], remoteSessions: OutsideSession[]): OutsideSession[] {
  const merged = new Map<string, OutsideSession>();

  for (const session of localSessions) {
    merged.set(session.id, session);
  }

  for (const remote of remoteSessions) {
    const existing = merged.get(remote.id);
    merged.set(
      remote.id,
      buildSessionForStorage(
        {
          ...existing,
          ...remote,
          id: remote.id,
          routePoints: remote.routePoints ?? existing?.routePoints,
          title: remote.title ?? existing?.title,
          activityType: remote.activityType ?? existing?.activityType,
          distanceM:
            typeof remote.distanceM === "number" && Number.isFinite(remote.distanceM)
              ? remote.distanceM
              : existing?.distanceM,
          elevationGainMeters:
            typeof remote.elevationGainMeters === "number" && Number.isFinite(remote.elevationGainMeters)
              ? remote.elevationGainMeters
              : existing?.elevationGainMeters,
          elevationGainFeet:
            typeof remote.elevationGainFeet === "number" && Number.isFinite(remote.elevationGainFeet)
              ? remote.elevationGainFeet
              : existing?.elevationGainFeet,
          elapsedTimeSec:
            typeof remote.elapsedTimeSec === "number" && Number.isFinite(remote.elapsedTimeSec)
              ? remote.elapsedTimeSec
              : existing?.elapsedTimeSec,
          movingTimeSec:
            typeof remote.movingTimeSec === "number" && Number.isFinite(remote.movingTimeSec)
              ? remote.movingTimeSec
              : existing?.movingTimeSec,
          pausedTimeSec:
            typeof remote.pausedTimeSec === "number" && Number.isFinite(remote.pausedTimeSec)
              ? remote.pausedTimeSec
              : existing?.pausedTimeSec,
          isSunriseBonus:
            typeof remote.isSunriseBonus === "boolean" ? remote.isSunriseBonus : existing?.isSunriseBonus,
          isSunsetBonus:
            typeof remote.isSunsetBonus === "boolean" ? remote.isSunsetBonus : existing?.isSunsetBonus,
          bonusType:
            remote.bonusType === "sunrise" || remote.bonusType === "sunset"
              ? remote.bonusType
              : existing?.bonusType ?? null,
          bonusLabel:
            remote.bonusLabel === null || typeof remote.bonusLabel === "string"
              ? remote.bonusLabel
              : existing?.bonusLabel,
          bonusPoints:
            remote.bonusPoints === null || (typeof remote.bonusPoints === "number" && Number.isFinite(remote.bonusPoints))
              ? remote.bonusPoints
              : existing?.bonusPoints,
          sunriseBonus: typeof remote.sunriseBonus === "boolean" ? remote.sunriseBonus : existing?.sunriseBonus,
          sunsetBonus: typeof remote.sunsetBonus === "boolean" ? remote.sunsetBonus : existing?.sunsetBonus,
          savedRouteAt:
            typeof remote.savedRouteAt === "number" && Number.isFinite(remote.savedRouteAt)
              ? remote.savedRouteAt
              : existing?.savedRouteAt,
          shareIntentAt:
            typeof remote.shareIntentAt === "number" && Number.isFinite(remote.shareIntentAt)
              ? remote.shareIntentAt
              : existing?.shareIntentAt,
          paceSecPerMile:
            typeof remote.paceSecPerMile === "number" && Number.isFinite(remote.paceSecPerMile)
              ? remote.paceSecPerMile
              : existing?.paceSecPerMile,
        },
        true
      )
    );
  }

  return Array.from(merged.values());
}

async function readRemoteSessions(): Promise<OutsideSession[]> {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) return [];

  try {
    const snapshot = await getDocs(collection(db, "users", currentUser.uid, "sessions"));
    return snapshot.docs
      .map((entry) => {
        const remote = entry.data() as Partial<OutsideSession>;
        const rawRemote = remote as unknown as Record<string, unknown>;
        const routePoints = Array.isArray(remote?.routePoints)
          ? remote.routePoints
              .map((point) => normalizeRoutePoint(point))
              .filter((point): point is RoutePoint => point !== null)
          : undefined;

        const id = typeof remote.id === "string" ? remote.id : entry.id;
        const durationSec = firstFiniteNumber(
          rawRemote.durationSec,
          rawRemote.durationSeconds,
          rawRemote.elapsedTimeSec,
          rawRemote.elapsedSeconds
        );
        if (!id || !Number.isFinite(remote.startedAt) || !Number.isFinite(remote.endedAt) || !Number.isFinite(durationSec)) {
          return null;
        }

        return buildSessionForStorage(
          {
            ...(rawRemote as unknown as OutsideSession),
            id,
            startedAt: finiteNumberOr(remote.startedAt),
            endedAt: finiteNumberOr(remote.endedAt),
            durationSec: finiteNumberOr(durationSec),
            ...(typeof remote.elapsedTimeSec === "number" && Number.isFinite(remote.elapsedTimeSec)
              ? { elapsedTimeSec: remote.elapsedTimeSec }
              : {}),
            ...(typeof remote.movingTimeSec === "number" && Number.isFinite(remote.movingTimeSec)
              ? { movingTimeSec: remote.movingTimeSec }
              : {}),
            ...(typeof remote.pausedTimeSec === "number" && Number.isFinite(remote.pausedTimeSec)
              ? { pausedTimeSec: remote.pausedTimeSec }
              : {}),
            source: remote.source === "gps" ? "gps" : "timer",
            title: typeof remote.title === "string" ? remote.title : undefined,
            activityType: normalizeActivityType(remote.activityType),
            ...(typeof remote.distanceM === "number" && Number.isFinite(remote.distanceM)
              ? { distanceM: remote.distanceM }
              : {}),
            ...(typeof remote.elevationGainMeters === "number" && Number.isFinite(remote.elevationGainMeters)
              ? { elevationGainMeters: remote.elevationGainMeters }
              : {}),
            ...(typeof remote.elevationGainFeet === "number" && Number.isFinite(remote.elevationGainFeet)
              ? { elevationGainFeet: remote.elevationGainFeet }
              : {}),
            ...(typeof remote.isSunriseBonus === "boolean" ? { isSunriseBonus: remote.isSunriseBonus } : {}),
            ...(typeof remote.isSunsetBonus === "boolean" ? { isSunsetBonus: remote.isSunsetBonus } : {}),
            ...(remote.bonusType === "sunrise" || remote.bonusType === "sunset" ? { bonusType: remote.bonusType } : {}),
            ...(remote.bonusLabel === null || typeof remote.bonusLabel === "string"
              ? { bonusLabel: remote.bonusLabel ?? null }
              : {}),
            ...(remote.bonusPoints === null ||
            (typeof remote.bonusPoints === "number" && Number.isFinite(remote.bonusPoints))
              ? { bonusPoints: remote.bonusPoints ?? null }
              : {}),
            ...(typeof remote.sunriseBonus === "boolean" ? { sunriseBonus: remote.sunriseBonus } : {}),
            ...(typeof remote.sunsetBonus === "boolean" ? { sunsetBonus: remote.sunsetBonus } : {}),
            ...(typeof remote.savedRouteAt === "number" && Number.isFinite(remote.savedRouteAt)
              ? { savedRouteAt: remote.savedRouteAt }
              : {}),
            ...(typeof remote.shareIntentAt === "number" && Number.isFinite(remote.shareIntentAt)
              ? { shareIntentAt: remote.shareIntentAt }
              : {}),
            ...(typeof remote.paceSecPerMile === "number" && Number.isFinite(remote.paceSecPerMile)
              ? { paceSecPerMile: remote.paceSecPerMile }
              : {}),
            ...(routePoints && routePoints.length > 0 ? { routePoints } : {}),
          },
          true
        );
      })
      .filter((session): session is OutsideSession => session !== null);
  } catch {
    return [];
  }
}

async function readSummary(): Promise<{ summary: SummaryStats; version: number }> {
  const scope = await getUserStorageScope();
  if (!scope) return { summary: EMPTY_SUMMARY, version: SUMMARY_VERSION };

  const raw = await AsyncStorage.getItem(scope.summaryKey);
  if (!raw) return { summary: EMPTY_SUMMARY, version: 0 };
  try {
    const parsed = JSON.parse(raw) as PersistedSummaryStats;
    const parsedDaysCompleted =
      parsed?.daysCompleted && typeof parsed.daysCompleted === "object" && !Array.isArray(parsed.daysCompleted)
        ? parsed.daysCompleted
        : {};

    return {
      version: finiteNumberOr(parsed?.version, 0),
      summary: {
        totalMinutes: Math.max(0, finiteNumberOr(parsed?.totalMinutes, 0)),
        totalSessions: Math.max(0, finiteNumberOr(parsed?.totalSessions, 0)),
        currentStreakDays: Math.max(0, finiteNumberOr(parsed?.currentStreakDays, 0)),
        bestStreakDays: Math.max(0, finiteNumberOr(parsed?.bestStreakDays, 0)),
        currentStreak: Math.max(
          0,
          finiteNumberOr(parsed?.currentStreak, finiteNumberOr(parsed?.currentStreakDays, 0))
        ),
        longestStreak: Math.max(
          0,
          finiteNumberOr(parsed?.longestStreak, finiteNumberOr(parsed?.bestStreakDays, 0))
        ),
        lastActivityDate: typeof parsed?.lastActivityDate === "string" ? parsed.lastActivityDate : null,
        activeDaysThisWeek: Math.max(0, finiteNumberOr(parsed?.activeDaysThisWeek, 0)),
        activeDaysThisMonth: Math.max(0, finiteNumberOr(parsed?.activeDaysThisMonth, 0)),
        weeklyGoal: Math.max(1, finiteNumberOr(parsed?.weeklyGoal, DEFAULT_WEEKLY_GOAL)),
        monthlyGoal: Math.max(1, finiteNumberOr(parsed?.monthlyGoal, DEFAULT_MONTHLY_GOAL)),
        weeklyConsistencyStreakCurrent: Math.max(
          0,
          finiteNumberOr(parsed?.weeklyConsistencyStreakCurrent, 0)
        ),
        comebackStreakCount: Math.max(0, finiteNumberOr(parsed?.comebackStreakCount, 0)),
        streakFreezeCount: Math.max(0, finiteNumberOr(parsed?.streakFreezeCount, 0)),
        sunriseBonusCount: Math.max(0, finiteNumberOr(parsed?.sunriseBonusCount, 0)),
        sunsetBonusCount: Math.max(0, finiteNumberOr(parsed?.sunsetBonusCount, 0)),
        goldenHourStreakCurrent: Math.max(0, finiteNumberOr(parsed?.goldenHourStreakCurrent, 0)),
        goldenHourStreakBest: Math.max(0, finiteNumberOr(parsed?.goldenHourStreakBest, 0)),
        dualResetDaysCount: Math.max(0, finiteNumberOr(parsed?.dualResetDaysCount, 0)),
        daysCompleted: Object.fromEntries(
          Object.entries(parsedDaysCompleted)
            .map(([key, minutes]) => [key, finiteNumberOr(minutes, 0)] as const)
            .filter(([, minutes]) => minutes > 0)
        ) as Record<string, number>,
      },
    };
  } catch {
    return { summary: EMPTY_SUMMARY, version: 0 };
  }
}

async function writeSummary(summary: SummaryStats) {
  const scope = await getUserStorageScope();
  if (!scope) return;

  const payload: PersistedSummaryStats = {
    ...summary,
    version: SUMMARY_VERSION,
  };
  await AsyncStorage.setItem(scope.summaryKey, JSON.stringify(payload));
}

export async function getSessions(): Promise<OutsideSession[]> {
  const localSessions = await readSessions();
  const remoteSessions = await readRemoteSessions();

  if (remoteSessions.length === 0) {
    return localSessions.sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
  }

  const mergedSessions = mergeSessionLists(localSessions, remoteSessions);
  await writeSessions(mergedSessions);
  return mergedSessions.sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
}

export async function getSessionById(id: string): Promise<OutsideSession | null> {
  if (!id) return null;
  const sessions = await readSessions();
  const local = sessions.find((session) => session.id === id) ?? null;
  const currentUser = auth.currentUser;

  if (!currentUser?.uid) return null;
  if (local?.routePoints && local.routePoints.length > 1) return local;

  try {
    const snapshot = await getDoc(doc(db, "users", currentUser.uid, "sessions", id));
    if (!snapshot.exists()) return local;

    const remote = snapshot.data() as Partial<OutsideSession>;
    const rawRemote = remote as unknown as Record<string, unknown>;
    const routePoints = Array.isArray(remote?.routePoints)
      ? remote.routePoints
          .map((point) => normalizeRoutePoint(point))
          .filter((point): point is RoutePoint => point !== null)
      : undefined;
    const durationSec = firstFiniteNumber(
      rawRemote.durationSec,
      rawRemote.durationSeconds,
      rawRemote.elapsedTimeSec,
      rawRemote.elapsedSeconds,
      local?.durationSec
    );

    const merged = buildSessionForStorage(
      {
        ...(rawRemote as unknown as OutsideSession),
        id: typeof remote.id === "string" ? remote.id : id,
        startedAt: finiteNumberOr(remote.startedAt, local?.startedAt ?? 0),
        endedAt: finiteNumberOr(remote.endedAt, local?.endedAt ?? 0),
        durationSec: finiteNumberOr(durationSec, local?.durationSec ?? 0),
        elapsedTimeSec: finiteNumberOr(remote.elapsedTimeSec, local?.elapsedTimeSec ?? local?.durationSec ?? 0),
        movingTimeSec: finiteNumberOr(remote.movingTimeSec, local?.movingTimeSec ?? 0),
        pausedTimeSec: finiteNumberOr(remote.pausedTimeSec, local?.pausedTimeSec ?? 0),
        source: remote.source === "gps" || remote.source === "timer" ? remote.source : local?.source ?? "timer",
        title: typeof remote.title === "string" ? remote.title : local?.title,
        activityType: normalizeActivityType(remote.activityType ?? local?.activityType),
        distanceM: finiteNumberOr(remote.distanceM, local?.distanceM ?? 0),
        elevationGainMeters:
          finiteNumberOr(remote.elevationGainMeters, local?.elevationGainMeters ?? 0) || undefined,
        elevationGainFeet:
          finiteNumberOr(remote.elevationGainFeet, local?.elevationGainFeet ?? 0) || undefined,
        isSunriseBonus:
          typeof remote.isSunriseBonus === "boolean" ? remote.isSunriseBonus : local?.isSunriseBonus,
        isSunsetBonus:
          typeof remote.isSunsetBonus === "boolean" ? remote.isSunsetBonus : local?.isSunsetBonus,
        bonusType:
          remote.bonusType === "sunrise" || remote.bonusType === "sunset"
            ? remote.bonusType
            : local?.bonusType ?? null,
        bonusLabel:
          remote.bonusLabel === null || typeof remote.bonusLabel === "string"
            ? remote.bonusLabel
            : local?.bonusLabel,
        bonusPoints:
          remote.bonusPoints === null || (typeof remote.bonusPoints === "number" && Number.isFinite(remote.bonusPoints))
            ? remote.bonusPoints
            : local?.bonusPoints,
        sunriseBonus: typeof remote.sunriseBonus === "boolean" ? remote.sunriseBonus : local?.sunriseBonus,
        sunsetBonus: typeof remote.sunsetBonus === "boolean" ? remote.sunsetBonus : local?.sunsetBonus,
        savedRouteAt: finiteNumberOr(remote.savedRouteAt, local?.savedRouteAt ?? 0) || undefined,
        shareIntentAt: finiteNumberOr(remote.shareIntentAt, local?.shareIntentAt ?? 0) || undefined,
        paceSecPerMile:
          typeof remote.paceSecPerMile === "number" && Number.isFinite(remote.paceSecPerMile)
            ? remote.paceSecPerMile
            : local?.paceSecPerMile,
        routePoints: routePoints ?? local?.routePoints,
      },
      true
    );

    return merged;
  } catch {
    return local;
  }
}

export async function saveSessionRouteForLater(id: string): Promise<OutsideSession | null> {
  if (!id) return null;

  const sessions = await readSessions();
  const nextSavedAt = Date.now();
  let nextSession: OutsideSession | null = null;

  const nextSessions = sessions.map((session) => {
    if (session.id !== id) return session;
    if ((session.routePoints?.length ?? 0) < 2) return session;

    nextSession = {
      ...session,
      savedRouteAt: session.savedRouteAt ?? nextSavedAt,
      shareIntentAt: session.shareIntentAt ?? nextSavedAt,
    };

    return nextSession;
  });

  if (!nextSession) return null;

  await writeSessions(nextSessions);
  try {
    await syncSessionToFirestore(nextSession, true);
  } catch {
    // Keep local saved-route state even if cloud sync is unavailable.
  }
  return nextSession;
}

export async function getSavedRouteSessions(): Promise<OutsideSession[]> {
  const sessions = await readSessions();
  return sessions
    .filter((session) => Boolean(session.savedRouteAt) && (session.routePoints?.length ?? 0) > 1)
    .sort((a, b) => (b.savedRouteAt ?? 0) - (a.savedRouteAt ?? 0));
}

function summarizeSessions(sessions: OutsideSession[]): SummaryStats {
  const daysCompleted: Record<string, number> = {};
  const goldenHourDays: Record<string, number> = {};
  const dualResetFlagsByDay: Record<string, { sunrise: boolean; sunset: boolean }> = {};
  const now = new Date();
  const weeklyGoal = DEFAULT_WEEKLY_GOAL;
  const monthlyGoal = DEFAULT_MONTHLY_GOAL;

  for (const session of sessions) {
    const key = dayKeyLocal(new Date(session.endedAt));
    daysCompleted[key] = (daysCompleted[key] ?? 0) + minutesFromDuration(session.durationSec);

    if (isGoldenHourSession(session)) {
      goldenHourDays[key] = 1;
    }

    const existingFlags = dualResetFlagsByDay[key] ?? { sunrise: false, sunset: false };
    dualResetFlagsByDay[key] = {
      sunrise: existingFlags.sunrise || hasSunriseBonus(session),
      sunset: existingFlags.sunset || hasSunsetBonus(session),
    };
  }

  const { current, best } = computeStreaks(daysCompleted);
  const goldenHourStreaks = computeStreaks(goldenHourDays);
  const dualResetDaysCount = Object.values(dualResetFlagsByDay).filter((flags) =>
    isDualResetDay(flags)
  ).length;
  const activeDayKeys = Object.keys(daysCompleted)
    .filter((key) => (daysCompleted[key] ?? 0) > 0)
    .sort();
  const lastActivityDate = activeDayKeys.at(-1) ?? null;
  const activeDaysThisWeek = countActiveDaysThisWeek(daysCompleted, now);
  const activeDaysThisMonth = countActiveDaysThisMonth(daysCompleted, now);
  const comebackStreakCount = computeComebackStreakCount(activeDayKeys);
  const weeklyConsistencyStreakCurrent = computeWeeklyConsistencyStreak(daysCompleted, weeklyGoal, now);

  return {
    totalMinutes: sessions.reduce((acc, session) => acc + minutesFromDuration(session.durationSec), 0),
    totalSessions: sessions.length,
    currentStreakDays: current,
    bestStreakDays: best,
    currentStreak: current,
    longestStreak: best,
    lastActivityDate,
    activeDaysThisWeek,
    activeDaysThisMonth,
    weeklyGoal,
    monthlyGoal,
    weeklyConsistencyStreakCurrent,
    comebackStreakCount,
    streakFreezeCount: 0,
    sunriseBonusCount: sessions.filter((session) => hasSunriseBonus(session)).length,
    sunsetBonusCount: sessions.filter((session) => hasSunsetBonus(session)).length,
    goldenHourStreakCurrent: goldenHourStreaks.current,
    goldenHourStreakBest: goldenHourStreaks.best,
    dualResetDaysCount,
    daysCompleted,
  };
}

export async function getSummary(): Promise<SummaryStats> {
  const [{ summary, version }, sessions] = await Promise.all([readSummary(), readSessions()]);

  const summaryLooksMissing =
    summary.totalSessions === 0 &&
    summary.totalMinutes === 0 &&
    Object.keys(summary.daysCompleted).length === 0;

  const summaryLooksOutOfSync =
    summary.totalSessions !== sessions.length ||
    (sessions.length > 0 && Object.keys(summary.daysCompleted).length === 0);

  const summaryNeedsMigration = version < SUMMARY_VERSION;

  if (summaryLooksMissing && sessions.length === 0) return EMPTY_SUMMARY;

  if (summaryLooksMissing || summaryLooksOutOfSync || summaryNeedsMigration) {
    const rebuilt = summarizeSessions(sessions);
    await writeSummary(rebuilt);
    return rebuilt;
  }

  return summary;
}

export async function resetAllData(): Promise<void> {
  await clearUserOwnedWalkStorageForUid(getCurrentDataUid());
}

/** Returns summary so Complete screen can render streak immediately */
export async function addCompletedSession(
  session: OutsideSession
): Promise<{ summary: SummaryStats; session: OutsideSession }> {
  if (!getCurrentDataUid()) {
    const normalized = buildSessionForStorage(session, true);
    return { summary: EMPTY_SUMMARY, session: normalized };
  }

  const premiumStatus = await getPremiumStatus();
  const includeRoutePoints = premiumStatus.isPremium;
  const normalized = buildSessionForStorage(session, includeRoutePoints);
  const sessions = await readSessions();
  const existingIndex = sessions.findIndex((s) => s.id === normalized.id);
  if (existingIndex >= 0) {
    sessions[existingIndex] = normalized;
  } else {
    sessions.push(normalized);
  }

  await writeSessions(sessions);
  const nextSummary = summarizeSessions(sessions);

  await writeSummary(nextSummary);
  try {
    await refreshCurrentUserLeaderboardEntry(sessions);
  } catch {
    // Leaderboard sync should never block saving a completed walk.
  }
  try {
    await syncSessionToFirestore(normalized, includeRoutePoints);
  } catch {
    // Session summaries remain available locally if Firestore sync is unavailable.
  }
  return { summary: nextSummary, session: normalized };
}
