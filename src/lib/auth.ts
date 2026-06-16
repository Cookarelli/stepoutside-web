import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type UserProfile,
  type User,
} from "@firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { auth, db } from "./firebase";
import { syncRevenueCatIdentity } from "./pro";

const AUTH_CACHE_KEY = "stepoutside:v2:auth-cache";

export type AuthUserSnapshot = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  providerIds: string[];
  isAnonymous: boolean;
};

function toSnapshot(user: User | null): AuthUserSnapshot | null {
  if (!user) return null;

  return {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    providerIds: user.providerData.map((item) => item.providerId).filter(Boolean),
    isAnonymous: user.isAnonymous,
  };
}

async function writeCachedUser(user: AuthUserSnapshot | null): Promise<void> {
  if (!user) {
    await AsyncStorage.removeItem(AUTH_CACHE_KEY);
    return;
  }

  await AsyncStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(user));
}

export async function getCachedAuthUser(): Promise<AuthUserSnapshot | null> {
  const raw = await AsyncStorage.getItem(AUTH_CACHE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AuthUserSnapshot>;
    if (
      typeof parsed?.uid !== "string" ||
      !Array.isArray(parsed.providerIds) ||
      typeof parsed.isAnonymous !== "boolean"
    ) {
      return null;
    }

    return {
      uid: parsed.uid,
      email: parsed.email ?? null,
      displayName: parsed.displayName ?? null,
      photoURL: parsed.photoURL ?? null,
      providerIds: parsed.providerIds.filter((item): item is string => typeof item === "string"),
      isAnonymous: parsed.isAnonymous,
    };
  } catch {
    return null;
  }
}

export function subscribeToAuth(listener: (user: AuthUserSnapshot | null) => void): () => void {
  return onAuthStateChanged(auth, (user) => {
    const snapshot = toSnapshot(user);
    void (async () => {
      try {
        await writeCachedUser(snapshot);
        if (snapshot?.uid) {
          await syncRevenueCatIdentity(snapshot.uid);
        }
      } catch {
        // Keep auth state changes from crashing profile loads.
      }
    })();
    listener(snapshot);
  });
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
  await writeCachedUser(null);
  try {
    await syncRevenueCatIdentity(null);
  } catch {
    // Auth sign-out and local cache clearing should not depend on RevenueCat availability.
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function ensureUserProfileDocument(user: User): Promise<void> {
  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);
  const existing = snapshot.data() as
    | {
        createdAt?: unknown;
        displayName?: unknown;
        photoURL?: unknown;
      }
    | undefined;
  const now = Date.now();

  await setDoc(
    userRef,
    {
      uid: user.uid,
      email: user.email ? normalizeEmail(user.email) : null,
      displayName:
        typeof existing?.displayName === "string" ? existing.displayName : user.displayName ?? "",
      photoURL: typeof existing?.photoURL === "string" ? existing.photoURL : user.photoURL ?? "",
      createdAt: typeof existing?.createdAt === "number" ? existing.createdAt : now,
      updatedAt: now,
    },
    { merge: true }
  );
}

async function finishEmailPasswordAuth(user: User, fallback: string): Promise<AuthUserSnapshot> {
  const snapshot = toSnapshot(user);

  if (!snapshot) {
    throw new Error(fallback);
  }

  await ensureUserProfileDocument(user);
  await writeCachedUser(snapshot);
  await syncRevenueCatIdentity(snapshot.uid);
  return snapshot;
}

export async function signInWithEmailPassword(email: string, password: string): Promise<AuthUserSnapshot> {
  const result = await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
  return finishEmailPasswordAuth(result.user, "Email sign-in did not return a user.");
}

export async function createEmailPasswordAccount(email: string, password: string): Promise<AuthUserSnapshot> {
  const result = await createUserWithEmailAndPassword(auth, normalizeEmail(email), password);
  return finishEmailPasswordAuth(result.user, "Email sign-up did not return a user.");
}

export async function sendEmailPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, normalizeEmail(email));
}

export async function updateCurrentAuthProfile(input: {
  displayName?: string | null;
  photoURL?: string | null;
}): Promise<AuthUserSnapshot | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;

  const nextProfile: UserProfile = {};
  if ("displayName" in input) {
    nextProfile.displayName = input.displayName?.trim() || null;
  }
  if ("photoURL" in input) {
    nextProfile.photoURL = input.photoURL?.trim() || null;
  }

  await updateProfile(currentUser, nextProfile);
  const snapshot = toSnapshot(currentUser);
  await writeCachedUser(snapshot);
  return snapshot;
}
