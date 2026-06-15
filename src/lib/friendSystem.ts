import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { auth, db } from "./firebase";

export const FRIEND_SYSTEM_COLLECTIONS = {
  users: "users",
  userDiscovery: "userDiscovery",
  usernames: "usernames",
  friendRequests: "friendRequests",
  friendships: "friendships",
} as const;

export const FRIEND_REQUEST_STATUSES = ["pending", "accepted", "declined"] as const;
const SEARCH_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FriendRequestStatus = (typeof FRIEND_REQUEST_STATUSES)[number];

export interface FriendSystemUser {
  uid: string;
  username: string;
  email: string | null;
  displayName: string;
  photoURL: string;
}

export interface FriendDiscoveryProfile {
  uid: string;
  username: string;
  usernameLower: string;
  emailLower: string;
  displayName: string;
  photoURL: string;
  createdAt: number;
  updatedAt: number;
}

export interface FriendRequest {
  id: string;
  senderUid: string;
  recipientUid: string;
  status: FriendRequestStatus;
  createdAt: number;
}

export interface Friendship {
  id: string;
  users: [string, string];
  createdAt: number;
}

export type UserDocument = FriendSystemUser;
export type FriendDiscoveryDocument = FriendDiscoveryProfile;
export type FriendRequestDocument = FriendRequest;
export type FriendshipDocument = Friendship;

export type FriendRelationshipStatus = "none" | "friends" | "pending_sent" | "pending_received";

export type FriendDiscoveryResult = {
  uid: string;
  username: string;
  displayName: string;
  photoURL: string;
  relationshipStatus: FriendRelationshipStatus;
  pendingRequestId: string | null;
};

export type FriendRequestListItem = {
  request: FriendRequest;
  profile: FriendDiscoveryResult;
};

export type FriendListItem = {
  friendship: Friendship;
  profile: FriendDiscoveryResult;
};

export type FriendSystemUserInput = Partial<FriendSystemUser> & {
  uid?: string | null;
};

export type FriendRequestInput = Partial<FriendRequest> & {
  id?: string | null;
};

export type FriendshipInput = Partial<Omit<Friendship, "users">> & {
  id?: string | null;
  users?: unknown;
};

