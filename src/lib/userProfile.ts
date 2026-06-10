import AsyncStorage from "@react-native-async-storage/async-storage";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { doc, getDoc, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";

import { updateCurrentAuthProfile } from "./auth";
import { auth, db, storage } from "./firebase";
import { logFirestorePermissionDenied } from "./firestoreDebug";

export type PreferredActivity = "walking" | "hiking" | "trail-walks" | "recovery-walks";

export type LocalUserProfile = {
  uid?: string;
  displayName: string;
  username: string;
  usernameLower: string;
  location: string;
  favoriteActivity: string;
  outdoorGoal: string;
  dreamPlaces: string;
  photoURL: string;
  walkingGoal: string;
  preferredActivity: PreferredActivity | null;
  bio: string;
  createdAt: number;
  updatedAt: number;
};

export type UsernameValidationResult = {
  username: string;
  error: string | null;
};

const USER_PROFILES_KEY = "stepoutside:v2:user-profiles";
const RESERVED_USERNAMES = new Set(["admin", "support", "stepoutside", "premium", "null", "undefined"]);
const USERNAME_PATTERN = /^[a-z0-9_.]+$/;
const PROFILE_PHOTO_CONTENT_TYPE = "image/jpeg";

export const EMPTY_LOCAL_USER_PROFILE: LocalUserProfile = {
  displayName: "",
  username: "",
  usernameLower: "",
  location: "",
  favoriteActivity: "",
  outdoorGoal: "",
  dreamPlaces: "",
  photoURL: "",
  walkingGoal: "",
  preferredActivity: null,
  bio: "",
  createdAt: 0,
  updatedAt: 0,
};

function normalizeText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function normalizeLongText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizePreferredActivity(value: unknown): PreferredActivity | null {
  return value === "walking" ||
    value === "hiking" ||
    value === "trail-walks" ||
    value === "recovery-walks"
    ? value
    : null;
}

function preferredActivityToLabel(value: PreferredActivity | null): string {
  if (value === "walking") return "Walking";
  if (value === "hiking") return "Hiking";
  if (value === "trail-walks") return "Trail walks";
  if (value === "recovery-walks") return "Recovery walks";
  return "";
}

function normalizePhotoURL(value: unknown): string {
  const url = normalizeText(value, 600);
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : "";
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validateUsername(value: string): UsernameValidationResult {
  const username = normalizeUsername(value);

  if (!username) {
    return { username, error: null };
  }

  if (username.length < 3 || username.length > 20) {
    return { username, error: "Use 3 to 20 characters for your username." };
  }

  if (!USERNAME_PATTERN.test(username)) {
    return { username, error: "Use only letters, numbers, underscores, and periods." };
  }

  if (RESERVED_USERNAMES.has(username)) {
    return { username, error: "That username is reserved. Try another one." };
  }

  return { username, error: null };
}

function normalizeProfile(value: unknown): LocalUserProfile {
  const candidate = value && typeof value === "object" ? (value as Partial<LocalUserProfile>) : {};
  const preferredActivity = normalizePreferredActivity(candidate.preferredActivity);
  const favoriteActivity = normalizeText(candidate.favoriteActivity, 64) || preferredActivityToLabel(preferredActivity);
  const outdoorGoal = normalizeLongText(candidate.outdoorGoal, 180) || normalizeText(candidate.walkingGoal, 100);
  const dreamPlaces = normalizeLongText(candidate.dreamPlaces, 220) || normalizeLongText(candidate.bio, 180);
  const username = normalizeUsername(candidate.username ?? candidate.usernameLower ?? "");

  return {
    uid: typeof candidate.uid === "string" ? candidate.uid : undefined,
    displayName: normalizeText(candidate.displayName, 48),
    username,
    usernameLower: username,
    location: normalizeText(candidate.location, 80),
    favoriteActivity,
    outdoorGoal,
    dreamPlaces,
    photoURL: normalizePhotoURL(candidate.photoURL),
    walkingGoal: outdoorGoal,
    preferredActivity,
    bio: dreamPlaces,
    createdAt:
      typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt)
        ? candidate.createdAt
        : 0,
    updatedAt:
      typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt)
        ? candidate.updatedAt
        : 0,
  };
}

