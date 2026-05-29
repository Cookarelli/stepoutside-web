import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";

import { auth, db } from "../firebase";
import type { OutsideSession, SummaryStats } from "../store";
import { BADGE_CATALOG } from "./catalog";
import { buildChallengeHighlights } from "./evaluate";
import type { BadgeArtKey, BadgeDefinition, ChallengeStatus, ChallengeUnlockResult, LocalChallengeSnapshot } from "./types";

const KEY_CHALLENGE_SNAPSHOT = "stepoutside:v2:challengeSnapshot";
const CHALLENGE_SNAPSHOT_VERSION = 1;

type RefreshChallengeSnapshotInput = {
  sessions: OutsideSession[];
  summary: SummaryStats;
  now?: Date;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBadgeArtKey(value: unknown): value is BadgeArtKey {
  return typeof value === "string" && BADGE_CATALOG.some((badge) => badge.artKey === value);
}

function normalizeBadgeDefinition(value: unknown): BadgeDefinition | null {
  if (!isObject(value) || typeof value.id !== "string") return null;
  const catalogBadge = BADGE_CATALOG.find((badge) => badge.id === value.id);
  if (catalogBadge) return catalogBadge;

  if (
    typeof value.title !== "string" ||
    typeof value.description !== "string" ||
    (value.category !== "streak" &&
      value.category !== "milestone" &&
      value.category !== "time_of_day" &&
      value.category !== "community" &&
      value.category !== "recovery") ||
    (value.rarity !== "common" && value.rarity !== "rare" && value.rarity !== "legendary") ||
    (value.accent !== "forest" && value.accent !== "sunrise") ||
    !isBadgeArtKey(value.artKey)
  ) {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    description: value.description,
    category: value.category,
    rarity: value.rarity,
    accent: value.accent,
    artKey: value.artKey,
    unlockChallengeId: typeof value.unlockChallengeId === "string" ? value.unlockChallengeId : undefined,
    availability: value.availability === "coming_soon" ? "coming_soon" : "live",
  };
}

function normalizeBadgeState(value: unknown) {
  if (!isObject(value)) return null;
  const badge = normalizeBadgeDefinition(value.badge);
  if (!badge) return null;

  return {
    badge,
    earned: value.earned === true,
    earnedAtLabel: typeof value.earnedAtLabel === "string" ? value.earnedAtLabel : undefined,
    progressHint: typeof value.progressHint === "string" ? value.progressHint : "",
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : undefined,
  };
}

function normalizeSnapshot(value: unknown): LocalChallengeSnapshot | null {
  if (!isObject(value)) return null;
  const progress = Array.isArray(value.progress) ? value.progress : [];
  const badges = Array.isArray(value.badges)
    ? value.badges
        .map((item) => normalizeBadgeState(item))
        .filter((item): item is NonNullable<ReturnType<typeof normalizeBadgeState>> => item !== null)
    : [];
  const completedChallengeIds = Array.isArray(value.completedChallengeIds)
    ? value.completedChallengeIds.filter((item): item is string => typeof item === "string")
    : [];
  const earnedBadgeIds = Array.isArray(value.earnedBadgeIds)
    ? value.earnedBadgeIds.filter((item): item is string => typeof item === "string")
    : [];

  return {
    version:
      typeof value.version === "number" && Number.isFinite(value.version)
        ? value.version
        : CHALLENGE_SNAPSHOT_VERSION,
    updatedAt: typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) ? value.updatedAt : 0,
    progress,
    badges,
    completedChallengeIds,
    earnedBadgeIds,
  };
}