type UserDiscoveryInput = Partial<FriendDiscoveryProfile> & {
  email?: string | null;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNullableText(value: unknown): string | null {
  const text = cleanText(value);
  return text || null;
}

function cleanTimestamp(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeEmail(value: unknown): string {
  return cleanText(value).toLowerCase();
}

function isSearchableEmail(value: string): boolean {
  return SEARCH_EMAIL_PATTERN.test(value);
}

function normalizeSearchUsername(value: unknown): string {
  return cleanText(value).replace(/^@+/, "").toLowerCase();
}

export function friendRequestId(senderUid: string, recipientUid: string): string {
  return `${senderUid}_${recipientUid}`;
}

export function friendshipId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join("_");
}

export function isFriendRequestStatus(value: unknown): value is FriendRequestStatus {
  return FRIEND_REQUEST_STATUSES.includes(value as FriendRequestStatus);
}

export function emptyFriendSystemUser(uid = ""): FriendSystemUser {
  return {
    uid,
    username: "",
    email: null,
    displayName: "",
    photoURL: "",
  };
}

export function normalizeFriendSystemUser(input: FriendSystemUserInput | undefined, fallbackUid = ""): FriendSystemUser {
  if (!input) return emptyFriendSystemUser(fallbackUid);

  return {
    uid: cleanText(input.uid) || fallbackUid,
    username: cleanText(input.username).toLowerCase(),
    email: cleanNullableText(input.email?.toLowerCase()),
    displayName: cleanText(input.displayName),
    photoURL: cleanText(input.photoURL),
  };
}

export function normalizeFriendDiscoveryProfile(
  input: UserDiscoveryInput | undefined,
  fallbackUid = ""
): FriendDiscoveryProfile | null {
  if (!input) return null;

  const uid = cleanText(input.uid) || fallbackUid;
  const username = normalizeSearchUsername(input.username ?? input.usernameLower);
  if (!uid || !username) return null;

  return {
    uid,
    username,
    usernameLower: username,
    emailLower: normalizeEmail(input.emailLower ?? input.email),
    displayName: cleanText(input.displayName) || username,
    photoURL: cleanText(input.photoURL),
    createdAt: cleanTimestamp(input.createdAt),
    updatedAt: cleanTimestamp(input.updatedAt),
  };
}

export function normalizeFriendRequest(input: FriendRequestInput | undefined): FriendRequest | null {
  if (!input) return null;

  const id = cleanText(input.id);
  const senderUid = cleanText(input.senderUid);
  const recipientUid = cleanText(input.recipientUid);
  const status = isFriendRequestStatus(input.status) ? input.status : "pending";

  if (!id || !senderUid || !recipientUid) return null;

  return {
    id,
    senderUid,
    recipientUid,
    status,
    createdAt: cleanTimestamp(input.createdAt),
  };
}

export function normalizeFriendship(input: FriendshipInput | undefined): Friendship | null {
  if (!input) return null;

  const id = cleanText(input.id);
  const users = Array.isArray(input.users) ? input.users.map(cleanText).filter(Boolean) : [];

  if (!id || users.length !== 2 || users[0] === users[1]) return null;

  return {
    id,
    users: [users[0], users[1]],
    createdAt: cleanTimestamp(input.createdAt),
  };
}

function toDiscoveryResult(
  profile: FriendDiscoveryProfile,
  relationshipStatus: FriendRelationshipStatus,
  pendingRequestId: string | null
): FriendDiscoveryResult {
  return {
    uid: profile.uid,
    username: profile.username,
    displayName: profile.displayName || profile.username,
    photoURL: profile.photoURL,
    relationshipStatus,
    pendingRequestId,
  };
}

function emptyDiscoveryResult(uid: string): FriendDiscoveryResult {
  return {
    uid,
    username: "step-outside-user",
    displayName: "Step Outside User",
    photoURL: "",
    relationshipStatus: "none",
    pendingRequestId: null,
  };
}

async function getRelationshipStatus(targetUid: string): Promise<{
  relationshipStatus: FriendRelationshipStatus;
  pendingRequestId: string | null;
}> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid || !targetUid || currentUid === targetUid) {
    return { relationshipStatus: "none", pendingRequestId: null };
  }

  const friendshipSnapshot = await getDoc(
    doc(db, FRIEND_SYSTEM_COLLECTIONS.friendships, friendshipId(currentUid, targetUid))
  );
  if (friendshipSnapshot.exists()) {
    return { relationshipStatus: "friends", pendingRequestId: null };
  }

  const sentRequestId = friendRequestId(currentUid, targetUid);
  const sentSnapshot = await getDoc(doc(db, FRIEND_SYSTEM_COLLECTIONS.friendRequests, sentRequestId));
  const sentRequest = normalizeFriendRequest({
    id: sentSnapshot.id,
    ...(sentSnapshot.data() as Partial<FriendRequest> | undefined),
  });
  if (sentRequest?.status === "pending") {
    return { relationshipStatus: "pending_sent", pendingRequestId: sentRequest.id };
  }
  if (sentRequest?.status === "accepted") {
    return { relationshipStatus: "friends", pendingRequestId: null };
  }

  const receivedRequestId = friendRequestId(targetUid, currentUid);
  const receivedSnapshot = await getDoc(doc(db, FRIEND_SYSTEM_COLLECTIONS.friendRequests, receivedRequestId));
  const receivedRequest = normalizeFriendRequest({
    id: receivedSnapshot.id,
    ...(receivedSnapshot.data() as Partial<FriendRequest> | undefined),
  });
  if (receivedRequest?.status === "pending") {
    return { relationshipStatus: "pending_received", pendingRequestId: receivedRequest.id };
  }
  if (receivedRequest?.status === "accepted") {
    return { relationshipStatus: "friends", pendingRequestId: null };
  }

  return { relationshipStatus: "none", pendingRequestId: null };
}

