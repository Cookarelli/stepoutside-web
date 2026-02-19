import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

export type NotificationPrefs = {
  weatherReminders: boolean;
  streakRiskReminders: boolean;
  quietHoursStart: number; // 0-23
  quietHoursEnd: number; // 0-23
};

const PREFS_KEY = "@stepoutside/notificationPrefs";

const DEFAULT_PREFS: NotificationPrefs = {
  weatherReminders: true,
  streakRiskReminders: true,
  quietHoursStart: 22,
  quietHoursEnd: 8,
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const raw = await AsyncStorage.getItem(PREFS_KEY);
  if (!raw) return DEFAULT_PREFS;
  try {
    const p = JSON.parse(raw) as NotificationPrefs;
    return {
      weatherReminders: p?.weatherReminders ?? DEFAULT_PREFS.weatherReminders,
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
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }
  const req = await Notifications.requestPermissionsAsync();
  return req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

function inQuietHours(hour: number, start: number, end: number): boolean {
  // Handles overnight range (e.g., 22 -> 8)
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

export async function scheduleDailyStreakRiskReminder(prefs: NotificationPrefs): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();

  if (!prefs.streakRiskReminders) return;

  // 6:30 PM local reminder unless in quiet hours
  const reminderHour = 18;
  if (inQuietHours(reminderHour, prefs.quietHoursStart, prefs.quietHoursEnd)) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Keep your streak alive",
      body: "A quick walk now keeps your momentum going today.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: reminderHour,
      minute: 30,
    },
  });
}

export async function sendTestNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "StepOutside test",
      body: "Your reminder setup is working.",
    },
    trigger: null,
  });
}
