import {
  dayKeyLocal,
  hasSunriseBonus,
  hasSunsetBonus,
  isGoldenHourSession,
  type OutsideSession,
  type SummaryStats,
} from "../store";
import { BADGE_CATALOG, CHALLENGE_CATALOG } from "./catalog";
import type {
  BadgeUnlockState,
  ChallengeDefinition,
  ChallengeEvaluationContext,
  ChallengeMetric,
  LocalChallengeProgress,
} from "./types";

const MILES_TO_METERS = 1609.344;

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function countUniqueDays(sessions: OutsideSession[]): number {
  return new Set(sessions.map((session) => dayKeyLocal(new Date(session.endedAt)))).size;
}

function isWeekendSession(session: OutsideSession): boolean {
  const day = new Date(session.endedAt).getDay();
  return day === 0 || day === 6;
}

function isWithinWindow(session: OutsideSession, window: ChallengeDefinition["window"], now: Date): boolean {
  const endedAt = session.endedAt;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  switch (window) {
    case "weekly": {
      const weekStart = new Date(start);
      weekStart.setDate(start.getDate() - start.getDay());
      return endedAt >= weekStart.getTime();
    }
    case "monthly": {
      const monthStart = new Date(start.getFullYear(), start.getMonth(), 1).getTime();
      return endedAt >= monthStart;
    }
    case "rolling_7d":
      return endedAt >= now.getTime() - 7 * 86400000;
    case "rolling_30d":
      return endedAt >= now.getTime() - 30 * 86400000;
    case "all_time":
    default:
      return true;
  }
}

function sessionsInWindow(sessions: OutsideSession[], window: ChallengeDefinition["window"], now: Date): OutsideSession[] {
  return sessions.filter((session) => isWithinWindow(session, window, now));
}

export function metricProgressValue(metric: ChallengeMetric, sessions: OutsideSession[], summary: SummaryStats): number {
  switch (metric) {
    case "sessions":
      return sessions.length;
    case "minutes":
      return sessions.reduce((acc, session) => acc + Math.max(1, Math.round(session.durationSec / 60)), 0);
    case "distance_m":
      return sessions.reduce((acc, session) => acc + (typeof session.distanceM === "number" ? Math.max(0, session.distanceM) : 0), 0);
    case "days_completed":
      return countUniqueDays(sessions);
    case "sunrise_sessions":
      return sessions.filter((session) => hasSunriseBonus(session)).length;
    case "sunset_sessions":
      return sessions.filter((session) => hasSunsetBonus(session)).length;
    case "weekend_sessions":
      return sessions.filter(isWeekendSession).length;
    case "hike_sessions":
      return sessions.filter((session) => session.activityType === "hike").length;
    case "current_streak_days":
      return summary.currentStreakDays || summary.currentStreak || 0;
    default:
      return 0;
  }
}

export function formatMetricSupportingLabel(metric: ChallengeMetric, progressValue: number, goal: number): string {
  switch (metric) {
    case "distance_m": {
      const progressMiles = (progressValue / MILES_TO_METERS).toFixed(1);
      const goalMiles = Math.round(goal / MILES_TO_METERS);
      return `${progressMiles} / ${goalMiles} miles`;
    }
    case "minutes":
      return `${progressValue} / ${goal} minutes`;
    case "days_completed":
      return `${progressValue} / ${goal} active days`;
    case "sunrise_sessions":
      return `${progressValue} / ${goal} sunrise walks`;
    case "sunset_sessions":
      return `${progressValue} / ${goal} sunset walks`;
    case "weekend_sessions":
      return `${progressValue} / ${goal} weekend sessions`;
    case "hike_sessions":
      return `${progressValue} / ${goal} hikes`;
    case "current_streak_days":
      return `${progressValue} / ${goal} streak days`;
    case "sessions":
    default:
      return `${progressValue} / ${goal} sessions`;
  }
}

export function evaluateChallengeProgress({
  sessions,
  summary,
  now = new Date(),
}: ChallengeEvaluationContext): LocalChallengeProgress[] {
  return CHALLENGE_CATALOG.map((challenge) => {
    const scopedSessions = sessionsInWindow(sessions, challenge.window, now);
    const progressValue = metricProgressValue(challenge.metric, scopedSessions, summary);
    const percentComplete = clampPercent((progressValue / challenge.goal) * 100);
    const status = progressValue >= challenge.goal ? "completed" : "active";

    return {
      challengeId: challenge.id,
      status,
      progressValue,
      goalValue: challenge.goal,
      percentComplete,
      supportingLabel: formatMetricSupportingLabel(challenge.metric, progressValue, challenge.goal),
      badgeId: challenge.badgeId,
      rewardId: challenge.rewardId,
      updatedAt: now.getTime(),
    };
  });
}

function findChallengeProgress(progress: LocalChallengeProgress[], challengeId?: string): LocalChallengeProgress | undefined {
  if (!challengeId) return undefined;
  return progress.find((item) => item.challengeId === challengeId);
}

function earliestSessionLabel(sessions: OutsideSession[]): string | undefined {
  if (sessions.length === 0) return undefined;
  const earliest = [...sessions].sort((a, b) => a.endedAt - b.endedAt)[0];
  if (!earliest) return undefined;
  return new Date(earliest.endedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function evaluateBadges(context: ChallengeEvaluationContext): BadgeUnlockState[] {
  const progress = evaluateChallengeProgress(context);
  const earnedFallbackLabel = earliestSessionLabel(context.sessions);

  return BADGE_CATALOG.map((badge) => {
    const linkedProgress = findChallengeProgress(progress, badge.unlockChallengeId);
    const earned = linkedProgress?.status === "completed";
    const earnedAtLabel = earned ? earnedFallbackLabel : undefined;
    const progressHint = linkedProgress
      ? linkedProgress.supportingLabel
      : badge.availability === "coming_soon"
        ? "Coming soon"
        : badge.category === "time_of_day"
          ? `${context.summary.sunriseBonusCount + context.summary.sunsetBonusCount} golden-hour walks so far`
          : `${context.summary.totalSessions} sessions so far`;

    return {
      badge,
      earned,
      earnedAtLabel,
      progressHint,
      updatedAt: context.now?.getTime() ?? Date.now(),
    };
  });
}

export function buildChallengeHighlights(context: ChallengeEvaluationContext) {
  const progress = evaluateChallengeProgress(context);
  const badges = evaluateBadges(context);
  const completedCount = progress.filter((item) => item.status === "completed").length;
  const earnedCount = badges.filter((item) => item.earned).length;
  const goldenHourCount = context.sessions.filter(isGoldenHourSession).length;

  return {
    progress,
    badges,
    completedCount,
    earnedCount,
    goldenHourCount,
  };
}