export async function upsertCurrentUserDiscoveryProfile(): Promise<FriendDiscoveryProfile | null> {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) return null;

  const userSnapshot = await getDoc(doc(db, FRIEND_SYSTEM_COLLECTIONS.users, currentUser.uid));
  const userData = userSnapshot.data() as UserDiscoveryInput | undefined;
  const username = normalizeSearchUsername(userData?.username ?? userData?.usernameLower);
  if (!username) return null;

  const discoveryRef = doc(db, FRIEND_SYSTEM_COLLECTIONS.userDiscovery, currentUser.uid);
  const discoverySnapshot = await getDoc(discoveryRef);
  const now = Date.now();
  const profile = normalizeFriendDiscoveryProfile(
    {
      uid: currentUser.uid,
      username,
      email: currentUser.email,
      displayName: userData?.displayName || currentUser.displayName || "",
      photoURL: userData?.photoURL || currentUser.photoURL || "",
      createdAt:
        typeof discoverySnapshot.data()?.createdAt === "number"
          ? discoverySnapshot.data()?.createdAt
          : typeof userData?.createdAt === "number"
          ? userData.createdAt
          : now,
      updatedAt: now,
    },
    currentUser.uid
  );

  if (!profile) return null;
  await setDoc(discoveryRef, profile, { merge: false });
  return profile;
}

async function readDiscoveryProfile(
  uid: string,
  fallback?: Partial<FriendDiscoveryProfile>
): Promise<FriendDiscoveryProfile | null> {
  const snapshot = await getDoc(doc(db, FRIEND_SYSTEM_COLLECTIONS.userDiscovery, uid));
  return normalizeFriendDiscoveryProfile(
    {
      uid,
      ...(fallback ?? {}),
      ...(snapshot.data() as Partial<FriendDiscoveryProfile> | undefined),
    },
    uid
  );
}

async function requestListItemFromRequest(
  request: FriendRequest,
  profileUid: string,
  relationshipStatus: FriendRelationshipStatus
): Promise<FriendRequestListItem> {
  const profile = await readDiscoveryProfile(profileUid);
  return {
    request,
    profile: profile
      ? toDiscoveryResult(profile, relationshipStatus, request.id)
      : {
          ...emptyDiscoveryResult(profileUid),
          relationshipStatus,
          pendingRequestId: request.id,
        },
  };
}

async function friendListItemFromFriendship(friendship: Friendship, currentUid: string): Promise<FriendListItem | null> {
  const friendUid = friendship.users.find((uid) => uid !== currentUid);
  if (!friendUid) return null;

  const profile = await readDiscoveryProfile(friendUid);
  return {
    friendship,
    profile: profile
      ? toDiscoveryResult(profile, "friends", null)
      : {
          ...emptyDiscoveryResult(friendUid),
          relationshipStatus: "friends",
          pendingRequestId: null,
        },
  };
}

export async function searchUserByUsername(usernameInput: string): Promise<FriendDiscoveryResult | null> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) throw new Error("Sign in before searching for friends.");

  await upsertCurrentUserDiscoveryProfile();

  const username = normalizeSearchUsername(usernameInput);
  if (!username) return null;

  const usernameSnapshot = await getDoc(doc(db, FRIEND_SYSTEM_COLLECTIONS.usernames, username));
  const uid = cleanText(usernameSnapshot.data()?.uid);
  if (!usernameSnapshot.exists() || !uid || uid === currentUid) return null;

  const profile =
    (await readDiscoveryProfile(uid, {
      username,
      usernameLower: username,
      displayName: cleanText(usernameSnapshot.data()?.displayName) || username,
      photoURL: cleanText(usernameSnapshot.data()?.photoURL),
    })) ??
    normalizeFriendDiscoveryProfile(
      {
        uid,
        username,
        usernameLower: username,
        displayName: cleanText(usernameSnapshot.data()?.displayName) || username,
        photoURL: cleanText(usernameSnapshot.data()?.photoURL),
      },
      uid
    );

  if (!profile) return null;
  const relationship = await getRelationshipStatus(profile.uid);
  return toDiscoveryResult(profile, relationship.relationshipStatus, relationship.pendingRequestId);
}

