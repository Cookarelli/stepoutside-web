import assert from "node:assert/strict";
import test from "node:test";

import type { FriendChallengeListItem } from "../lib/friendChallenges";
import type { FriendListItem } from "../lib/friendSystem";
import type { OutsideSession } from "../lib/store";
import {
  calculateChallengeProgress,
  challengeDaysRemaining,
  dailyPromptIndex,
  friendsActiveToday,
  selectCurrentChallenge,
} from "./homeV3";

const baseChallenge: FriendChallengeListItem = {
  challenge: {
    id: "active",
    senderUid: "one",
    receiverUid: "two",
    type: "outside_minutes",
    target: 60,
    startDate: new Date(2026, 6, 10).getTime(),
    endDate: new Date(2026, 6, 16, 23, 59).getTime(),
    status: "accepted",
    createdAt: new Date(2026, 6, 9).getTime(),
  },
  profile: null,
};

test("friendsActiveToday includes only same-local-day activity and sorts newest first", () => {
  const friend = (id: string, updatedAt: number): FriendListItem =>
    ({
      friendship: { id, users: ["me", id], createdAt: 0 },
      profile: { uid: id, username: id, displayName: id, photoURL: "", relationshipStatus: "friends", pendingRequestId: null },
      activity: { uid: id, username: id, displayName: id, photoURL: "", walkCount: 1, totalDistanceM: 0, currentStreak: 1, updatedAt },
    }) as FriendListItem;

  const now = new Date(2026, 6, 12, 18);
  const result = friendsActiveToday(
    [friend("old", new Date(2026, 6, 11, 23).getTime()), friend("early", new Date(2026, 6, 12, 8).getTime()), friend("late", new Date(2026, 6, 12, 16).getTime())],
    now
  );
  assert.deepEqual(result.map((item) => item.profile.uid), ["late", "early"]);
});

test("selectCurrentChallenge deduplicates and chooses the active challenge ending first", () => {
  const later = { ...baseChallenge, challenge: { ...baseChallenge.challenge, id: "later", endDate: new Date(2026, 6, 20).getTime() } };
  const selected = selectCurrentChallenge([later, baseChallenge, baseChallenge], new Date(2026, 6, 12));
  assert.equal(selected?.challenge.id, "active");
});

test("calculateChallengeProgress uses only sessions inside the challenge window", () => {
  const session = (endedAt: number, durationSec: number): OutsideSession => ({ id: String(endedAt), startedAt: endedAt - durationSec * 1000, endedAt, durationSec, source: "timer" });
  const progress = calculateChallengeProgress(baseChallenge, [
    session(new Date(2026, 6, 11).getTime(), 20 * 60),
    session(new Date(2026, 6, 12).getTime(), 10 * 60),
    session(new Date(2026, 6, 18).getTime(), 90 * 60),
  ]);
  assert.equal(progress.current, 30);
  assert.equal(progress.percent, 50);
});

test("day and prompt helpers remain bounded", () => {
  assert.equal(challengeDaysRemaining(new Date(2026, 6, 14).getTime(), new Date(2026, 6, 12)), 2);
  assert.ok(dailyPromptIndex(new Date(2026, 6, 12), 8) < 8);
});

test("new-user inputs produce honest empty states without synthetic progress", () => {
  const now = new Date(2026, 6, 12);
  assert.deepEqual(friendsActiveToday([], now), []);
  assert.equal(selectCurrentChallenge([], now), null);
  assert.deepEqual(calculateChallengeProgress(baseChallenge, []), {
    current: 0,
    target: 60,
    unit: "minutes",
    percent: 0,
  });
});