async function readProfiles(): Promise<Record<string, LocalUserProfile>> {
  const raw = await AsyncStorage.getItem(USER_PROFILES_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, normalizeProfile(value)])
    );
  } catch {
    return {};
  }
}

async function writeLocalProfile(identityKey: string, profile: LocalUserProfile): Promise<void> {
  const profiles = await readProfiles();
  await AsyncStorage.setItem(USER_PROFILES_KEY, JSON.stringify({ ...profiles, [identityKey]: profile }));
}

export async function getLocalUserProfile(identityKey: string): Promise<LocalUserProfile> {
  const currentUser = auth.currentUser;
  if (currentUser?.uid) {
    const path = `users/${currentUser.uid}`;
    try {
      const snapshot = await getDoc(doc(db, "users", currentUser.uid));
      if (snapshot.exists()) {
        const profile = normalizeProfile({ uid: currentUser.uid, ...snapshot.data() });
        await writeLocalProfile(currentUser.uid, profile);
        return profile;
      }
    } catch (error) {
      logFirestorePermissionDenied("load user profile", [path], error);
      // Fall back to cached local profile when cloud profile is unavailable.
    }
  }

  const profiles = await readProfiles();
  return profiles[identityKey] ?? profiles[currentUser?.uid ?? ""] ?? profiles.device ?? EMPTY_LOCAL_USER_PROFILE;
}

export function profilePhotoPathForUid(uid: string): string {
  return `profilePhotos/${uid}/avatar.jpg`;
}

function versionedPhotoURL(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
}

function storageErrorCode(error: unknown): string {
  return typeof error === "object" && error && "code" in error ? String(error.code) : "";
}

function storageErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isFirebaseStorageUnavailableError(error: unknown): boolean {
  const code = storageErrorCode(error);
  const message = storageErrorMessage(error).toLowerCase();

  return (
    code === "storage/bucket-not-found" ||
    code === "storage/project-not-found" ||
    (code === "storage/unknown" &&
      (message.includes("bucket") ||
        message.includes("not found") ||
        message.includes("not set up") ||
        message.includes("storage has not been set up")))
  );
}

function normalizeStorageUploadError(error: unknown): Error {
  const code = storageErrorCode(error);

  if (code === "storage/unauthorized") {
    return new Error("Profile photo upload is not allowed yet. Deploy Firebase Storage rules for profilePhotos/{uid}/avatar.jpg.");
  }

  if (isFirebaseStorageUnavailableError(error)) {
    return new Error("Profile photo upload is not available yet because Firebase Storage has not been set up for this project. Your profile details can still be saved.");
  }

  if (code === "storage/retry-limit-exceeded" || code === "storage/canceled" || code === "storage/unknown") {
    return new Error("Couldn’t upload the profile photo to Firebase Storage. Check your connection and try again.");
  }

  return error instanceof Error ? error : new Error("Couldn’t upload the profile photo to Firebase Storage.");
}

export async function uploadCurrentUserProfilePhoto(localUri: string): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) {
    throw new Error("Sign in before uploading a profile photo.");
  }

  const response = await fetch(localUri);
  if (!response.ok) {
    throw new Error("Could not read the selected photo.");
  }

  const blob = await response.blob();
  const photoRef = ref(storage, profilePhotoPathForUid(currentUser.uid));
  try {
    await uploadBytes(photoRef, blob, {
      contentType: PROFILE_PHOTO_CONTENT_TYPE,
      customMetadata: {
        ownerUid: currentUser.uid,
      },
    });

    return versionedPhotoURL(await getDownloadURL(photoRef));
  } catch (error) {
    throw normalizeStorageUploadError(error);
  }
}

export async function deleteProfilePhotoObjectForUid(uid: string): Promise<void> {
  if (!uid) return;

  try {
    await deleteObject(ref(storage, profilePhotoPathForUid(uid)));
  } catch (error) {
    const code = storageErrorCode(error);
    if (code !== "storage/object-not-found" && !isFirebaseStorageUnavailableError(error)) {
      throw error;
    }
  }
}

export async function deleteCurrentUserProfilePhotoObject(): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) return;
  await deleteProfilePhotoObjectForUid(currentUser.uid);
}

