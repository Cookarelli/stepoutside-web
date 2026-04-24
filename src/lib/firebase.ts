import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, initializeAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

function envOrFallback(name: keyof NodeJS.ProcessEnv, fallback: string): string {
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

  return value || fallback;
}

const firebaseConfig = {
  apiKey: envOrFallback("EXPO_PUBLIC_FIREBASE_API_KEY", "preview-api-key"),
  authDomain: envOrFallback("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", "stepoutside-preview.firebaseapp.com"),
  projectId: envOrFallback("EXPO_PUBLIC_FIREBASE_PROJECT_ID", "stepoutside-preview"),
  storageBucket: envOrFallback("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET", "stepoutside-preview.appspot.com"),
  messagingSenderId: envOrFallback("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "000000000000"),
  appId: envOrFallback("EXPO_PUBLIC_FIREBASE_APP_ID", "1:000000000000:web:preview"),
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
    // This Firebase build currently initializes Auth without an RN-specific persistence adapter.
    // Profile UI caches a lightweight user snapshot locally, but native auth session persistence
    // still needs validation or a package upgrade before we call it "fully synced."
    return initializeAuth(app);
  } catch {
    return getAuth(app);
  }
})();

/**
 * Firestore
 */
export const db: Firestore = getFirestore(app);
