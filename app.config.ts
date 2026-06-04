import type { ExpoConfig } from "expo/config";

const iosGoogleMapsApiKey = process.env.GOOGLE_MAPS_IOS_API_KEY ?? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const androidGoogleMapsApiKey =
  process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

const config: ExpoConfig = {
  name: "Step Outside",
  slug: "step-outside-v2",
  version: "2.1.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "stepoutsidev2",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.cookarell.stepoutside",
    ...(iosGoogleMapsApiKey
      ? {
          config: {
            googleMapsApiKey: iosGoogleMapsApiKey,
          },
        }
      : {}),
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "Step Outside uses your location while you track a walk and when you look for nearby reset routes or local sunrise and sunset timing.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "Step Outside uses your location during an active walk so distance and route tracking continue when your screen is locked.",
      NSLocationAlwaysUsageDescription:
        "Step Outside uses your location during an active walk so distance and route tracking continue when your screen is locked.",
      UIBackgroundModes: ["location"],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "com.stevencook.stepoutside",
    versionCode: 3,
    ...(androidGoogleMapsApiKey
      ? {
          config: {
            googleMaps: {
              apiKey: androidGoogleMapsApiKey,
            },
          },
        }
      : {}),
    permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-notifications",
      {
        icon: "./assets/images/icon.png",
        color: "#255E36",
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Step Outside uses your location while you track a walk and when you look for nearby reset routes.",
        locationAlwaysAndWhenInUsePermission:
          "Step Outside uses your location during an active walk so distance and route tracking continue when your screen is locked.",
        locationAlwaysPermission:
          "Step Outside uses your location during an active walk so distance and route tracking continue when your screen is locked.",
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
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
