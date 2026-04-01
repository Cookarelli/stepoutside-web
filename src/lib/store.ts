import AsyncStorage from "@react-native-async-storage/async-storage";

export type SessionSource = "timer" | "gps";

export type OutsideSession = {
  id: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  source: SessionSource;
  /** Optional GPS distance (meters) */
  distanceM?: number;
  sunriseBonus?: boolean;
  sunsetBonus?: boolean;
};

export type SummaryStats = {
  totalMinutes: number;
  totalSessions: number;
  currentStreakDays: number;
  bestStreakDays: number;
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
const SUMMARY_VERSION = 2;

export const EMPTY_SUMMARY: SummaryStats = {
  totalMinutes: 0,
  totalSessions: 0,
  currentStreakDays: 0,
  bestStreakDays: 0,
  sunriseBonusCount: 0,
  sunsetBonusCount: 0,
  goldenHourStreakCurrent: 0,
  goldenHourStreakBest: 0,
  dualResetDaysCount: 0,
  daysCompleted: {},
};

function clampMin1(n: number): number {
  return Math.max(1, Math.round(n));
}

export function dayKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function minutesFromDuration(durationSec: number): number {
  return clampMin1(durationSec / 60);
}

export function isGoldenHourSession(session: Pick<OutsideSession, "sunriseBonus" | "sunsetBonus">): boolean {
  return Boolean(session.sunriseBonus || session.sunsetBonus);
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

  const toDate = (k: string) => {
    const [y, m, d] = k.split("-").map((x) => Number(x));
    return new Date(y, (m ?? 1) - 1, d ?? 1);
  };

  for (let i = 1; i < keys.length; i++) {
    const prev = toDate(keys[i - 1]);
    const cur = toDate(keys[i]);
    const diffDays = Math.round((cur.getTime() - prev.getTime()) / 86400000);

    if (diffDays === 1) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }

  return { current, best };
}

async function readSessions(): Promise<OutsideSession[]> {
  const raw = await AsyncStorage.getItem(KEY_SESSIONS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as OutsideSession[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (session) =>
        typeof session?.id === "string" &&
        typeof session?.startedAt === "number" &&
        typeof session?.endedAt === "number" &&
        typeof session?.durationSec === "number" &&
        (session?.source === "timer" || session?.source === "gps")
    );
  } catch {
    return [];
  }
}

async function writeSessions(sessions: OutsideSession[]) {
  await AsyncStorage.setItem(KEY_SESSIONS, JSON.stringify(sessions));
}

async function readSummary(): Promise<{ summary: SummaryStats; version: number }> {
  const raw = await AsyncStorage.getItem(KEY_SUMMARY);
  if (!raw) return { summary: EMPTY_SUMMARY, version: 0 };
  try {
    const parsed = JSON.parse(raw) as PersistedSummaryStats;
    return {
      version: Number(parsed?.version ?? 0),
      summary: {
        totalMinutes: Number(parsed?.totalMinutes ?? 0),
        totalSessions: Number(parsed?.totalSessions ?? 0),
        currentStreakDays: Number(parsed?.currentStreakDays ?? 0),
        bestStreakDays: Number(parsed?.bestStreakDays ?? 0),
        sunriseBonusCount: Number(parsed?.sunriseBonusCount ?? 0),
        sunsetBonusCount: Number(parsed?.sunsetBonusCount ?? 0),
        goldenHourStreakCurrent: Number(parsed?.goldenHourStreakCurrent ?? 0),
        goldenHourStreakBest: Number(parsed?.goldenHourStreakBest ?? 0),
        dualResetDaysCount: Number(parsed?.dualResetDaysCount ?? 0),
        daysCompleted: Object.fromEntries(
          Object.entries(parsed?.daysCompleted ?? {}).filter(([, minutes]) => Number(minutes) > 0)
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
  const sessions = await readSessions();
  return sessions.sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
}

function summarizeSessions(sessions: OutsideSession[]): SummaryStats {
  const daysCompleted: Record<string, number> = {};
  const goldenHourDays: Record<string, number> = {};
  const dualResetFlagsByDay: Record<string, { sunrise: boolean; sunset: boolean }> = {};

  for (const session of sessions) {
    const key = dayKeyLocal(new Date(session.endedAt));
    daysCompleted[key] = (daysCompleted[key] ?? 0) + minutesFromDuration(session.durationSec);

    if (isGoldenHourSession(session)) {
      goldenHourDays[key] = 1;
    }

    const existingFlags = dualResetFlagsByDay[key] ?? { sunrise: false, sunset: false };
    dualResetFlagsByDay[key] = {
      sunrise: existingFlags.sunrise || Boolean(session.sunriseBonus),
      sunset: existingFlags.sunset || Boolean(session.sunsetBonus),
    };
  }

  const { current, best } = computeStreaks(daysCompleted);
  const goldenHourStreaks = computeStreaks(goldenHourDays);
  const dualResetDaysCount = Object.values(dualResetFlagsByDay).filter((flags) =>
    isDualResetDay(flags)
  ).length;

  return {
    totalMinutes: sessions.reduce((acc, session) => acc + minutesFromDuration(session.durationSec), 0),
    totalSessions: sessions.length,
    currentStreakDays: current,
    bestStreakDays: best,
    sunriseBonusCount: sessions.filter((session) => session.sunriseBonus).length,
    sunsetBonusCount: sessions.filter((session) => session.sunsetBonus).length,
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
): Promise<{ summary: SummaryStats }> {
  const sessions = await readSessions();

  const exists = sessions.some((s) => s.id === session.id);
  if (!exists) sessions.push(session);

  await writeSessions(sessions);
  const nextSummary = summarizeSessions(sessions);

  await writeSummary(nextSummary);
  return { summary: nextSummary };
}
