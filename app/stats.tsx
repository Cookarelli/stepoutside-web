import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { dayKeyLocal, getSessions, getSummary, type OutsideSession, type SummaryStats } from "../src/lib/store";

function fmtTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

function lastNDaysKeys(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(dayKeyLocal(d));
  }
  return out.reverse();
}

export default function StatsScreen() {
  const router = useRouter();

  const t = {
    bg: "#F8F4EE",
    text: "rgba(11,15,14,0.92)",
    sub: "rgba(11,15,14,0.62)",
    card: "rgba(11,15,14,0.06)",
    cardBorder: "rgba(11,15,14,0.12)",
    highlight: "#F2B541",
    watermark: 0.08,
  } as const;

  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [sessions, setSessions] = useState<OutsideSession[]>([]);
  const [loading, setLoading] = useState(true);

  const last7 = useMemo(() => lastNDaysKeys(7), []);

  const load = async () => {
    setLoading(true);
    const s = await getSummary();
    const sess = await getSessions();
    setSummary(s);
    setSessions(sess);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalMinutes = summary?.totalMinutes ?? 0;
  const totalSessions = summary?.totalSessions ?? 0;
  const currentStreak = summary?.currentStreakDays ?? 0;
  const bestStreak = summary?.bestStreakDays ?? 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]} edges={["top", "left", "right", "bottom"]}>
      <View style={[styles.container, { backgroundColor: t.bg }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image source={require("../assets/images/icon.png")} style={styles.logo} />
            <Text style={[styles.headerTitle, { color: t.text }]}>Stats</Text>
          </View>

          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              router.back();
            }}
            style={({ pressed }) => [
              styles.backBtn,
              { backgroundColor: t.card, borderColor: t.cardBorder },
              pressed ? { opacity: 0.9 } : null,
            ]}
          >
            <Text style={[styles.backBtnText, { color: t.sub }]}>Done</Text>
          </Pressable>
        </View>

        <Image
          source={require("../assets/images/icon.png")}
          resizeMode="contain"
          style={[styles.watermark, { opacity: t.watermark }]}
        />

        <ScrollView contentContainerStyle={styles.scrollPad}>
          <View style={styles.grid}>
            <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
              <Text style={[styles.cardLabel, { color: t.sub }]}>Current streak</Text>
              <Text style={[styles.cardValue, { color: t.text }]}>{currentStreak}</Text>
              <Text style={[styles.cardSub, { color: t.sub }]}>days</Text>
            </View>

            <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
              <Text style={[styles.cardLabel, { color: t.sub }]}>Total outside</Text>
              <Text style={[styles.cardValue, { color: t.text }]}>{totalMinutes}</Text>
              <Text style={[styles.cardSub, { color: t.sub }]}>minutes</Text>
            </View>

            <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
              <Text style={[styles.cardLabel, { color: t.sub }]}>Best streak</Text>
              <Text style={[styles.cardValue, { color: t.text }]}>{bestStreak}</Text>
              <Text style={[styles.cardSub, { color: t.sub }]}>days</Text>
            </View>

            <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
              <Text style={[styles.cardLabel, { color: t.sub }]}>Sessions</Text>
              <Text style={[styles.cardValue, { color: t.text }]}>{totalSessions}</Text>
              <Text style={[styles.cardSub, { color: t.sub }]}>completed</Text>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: t.text }]}>Last 7 days</Text>
          <View style={[styles.accentRule, { backgroundColor: t.highlight }]} />

          <View style={[styles.panel, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            {summary ? (
              last7.map((dk) => {
                const mins = summary.daysCompleted?.[dk] ?? 0;
                return (
                  <View key={dk} style={styles.row}>
                    <Text style={[styles.rowLeft, { color: t.sub }]}>{dk}</Text>
                    <Text style={[styles.rowRight, { color: t.text }]}>{mins} min</Text>
                  </View>
                );
              })
            ) : (
              <Text style={[styles.muted, { color: t.sub }]}>
                {loading ? "Loading…" : "No data yet. Go get one."}
              </Text>
            )}
          </View>

          <Text style={[styles.sectionTitle, { color: t.text }]}>Recent sessions</Text>
          <View style={[styles.accentRule, { backgroundColor: t.highlight }]} />

          <View style={[styles.panel, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            {sessions.length === 0 ? (
              <Text style={[styles.muted, { color: t.sub }]}>
                {loading ? "Loading…" : "No sessions yet."}
              </Text>
            ) : (
              sessions.slice(0, 10).map((s, idx) => {
                const mins = Math.max(1, Math.round(s.durationSec / 60));
                const key = `${String((s as any).id ?? "")}-${String((s as any).startedAt ?? "")}-${String(
                  (s as any).endedAt ?? ""
                )}-${idx}`;
                return (
                  <View key={key} style={styles.sessionRow}>
                    <Text style={[styles.sessionTitle, { color: t.text }]}>{mins} min</Text>
                    <Text style={[styles.sessionSub, { color: t.sub }]}>{fmtTime(s.endedAt)}</Text>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 18 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 8,
    marginTop: 10,
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  logo: { width: 30, height: 30, borderRadius: 10 },
  headerTitle: { marginLeft: 10, fontSize: 22, fontWeight: "900" },

  backBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  backBtnText: { fontWeight: "800" },

  watermark: {
    position: "absolute",
    top: 120,
    right: -40,
    width: 320,
    height: 320,
  },

  scrollPad: { paddingBottom: 28 },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 10,
  },
  card: {
    width: "48%",
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
  },
  cardLabel: { fontWeight: "800" },
  cardValue: {
    fontSize: 46,
    fontWeight: "900",
    marginTop: 8,
    letterSpacing: -0.3,
  },
  cardSub: { fontWeight: "800", marginTop: 2 },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    marginTop: 8,
    marginBottom: 10,
  },
  accentRule: {
    height: 4,
    width: 46,
    borderRadius: 99,
    marginTop: -6,
    marginBottom: 12,
  },

  panel: {
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
  },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9 },
  rowLeft: { fontWeight: "800" },
  rowRight: { fontWeight: "900" },

  sessionRow: { paddingVertical: 10 },
  sessionTitle: { fontWeight: "900", fontSize: 18 },
  sessionSub: { marginTop: 4, fontWeight: "700" },

  muted: { fontWeight: "700" },
});
