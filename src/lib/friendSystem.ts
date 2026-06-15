export const FRIEND_SYSTEM_COLLECTIONS = {
  users: "users",
  friendRequests: "friendRequests",
  friendships: "friendships",
} as const;

export const FRIEND_REQUEST_STATUSES = ["pending", "accepted", "declined"] as const;

export type FriendRequestStatus = (typeof FRIEND_REQUEST_STATUSES)[number];

export interface FriendSystemUser {
  uid: string;
  username: string;
  email: string | null;
  displayName: string;
  photoURL: string;
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
export type FriendRequestDocument = FriendRequest;
export type FriendshipDocument = Friendship;

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
