import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { Platform } from "react-native";

import { getDailySpark } from "./dailySpark";

export type NotificationPrefs = {
  sunriseQuotes: boolean;
  sunsetReminders: boolean;
  streakRiskReminders: boolean;
  quietHoursStart: number; // 0-23
  quietHoursEnd: number; // 0-23
};

const PREFS_KEY = "@stepoutside/notificationPrefs";
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

const DEFAULT_PREFS: NotificationPrefs = {
  sunriseQuotes: true,
  sunsetReminders: true,
  streakRiskReminders: true,
  quietHoursStart: 22,
  quietHoursEnd: 8,
};

type NotificationsModule = typeof import("expo-notifications");

let notificationsModulePromise: Promise<NotificationsModule | null> | null = null;
let notificationHandlerConfigured = false;

async function getNotificationsModule(): Promise<NotificationsModule | null> {
  if (Platform.OS === "web") return null;

  if (!notificationsModulePromise) {
    notificationsModulePromise = import("expo-notifications");
  }

  const notifications = await notificationsModulePromise;

  if (!notifications || notificationHandlerConfigured) {
    return notifications;
  }

  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === "android") {
    await notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 180],
      lightColor: "#255E36",
    });
  }

  notificationHandlerConfigured = true;

  return notifications;
}

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const raw = await AsyncStorage.getItem(PREFS_KEY);
  if (!raw) return DEFAULT_PREFS;
  try {
    const p = JSON.parse(raw) as Partial<NotificationPrefs> & { weatherReminders?: boolean };
    return {
      sunriseQuotes: p?.sunriseQuotes ?? p?.weatherReminders ?? DEFAULT_PREFS.sunriseQuotes,
      sunsetReminders: p?.sunsetReminders ?? p?.weatherReminders ?? DEFAULT_PREFS.sunsetReminders,
      streakRiskReminders: p?.streakRiskReminders ?? DEFAULT_PREFS.streakRiskReminders,
      quietHoursStart: p?.quietHoursStart ?? DEFAULT_PREFS.quietHoursStart,
      quietHoursEnd: p?.quietHoursEnd ?? DEFAULT_PREFS.quietHoursEnd,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function setNotificationPrefs(next: NotificationPrefs): Promise<void> {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
}

export async function requestNotificationPermission(): Promise<boolean> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return false;

  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }
  const req = await Notifications.requestPermissionsAsync();
  return req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

async function hasNotificationPermission(): Promise<boolean> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return false;

  const current = await Notifications.getPermissionsAsync();
  return current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

function inQuietHours(hour: number, start: number, end: number): boolean {
  // Handles overnight range (e.g., 22 -> 8)
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

function adjustMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function isSchedulable(date: Date, prefs: NotificationPrefs): boolean {
  if (date.getTime() <= Date.now() + 60_000) return false;
  if (inQuietHours(date.getHours(), prefs.quietHoursStart, prefs.quietHoursEnd)) return false;
  return true;
}

function nextEveningReminder(baseDate: Date): Date {
  const next = new Date(baseDate);
  next.setHours(18, 30, 0, 0);
  if (next.getTime() <= Date.now() + 60_000) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

async function fetchSunEvents(): Promise<{ sunrise: Date[]; sunset: Date[] } | null> {
  const permission = await Location.getForegroundPermissionsAsync();
  const granted =
    permission.granted || permission.status === "granted"
      ? permission
      : await Location.requestForegroundPermissionsAsync();

  if (granted.status !== "granted") return null;

  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const { latitude, longitude } = pos.coords;

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: "sunrise,sunset",
    forecast_days: "3",
    timezone: "auto",
  });

  const res = await fetch(`${OPEN_METEO_URL}?${params.toString()}`);
  if (!res.ok) throw new Error("sun events fetch failed");

  const data = await res.json();
  const sunrise = ((data?.daily?.sunrise ?? []) as string[]).map((value) => new Date(value));
  const sunset = ((data?.daily?.sunset ?? []) as string[]).map((value) => new Date(value));

  return { sunrise, sunset };
}

export async function scheduleSmartReminders(prefs: NotificationPrefs): Promise<void> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  await Notifications.cancelAllScheduledNotificationsAsync();

  const spark = getDailySpark(new Date());

  if (prefs.streakRiskReminders) {
    const reminderAt = nextEveningReminder(new Date());
    if (isSchedulable(reminderAt, prefs)) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Keep your streak alive",
          body: spark.reward,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminderAt,
        },
      });
    }
  }

  if (!prefs.sunriseQuotes && !prefs.sunsetReminders) return;

  try {
    const sunEvents = await fetchSunEvents();
    if (!sunEvents) return;

    if (prefs.sunriseQuotes) {
      for (const sunrise of sunEvents.sunrise) {
        const notifyAt = adjustMinutes(sunrise, 12);
        if (!isSchedulable(notifyAt, prefs)) continue;

        const sunriseSpark = getDailySpark(sunrise);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Sunrise quote",
            body: sunriseSpark.sunriseNudge,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: notifyAt,
          },
        });
      }
    }

    if (prefs.sunsetReminders) {
      for (const sunset of sunEvents.sunset) {
        const notifyAt = adjustMinutes(sunset, -35);
        if (!isSchedulable(notifyAt, prefs)) continue;

        const sunsetSpark = getDailySpark(sunset);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Sunset walk window",
            body: sunsetSpark.sunsetNudge,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: notifyAt,
          },
        });
      }
    }
  } catch {
    // If solar-time scheduling fails, keep the streak saver reminder as the reliable fallback.
  }
}

export async function sendTestNotification(): Promise<void> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  const spark = getDailySpark(new Date());

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Step Outside test",
      body: spark.sunriseNudge,
    },
    trigger: null,
  });
}

export async function refreshScheduledReminders(): Promise<void> {
  const allowed = await hasNotificationPermission();
  if (!allowed) return;

  const prefs = await getNotificationPrefs();
  await scheduleSmartReminders(prefs);
}
