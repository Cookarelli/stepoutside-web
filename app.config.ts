import { existsSync } from "node:fs";
import type { ExpoConfig } from "expo/config";

const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
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
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "Step Outside uses your location while you track a walk and when you look for nearby reset routes or local sunrise and sunset timing.",
      ITSAppUsesNonExemptEncryption: false,
    },
    ...(googleMapsApiKey
      ? {
          config: {
            googleMapsApiKey,
          },
        }
      : {}),
    ...(hasIosGoogleServicesFile ? { googleServicesFile: iosGoogleServicesFile } : {}),
  },
  android: {
    package: "com.stevencook.stepoutside",
    versionCode: 3,
    permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    ...(googleMapsApiKey
      ? {
          config: {
            googleMaps: {
              apiKey: googleMapsApiKey,
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
