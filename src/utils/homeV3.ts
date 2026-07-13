import type { FriendChallengeListItem } from "../lib/friendChallenges";
import type { FriendListItem } from "../lib/friendSystem";
import type { OutsideSession } from "../lib/store";

const METERS_PER_MILE = 1609.344;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ChallengeProgress = {
  current: number;
  target: number;
  unit: "miles" | "walks" | "minutes";
  percent: number;
};

function localDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function friendsActiveToday(friends: FriendListItem[], now = new Date()): FriendListItem[] {
  const today = localDayKey(now.getTime());
  return friends
    .filter((friend) => friend.activity && localDayKey(friend.activity.updatedAt) === today)
    .sort((a, b) => (b.activity?.updatedAt ?? 0) - (a.activity?.updatedAt ?? 0));
}

export function selectCurrentChallenge(
  items: FriendChallengeListItem[],
  now = new Date()
): FriendChallengeListItem | null {
  const nowMs = now.getTime();
  const unique = new Map(items.map((item) => [item.challenge.id, item]));
  return (
    [...unique.values()]
      .filter(
        (item) =>
          item.challenge.status === "accepted" &&
          item.challenge.startDate <= nowMs &&
          item.challenge.endDate >= nowMs
      )
      .sort((a, b) => a.challenge.endDate - b.challenge.endDate)[0] ?? null
  );
}

export function calculateChallengeProgress(
  item: FriendChallengeListItem,
  sessions: OutsideSession[]
): ChallengeProgress {
  const { challenge } = item;
  const eligibleSessions = sessions.filter(
    (session) => session.endedAt >= challenge.startDate && session.endedAt <= challenge.endDate
  );

  let current = 0;
  let unit: ChallengeProgress["unit"] = "minutes";
  if (challenge.type === "walk_distance") {
    current = eligibleSessions.reduce((total, session) => total + (session.distanceM ?? 0), 0) / METERS_PER_MILE;
    unit = "miles";
  } else if (challenge.type === "walk_count") {
    current = eligibleSessions.length;
    unit = "walks";
  } else {
    current = eligibleSessions.reduce((total, session) => total + session.durationSec, 0) / 60;
  }

  const target = Math.max(0, challenge.target);
  return {
    current,
    target,
    unit,
    percent: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0,
  };
}

export function challengeDaysRemaining(endDate: number, now = new Date()): number {
  return Math.max(0, Math.ceil((endDate - now.getTime()) / DAY_MS));
}

export function dailyPromptIndex(date: Date, promptCount: number): number {
  if (promptCount <= 0) return 0;
  const key = date.getFullYear() * 372 + (date.getMonth() + 1) * 31 + date.getDate();
  return Math.abs(key) % promptCount;
}
