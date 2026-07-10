import { doc, getDoc, runTransaction } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { auth, db, storage } from "./firebase";
import { updateAuthProfileFields } from "./auth";
import { upsertCurrentUserDiscoveryProfile } from "./friendSystem";

export type UserProfile = {
  uid: string;
  displayName: string;
  username: string;
  usernameLower: string;
  location: string;
  favoriteActivity: string;
  outdoorGoal: string;
  dreamPlaces: string;
  photoURL: string;
  createdAt: number;
  updatedAt: number;
};

export type EditableUserProfile = Pick<
  UserProfile,
  "displayName" | "username" | "location" | "favoriteActivity" | "outdoorGoal" | "dreamPlaces" | "photoURL"
>;

export type UsernameValidationResult = {
  username: string;
  error: string | null;
};

const RESERVED_USERNAMES = new Set(["admin", "support", "stepoutside", "premium", "null", "undefined"]);
const USERNAME_PATTERN = /^[a-z0-9_.]+$/;
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;
const PROFILE_PHOTO_CONTENT_TYPE = "image/jpeg";

export function profilePhotoPathForUid(uid: string): string {
  return `profilePhotos/${uid}/avatar.jpg`;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanLongText(value: unknown): string {
  return cleanText(value).replace(/\s+/g, " ");
}

function cleanPhotoURL(value: unknown): string {
  const url = cleanText(value);
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : "";
}

function normalizeProfile(value: Partial<UserProfile> | undefined, uid: string): UserProfile | null {
  if (!value) return null;
  const username = normalizeUsername(value.username ?? value.usernameLower ?? "");
  if (!username) return null;

  return {
    uid,
    displayName: cleanLongText(value.displayName),
    username,
    usernameLower: username,
    location: cleanLongText(value.location),
    favoriteActivity: cleanLongText(value.favoriteActivity),
    outdoorGoal: cleanLongText(value.outdoorGoal),
    dreamPlaces: cleanLongText(value.dreamPlaces),
    photoURL: cleanPhotoURL(value.photoURL),
    createdAt: typeof value.createdAt === "number" ? value.createdAt : Date.now(),
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
  };
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validateUsername(value: string): UsernameValidationResult {
  const username = normalizeUsername(value);

  if (!username) {
    return { username, error: "Choose a public username before saving." };
  }

  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return { username, error: "Use 3 to 20 characters for your username." };
  }

  if (!USERNAME_PATTERN.test(username)) {
    return { username, error: "Use only letters, numbers, underscores, and periods." };
  }

  if (RESERVED_USERNAMES.has(username)) {
    return { username, error: "That username is reserved. Try a more personal trail name." };
  }

  return { username, error: null };
}

export function validatePhotoURL(value: string): string | null {
  const photoURL = cleanText(value);
  if (!photoURL) return null;
  if (!/^https?:\/\//i.test(photoURL)) return "Photo URL must start with http:// or https://.";
  return null;
}

export function isUserProfileComplete(profile: UserProfile | null): boolean {
  return Boolean(profile && !validateUsername(profile.username).error);
}

export function emptyEditableProfile(): EditableUserProfile {
  return {
    displayName: "",
    username: "",
    location: "",
    favoriteActivity: "",
    outdoorGoal: "",
    dreamPlaces: "",
    photoURL: "",
  };
}

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) return null;

  const snapshot = await getDoc(doc(db, "users", currentUser.uid));
  return normalizeProfile(snapshot.data() as Partial<UserProfile> | undefined, currentUser.uid);
}

export function editableProfileFromSources(profile: UserProfile | null): EditableUserProfile {
  if (!profile) return emptyEditableProfile();

  return {
    displayName: profile.displayName,
    username: profile.username,
    location: profile.location,
    favoriteActivity: profile.favoriteActivity,
    outdoorGoal: profile.outdoorGoal,
    dreamPlaces: profile.dreamPlaces,
    photoURL: profile.photoURL,
  };
}