export async function searchUserByEmail(emailInput: string): Promise<FriendDiscoveryResult | null> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) throw new Error("Sign in before searching for friends.");

  await upsertCurrentUserDiscoveryProfile();

  const emailLower = normalizeEmail(emailInput);
  if (!emailLower || !isSearchableEmail(emailLower)) return null;

  const snapshot = await getDocs(
    query(
      collection(db, FRIEND_SYSTEM_COLLECTIONS.userDiscovery),
      where("emailLower", "==", emailLower),
      limit(5)
    )
  );
  const profile = snapshot.docs
    .map((entry) => normalizeFriendDiscoveryProfile(entry.data() as Partial<FriendDiscoveryProfile>, entry.id))
    .find((entry): entry is FriendDiscoveryProfile => entry !== null && entry.uid !== currentUid);

  if (!profile) return null;
  const relationship = await getRelationshipStatus(profile.uid);
  return toDiscoveryResult(profile, relationship.relationshipStatus, relationship.pendingRequestId);
}

export async function searchUserForFriendDiscovery(input: string): Promise<FriendDiscoveryResult | null> {
  const searchText = cleanText(input);
  if (!searchText) return null;

  const usernameResult = await searchUserByUsername(searchText);
  if (usernameResult || !searchText.includes("@")) return usernameResult;
  return searchUserByEmail(searchText);
}

export async function sendFriendRequest(recipientUid: string): Promise<FriendRequest> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) throw new Error("Sign in before adding friends.");
  if (!recipientUid || recipientUid === currentUid) throw new Error("Choose another Step Outside user.");

  const requestId = friendRequestId(currentUid, recipientUid);
  const requestRef = doc(db, FRIEND_SYSTEM_COLLECTIONS.friendRequests, requestId);
  const reverseRequestRef = doc(
    db,
    FRIEND_SYSTEM_COLLECTIONS.friendRequests,
    friendRequestId(recipientUid, currentUid)
  );
  const friendshipRef = doc(db, FRIEND_SYSTEM_COLLECTIONS.friendships, friendshipId(currentUid, recipientUid));
  const now = Date.now();

  return runTransaction(db, async (transaction) => {
    const [friendshipSnapshot, requestSnapshot, reverseRequestSnapshot] = await Promise.all([
      transaction.get(friendshipRef),
      transaction.get(requestRef),
      transaction.get(reverseRequestRef),
    ]);

    if (friendshipSnapshot.exists()) {
      throw new Error("You are already friends.");
    }

    const existingRequest = normalizeFriendRequest({
      id: requestSnapshot.id,
      ...(requestSnapshot.data() as Partial<FriendRequest> | undefined),
    });
    if (existingRequest?.status === "pending") {
      throw new Error("Friend request already sent.");
    }
    if (existingRequest?.status === "accepted") {
      throw new Error("You are already friends.");
    }
    if (requestSnapshot.exists()) {
      throw new Error("Friend request already exists.");
    }

    const reverseRequest = normalizeFriendRequest({
      id: reverseRequestSnapshot.id,
      ...(reverseRequestSnapshot.data() as Partial<FriendRequest> | undefined),
    });
    if (reverseRequest?.status === "pending") {
      throw new Error("This user already sent you a friend request.");
    }
    if (reverseRequest?.status === "accepted") {
      throw new Error("You are already friends.");
    }

    const request: FriendRequest = {
      id: requestId,
      senderUid: currentUid,
      recipientUid,
      status: "pending",
      createdAt: now,
    };

    transaction.set(requestRef, request);
    return request;
  });
}

export async function getIncomingFriendRequests(): Promise<FriendRequestListItem[]> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) throw new Error("Sign in before viewing friend requests.");

  await upsertCurrentUserDiscoveryProfile();

  const snapshot = await getDocs(
    query(
      collection(db, FRIEND_SYSTEM_COLLECTIONS.friendRequests),
      where("recipientUid", "==", currentUid),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    )
  );

  const requests = snapshot.docs
    .map((entry) =>
      normalizeFriendRequest({
        id: entry.id,
        ...(entry.data() as Partial<FriendRequest>),
      })
    )
    .filter((request): request is FriendRequest => request !== null);

  return Promise.all(
    requests.map((request) => requestListItemFromRequest(request, request.senderUid, "pending_received"))
  );
}

