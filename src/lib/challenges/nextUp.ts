import { CHALLENGE_CATALOG } from "./catalog";
import type { BadgeDefinition, ChallengeDefinition, LocalChallengeProgress, LocalChallengeSnapshot } from "./types";

export type NextUpMilestone = {
  badge: BadgeDefinition;
  challenge: ChallengeDefinition | null;
  supportingLabel: string;
  encouragement: string;
  percentComplete: number;
  progressValue: number;
  goalValue: number;
};

type GetNextUpOptions = {
  excludeBadgeIds?: string[];
};

export function getNextUpMilestone(
  snapshot: LocalChallengeSnapshot | null,
  options: GetNextUpOptions = {}
): NextUpMilestone | null {
  if (!snapshot) return null;

  const excluded = new Set(options.excludeBadgeIds ?? []);

  const candidates = snapshot.badges
    .filter((state) => !state.earned)
    .filter((state) => state.badge.availability !== "coming_soon")
    .filter((state) => !excluded.has(state.badge.id))
    .map((state, index) => {
      const challenge = state.badge.unlockChallengeId
        ? CHALLENGE_CATALOG.find((item) => item.id === state.badge.unlockChallengeId) ?? null
        : null;
      const progress = challenge
        ? snapshot.progress.find((item) => item.challengeId === challenge.id) ?? null
        : null;

      return {
        badge: state.badge,
        challenge,
        progress,
        index,
      };
    })
    .sort((a, b) => {
      const aPercent = a.progress?.percentComplete ?? 0;
      const bPercent = b.progress?.percentComplete ?? 0;
      if (bPercent !== aPercent) return bPercent - aPercent;

      const aRemaining = getRemainingProgress(a.progress);
      const bRemaining = getRemainingProgress(b.progress);
      if (aRemaining !== bRemaining) return aRemaining - bRemaining;

      return a.index - b.index;
    });

  const next = candidates[0];
  if (!next) return null;

  return {
    badge: next.badge,
    challenge: next.challenge,
    supportingLabel: next.progress?.supportingLabel ?? "Your next walk keeps this moving.",
    encouragement: buildEncouragement(next.badge, next.challenge, next.progress),
    percentComplete: next.progress?.percentComplete ?? 0,
    progressValue: next.progress?.progressValue ?? 0,
    goalValue: next.progress?.goalValue ?? 0,
  };
}

function getRemainingProgress(progress: LocalChallengeProgress | null): number {
  if (!progress) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, progress.goalValue - progress.progressValue);
}

function buildEncouragement(
  badge: BadgeDefinition,
  challenge: ChallengeDefinition | null,
  progress: LocalChallengeProgress | null
): string {
  if (!challenge || !progress) {
    return "Keep stepping outside and your next badge will start to take shape.";
  }

  switch (challenge.type) {
    case "streak":
      return "Keep your streak alive and this badge gets closer.";
    case "completion_percentage":
      return "A few more active days this week will bring it home.";
    case "time_of_day":
      return badge.accent === "sunrise"
        ? "A few more golden-hour walks will unlock this one."
        : "Keep showing up at the right moments to unlock it.";
    case "milestone":
    default:
      return "Stay with the rhythm and this milestone will land.";
  }
}
