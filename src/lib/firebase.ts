import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, initializeAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

function requiredEnv(name: keyof NodeJS.ProcessEnv): string {
  const value =
    name === "EXPO_PUBLIC_FIREBASE_API_KEY"
      ? process.env.EXPO_PUBLIC_FIREBASE_API_KEY
      : name === "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"
      ? process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
      : name === "EXPO_PUBLIC_FIREBASE_PROJECT_ID"
      ? process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID
      : name === "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"
      ? process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
      : name === "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
      ? process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
      : name === "EXPO_PUBLIC_FIREBASE_APP_ID"
      ? process.env.EXPO_PUBLIC_FIREBASE_APP_ID
      : process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID;

  if (!value) throw new Error(`[firebase] Missing required env var: ${name}`);
  return value;
}

const firebaseConfig = {
  apiKey: requiredEnv("EXPO_PUBLIC_FIREBASE_API_KEY"),
  authDomain: requiredEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: requiredEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: requiredEnv("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: requiredEnv("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: requiredEnv("EXPO_PUBLIC_FIREBASE_APP_ID"),
  // measurementId is optional and web-only; safe to ignore in native.
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

/**
 * Firebase App (single instance across fast refresh)
 */
export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

/**
 * Firebase Auth
 */
export const auth: Auth = (() => {
  try {
    // Persistence can be wired later if auth is enabled in-app.
    return initializeAuth(app);
  } catch {
    return getAuth(app);
  }
})();

/**
 * Firestore
 */
export const db: Firestore = getFirestore(app);
