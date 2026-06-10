import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import * as FirebaseAuth from "@firebase/auth";
import type { Auth, Persistence } from "@firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

import { ENV } from "../../env";

type RequiredFirebaseEnvKey = Exclude<keyof typeof ENV.FIREBASE, "measurementId" | "usePreviewFallback">;

function requiredFirebaseEnv(name: RequiredFirebaseEnvKey, envName: string): string {
  const value = ENV.FIREBASE[name];
  if (!value) {
    throw new Error(`[Firebase] Missing required ${envName}. Add it to .env or the EAS build environment.`);
  }

  return value;
}

const previewFirebaseConfig = {
  apiKey: "preview-api-key",
  authDomain: "stepoutside-preview.firebaseapp.com",
  projectId: "stepoutside-preview",
  storageBucket: "stepoutside-preview.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:preview",
  measurementId: undefined,
};

const usingFallbackProject = __DEV__ && ENV.FIREBASE.usePreviewFallback;

const firebaseConfig = {
  apiKey: usingFallbackProject
    ? previewFirebaseConfig.apiKey
    : requiredFirebaseEnv("apiKey", "EXPO_PUBLIC_FIREBASE_API_KEY"),
  authDomain: usingFallbackProject
    ? previewFirebaseConfig.authDomain
    : requiredFirebaseEnv("authDomain", "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: usingFallbackProject
    ? previewFirebaseConfig.projectId
    : requiredFirebaseEnv("projectId", "EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: usingFallbackProject
    ? previewFirebaseConfig.storageBucket
    : requiredFirebaseEnv("storageBucket", "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: usingFallbackProject
    ? previewFirebaseConfig.messagingSenderId
    : requiredFirebaseEnv("messagingSenderId", "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: usingFallbackProject
    ? previewFirebaseConfig.appId
    : requiredFirebaseEnv("appId", "EXPO_PUBLIC_FIREBASE_APP_ID"),
  // measurementId is optional and web-only; safe to ignore in native.
  measurementId: usingFallbackProject ? previewFirebaseConfig.measurementId : ENV.FIREBASE.measurementId,
};

const { getAuth, initializeAuth } = FirebaseAuth;
const getReactNativePersistence = (
  FirebaseAuth as typeof FirebaseAuth & {
    getReactNativePersistence?: (storage: typeof AsyncStorage) => Persistence;
  }
).getReactNativePersistence;

/**
 * Firebase App (single instance across fast refresh)
 */
export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
if (__DEV__) {
  console.info("[Firebase] config", {
    projectId: firebaseConfig.projectId,
    usingFallbackProject,
  });
}

/**
 * Firebase Auth
 */
export const auth: Auth = (() => {
  try {
    return initializeAuth(
      app,
      getReactNativePersistence
        ? {
            persistence: getReactNativePersistence(AsyncStorage),
          }
        : undefined
    );
  } catch {
    return getAuth(app);
  }
})();

export async function waitForAuthReady(): Promise<void> {
  await auth.authStateReady();
}

/**
 * Firestore
 */
export const db: Firestore = getFirestore(app);

/**
 * Firebase Storage
 */
export const storage: FirebaseStorage = getStorage(app);
