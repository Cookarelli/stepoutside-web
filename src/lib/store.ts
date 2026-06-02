import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";

import { auth, db } from "./firebase";
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
  segmentStart?: boolean;
};

export type RouteCaptureStatus = "none" | "partial" | "complete";

export type GpsDiagnostics = {
  rawPoints: number;
  acceptedPoints: number;
  rejectedPoints: number;
  rejectionCounts?: Record<string, number>;
  lastRejectedReason?: string | null;
  lastAcceptedAt?: number | null;
  acceptedDistanceM?: number;
  averageAccuracy?: number | null;
  worstAccuracy?: number | null;
};

export type OutsideSession = {
  id: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  activeDurationSec?: number;
  pausedDurationSec?: number;
  totalElapsedSec?: number;
  movingDurationSec?: number;
  source: SessionSource;
  title?: string;
  activityType?: ActivityType;
  /** Optional GPS distance (meters) */
  distanceM?: number;
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
  routeCaptureStatus?: RouteCaptureStatus;
  routeCaptureInterrupted?: boolean;
  routeCaptureGapSec?: number;
  gpsDiagnostics?: GpsDiagnostics;
};

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

const KEY_SESSIONS = "stepoutside:v2:sessions";
const KEY_SUMMARY = "stepoutside:v2:summary";
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

function finiteNumberOr(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
    ...(typeof candidate.segmentStart === "boolean" ? { segmentStart: candidate.segmentStart } : {}),
  };
}

function normalizeRouteCaptureStatus(value: unknown): RouteCaptureStatus | undefined {
  if (value === "complete" || value === "partial" || value === "none") {
    return value;
  }
  return undefined;
}

function normalizeGpsDiagnostics(value: unknown): GpsDiagnostics | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = value as Partial<GpsDiagnostics>;
  if (
    typeof candidate.rawPoints !== "number" ||
    !Number.isFinite(candidate.rawPoints) ||
    typeof candidate.acceptedPoints !== "number" ||
    !Number.isFinite(candidate.acceptedPoints) ||
    typeof candidate.rejectedPoints !== "number" ||
    !Number.isFinite(candidate.rejectedPoints)
  ) {
    return undefined;
  }

  const rejectionCounts =
    candidate.rejectionCounts && typeof candidate.rejectionCounts === "object"
      ? Object.fromEntries(
          Object.entries(candidate.rejectionCounts).filter(
            ([key, count]) => typeof key === "string" && typeof count === "number" && Number.isFinite(count)
          )
        )
      : undefined;

  return {
    rawPoints: Math.max(0, Math.round(candidate.rawPoints)),
    acceptedPoints: Math.max(0, Math.round(candidate.acceptedPoints)),
    rejectedPoints: Math.max(0, Math.round(candidate.rejectedPoints)),
    ...(rejectionCounts && Object.keys(rejectionCounts).length > 0 ? { rejectionCounts } : {}),
    ...(candidate.lastRejectedReason === null || typeof candidate.lastRejectedReason === "string"
      ? { lastRejectedReason: candidate.lastRejectedReason ?? null }
      : {}),
    ...(candidate.lastAcceptedAt === null ||
    (typeof candidate.lastAcceptedAt === "number" && Number.isFinite(candidate.lastAcceptedAt))
      ? { lastAcceptedAt: candidate.lastAcceptedAt ?? null }
      : {}),
    ...(typeof candidate.acceptedDistanceM === "number" && Number.isFinite(candidate.acceptedDistanceM)
      ? { acceptedDistanceM: Math.max(0, candidate.acceptedDistanceM) }
      : {}),
    ...(candidate.averageAccuracy === null ||
    (typeof candidate.averageAccuracy === "number" && Number.isFinite(candidate.averageAccuracy))
      ? { averageAccuracy: candidate.averageAccuracy ?? null }
      : {}),
    ...(candidate.worstAccuracy === null ||
    (typeof candidate.worstAccuracy === "number" && Number.isFinite(candidate.worstAccuracy))
      ? { worstAccuracy: candidate.worstAccuracy ?? null }
      : {}),
  };
}

function normalizeActivityType(value: unknown): ActivityType {
  return value === "hike" ? "hike" : "walk";
}

function defaultSessionTitle(session: Pick<OutsideSession, "activityType">): string {
  return session.activityType === "hike" ? "Outdoor hike" : "Outdoor walk";
}

