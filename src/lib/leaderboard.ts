import {
  collection,
  type DocumentData,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  type QueryDocumentSnapshot,
  setDoc,
  startAfter,
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
  currentStreak: number;
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
const DEFAULT_GLOBAL_PAGE_SIZE = 25;

export type GlobalLeaderboardCursor = QueryDocumentSnapshot<DocumentData>;

export type LeaderboardPage = {
  entries: RankedLeaderboardEntry[];
  pinnedEntry: RankedLeaderboardEntry | null;
  nextCursor: GlobalLeaderboardCursor | null;
  hasMore: boolean;
  friendCount: number | null;
};

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

function parseDayKey(key: string): Date {
  const [year, month, day] = key.split("-").map((value) => Number(value));
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function diffDaysBetweenKeys(a: string, b: string): number {
  return Math.round((parseDayKey(b).getTime() - parseDayKey(a).getTime()) / 86400000);
}

function currentStreakFromSessions(sessions: OutsideSession[]): number {
  const keys = Array.from(new Set(sessions.map((session) => dayKeyLocal(new Date(session.endedAt))))).sort();
  if (keys.length === 0) return 0;

  const activeDays = new Set(keys);
  const today = new Date();
  let current = 0;

  for (let index = 0; index < 3650; index += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    if (!activeDays.has(dayKeyLocal(date))) break;
    current += 1;
  }

  if (current > 0) return current;

  const lastKey = keys[keys.length - 1];
  const todayKey = dayKeyLocal(today);
  return lastKey && diffDaysBetweenKeys(lastKey, todayKey) === 1 ? 0 : 0;
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
    currentStreak: cleanNumber(input.currentStreak),
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

function scoreFieldForPeriod(period: LeaderboardPeriod): keyof LeaderboardEntry {
  if (period === "weekly") return "weeklyMinutes";
  if (period === "monthly") return "monthlyMinutes";
  return "allTimeMinutes";
}

function rankEntries(
  entries: LeaderboardEntry[],
  period: LeaderboardPeriod,
  rankOffset = 0
): RankedLeaderboardEntry[] {
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
    .map((entry, index) => ({ ...entry, rank: rankOffset + index + 1 }));
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
    currentStreak: currentStreakFromSessions(sessions),
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
  const result = await getFriendLeaderboardEntriesWithCount();
  return result.entries;
}

async function getFriendLeaderboardEntriesWithCount(): Promise<{ entries: LeaderboardEntry[]; friendCount: number }> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) return { entries: [], friendCount: 0 };

  const friends = await getFriendsList({ includeActivity: false });
  const uids = Array.from(new Set([currentUid, ...friends.map((friend) => friend.profile.uid).filter(Boolean)]));
  const entries = await Promise.all(uids.map((uid) => readLeaderboardEntry(uid)));
  return {
    entries: entries.filter((entry): entry is LeaderboardEntry => entry !== null),
    friendCount: friends.length,
  };
}

function globalLeaderboardQuery(
  period: LeaderboardPeriod,
  pageSize: number,
  cursor?: GlobalLeaderboardCursor | null
) {
  const entriesRef = collection(db, LEADERBOARD_COLLECTION);
  const now = new Date();
  const size = Math.max(5, Math.min(50, pageSize));

  if (period === "weekly") {
    const base = [
      where("weekKey", "==", weekKeyLocal(now)),
      where("weeklyMinutes", ">", 0),
      orderBy("weeklyMinutes", "desc"),
      limit(size),
    ] as const;
    return cursor ? query(entriesRef, ...base, startAfter(cursor)) : query(entriesRef, ...base);
  }

  if (period === "monthly") {
    const base = [
      where("monthKey", "==", monthKeyLocal(now)),
      where("monthlyMinutes", ">", 0),
      orderBy("monthlyMinutes", "desc"),
      limit(size),
    ] as const;
    return cursor ? query(entriesRef, ...base, startAfter(cursor)) : query(entriesRef, ...base);
  }

  const base = [where("allTimeMinutes", ">", 0), orderBy("allTimeMinutes", "desc"), limit(size)] as const;
  return cursor ? query(entriesRef, ...base, startAfter(cursor)) : query(entriesRef, ...base);
}

async function getGlobalLeaderboardEntries(period: LeaderboardPeriod): Promise<LeaderboardEntry[]> {
  const snapshot = await getDocs(globalLeaderboardQuery(period, DEFAULT_GLOBAL_PAGE_SIZE));
  return snapshot.docs
    .map((entry) => normalizeLeaderboardEntry(entry.data() as Partial<LeaderboardEntry>, entry.id))
    .filter((entry): entry is LeaderboardEntry => entry !== null);
}

async function getPinnedGlobalRank(entry: LeaderboardEntry, period: LeaderboardPeriod): Promise<number> {
  const entriesRef = collection(db, LEADERBOARD_COLLECTION);
  const now = new Date();
  const scoreField = scoreFieldForPeriod(period);
  const score = cleanNumber(entry[scoreField]);

  if (score <= 0) return 0;

  const rankQuery =
    period === "weekly"
      ? query(entriesRef, where("weekKey", "==", weekKeyLocal(now)), where(scoreField, ">", score), orderBy(scoreField, "desc"))
      : period === "monthly"
        ? query(entriesRef, where("monthKey", "==", monthKeyLocal(now)), where(scoreField, ">", score), orderBy(scoreField, "desc"))
        : query(entriesRef, where(scoreField, ">", score), orderBy(scoreField, "desc"));
  const snapshot = await getCountFromServer(rankQuery);
  return snapshot.data().count + 1;
}

export async function getCurrentUserPinnedLeaderboardEntry(
  period: LeaderboardPeriod,
  scope: LeaderboardScope
): Promise<RankedLeaderboardEntry | null> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) return null;

  const entry = await readLeaderboardEntry(currentUid);
  if (!entry) return null;

  if (scope === "friends") {
    const friendEntries = await getFriendLeaderboardEntries();
    return rankEntries(friendEntries, period).find((candidate) => candidate.uid === currentUid) ?? null;
  }

  const score = scoreForPeriod(entry, period);
  const rank = await getPinnedGlobalRank(entry, period);
  return {
    ...entry,
    rank,
    scoreMinutes: score.minutes,
    scoreSessions: score.sessions,
    scoreDistanceM: score.distanceM,
    isCurrentUser: true,
  };
}

