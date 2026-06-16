import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
} from "firebase/firestore";

import { auth, db } from "./firebase";
import { getFriendsList } from "./friendSystem";
import type { OutsideSession } from "./store";

export type LeaderboardScope = "friends" | "global";
export type LeaderboardPeriod = "weekly" | "monthly" | "allTime";

export type LeaderboardEntry = {
  uid: string;
  displayName: string;
  username: string;
  photoURL: string;
  weeklyMinutes: number;
  weeklySessions: number;
  weeklyDistanceM: number;
  monthlyMinutes: number;
  monthlySessions: number;
  monthlyDistanceM: number;
  allTimeMinutes: number;
  allTimeSessions: number;
  allTimeDistanceM: number;
  weekKey: string;
  monthKey: string;
  updatedAt: number;
};

export type RankedLeaderboardEntry = LeaderboardEntry & {
  rank: number;
  scoreMinutes: number;
  scoreSessions: number;
  scoreDistanceM: number;
  isCurrentUser: boolean;
};

const LEADERBOARD_COLLECTION = "leaderboardEntries";
const GLOBAL_LIMIT = 50;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function minutesFromDuration(durationSec: number): number {
  return Math.max(1, Math.round(cleanNumber(durationSec) / 60));
}

function dayKeyLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function weekKeyLocal(date: Date): string {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return dayKeyLocal(start);
}

function monthKeyLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function sessionIsInWeek(session: OutsideSession, weekKey: string): boolean {
  return weekKeyLocal(new Date(session.endedAt)) === weekKey;
}

function sessionIsInMonth(session: OutsideSession, monthKey: string): boolean {
  return monthKeyLocal(new Date(session.endedAt)) === monthKey;
}

function sumMinutes(sessions: OutsideSession[]): number {
  return sessions.reduce((total, session) => total + minutesFromDuration(session.durationSec), 0);
}

function sumDistanceM(sessions: OutsideSession[]): number {
  return sessions.reduce((total, session) => total + cleanNumber(session.distanceM), 0);
}

function normalizeLeaderboardEntry(input: Partial<LeaderboardEntry> | undefined, uid: string): LeaderboardEntry | null {
  if (!input || !uid) return null;

  return {
    uid,
    displayName: cleanText(input.displayName) || cleanText(input.username) || "Step Outside User",
    username: cleanText(input.username) || "step-outside-user",
    photoURL: cleanText(input.photoURL),
    weeklyMinutes: cleanNumber(input.weeklyMinutes),
    weeklySessions: cleanNumber(input.weeklySessions),
    weeklyDistanceM: cleanNumber(input.weeklyDistanceM),
    monthlyMinutes: cleanNumber(input.monthlyMinutes),
    monthlySessions: cleanNumber(input.monthlySessions),
    monthlyDistanceM: cleanNumber(input.monthlyDistanceM),
    allTimeMinutes: cleanNumber(input.allTimeMinutes),
    allTimeSessions: cleanNumber(input.allTimeSessions),
    allTimeDistanceM: cleanNumber(input.allTimeDistanceM),
    weekKey: cleanText(input.weekKey),
    monthKey: cleanText(input.monthKey),
    updatedAt: cleanNumber(input.updatedAt),
  };
}

function scoreForPeriod(entry: LeaderboardEntry, period: LeaderboardPeriod, now = new Date()) {
  if (period === "weekly" && entry.weekKey === weekKeyLocal(now)) {
    return {
      minutes: entry.weeklyMinutes,
      sessions: entry.weeklySessions,
      distanceM: entry.weeklyDistanceM,
    };
  }

  if (period === "monthly" && entry.monthKey === monthKeyLocal(now)) {
    return {
      minutes: entry.monthlyMinutes,
      sessions: entry.monthlySessions,
      distanceM: entry.monthlyDistanceM,
    };
  }

  if (period === "allTime") {
    return {
      minutes: entry.allTimeMinutes,
      sessions: entry.allTimeSessions,
      distanceM: entry.allTimeDistanceM,
    };
  }

  return { minutes: 0, sessions: 0, distanceM: 0 };
}

