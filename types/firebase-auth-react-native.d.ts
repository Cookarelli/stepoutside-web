import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { Persistence } from "firebase/auth";

// The firebase package's top-level type export omits this React Native-only API,
// although Metro resolves it from @firebase/auth's react-native export at runtime.
declare module "firebase/auth" {
  export function getReactNativePersistence(storage: AsyncStorageStatic): Persistence;
}