export async function getLeaderboardPage(options: {
  scope: LeaderboardScope;
  period: LeaderboardPeriod;
  pageSize?: number;
  cursor?: GlobalLeaderboardCursor | null;
  rankOffset?: number;
  includePinned?: boolean;
}): Promise<LeaderboardPage> {
  const pageSize = options.pageSize ?? DEFAULT_GLOBAL_PAGE_SIZE;

  if (options.scope === "friends") {
    const { entries, friendCount } = await getFriendLeaderboardEntriesWithCount();
    const ranked = rankEntries(entries, options.period);
    return {
      entries: ranked,
      pinnedEntry: ranked.find((entry) => entry.isCurrentUser) ?? null,
      nextCursor: null,
      hasMore: false,
      friendCount,
    };
  }

  const snapshot = await getDocs(globalLeaderboardQuery(options.period, pageSize, options.cursor));
  const entries = snapshot.docs
    .map((entry) => normalizeLeaderboardEntry(entry.data() as Partial<LeaderboardEntry>, entry.id))
    .filter((entry): entry is LeaderboardEntry => entry !== null);
  const ranked = rankEntries(entries, options.period, options.rankOffset ?? 0);
  const pinnedEntry =
    options.includePinned === false ? null : await getCurrentUserPinnedLeaderboardEntry(options.period, "global");

  return {
    entries: ranked,
    pinnedEntry,
    nextCursor: snapshot.docs.at(-1) ?? null,
    hasMore: snapshot.docs.length === Math.max(5, Math.min(50, pageSize)),
    friendCount: null,
  };
}

export async function getLeaderboardEntries(
  scope: LeaderboardScope,
  period: LeaderboardPeriod
): Promise<RankedLeaderboardEntry[]> {
  const entries = scope === "friends" ? await getFriendLeaderboardEntries() : await getGlobalLeaderboardEntries(period);
  const ranked = rankEntries(entries, period);
  return scope === "global" ? ranked.filter((entry) => entry.scoreMinutes > 0) : ranked;
}
