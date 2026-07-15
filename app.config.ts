import { existsSync } from "node:fs";
import type { ExpoConfig } from "expo/config";

const iosGoogleMapsApiKey =
  process.env.GOOGLE_MAPS_IOS_API_KEY?.trim() ?? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
const androidGoogleMapsApiKey =
  process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim() ?? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
const iosGoogleServicesFile = "./GoogleService-Info.plist";
const androidGoogleServicesFile = "./google-services.json";
const hasIosGoogleServicesFile = existsSync(iosGoogleServicesFile);
const hasAndroidGoogleServicesFile = existsSync(androidGoogleServicesFile);

const config: ExpoConfig = {
  name: "Step Outside",
  slug: "step-outside-v2",
  version: "3.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "stepoutsidev2",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.cookarell.stepoutside",
    buildNumber: "38",
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "Step Outside uses your location while you track a walk and when you look for nearby reset routes or local sunrise and sunset timing.",
      ITSAppUsesNonExemptEncryption: false,
    },
    ...(iosGoogleMapsApiKey
      ? {
          config: {
            googleMapsApiKey: iosGoogleMapsApiKey,
          },
        }
      : {}),
    ...(hasIosGoogleServicesFile ? { googleServicesFile: iosGoogleServicesFile } : {}),
  },
  android: {
    package: "com.stevencook.stepoutside",
    // EAS remote versioning is authoritative. The current remote counter is 6;
    // the first approved Android test build will auto-increment to 7.
    versionCode: 7,
    permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    ...(androidGoogleMapsApiKey
      ? {
          config: {
            googleMaps: {
              apiKey: androidGoogleMapsApiKey,
            },
          },
        }
      : {}),
    ...(hasAndroidGoogleServicesFile ? { googleServicesFile: androidGoogleServicesFile } : {}),
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-dev-client",
    "@react-native-firebase/app",
    "@react-native-firebase/analytics",
    [
      "expo-build-properties",
      {
        ios: {
          useFrameworks: "static",
        },
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/images/icon.png",
        color: "#255E36",
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    "expo-web-browser",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: "a406fe2d-b4e7-47cf-8ede-10db0667d753",
    },
  },
  owner: "cookarell",
};

export default config;
