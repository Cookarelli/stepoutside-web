// src/lib/statsReducer.ts

export type SessionSource = "timer" | "gps";

export type OutsideSession = {
  id: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  distanceM?: number; // optional in V1/V2 foundation
  source: SessionSource;
};

export type SummaryStats = {
  totalSessions: number;
  totalMinutes: number;

  // dayKey -> minutes completed on that day
  daysCompleted: Record<string, number>;

  currentStreakDays: number;
  bestStreakDays: number;

  lastUpdatedAt: number;
};

export function dayKeyLocal(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function minutesFromDuration(durationSec: number): number {
  return Math.max(1, Math.round(durationSec / 60));
}

function normalizeDayKey(key: string): string {
  // Expect YYYY-MM-DD. If someone passes ISO date, slice first 10 chars.
  if (key.length >= 10) return key.slice(0, 10);
  return key;
}

export function reduceSessionsToSummary(
  sessions: OutsideSession[],
  now: Date = new Date()
): SummaryStats {
  const daysCompleted: Record<string, number> = {};
  let totalSessions = 0;
  let totalMinutes = 0;

  for (const s of sessions) {
    if (!s || !Number.isFinite(s.endedAt) || !Number.isFinite(s.durationSec)) continue;

    totalSessions += 1;
    const mins = minutesFromDuration(s.durationSec);
    totalMinutes += mins;

    const dk = dayKeyLocal(new Date(s.endedAt));
    daysCompleted[dk] = (daysCompleted[dk] ?? 0) + mins;
  }

  const currentStreakDays = computeCurrentStreak(daysCompleted, now);
  const bestStreakDays = computeBestStreak(daysCompleted);

  return {
    totalSessions,
    totalMinutes,
    daysCompleted,
    currentStreakDays,
    bestStreakDays,
    lastUpdatedAt: Date.now(),
  };
}

export function computeCurrentStreak(
  daysCompleted: Record<string, number>,
  now: Date = new Date()
): number {
  // Rule: a day counts if minutes > 0.
  // We allow streak to include today if completed today.
  let streak = 0;

  for (let i = 0; i < 3650; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dk = dayKeyLocal(d);

    const mins = daysCompleted[dk] ?? 0;
    if (mins > 0) {
      streak += 1;
    } else {
      // stop on first missing day
      break;
    }
  }
  return streak;
}

export function computeBestStreak(daysCompleted: Record<string, number>): number {
  // Longest consecutive run of days where minutes > 0.
  // We sort keys, then count consecutive day gaps of exactly 1.
  const keys = Object.keys(daysCompleted)
    .map(normalizeDayKey)
    .filter((k) => (daysCompleted[k] ?? 0) > 0)
    .sort(); // YYYY-MM-DD sorts chronologically

  if (keys.length === 0) return 0;

  let best = 1;
  let cur = 1;

  const toDate = (k: string) => {
    const [y, m, d] = k.split("-").map((x) => Number(x));
    return new Date(y, (m ?? 1) - 1, d ?? 1);
  };

  for (let i = 1; i < keys.length; i++) {
    const prev = toDate(keys[i - 1]).getTime();
    const next = toDate(keys[i]).getTime();
    const diffDays = Math.round((next - prev) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      cur += 1;
      if (cur > best) best = cur;
    } else {
      cur = 1;
    }
  }

  return best;
}