export async function readLocalChallengeSnapshot(): Promise<LocalChallengeSnapshot | null> {
  const raw = await AsyncStorage.getItem(KEY_CHALLENGE_SNAPSHOT);
  if (!raw) return null;

  try {
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeLocalChallengeSnapshot(snapshot: LocalChallengeSnapshot): Promise<void> {
  await AsyncStorage.setItem(KEY_CHALLENGE_SNAPSHOT, JSON.stringify(snapshot));
}

function normalizeRemoteProgress(value: unknown) {
  if (!isObject(value) || typeof value.challengeId !== "string") return null;
  const status =
    value.status === "active" ||
    value.status === "completed" ||
    value.status === "locked" ||
    value.status === "upcoming"
      ? (value.status as ChallengeStatus)
      : "active";

  return {
    challengeId: value.challengeId,
    status,
    progressValue: typeof value.progressValue === "number" ? value.progressValue : 0,
    goalValue: typeof value.goalValue === "number" ? value.goalValue : 0,
    percentComplete: typeof value.percentComplete === "number" ? value.percentComplete : 0,
    supportingLabel: typeof value.supportingLabel === "string" ? value.supportingLabel : "",
    badgeId: typeof value.badgeId === "string" ? value.badgeId : undefined,
    rewardId: typeof value.rewardId === "string" ? value.rewardId : undefined,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : undefined,
  };
}

function normalizeRemoteBadge(value: unknown) {
  return normalizeBadgeState(value);
}

export async function readRemoteChallengeSnapshot(): Promise<LocalChallengeSnapshot | null> {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) return null;

  try {
    const [progressSnapshot, badgesSnapshot] = await Promise.all([
      getDocs(collection(db, "users", currentUser.uid, "challengeProgress")),
      getDocs(collection(db, "users", currentUser.uid, "badges")),
    ]);

    const progress = progressSnapshot.docs
      .map((entry) => normalizeRemoteProgress(entry.data()))
      .filter((item): item is NonNullable<ReturnType<typeof normalizeRemoteProgress>> => item !== null);

    const badges = badgesSnapshot.docs
      .map((entry) => normalizeRemoteBadge(entry.data()))
      .filter((item): item is NonNullable<ReturnType<typeof normalizeRemoteBadge>> => item !== null);

    if (progress.length === 0 && badges.length === 0) return null;

    const updatedAt = Math.max(
      0,
      ...progress.map((item) => item.updatedAt ?? 0),
      ...badges.map((item) => item.updatedAt ?? 0)
    );

    return {
      version: CHALLENGE_SNAPSHOT_VERSION,
      updatedAt,
      progress,
      badges,
      completedChallengeIds: progress.filter((item) => item.status === "completed").map((item) => item.challengeId),
      earnedBadgeIds: badges.filter((item) => item.earned).map((item) => item.badge.id),
    };
  } catch {
    return null;
  }
}

export async function syncChallengeSnapshotToFirestore(snapshot: LocalChallengeSnapshot): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) return;

  await Promise.all([
    ...snapshot.progress.map((progress) =>
      setDoc(doc(db, "users", currentUser.uid, "challengeProgress", progress.challengeId), {
        ...progress,
        updatedAt: progress.updatedAt ?? snapshot.updatedAt,
      })
    ),
    ...snapshot.badges.map((badgeState) =>
      setDoc(doc(db, "users", currentUser.uid, "badges", badgeState.badge.id), {
        ...badgeState,
        updatedAt: badgeState.updatedAt ?? snapshot.updatedAt,
      })
    ),
  ]);
}

export async function hydrateLocalChallengeSnapshotFromFirestore(): Promise<LocalChallengeSnapshot | null> {
  const [local, remote] = await Promise.all([readLocalChallengeSnapshot(), readRemoteChallengeSnapshot()]);
  if (!remote) return local;
  if (!local || remote.updatedAt >= local.updatedAt) {
    await writeLocalChallengeSnapshot(remote);
    return remote;
  }
  return local;
}

export function buildLocalChallengeSnapshot({
  sessions,
  summary,
  now = new Date(),
}: RefreshChallengeSnapshotInput): LocalChallengeSnapshot {
  const state = buildChallengeHighlights({ sessions, summary, now });
  const completedChallengeIds = state.progress
    .filter((item) => item.status === "completed")
    .map((item) => item.challengeId);
  const earnedBadgeIds = state.badges.filter((item) => item.earned).map((item) => item.badge.id);

  return {
    version: CHALLENGE_SNAPSHOT_VERSION,
    updatedAt: Date.now(),
    progress: state.progress,
    badges: state.badges,
    completedChallengeIds,
    earnedBadgeIds,
  };
}

export async function refreshLocalChallengeSnapshot(
  input: RefreshChallengeSnapshotInput
): Promise<{ snapshot: LocalChallengeSnapshot; unlocks: ChallengeUnlockResult }> {
  const previous = await readLocalChallengeSnapshot();
  const next = buildLocalChallengeSnapshot(input);

  const previousCompleted = new Set(previous?.completedChallengeIds ?? []);
  const previousBadges = new Set(previous?.earnedBadgeIds ?? []);

  const unlocks: ChallengeUnlockResult = {
    newlyCompletedChallengeIds: next.completedChallengeIds.filter((id) => !previousCompleted.has(id)),
    newlyEarnedBadgeIds: next.earnedBadgeIds.filter((id) => !previousBadges.has(id)),
  };

  await writeLocalChallengeSnapshot(next);
  try {
    await syncChallengeSnapshotToFirestore(next);
  } catch {
    // Keep the local snapshot authoritative if cloud sync is unavailable.
  }

  return { snapshot: next, unlocks };
}
