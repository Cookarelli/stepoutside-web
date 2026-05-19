import { dayKeyLocal, hasSunriseBonus, hasSunsetBonus, type OutsideSession } from "./store";

export type MonthlyComparison = {
  previousMonthLabel: string;
  activityDelta: number;
  distanceDeltaM: number;
  durationDeltaSec: number;
};

export type MonthlyActivityStats = {
  monthLabel: string;
  totalActivities: number;
  walkCount: number;
  hikeCount: number;
  totalDistanceM: number;
  totalDurationSec: number;
  averageDistanceM: number;
  bestDayKey: string | null;
  bestDayDurationSec: number;
  sunriseBonusCount: number;
  sunsetBonusCount: number;
  activeDays: number;
  longestActivity: OutsideSession | null;
  comparison: MonthlyComparison | null;
};

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function filterSessionsForMonth(sessions: OutsideSession[], target: Date): OutsideSession[] {
  const monthStart = startOfMonth(target).getTime();
  const nextMonthStart = startOfNextMonth(target).getTime();
  return sessions.filter((session) => session.endedAt >= monthStart && session.endedAt < nextMonthStart);
}

function buildMonthCore(sessions: OutsideSession[], target: Date) {
  const monthSessions = filterSessionsForMonth(sessions, target);
  const dayTotals = new Map<string, number>();

  for (const session of monthSessions) {
    const dayKey = dayKeyLocal(new Date(session.endedAt));
    dayTotals.set(dayKey, (dayTotals.get(dayKey) ?? 0) + session.durationSec);
  }

  let bestDayKey: string | null = null;
  let bestDayDurationSec = 0;
  for (const [dayKey, durationSec] of dayTotals.entries()) {
    if (durationSec > bestDayDurationSec) {
      bestDayKey = dayKey;
      bestDayDurationSec = durationSec;
    }
  }

  const totalDistanceM = monthSessions.reduce(
    (sum, session) => sum + (typeof session.distanceM === "number" && Number.isFinite(session.distanceM) ? session.distanceM : 0),
    0
  );
  const totalDurationSec = monthSessions.reduce((sum, session) => sum + Math.max(0, session.durationSec), 0);
  const longestActivity =
    monthSessions.length > 0
      ? [...monthSessions].sort((a, b) => Math.max(0, b.durationSec) - Math.max(0, a.durationSec))[0] ?? null
      : null;

  return {
    monthLabel: formatMonthLabel(target),
    totalActivities: monthSessions.length,
    walkCount: monthSessions.filter((session) => (session.activityType ?? "walk") !== "hike").length,
    hikeCount: monthSessions.filter((session) => session.activityType === "hike").length,
    totalDistanceM,
    totalDurationSec,
    averageDistanceM: monthSessions.length > 0 ? totalDistanceM / monthSessions.length : 0,
    bestDayKey,
    bestDayDurationSec,
    sunriseBonusCount: monthSessions.filter((session) => hasSunriseBonus(session)).length,
    sunsetBonusCount: monthSessions.filter((session) => hasSunsetBonus(session)).length,
    activeDays: dayTotals.size,
    longestActivity,
  };
}

export function buildMonthlyActivityStats(
  sessions: OutsideSession[],
  now: Date = new Date()
): MonthlyActivityStats {
  const currentMonth = buildMonthCore(sessions, now);
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = buildMonthCore(sessions, previousMonthDate);

  return {
    ...currentMonth,
    comparison:
      previousMonth.totalActivities > 0
        ? {
            previousMonthLabel: previousMonth.monthLabel,
            activityDelta: currentMonth.totalActivities - previousMonth.totalActivities,
            distanceDeltaM: currentMonth.totalDistanceM - previousMonth.totalDistanceM,
            durationDeltaSec: currentMonth.totalDurationSec - previousMonth.totalDurationSec,
          }
        : null,
  };
}