export async function saveCurrentUserProfile(input: EditableUserProfile): Promise<UserProfile> {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) {
    throw new Error("Sign in with email before editing your profile.");
  }

  const usernameResult = validateUsername(input.username);
  if (usernameResult.error) {
    throw new Error(usernameResult.error);
  }

  const photoError = validatePhotoURL(input.photoURL);
  if (photoError) {
    throw new Error(photoError);
  }

  const uid = currentUser.uid;
  const nextUsername = usernameResult.username;
  const userRef = doc(db, "users", uid);
  const nextUsernameRef = doc(db, "usernames", nextUsername);
  const now = Date.now();

  const savedProfile = await runTransaction(db, async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    const existingUserData = userSnapshot.data() as Partial<UserProfile> | undefined;
    const existingProfile = normalizeProfile(existingUserData, uid);
    const existingCreatedAt =
      typeof existingUserData?.createdAt === "number" ? existingUserData.createdAt : undefined;
    const previousUsername = existingProfile?.username ?? "";
    const nextUsernameSnapshot = await transaction.get(nextUsernameRef);

    if (nextUsernameSnapshot.exists()) {
      const ownerUid = nextUsernameSnapshot.data()?.uid;
      if (ownerUid !== uid) {
        throw new Error("That username is already taken.");
      }
    }

    if (previousUsername && previousUsername !== nextUsername) {
      const previousUsernameRef = doc(db, "usernames", previousUsername);
      const previousUsernameSnapshot = await transaction.get(previousUsernameRef);
      if (previousUsernameSnapshot.exists() && previousUsernameSnapshot.data()?.uid === uid) {
        transaction.delete(previousUsernameRef);
      }
    }

    const profile: UserProfile = {
      uid,
      displayName: cleanLongText(input.displayName),
      username: nextUsername,
      usernameLower: nextUsername,
      location: cleanLongText(input.location),
      favoriteActivity: cleanLongText(input.favoriteActivity),
      outdoorGoal: cleanLongText(input.outdoorGoal),
      dreamPlaces: cleanLongText(input.dreamPlaces),
      photoURL: cleanPhotoURL(input.photoURL),
      createdAt: existingProfile?.createdAt ?? existingCreatedAt ?? now,
      updatedAt: now,
    };

    transaction.set(
      nextUsernameRef,
      {
        uid,
        username: nextUsername,
        createdAt: nextUsernameSnapshot.exists()
          ? typeof nextUsernameSnapshot.data()?.createdAt === "number"
            ? nextUsernameSnapshot.data()?.createdAt
            : now
          : now,
        updatedAt: now,
      },
      { merge: false }
    );
    const emailLower = currentUser.email?.trim().toLowerCase() ?? "";
    transaction.set(userRef, { ...profile, email: emailLower || null, emailLower }, { merge: true });

    return profile;
  });

  await updateAuthProfileFields({
    displayName: savedProfile.displayName || null,
    photoURL: savedProfile.photoURL || null,
  });
  await upsertCurrentUserDiscoveryProfile();

  return savedProfile;
}

export async function uploadCurrentUserProfilePhoto(localUri: string): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) {
    throw new Error("Sign in with email before changing your profile photo.");
  }

  const response = await fetch(localUri);
  if (!response.ok) {
    throw new Error("Could not read the selected photo.");
  }

  const blob = await response.blob();
  const photoRef = ref(storage, profilePhotoPathForUid(currentUser.uid));
  await uploadBytes(photoRef, blob, {
    contentType: PROFILE_PHOTO_CONTENT_TYPE,
    customMetadata: {
      ownerUid: currentUser.uid,
    },
  });

  return getDownloadURL(photoRef);
}

export async function deleteCurrentUserProfilePhotoObject(): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) return;
  await deleteProfilePhotoObjectForUid(currentUser.uid);
}

export async function deleteProfilePhotoObjectForUid(uid: string): Promise<void> {
  if (!uid) return;

  try {
    await deleteObject(ref(storage, profilePhotoPathForUid(uid)));
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code !== "storage/object-not-found") {
      throw error;
    }
  }
}
