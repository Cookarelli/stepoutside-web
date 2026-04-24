import AsyncStorage from "@react-native-async-storage/async-storage";
import * as WebBrowser from "expo-web-browser";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";

import { auth } from "./firebase";
import { syncRevenueCatIdentity } from "./pro";

WebBrowser.maybeCompleteAuthSession();

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
        await syncRevenueCatIdentity(snapshot?.uid ?? null);
      } catch {
        // Keep auth state changes from crashing profile loads.
      }
    })();
    listener(snapshot);
  });
}

export async function signInWithGoogleIdToken(idToken: string, accessToken?: string | null): Promise<AuthUserSnapshot> {
  const credential = GoogleAuthProvider.credential(idToken, accessToken ?? undefined);
  const result = await signInWithCredential(auth, credential);
  const snapshot = toSnapshot(result.user);

  if (!snapshot) {
    throw new Error("Google sign-in did not return a user.");
  }

  await writeCachedUser(snapshot);
  await syncRevenueCatIdentity(snapshot.uid);
  return snapshot;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
  await syncRevenueCatIdentity(null);
  await writeCachedUser(null);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function finishEmailPasswordAuth(user: User, fallback: string): Promise<AuthUserSnapshot> {
  const snapshot = toSnapshot(user);

  if (!snapshot) {
    throw new Error(fallback);
  }

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