function computePaceSecPerMile(durationSec: number, distanceM?: number): number | undefined {
  if (typeof distanceM !== "number" || !Number.isFinite(distanceM) || distanceM < 25) return undefined;
  const miles = distanceM / 1609.344;
  if (miles <= 0) return undefined;
  return Math.max(1, Math.round(durationSec / miles));
}

function resolvePaceDurationSec(
  session: Pick<OutsideSession, "movingDurationSec" | "activeDurationSec" | "durationSec">
): number {
  if (typeof session.movingDurationSec === "number" && Number.isFinite(session.movingDurationSec) && session.movingDurationSec > 0) {
    return session.movingDurationSec;
  }

  if (typeof session.activeDurationSec === "number" && Number.isFinite(session.activeDurationSec) && session.activeDurationSec > 0) {
    return session.activeDurationSec;
  }

  return Math.max(0, finiteNumberOr(session.durationSec));
}

function buildSessionForStorage(session: OutsideSession, includeRoutePoints: boolean): OutsideSession {
  const routePoints =
    includeRoutePoints && Array.isArray(session.routePoints) && session.routePoints.length > 1
      ? session.routePoints
      : undefined;

  return {
    id: session.id,
    startedAt: finiteNumberOr(session.startedAt),
    endedAt: finiteNumberOr(session.endedAt),
    durationSec: Math.max(0, finiteNumberOr(session.durationSec)),
    ...(typeof session.activeDurationSec === "number" && Number.isFinite(session.activeDurationSec)
      ? { activeDurationSec: Math.max(0, session.activeDurationSec) }
      : {}),
    ...(typeof session.pausedDurationSec === "number" && Number.isFinite(session.pausedDurationSec)
      ? { pausedDurationSec: Math.max(0, session.pausedDurationSec) }
      : {}),
    ...(typeof session.totalElapsedSec === "number" && Number.isFinite(session.totalElapsedSec)
      ? { totalElapsedSec: Math.max(0, session.totalElapsedSec) }
      : {}),
    ...(typeof session.movingDurationSec === "number" && Number.isFinite(session.movingDurationSec)
      ? { movingDurationSec: Math.max(0, session.movingDurationSec) }
      : {}),
    source: session.source === "gps" ? "gps" : "timer",
    title: session.title?.trim() || defaultSessionTitle(session),
    activityType: normalizeActivityType(session.activityType),
    ...(typeof session.distanceM === "number" && Number.isFinite(session.distanceM)
      ? { distanceM: Math.max(0, session.distanceM) }
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
      : computePaceSecPerMile(resolvePaceDurationSec(session), session.distanceM)
        ? { paceSecPerMile: computePaceSecPerMile(resolvePaceDurationSec(session), session.distanceM) }
        : {}),
    ...(normalizeRouteCaptureStatus(session.routeCaptureStatus) ? { routeCaptureStatus: session.routeCaptureStatus } : {}),
    ...(typeof session.routeCaptureInterrupted === "boolean"
      ? { routeCaptureInterrupted: session.routeCaptureInterrupted }
      : {}),
    ...(typeof session.routeCaptureGapSec === "number" && Number.isFinite(session.routeCaptureGapSec)
      ? { routeCaptureGapSec: Math.max(0, session.routeCaptureGapSec) }
      : {}),
    ...(normalizeGpsDiagnostics(session.gpsDiagnostics) ? { gpsDiagnostics: normalizeGpsDiagnostics(session.gpsDiagnostics) } : {}),
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

  const payload = buildRemoteSessionPayload(session, includeRoutePoints);
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
  const raw = await AsyncStorage.getItem(KEY_SESSIONS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as OutsideSession[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((session) => {
        const routePoints = Array.isArray(session?.routePoints)
          ? session.routePoints
              .map((point) => normalizeRoutePoint(point))
              .filter((point): point is RoutePoint => point !== null)
          : undefined;

        if (
          typeof session?.id !== "string" ||
          !Number.isFinite(session?.startedAt) ||
          !Number.isFinite(session?.endedAt) ||
          !Number.isFinite(session?.durationSec) ||
          (session?.source !== "timer" && session?.source !== "gps")
        ) {
          return null;
        }

        return {
          ...buildSessionForStorage(
            {
              id: session.id,
              startedAt: finiteNumberOr(session.startedAt),
              endedAt: finiteNumberOr(session.endedAt),
              durationSec: Math.max(0, finiteNumberOr(session.durationSec)),
              activeDurationSec: finiteNumberOr(session.activeDurationSec),
              pausedDurationSec: finiteNumberOr(session.pausedDurationSec),
              totalElapsedSec: finiteNumberOr(session.totalElapsedSec),
              movingDurationSec: finiteNumberOr(session.movingDurationSec),
              source: session.source,
              title: typeof session.title === "string" ? session.title : undefined,
              activityType: normalizeActivityType(session.activityType),
          ...(typeof session.distanceM === "number" && Number.isFinite(session.distanceM)
            ? { distanceM: Math.max(0, session.distanceM) }
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
              ...(normalizeRouteCaptureStatus(session.routeCaptureStatus)
                ? { routeCaptureStatus: session.routeCaptureStatus }
                : {}),
              ...(typeof session.routeCaptureInterrupted === "boolean"
                ? { routeCaptureInterrupted: session.routeCaptureInterrupted }
                : {}),
              ...(typeof session.routeCaptureGapSec === "number" && Number.isFinite(session.routeCaptureGapSec)
                ? { routeCaptureGapSec: session.routeCaptureGapSec }
                : {}),
              ...(normalizeGpsDiagnostics(session.gpsDiagnostics)
                ? { gpsDiagnostics: normalizeGpsDiagnostics(session.gpsDiagnostics) }
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
  await AsyncStorage.setItem(KEY_SESSIONS, JSON.stringify(sessions));
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
          activeDurationSec:
            typeof remote.activeDurationSec === "number" && Number.isFinite(remote.activeDurationSec)
              ? remote.activeDurationSec
              : existing?.activeDurationSec,
          pausedDurationSec:
            typeof remote.pausedDurationSec === "number" && Number.isFinite(remote.pausedDurationSec)
              ? remote.pausedDurationSec
              : existing?.pausedDurationSec,
          totalElapsedSec:
            typeof remote.totalElapsedSec === "number" && Number.isFinite(remote.totalElapsedSec)
              ? remote.totalElapsedSec
              : existing?.totalElapsedSec,
          movingDurationSec:
            typeof remote.movingDurationSec === "number" && Number.isFinite(remote.movingDurationSec)
              ? remote.movingDurationSec
              : existing?.movingDurationSec,
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
          routeCaptureStatus: normalizeRouteCaptureStatus(remote.routeCaptureStatus) ?? existing?.routeCaptureStatus,
          routeCaptureInterrupted:
            typeof remote.routeCaptureInterrupted === "boolean"
              ? remote.routeCaptureInterrupted
              : existing?.routeCaptureInterrupted,
          routeCaptureGapSec:
            typeof remote.routeCaptureGapSec === "number" && Number.isFinite(remote.routeCaptureGapSec)
              ? remote.routeCaptureGapSec
              : existing?.routeCaptureGapSec,
          gpsDiagnostics: normalizeGpsDiagnostics(remote.gpsDiagnostics) ?? existing?.gpsDiagnostics,
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
        const routePoints = Array.isArray(remote?.routePoints)
          ? remote.routePoints
              .map((point) => normalizeRoutePoint(point))
              .filter((point): point is RoutePoint => point !== null)
          : undefined;

        const id = typeof remote.id === "string" ? remote.id : entry.id;
        if (!id || !Number.isFinite(remote.startedAt) || !Number.isFinite(remote.endedAt) || !Number.isFinite(remote.durationSec)) {
          return null;
        }

        return buildSessionForStorage(
          {
            id,
            startedAt: finiteNumberOr(remote.startedAt),
            endedAt: finiteNumberOr(remote.endedAt),
            durationSec: finiteNumberOr(remote.durationSec),
            ...(typeof remote.activeDurationSec === "number" && Number.isFinite(remote.activeDurationSec)
              ? { activeDurationSec: remote.activeDurationSec }
              : {}),
            ...(typeof remote.pausedDurationSec === "number" && Number.isFinite(remote.pausedDurationSec)
              ? { pausedDurationSec: remote.pausedDurationSec }
              : {}),
            ...(typeof remote.totalElapsedSec === "number" && Number.isFinite(remote.totalElapsedSec)
              ? { totalElapsedSec: remote.totalElapsedSec }
              : {}),
            ...(typeof remote.movingDurationSec === "number" && Number.isFinite(remote.movingDurationSec)
              ? { movingDurationSec: remote.movingDurationSec }
              : {}),
            source: remote.source === "gps" ? "gps" : "timer",
            title: typeof remote.title === "string" ? remote.title : undefined,
            activityType: normalizeActivityType(remote.activityType),
            ...(typeof remote.distanceM === "number" && Number.isFinite(remote.distanceM)
              ? { distanceM: remote.distanceM }
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
            ...(normalizeRouteCaptureStatus(remote.routeCaptureStatus)
              ? { routeCaptureStatus: remote.routeCaptureStatus }
              : {}),
            ...(typeof remote.routeCaptureInterrupted === "boolean"
              ? { routeCaptureInterrupted: remote.routeCaptureInterrupted }
              : {}),
            ...(typeof remote.routeCaptureGapSec === "number" && Number.isFinite(remote.routeCaptureGapSec)
              ? { routeCaptureGapSec: remote.routeCaptureGapSec }
              : {}),
            ...(normalizeGpsDiagnostics(remote.gpsDiagnostics)
              ? { gpsDiagnostics: normalizeGpsDiagnostics(remote.gpsDiagnostics) }
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
  const raw = await AsyncStorage.getItem(KEY_SUMMARY);
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
  const payload: PersistedSummaryStats = {
    ...summary,
    version: SUMMARY_VERSION,
  };
  await AsyncStorage.setItem(KEY_SUMMARY, JSON.stringify(payload));
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

  if (!currentUser?.uid) return local;
  if (local?.routePoints && local.routePoints.length > 1) return local;

  try {
    const snapshot = await getDoc(doc(db, "users", currentUser.uid, "sessions", id));
    if (!snapshot.exists()) return local;

    const remote = snapshot.data() as Partial<OutsideSession>;
    const routePoints = Array.isArray(remote?.routePoints)
      ? remote.routePoints
          .map((point) => normalizeRoutePoint(point))
          .filter((point): point is RoutePoint => point !== null)
      : undefined;

    const merged = buildSessionForStorage(
      {
        id: typeof remote.id === "string" ? remote.id : id,
        startedAt: finiteNumberOr(remote.startedAt, local?.startedAt ?? 0),
        endedAt: finiteNumberOr(remote.endedAt, local?.endedAt ?? 0),
        durationSec: finiteNumberOr(remote.durationSec, local?.durationSec ?? 0),
        activeDurationSec: finiteNumberOr(remote.activeDurationSec, local?.activeDurationSec ?? 0),
        pausedDurationSec: finiteNumberOr(remote.pausedDurationSec, local?.pausedDurationSec ?? 0),
        totalElapsedSec: finiteNumberOr(remote.totalElapsedSec, local?.totalElapsedSec ?? 0),
        movingDurationSec: finiteNumberOr(remote.movingDurationSec, local?.movingDurationSec ?? 0),
        source: remote.source === "gps" || remote.source === "timer" ? remote.source : local?.source ?? "timer",
        title: typeof remote.title === "string" ? remote.title : local?.title,
        activityType: normalizeActivityType(remote.activityType ?? local?.activityType),
        distanceM: finiteNumberOr(remote.distanceM, local?.distanceM ?? 0),
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
  await AsyncStorage.multiRemove([KEY_SESSIONS, KEY_SUMMARY]);
}

/** Returns summary so Complete screen can render streak immediately */
export async function addCompletedSession(
  session: OutsideSession
): Promise<{ summary: SummaryStats; sessions: OutsideSession[] }> {
  const premiumStatus = await getPremiumStatus();
  const includeRoutePoints = premiumStatus.isPremium;
  const normalized = buildSessionForStorage(session, includeRoutePoints);
  const sessions = await readSessions();

  const exists = sessions.some((s) => s.id === normalized.id);
  if (!exists) sessions.push(normalized);

  await writeSessions(sessions);
  const nextSummary = summarizeSessions(sessions);

  await writeSummary(nextSummary);
  try {
    await syncSessionToFirestore(normalized, includeRoutePoints);
  } catch {
    // Session summaries remain available locally if Firestore sync is unavailable.
  }
  return { summary: nextSummary, sessions };
}