export async function saveCurrentUserProfilePhotoURL(identityKey: string, photoURL: string): Promise<LocalUserProfile> {
  const currentUser = auth.currentUser;
  const normalizedPhotoURL = normalizePhotoURL(photoURL);

  if (!currentUser?.uid) {
    const profiles = await readProfiles();
    const nextProfile = normalizeProfile({
      ...(profiles[identityKey] ?? EMPTY_LOCAL_USER_PROFILE),
      photoURL: normalizedPhotoURL,
      updatedAt: Date.now(),
    });
    await writeLocalProfile(identityKey, nextProfile);
    return nextProfile;
  }

  const uid = currentUser.uid;
  const path = `users/${uid}`;
  const userRef = doc(db, "users", uid);

  try {
    await setDoc(
      userRef,
      {
        uid,
        photoURL: normalizedPhotoURL,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
    await updateCurrentAuthProfile({ photoURL: normalizedPhotoURL || null });

    const snapshot = await getDoc(userRef);
    const nextProfile = normalizeProfile({ uid, ...snapshot.data() });
    await writeLocalProfile(uid, nextProfile);
    return nextProfile;
  } catch (error) {
    logFirestorePermissionDenied("save profile photo url", [path], error);
    throw error;
  }
}

export async function saveLocalUserProfile(
  identityKey: string,
  profile: Omit<LocalUserProfile, "updatedAt"> | LocalUserProfile
): Promise<LocalUserProfile> {
  const currentUser = auth.currentUser;
  const normalized = normalizeProfile({ ...profile, updatedAt: Date.now() });

  if (!currentUser?.uid) {
    await writeLocalProfile(identityKey, normalized);
    return normalized;
  }

  const usernameResult = validateUsername(normalized.username);
  if (usernameResult.error) {
    throw new Error(usernameResult.error);
  }

  const uid = currentUser.uid;
  const userRef = doc(db, "users", uid);
  const nextUsername = usernameResult.username;
  const nextUsernameRef = nextUsername ? doc(db, "usernames", nextUsername) : null;
  const now = Date.now();

  const transactionPaths = [`users/${uid}`, ...(nextUsername ? [`usernames/${nextUsername}`] : [])];
  const savedProfile = await runTransaction(db, async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    const existingProfile = normalizeProfile({ uid, ...userSnapshot.data() });
    const previousUsername = existingProfile.username;
    const nextUsernameSnapshot = nextUsernameRef ? await transaction.get(nextUsernameRef) : null;

    if (nextUsernameSnapshot?.exists() && nextUsernameSnapshot.data()?.uid !== uid) {
      throw new Error("That username is already taken.");
    }

    if (previousUsername && previousUsername !== nextUsername) {
      const previousUsernameRef = doc(db, "usernames", previousUsername);
      transactionPaths.push(`usernames/${previousUsername}`);
      const previousUsernameSnapshot = await transaction.get(previousUsernameRef);
      if (previousUsernameSnapshot.exists() && previousUsernameSnapshot.data()?.uid === uid) {
        transaction.delete(previousUsernameRef);
      }
    }

    const nextProfile: LocalUserProfile = {
      ...normalized,
      uid,
      username: nextUsername,
      usernameLower: nextUsername,
      walkingGoal: normalized.outdoorGoal,
      bio: normalized.dreamPlaces,
      createdAt: existingProfile.createdAt || now,
      updatedAt: now,
    };

    if (nextUsernameRef) {
      transaction.set(
        nextUsernameRef,
        {
          uid,
          username: nextUsername,
          createdAt: nextUsernameSnapshot?.exists()
            ? nextUsernameSnapshot.data()?.createdAt ?? serverTimestamp()
            : serverTimestamp(),
        },
        { merge: false }
      );
    }
    transaction.set(userRef, nextProfile, { merge: true });

    return nextProfile;
  }).catch((error) => {
    logFirestorePermissionDenied("save user profile transaction", transactionPaths, error);
    throw error;
  });

  await Promise.allSettled([
    writeLocalProfile(uid, savedProfile),
    updateCurrentAuthProfile({
      displayName: savedProfile.displayName || null,
      photoURL: savedProfile.photoURL || null,
    }),
  ]);

  return savedProfile;
}

export async function clearLocalUserProfiles(): Promise<void> {
  await AsyncStorage.removeItem(USER_PROFILES_KEY);
}
