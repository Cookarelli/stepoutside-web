import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import { auth, db } from "./firebase";
import {
  FRIEND_SYSTEM_COLLECTIONS,
  friendshipId,
  normalizeFriendDiscoveryProfile,
  type FriendDiscoveryProfile,
} from "./friendSystem";

export const FRIEND_CHALLENGE_COLLECTION = "friendChallenges";
export const FRIEND_CHALLENGE_TYPES = ["walk_distance", "walk_count", "outside_minutes"] as const;
export const FRIEND_CHALLENGE_STATUSES = ["pending", "accepted", "declined", "completed", "expired"] as const;

export type FriendChallengeType = (typeof FRIEND_CHALLENGE_TYPES)[number];
export type FriendChallengeStatus = (typeof FRIEND_CHALLENGE_STATUSES)[number];

export type FriendChallenge = {
  id: string;
  senderUid: string;
  receiverUid: string;
  type: FriendChallengeType;
  target: number;
  startDate: number;
  endDate: number;
  status: FriendChallengeStatus;
  createdAt: number;
};

export type FriendChallengeListItem = {
  challenge: FriendChallenge;
  profile: FriendDiscoveryProfile | null;
};

export type FriendChallengeOption = {
  type: FriendChallengeType;
  title: string;
  target: number;
};

export const DEFAULT_FRIEND_CHALLENGE_OPTIONS: FriendChallengeOption[] = [
  { type: "walk_distance", title: "5 Miles This Week", target: 5 },
  { type: "walk_count", title: "3 Walks This Week", target: 3 },
  { type: "outside_minutes", title: "60 Minutes Outside This Week", target: 60 },
];

type FriendChallengeInput = Partial<FriendChallenge> & {
  id?: string | null;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function isFriendChallengeType(value: unknown): value is FriendChallengeType {
  return FRIEND_CHALLENGE_TYPES.includes(value as FriendChallengeType);
}

function isFriendChallengeStatus(value: unknown): value is FriendChallengeStatus {
  return FRIEND_CHALLENGE_STATUSES.includes(value as FriendChallengeStatus);
}

function weekWindow(now = new Date()): { startDate: number; endDate: number } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return {
    startDate: start.getTime(),
    endDate: end.getTime(),
  };
}

export function challengeTitle(type: FriendChallengeType, target: number): string {
  if (type === "walk_distance") return `${target} Mile${target === 1 ? "" : "s"} This Week`;
  if (type === "walk_count") return `${target} Walk${target === 1 ? "" : "s"} This Week`;
  return `${target} Minutes Outside This Week`;
}

export function challengeTypeLabel(type: FriendChallengeType): string {
  if (type === "walk_distance") return "Walk Distance";
  if (type === "walk_count") return "Walk Count";
  return "Outside Minutes";
}

export function normalizeFriendChallenge(input: FriendChallengeInput | undefined, fallbackId = ""): FriendChallenge | null {
  if (!input) return null;

  const id = cleanText(input.id) || fallbackId;
  const senderUid = cleanText(input.senderUid);
  const receiverUid = cleanText(input.receiverUid);
  const type = isFriendChallengeType(input.type) ? input.type : null;
  const status = isFriendChallengeStatus(input.status) ? input.status : null;

  if (!id || !senderUid || !receiverUid || senderUid === receiverUid || !type || !status) return null;

  return {
    id,
    senderUid,
    receiverUid,
    type,
    target: cleanNumber(input.target),
    startDate: cleanNumber(input.startDate),
    endDate: cleanNumber(input.endDate),
    status,
    createdAt: cleanNumber(input.createdAt),
  };
}

async function readDiscoveryProfile(uid: string): Promise<FriendDiscoveryProfile | null> {
  const snapshot = await getDoc(doc(db, FRIEND_SYSTEM_COLLECTIONS.userDiscovery, uid));
  return normalizeFriendDiscoveryProfile(
    {
      uid,
      ...(snapshot.data() as Partial<FriendDiscoveryProfile> | undefined),
    },
    uid
  );
}

async function challengeListItemFromChallenge(
  challenge: FriendChallenge,
  profileUid: string
): Promise<FriendChallengeListItem> {
  return {
    challenge,
    profile: await readDiscoveryProfile(profileUid),
  };
}

async function assertCurrentUserIsFriend(receiverUid: string): Promise<void> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) throw new Error("Sign in before sending challenges.");
  if (!receiverUid || receiverUid === currentUid) throw new Error("Choose another Step Outside user.");

  const friendshipSnapshot = await getDoc(
    doc(db, FRIEND_SYSTEM_COLLECTIONS.friendships, friendshipId(currentUid, receiverUid))
  );
  if (!friendshipSnapshot.exists()) {
    throw new Error("You can only challenge friends.");
  }
}

export async function sendFriendChallengeInvitation(
  receiverUid: string,
  option: FriendChallengeOption
): Promise<FriendChallenge> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) throw new Error("Sign in before sending challenges.");

  await assertCurrentUserIsFriend(receiverUid);

  const now = Date.now();
  const { startDate, endDate } = weekWindow(new Date(now));
  const payload = {
    senderUid: currentUid,
    receiverUid,
    type: option.type,
    target: option.target,
    startDate,
    endDate,
    status: "pending" as const,
    createdAt: now,
  };

  const challengeRef = await addDoc(collection(db, FRIEND_CHALLENGE_COLLECTION), payload);
  return {
    id: challengeRef.id,
    ...payload,
  };
}

async function listChallenges(field: "senderUid" | "receiverUid"): Promise<FriendChallengeListItem[]> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) throw new Error("Sign in before viewing challenges.");

  const snapshot = await getDocs(
    query(
      collection(db, FRIEND_CHALLENGE_COLLECTION),
      where(field, "==", currentUid),
      orderBy("createdAt", "desc")
    )
  );

  const challenges = snapshot.docs
    .map((entry) => normalizeFriendChallenge(entry.data() as FriendChallengeInput, entry.id))
    .filter((challenge): challenge is FriendChallenge => challenge !== null);

  const profileField = field === "receiverUid" ? "senderUid" : "receiverUid";
  return Promise.all(challenges.map((challenge) => challengeListItemFromChallenge(challenge, challenge[profileField])));
}

export async function getIncomingFriendChallenges(): Promise<FriendChallengeListItem[]> {
  return listChallenges("receiverUid");
}

export async function getSentFriendChallenges(): Promise<FriendChallengeListItem[]> {
  return listChallenges("senderUid");
}

async function updateChallengeResponse(challengeId: string, status: "accepted" | "declined"): Promise<void> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) throw new Error("Sign in before responding to challenges.");

  const challengeRef = doc(db, FRIEND_CHALLENGE_COLLECTION, challengeId);
  const snapshot = await getDoc(challengeRef);
  const challenge = normalizeFriendChallenge(snapshot.data() as FriendChallengeInput | undefined, snapshot.id);

  if (!snapshot.exists() || !challenge) throw new Error("Challenge invitation was not found.");
  if (challenge.receiverUid !== currentUid) throw new Error("Only the recipient can respond to this challenge.");
  if (challenge.status !== "pending") throw new Error("This challenge invitation is no longer pending.");

  await updateDoc(challengeRef, { status });
}

export async function acceptFriendChallenge(challengeId: string): Promise<void> {
  await updateChallengeResponse(challengeId, "accepted");
}

export async function declineFriendChallenge(challengeId: string): Promise<void> {
  await updateChallengeResponse(challengeId, "declined");
}