export async function getOutgoingFriendRequests(): Promise<FriendRequestListItem[]> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) throw new Error("Sign in before viewing friend requests.");

  await upsertCurrentUserDiscoveryProfile();

  const snapshot = await getDocs(
    query(
      collection(db, FRIEND_SYSTEM_COLLECTIONS.friendRequests),
      where("senderUid", "==", currentUid),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    )
  );

  const requests = snapshot.docs
    .map((entry) =>
      normalizeFriendRequest({
        id: entry.id,
        ...(entry.data() as Partial<FriendRequest>),
      })
    )
    .filter((request): request is FriendRequest => request !== null);

  return Promise.all(requests.map((request) => requestListItemFromRequest(request, request.recipientUid, "pending_sent")));
}

export async function getFriendsList(): Promise<FriendListItem[]> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) throw new Error("Sign in before viewing friends.");

  await upsertCurrentUserDiscoveryProfile();

  const snapshot = await getDocs(
    query(
      collection(db, FRIEND_SYSTEM_COLLECTIONS.friendships),
      where("users", "array-contains", currentUid),
      orderBy("createdAt", "desc")
    )
  );

  const friendships = snapshot.docs
    .map((entry) =>
      normalizeFriendship({
        id: entry.id,
        ...(entry.data() as Partial<Friendship>),
      })
    )
    .filter((friendship): friendship is Friendship => friendship !== null);

  const items = await Promise.all(friendships.map((friendship) => friendListItemFromFriendship(friendship, currentUid)));
  return items.filter((item): item is FriendListItem => item !== null);
}

export async function acceptFriendRequest(requestId: string): Promise<Friendship> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) throw new Error("Sign in before accepting friend requests.");

  const requestRef = doc(db, FRIEND_SYSTEM_COLLECTIONS.friendRequests, requestId);

  return runTransaction(db, async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    const request = normalizeFriendRequest({
      id: requestSnapshot.id,
      ...(requestSnapshot.data() as Partial<FriendRequest> | undefined),
    });

    if (!requestSnapshot.exists() || !request) {
      throw new Error("Friend request was not found.");
    }
    if (request.recipientUid !== currentUid) {
      throw new Error("Only the recipient can accept this request.");
    }
    if (request.status !== "pending") {
      throw new Error("This friend request is no longer pending.");
    }

    const nextFriendshipId = friendshipId(request.senderUid, request.recipientUid);
    const friendshipRef = doc(db, FRIEND_SYSTEM_COLLECTIONS.friendships, nextFriendshipId);
    const friendshipSnapshot = await transaction.get(friendshipRef);

    if (friendshipSnapshot.exists()) {
      transaction.update(requestRef, { status: "accepted" });
      const existing = normalizeFriendship({
        id: friendshipSnapshot.id,
        ...(friendshipSnapshot.data() as Partial<Friendship> | undefined),
      });
      if (existing) return existing;
      throw new Error("Friendship already exists.");
    }

    const friendship: Friendship = {
      id: nextFriendshipId,
      users: [request.senderUid, request.recipientUid].sort() as [string, string],
      createdAt: Date.now(),
    };

    transaction.set(friendshipRef, friendship);
    transaction.update(requestRef, { status: "accepted" });
    return friendship;
  });
}

export async function declineFriendRequest(requestId: string): Promise<void> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) throw new Error("Sign in before declining friend requests.");

  const requestRef = doc(db, FRIEND_SYSTEM_COLLECTIONS.friendRequests, requestId);
  const requestSnapshot = await getDoc(requestRef);
  const request = normalizeFriendRequest({
    id: requestSnapshot.id,
    ...(requestSnapshot.data() as Partial<FriendRequest> | undefined),
  });

  if (!requestSnapshot.exists() || !request) {
    throw new Error("Friend request was not found.");
  }
  if (request.recipientUid !== currentUid) {
    throw new Error("Only the recipient can decline this request.");
  }
  if (request.status !== "pending") {
    throw new Error("This friend request is no longer pending.");
  }

  await updateDoc(requestRef, { status: "declined" });
}
