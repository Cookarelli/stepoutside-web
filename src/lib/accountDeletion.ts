import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  deleteUser,
  type User,
} from "firebase/auth";
import {
  deleteDoc,
  doc,
  getDocs,
  collection,
  writeBatch,
} from "firebase/firestore";
import * as Notifications from "expo-notifications";

import { clearActiveWalkSnapshot, clearCompletedWalkDraft } from "./activeWalk";
import { stopBackgroundWalkTracking } from "./walkLocationTracking";
import { signOutUser } from "./auth";
import { db } from "./firebase";
import { resetAllData } from "./store";
import { clearLocalUserProfiles } from "./userProfile";

const LOCAL_KEYS_TO_CLEAR = [
  "stepoutside:v2:auth-cache",
  "stepoutside:v2:summary",
  "stepoutside:v2:sessions",
  "stepoutside:v2:reflections",
  "stepoutside:v2:challengeSnapshot",
  "@stepoutside/notificationPrefs",
  "@stepoutside/proState",
  "@stepoutside/recentSuggestions",
  "@stepoutside/savedWalks",
  "@stepoutside/routeZipCode",
  "@stepoutside/activeWalk",
  "@stepoutside/completedWalkDraft",
] as const;

const USER_SUBCOLLECTIONS = ["sessions", "reflections", "challengeProgress", "badges", "memberships"] as const;

export const ACCOUNT_DELETION_REVIEW_NOTE =
  "Account deletion is available at Profile → Settings → Delete Account. Sign in with the demo account, open Profile, choose Delete Account, confirm deletion.";

export const ACCOUNT_DELETION_DEMO_NOTE_TEMPLATE = `Demo account:
Email: [ADD DEMO EMAIL]
Password: [ADD DEMO PASSWORD]

Account deletion path:
Profile → Settings → Delete Account → Permanently Delete My Account`;

export type DeleteAccountResult = {
  cloudCleanupRequired: boolean;
  cloudCleanupTargets: string[];
};

function isRequiresRecentLogin(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    (error as { code: string }).code === "auth/requires-recent-login"
  );
}

async function deleteCollectionDocs(uid: string, collectionName: (typeof USER_SUBCOLLECTIONS)[number]) {
  const snapshot = await getDocs(collection(db, "users", uid, collectionName));
  if (snapshot.empty) return;

  let batch = writeBatch(db);
  let count = 0;

  for (const entry of snapshot.docs) {
    batch.delete(entry.ref);
    count += 1;

    if (count >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }
}

async function deleteUserOwnedFirestoreData(uid: string): Promise<DeleteAccountResult> {
  const membershipSnapshot = await getDocs(collection(db, "users", uid, "memberships"));
  const cloudCleanupTargets = membershipSnapshot.docs.map((entry) => entry.id);

  for (const collectionName of USER_SUBCOLLECTIONS) {
    await deleteCollectionDocs(uid, collectionName);
  }

  await deleteDoc(doc(db, "users", uid));

  return {
    cloudCleanupRequired: cloudCleanupTargets.length > 0,
    cloudCleanupTargets,
  };
}

async function clearLocalUserState(): Promise<void> {
  await stopBackgroundWalkTracking();
  await resetAllData();
  await Promise.allSettled([
    AsyncStorage.multiRemove([...LOCAL_KEYS_TO_CLEAR]),
    clearActiveWalkSnapshot(),
    clearCompletedWalkDraft(),
    clearLocalUserProfiles(),
    Notifications.cancelAllScheduledNotificationsAsync(),
  ]);
}

export async function deleteCurrentAccount(currentUser: User): Promise<DeleteAccountResult> {
  const firestoreResult = await deleteUserOwnedFirestoreData(currentUser.uid);
  await deleteUser(currentUser);

  const cleanupResults = await Promise.allSettled([signOutUser(), clearLocalUserState()]);
  const cleanupErrors = cleanupResults.filter((result): result is PromiseRejectedResult => result.status === "rejected");

  if (cleanupErrors.length > 0) {
    console.warn("[account-delete] post-delete cleanup completed with warnings", cleanupErrors.map((result) => result.reason));
  }

  return firestoreResult;
}

export function accountDeletionRequiresRecentLogin(error: unknown): boolean {
  return isRequiresRecentLogin(error);
}

// TODO: Add a callable Cloud Function to clean up shared company documents that cannot be
// deleted safely from the client, including companies/{companyId}/members/{uid} and
// companies/{companyId}/challengeProgress entries tied to the deleted user.