function rankEntries(entries: LeaderboardEntry[], period: LeaderboardPeriod): RankedLeaderboardEntry[] {
  const currentUid = auth.currentUser?.uid ?? "";
  return entries
    .map((entry) => {
      const score = scoreForPeriod(entry, period);
      return {
        ...entry,
        rank: 0,
        scoreMinutes: score.minutes,
        scoreSessions: score.sessions,
        scoreDistanceM: score.distanceM,
        isCurrentUser: entry.uid === currentUid,
      };
    })
    .sort((a, b) => {
      if (b.scoreMinutes !== a.scoreMinutes) return b.scoreMinutes - a.scoreMinutes;
      if (b.scoreSessions !== a.scoreSessions) return b.scoreSessions - a.scoreSessions;
      if (b.scoreDistanceM !== a.scoreDistanceM) return b.scoreDistanceM - a.scoreDistanceM;
      return a.displayName.localeCompare(b.displayName);
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

async function currentUserDisplay() {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) return null;

  const snapshot = await getDoc(doc(db, "users", currentUser.uid));
  const profile = snapshot.data() as
    | {
        displayName?: unknown;
        username?: unknown;
        usernameLower?: unknown;
        photoURL?: unknown;
      }
    | undefined;

  const username = cleanText(profile?.username ?? profile?.usernameLower);
  return {
    displayName: cleanText(profile?.displayName) || currentUser.displayName || username || "Step Outside User",
    username: username || currentUser.email?.split("@")[0]?.toLowerCase() || "step-outside-user",
    photoURL: cleanText(profile?.photoURL) || currentUser.photoURL || "",
  };
}

export async function refreshCurrentUserLeaderboardEntry(sessions: OutsideSession[]): Promise<LeaderboardEntry | null> {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) return null;

  const now = new Date();
  const weekKey = weekKeyLocal(now);
  const monthKey = monthKeyLocal(now);
  const weeklySessions = sessions.filter((session) => sessionIsInWeek(session, weekKey));
  const monthlySessions = sessions.filter((session) => sessionIsInMonth(session, monthKey));
  const display = await currentUserDisplay();
  if (!display) return null;

  const entry: LeaderboardEntry = {
    uid: currentUser.uid,
    displayName: display.displayName,
    username: display.username,
    photoURL: display.photoURL,
    weeklyMinutes: sumMinutes(weeklySessions),
    weeklySessions: weeklySessions.length,
    weeklyDistanceM: sumDistanceM(weeklySessions),
    monthlyMinutes: sumMinutes(monthlySessions),
    monthlySessions: monthlySessions.length,
    monthlyDistanceM: sumDistanceM(monthlySessions),
    allTimeMinutes: sumMinutes(sessions),
    allTimeSessions: sessions.length,
    allTimeDistanceM: sumDistanceM(sessions),
    weekKey,
    monthKey,
    updatedAt: Date.now(),
  };

  await setDoc(doc(db, LEADERBOARD_COLLECTION, currentUser.uid), entry, { merge: false });
  return entry;
}

async function readLeaderboardEntry(uid: string): Promise<LeaderboardEntry | null> {
  const snapshot = await getDoc(doc(db, LEADERBOARD_COLLECTION, uid));
  return normalizeLeaderboardEntry(snapshot.data() as Partial<LeaderboardEntry> | undefined, snapshot.id);
}

async function getFriendLeaderboardEntries(): Promise<LeaderboardEntry[]> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) return [];

  const friends = await getFriendsList();
  const uids = Array.from(new Set([currentUid, ...friends.map((friend) => friend.profile.uid).filter(Boolean)]));
  const entries = await Promise.all(uids.map((uid) => readLeaderboardEntry(uid)));
  return entries.filter((entry): entry is LeaderboardEntry => entry !== null);
}

async function getGlobalLeaderboardEntries(period: LeaderboardPeriod): Promise<LeaderboardEntry[]> {
  const entriesRef = collection(db, LEADERBOARD_COLLECTION);
  const now = new Date();
  const leaderboardQuery =
    period === "weekly"
      ? query(entriesRef, where("weekKey", "==", weekKeyLocal(now)), orderBy("weeklyMinutes", "desc"), limit(GLOBAL_LIMIT))
      : period === "monthly"
        ? query(entriesRef, where("monthKey", "==", monthKeyLocal(now)), orderBy("monthlyMinutes", "desc"), limit(GLOBAL_LIMIT))
        : query(entriesRef, orderBy("allTimeMinutes", "desc"), limit(GLOBAL_LIMIT));

  const snapshot = await getDocs(leaderboardQuery);
  return snapshot.docs
    .map((entry) => normalizeLeaderboardEntry(entry.data() as Partial<LeaderboardEntry>, entry.id))
    .filter((entry): entry is LeaderboardEntry => entry !== null);
}

export async function getLeaderboardEntries(
  scope: LeaderboardScope,
  period: LeaderboardPeriod
): Promise<RankedLeaderboardEntry[]> {
  const entries = scope === "friends" ? await getFriendLeaderboardEntries() : await getGlobalLeaderboardEntries(period);
  const ranked = rankEntries(entries, period);
  return scope === "global" ? ranked.filter((entry) => entry.scoreMinutes > 0) : ranked;
}
