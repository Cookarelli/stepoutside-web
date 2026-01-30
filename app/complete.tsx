import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { addCompletedSession, type SessionSource } from "../src/lib/store";

function minutesFromDuration(durationSec: number): number {
  return Math.max(1, Math.round(durationSec / 60));
}

function fmtNiceMinutes(min: number): string {
  return min === 1 ? "1 minute" : `${min} minutes`;
}

export default function CompleteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    startedAt?: string;
    endedAt?: string;
    durationSec?: string;
    source?: string;
  }>();

  const startedAt = Number(params.startedAt || "");
  const endedAt = Number(params.endedAt || "");
  const durationSec = Number(params.durationSec || "");
  const source: SessionSource = params.source === "gps" ? "gps" : "timer";

  const valid =
    Number.isFinite(startedAt) &&
    Number.isFinite(endedAt) &&
    Number.isFinite(durationSec) &&
    durationSec > 0;

  const saveKey = `${startedAt}-${endedAt}-${durationSec}-${source}`;

  const [saving, setSaving] = useState(true);
  const [minutes, setMinutes] = useState(0);
  const [streakLine, setStreakLine] = useState<string>("");
  const [errorText, setErrorText] = useState<string>("");

  const lastSaveKeyRef = useRef<string | null>(null);
  const didHapticRef = useRef(false);

  useEffect(() => {
    (async () => {
      if (!valid) {
        setSaving(false);
        return;
      }

      // Prevent double-saves on refresh/navigation
      if (lastSaveKeyRef.current === saveKey) {
        setSaving(false);
        return;
      }
      lastSaveKeyRef.current = saveKey;

      try {
        setErrorText("");
        setSaving(true);

        const mins = minutesFromDuration(durationSec);
        setMinutes(mins);

        const id = `${startedAt}-${endedAt}`;
        const result = await addCompletedSession({
          id,
          startedAt,
          endedAt,
          durationSec,
          source,
        });

        // Some store implementations return `{ summary }` where `summary` can be undefined.
        const summary = (result as any)?.summary;
        if (summary && typeof summary.currentStreakDays === "number") {
          setStreakLine(
            `Streak: ${summary.currentStreakDays} day${summary.currentStreakDays === 1 ? "" : "s"} • Best: ${summary.bestStreakDays}`
          );
        } else {
          setStreakLine("");
        }

        if (!didHapticRef.current) {
          didHapticRef.current = true;
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success
          );
        }
      } catch (_e: any) {
        // allow retry
        lastSaveKeyRef.current = null;
        setErrorText("Couldn’t save this session. Try again.");
      } finally {
        setSaving(false);
      }
    })();
  }, [saveKey, valid, startedAt, endedAt, durationSec, source]);

  const headline = useMemo(() => {
    if (!valid) return "Go back and start a walk.";
    return "This counts.";
  }, [valid]);

  return (
    <SafeAreaView
      style={styles.safe}
      edges={["top", "left", "right", "bottom"]}
    >
      <View style={styles.container}>
        <Image
          source={require("../assets/images/icon.png")}
          style={styles.logo}
        />
        <Text style={styles.title}>Step Outside</Text>

        <Text style={styles.headline}>{headline}</Text>

        {valid ? (
          <>
            <Text style={styles.big}>
              {fmtNiceMinutes(minutes || minutesFromDuration(durationSec))}
            </Text>
            <Text style={styles.sub}>
              {saving
                ? "Updating your streak…"
                : errorText
                  ? errorText
                  : streakLine || "Streak updated."}
            </Text>
          </>
        ) : (
          <Text style={styles.sub}>No session found.</Text>
        )}

        <Pressable
          onPress={() => router.push("/stats")}
          style={({ pressed }) => [
            styles.btnPrimary,
            pressed ? { opacity: 0.9 } : null,
          ]}
        >
          <Text style={styles.btnPrimaryText}>VIEW STATS</Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace("/start")}
          style={({ pressed }) => [
            styles.btnSecondary,
            pressed ? { opacity: 0.9 } : null,
          ]}
        >
          <Text style={styles.btnSecondaryText}>BACK TO START</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8F4EE" },
  container: {
    flex: 1,
    backgroundColor: "#F8F4EE",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  logo: { width: 88, height: 88, borderRadius: 22, marginBottom: 14 },
  title: { fontSize: 22, fontWeight: "900", color: "#0B0F0E" },
  headline: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: "900",
    color: "#0B0F0E",
  },
  big: { marginTop: 10, fontSize: 44, fontWeight: "900", color: "#0B0F0E" },
  sub: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(11,15,14,0.65)",
    textAlign: "center",
  },
  btnPrimary: {
    marginTop: 22,
    backgroundColor: "#255E36",
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 16,
    minWidth: 240,
    alignItems: "center",
  },
  btnPrimaryText: { color: "white", fontWeight: "900", letterSpacing: 1 },
  btnSecondary: {
    marginTop: 12,
    backgroundColor: "rgba(11,15,14,0.06)",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 16,
    minWidth: 240,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(11,15,14,0.12)",
  },
  btnSecondaryText: { color: "#0B0F0E", fontWeight: "900", letterSpacing: 1 },
});
