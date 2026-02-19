import { useFocusEffect, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { resetOnboarding } from "../../src/lib/onboarding";
import { getNotificationPrefs, requestNotificationPermission, scheduleDailyStreakRiskReminder, sendTestNotification, setNotificationPrefs, type NotificationPrefs } from "../../src/lib/notifications";
import { getProState } from "../../src/lib/pro";

export default function ProfileTab() {
  const router = useRouter();
  const [isPro, setIsPro] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);

  useEffect(() => {
    void (async () => {
      const p = await getProState();
      setIsPro(p.isPro);
      const np = await getNotificationPrefs();
      setPrefs(np);
    })();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void (async () => {
        const p = await getProState();
        setIsPro(p.isPro);
      })();
    }, [])
  );

  const onResetOnboarding = () => {
    Alert.alert("Replay welcome screens?", "This will show onboarding again on next app launch.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Replay",
        style: "default",
        onPress: async () => {
          await resetOnboarding();
          router.replace("/splash");
        },
      },
    ]);
  };

  const updatePrefs = async (next: NotificationPrefs) => {
    setPrefs(next);
    await setNotificationPrefs(next);
    const ok = await requestNotificationPermission();
    if (ok) await scheduleDailyStreakRiskReminder(next);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.sub}>Anonymous now. Profile later.</Text>
      <Text style={styles.proStatus}>{isPro ? "Pro Active" : "Free Plan"}</Text>

      <Pressable onPress={() => router.push("/pro")} style={({ pressed }) => [styles.btn, pressed ? { opacity: 0.9 } : null]}>
        <Text style={styles.btnText}>{isPro ? "Manage Pro" : "Unlock Pro"}</Text>
      </Pressable>

      <View style={styles.notificationsCard}>
        <Text style={styles.notificationsTitle}>Smart reminders</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Weather reminders</Text>
          <Switch
            value={prefs?.weatherReminders ?? false}
            onValueChange={(v) => {
              if (!prefs) return;
              void updatePrefs({ ...prefs, weatherReminders: v });
            }}
          />
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Streak-risk reminders</Text>
          <Switch
            value={prefs?.streakRiskReminders ?? false}
            onValueChange={(v) => {
              if (!prefs) return;
              void updatePrefs({ ...prefs, streakRiskReminders: v });
            }}
          />
        </View>

        <Pressable style={styles.testBtn} onPress={() => void sendTestNotification()}>
          <Text style={styles.testBtnText}>Send test reminder</Text>
        </Pressable>
      </View>

      <Pressable onPress={onResetOnboarding} style={({ pressed }) => [styles.btnAlt, pressed ? { opacity: 0.9 } : null]}>
        <Text style={styles.btnAltText}>Replay Welcome Screens</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F4EE", alignItems: "center", justifyContent: "center", padding: 20 },
  title: { fontSize: 28, fontWeight: "900", color: "#0B0F0E" },
  sub: { marginTop: 10, fontSize: 14, fontWeight: "700", color: "rgba(11,15,14,0.65)", textAlign: "center" },
  proStatus: {
    marginTop: 8,
    color: "#255E36",
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  btn: {
    marginTop: 18,
    backgroundColor: "#255E36",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  btnText: { color: "white", fontWeight: "900", letterSpacing: 0.4 },
  notificationsCard: {
    marginTop: 12,
    width: "100%",
    borderRadius: 14,
    backgroundColor: "rgba(11,15,14,0.06)",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.12)",
    padding: 12,
  },
  notificationsTitle: { fontWeight: "900", color: "#0B0F0E", marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  rowLabel: { fontWeight: "700", color: "rgba(11,15,14,0.75)" },
  testBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "rgba(37,94,54,0.14)",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  testBtnText: { color: "#255E36", fontWeight: "900" },
  btnAlt: {
    marginTop: 10,
    backgroundColor: "rgba(11,15,14,0.08)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  btnAltText: { color: "rgba(11,15,14,0.72)", fontWeight: "900", letterSpacing: 0.3 },
});
