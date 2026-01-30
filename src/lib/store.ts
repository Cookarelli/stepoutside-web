import AsyncStorage from "@react-native-async-storage/async-storage";

export type SessionSource = "timer" | "gps";

export type OutsideSession = {
  id: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  source: SessionSource;
};

export type SummaryStats = {
  totalMinutes: number;
  totalSessions: number;
  currentStreakDays: number;
  bestStreakDays: number;
  daysCompleted: Record<string, number>; // YYYY-MM-DD -> minutes
};

const KEY_SESSIONS = "stepoutside:v2:sessions";
const KEY_SUMMARY = "stepoutside:v2:summary";

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

function computeStreaks(daysCompleted: Record<string, number>) {
  const keys = Object.keys(daysCompleted)
    .filter((k) => (daysCompleted[k] ?? 0) > 0)
    .sort(); // YYYY-MM-DD lexicographic works

  if (keys.length === 0) {
    return { current: 0, best: 0 };
  }

  // Build a set for O(1) lookups
  const set = new Set(keys);

  // current streak: walk backwards from today
  const today = new Date();
  let current = 0;
  for (let i = 0; i < 3650; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const k = dayKeyLocal(d);
    if (set.has(k)) current++;
    else break;
  }

  // best streak: scan runs across sorted keys
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
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeSessions(sessions: OutsideSession[]) {
  await AsyncStorage.setItem(KEY_SESSIONS, JSON.stringify(sessions));
}

async function readSummary(): Promise<SummaryStats> {
  const raw = await AsyncStorage.getItem(KEY_SUMMARY);
  if (!raw) {
    return {
      totalMinutes: 0,
      totalSessions: 0,
      currentStreakDays: 0,
      bestStreakDays: 0,
      daysCompleted: {},
    };
  }
  try {
    const parsed = JSON.parse(raw) as SummaryStats;
    return {
      totalMinutes: Number(parsed.totalMinutes ?? 0),
      totalSessions: Number(parsed.totalSessions ?? 0),
      currentStreakDays: Number(parsed.currentStreakDays ?? 0),
      bestStreakDays: Number(parsed.bestStreakDays ?? 0),
      daysCompleted: (parsed.daysCompleted ?? {}) as Record<string, number>,
    };
  } catch {
    return {
      totalMinutes: 0,
      totalSessions: 0,
      currentStreakDays: 0,
      bestStreakDays: 0,
      daysCompleted: {},
    };
  }
}

async function writeSummary(summary: SummaryStats) {
  await AsyncStorage.setItem(KEY_SUMMARY, JSON.stringify(summary));
}

/**
 * Public API
 */

export async function getSessions(): Promise<OutsideSession[]> {
  const sessions = await readSessions();
  // newest first
  return sessions.sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
}

export async function getSummary(): Promise<SummaryStats> {
  return await readSummary();
}

export async function resetAllData(): Promise<void> {
  await AsyncStorage.multiRemove([KEY_SESSIONS, KEY_SUMMARY]);
}

export async function addCompletedSession(session: OutsideSession): Promise<void> {
  const sessions = await readSessions();

  // de-dupe by id (important for reloads)
  const exists = sessions.some((s) => s.id === session.id);
  if (!exists) sessions.push(session);

  await writeSessions(sessions);

  // Update summary
  const summary = await readSummary();
  const mins = minutesFromDuration(session.durationSec);

  const ended = new Date(session.endedAt);
  const dk = dayKeyLocal(ended);

  const prevDay = summary.daysCompleted[dk] ?? 0;
  const nextDay = prevDay + mins;

  const nextDays = { ...summary.daysCompleted, [dk]: nextDay };

  const totalMinutes = sessions.reduce((acc, s) => acc + minutesFromDuration(s.durationSec), 0);
  const totalSessions = sessions.length;

  const { current, best } = computeStreaks(nextDays);

  const nextSummary: SummaryStats = {
    totalMinutes,
    totalSessions,
    currentStreakDays: current,
    bestStreakDays: Math.max(best, summary.bestStreakDays ?? 0),
    daysCompleted: nextDays,
  };

  await writeSummary(nextSummary);
}